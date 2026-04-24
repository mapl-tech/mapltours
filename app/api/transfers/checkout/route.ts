import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getDestination,
  getTransferPrice,
  type TransferTripType,
} from '@/lib/airport-transfers'

/**
 * Airport-transfer checkout — separate flow from the tour checkout, but
 * shares the `bookings` / `booking_items` tables (tagged booking_type =
 * 'transfer' and item_type = 'transfer'). Idempotency key = sha256 of the
 * cart + customer email, so double-clicks never double-charge.
 */

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface TransferItemIn {
  destinationId: string
  tripType: TransferTripType
  passengers: number
  arrivalAt?: string
  arrivalFlight?: string
  departureAt?: string
  departureFlight?: string
}

interface CheckoutBody {
  amount: number
  items: TransferItemIn[]
  customer?: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    country?: string
    specialRequests?: string
  }
  breakdown?: {
    subtotal?: number
    fee?: number
  }
}

function hashCart(body: CheckoutBody): string {
  const payload = JSON.stringify({
    items: body.items
      .map(
        (i) =>
          `${i.destinationId}:${i.tripType}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: Math.round(body.amount * 100),
    email: (body.customer?.email ?? '').toLowerCase().trim(),
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckoutBody
    const amountInCents = Math.round(body.amount * 100)

    if (amountInCents < 50) {
      return NextResponse.json({ error: 'Amount must be at least $0.50' }, { status: 400 })
    }
    if (!body.items?.length) {
      return NextResponse.json({ error: 'No transfers selected' }, { status: 400 })
    }

    // Re-validate each item's price server-side so a tampered client can't
    // underpay. The authoritative rate table lives in lib/airport-transfers.ts.
    for (const item of body.items) {
      const expected = getTransferPrice(item.destinationId, item.tripType)
      if (expected === null) {
        return NextResponse.json(
          { error: `Unknown destination: ${item.destinationId}` },
          { status: 400 },
        )
      }
      if (item.passengers < 1 || item.passengers > 4) {
        return NextResponse.json(
          { error: 'Passengers must be between 1 and 4.' },
          { status: 400 },
        )
      }
    }

    const cartHash = hashCart(body)
    const supabase = createServiceClient()

    // 1. Reuse a pending transfer booking for the same cart.
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, stripe_payment_id, status')
      .eq('cart_hash', cartHash)
      .eq('status', 'pending')
      .eq('booking_type', 'transfer')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.stripe_payment_id) {
      try {
        const pi = await stripe.paymentIntents.retrieve(existing.stripe_payment_id)
        if (
          pi.status === 'requires_payment_method' ||
          pi.status === 'requires_confirmation' ||
          pi.status === 'requires_action'
        ) {
          return NextResponse.json({
            clientSecret: pi.client_secret,
            bookingId: existing.id,
          })
        }
      } catch (err) {
        console.warn('[transfers/checkout] stale PI retrieve failed', err)
      }
    }

    // 2. Create a new pending transfer booking.
    const c = body.customer ?? {}
    const { data: booking, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        booking_type: 'transfer',
        first_name: (c.firstName ?? '').slice(0, 80),
        last_name: (c.lastName ?? '').slice(0, 80),
        email: (c.email ?? '').slice(0, 200),
        phone: c.phone ? c.phone.slice(0, 40) : null,
        country: c.country ? c.country.slice(0, 80) : null,
        special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
        total_paid: body.amount,
        subtotal: body.breakdown?.subtotal ?? null,
        booking_fee: body.breakdown?.fee ?? null,
        cart_hash: cartHash,
        status: 'pending',
        currency: 'usd',
      })
      .select('id')
      .single()

    if (insertErr || !booking) {
      console.error('[transfers/checkout] booking insert failed', insertErr)
      return NextResponse.json({ error: 'Could not create booking' }, { status: 500 })
    }

    // 3. Persist line items, one per transfer.
    const itemRows = body.items.map((i) => {
      const dest = getDestination(i.destinationId)!
      const price = getTransferPrice(i.destinationId, i.tripType)!
      return {
        booking_id: booking.id,
        item_type: 'transfer' as const,
        experience_id: null,
        title:
          i.tripType === 'round_trip'
            ? `Airport transfer — ${dest.name} (round-trip)`
            : `Airport transfer — ${dest.name} (one-way)`,
        destination: dest.name,
        travelers: 1, // flat-rate line, see passengers column for actual pax
        date:
          i.arrivalAt?.slice(0, 10) ??
          i.departureAt?.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
        price_per_person: price,
        airport: 'MBJ',
        hotel: dest.name,
        zone: dest.zone,
        trip_type: i.tripType,
        arrival_flight: i.arrivalFlight ?? null,
        arrival_at: i.arrivalAt ? new Date(i.arrivalAt).toISOString() : null,
        departure_flight: i.departureFlight ?? null,
        departure_at: i.departureAt ? new Date(i.departureAt).toISOString() : null,
        passengers: Math.max(1, Math.min(4, i.passengers)),
      }
    })

    const { error: itemsErr } = await supabase.from('booking_items').insert(itemRows)
    if (itemsErr) {
      console.error('[transfers/checkout] items insert failed', itemsErr)
      await supabase.from('bookings').delete().eq('id', booking.id)
      return NextResponse.json({ error: 'Could not persist transfer items' }, { status: 500 })
    }

    // 4. Create PaymentIntent. Idempotency key prevents duplicate charges.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          booking_id: booking.id,
          booking_type: 'transfer',
          item_count: String(body.items.length),
          summary: body.items
            .map((i) => {
              const dest = getDestination(i.destinationId)
              return `${dest?.name ?? i.destinationId}|${i.tripType}|${i.passengers}pax`
            })
            .join(', ')
            .slice(0, 490),
        },
        ...(c.email ? { receipt_email: c.email } : {}),
      },
      { idempotencyKey: cartHash },
    )

    await supabase
      .from('bookings')
      .update({ stripe_payment_id: paymentIntent.id })
      .eq('id', booking.id)

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId: booking.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[transfers/checkout] create failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
