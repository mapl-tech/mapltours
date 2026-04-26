import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getDestination,
  getTransferPrice,
  type TransferTripType,
} from '@/lib/airport-transfers'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'

/**
 * Transfers checkout — sibling of /api/checkout, with the same hardening:
 *   • Server-side pricing (rates from lib/airport-transfers + 5% fee)
 *   • Atomic idempotency via the unique partial index on bookings
 *   • Verified PI attach
 *   • Schema guard
 *
 * Adversarial-review fixes:
 *   • body.amount is no longer trusted; we recompute the grand total
 *     from the rate table and use that for the PaymentIntent.
 *   • The select-then-insert race is replaced with a try-insert /
 *     catch-23505 / refresh path against the unique partial index.
 *   • PI attach is verified — if it can't be persisted, the request
 *     fails closed.
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

function hashCart(items: TransferItemIn[], amountCents: number, email: string): string {
  const payload = JSON.stringify({
    items: items
      .map(
        (i) =>
          `${i.destinationId}:${i.tripType}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: amountCents,
    email: (email ?? '').toLowerCase().trim(),
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

const PI_REUSABLE_STATUSES: Stripe.PaymentIntent.Status[] = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]

export async function POST(request: NextRequest) {
  let reqId = ''
  try {
    reqId = crypto.randomBytes(6).toString('hex')

    const body = (await request.json()) as CheckoutBody
    if (!body.items?.length) {
      return NextResponse.json({ error: 'No transfers selected' }, { status: 400 })
    }

    // 1. Server-side pricing: validate every line and rebuild the total.
    let subtotal = 0
    interface PricedRow {
      input: TransferItemIn
      destination: ReturnType<typeof getDestination>
      price: number
    }
    const priced: PricedRow[] = []
    for (const item of body.items) {
      const dest = getDestination(item.destinationId)
      const price = getTransferPrice(item.destinationId, item.tripType)
      if (!dest || price === null) {
        return NextResponse.json(
          { error: `Unknown destination: ${item.destinationId}` },
          { status: 400 },
        )
      }
      const pax = Math.round(item.passengers)
      if (!Number.isFinite(pax) || pax < 1 || pax > 4) {
        return NextResponse.json(
          { error: 'Passengers must be between 1 and 4.' },
          { status: 400 },
        )
      }
      priced.push({ input: { ...item, passengers: pax }, destination: dest, price })
      subtotal += price
    }

    // Transfers fee mirrors lib/transfers-cart.ts (5% flat).
    const fee = Math.round(subtotal * 0.05)
    const total = subtotal + fee
    const amountInCents = Math.round(total * 100)
    if (amountInCents < 50) {
      return NextResponse.json({ error: 'Amount must be at least $0.50' }, { status: 400 })
    }

    // Reject overt client tampering. We tolerate $1 of rounding drift.
    const claimed = Number(body.amount)
    if (Number.isFinite(claimed) && Math.abs(claimed - total) > 1) {
      console.warn('[transfers/checkout]', reqId, 'amount mismatch', { claimed, total })
      return NextResponse.json(
        { error: 'Cart total mismatch — please reload and try again', requestId: reqId },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    await assertCheckoutSchema(supabase)

    const c = body.customer ?? {}
    const cartHash = hashCart(body.items, amountInCents, c.email ?? '')

    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      email: (c.email ?? '').slice(0, 200),
      phone: c.phone ? c.phone.slice(0, 40) : null,
      country: c.country ? c.country.slice(0, 80) : null,
      special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
    } as const

    const monetaryFields = {
      total_paid: total,
      subtotal,
      booking_fee: fee,
      currency: 'usd',
    } as const

    // 2. Atomic insert against the unique partial index.
    let bookingId: string | null = null
    let isReusedRow = false

    const { data: inserted, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        booking_type: 'transfer',
        ...customerFields,
        ...monetaryFields,
        cart_hash: cartHash,
        status: 'pending',
      })
      .select('id')
      .single()

    if (!insertErr && inserted) {
      bookingId = inserted.id
    } else if (insertErr?.code === '23505') {
      isReusedRow = true
      const { data: existing, error: existingErr } = await supabase
        .from('bookings')
        .select('id')
        .eq('cart_hash', cartHash)
        .eq('booking_type', 'transfer')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingErr || !existing) {
        console.error('[transfers/checkout]', reqId, 'conflict-fetch failed', existingErr)
        return NextResponse.json(
          { error: 'Could not load existing booking', requestId: reqId },
          { status: 500 },
        )
      }
      bookingId = existing.id
      // Refresh contact + flight context so dispatch sees the latest values.
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ ...customerFields, ...monetaryFields })
        .eq('id', bookingId)
      if (updErr) {
        console.error('[transfers/checkout]', reqId, 'reuse update failed', updErr)
        return NextResponse.json(
          { error: 'Could not refresh booking', requestId: reqId },
          { status: 500 },
        )
      }
      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
    } else {
      console.error('[transfers/checkout]', reqId, 'booking insert failed', insertErr)
      return NextResponse.json(
        { error: 'Could not create booking', requestId: reqId },
        { status: 500 },
      )
    }

    // 3. Persist line items (server-priced).
    const itemRows = priced.map((p) => ({
      booking_id: bookingId!,
      item_type: 'transfer' as const,
      experience_id: null,
      title:
        p.input.tripType === 'round_trip'
          ? `Airport transfer — ${p.destination!.name} (round-trip)`
          : `Airport transfer — ${p.destination!.name} (one-way)`,
      destination: p.destination!.name,
      travelers: 1,
      date:
        p.input.arrivalAt?.slice(0, 10) ??
        p.input.departureAt?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
      price_per_person: p.price,
      airport: 'MBJ',
      hotel: p.destination!.name,
      zone: p.destination!.zone,
      trip_type: p.input.tripType,
      arrival_flight: p.input.arrivalFlight ?? null,
      arrival_at: p.input.arrivalAt ? new Date(p.input.arrivalAt).toISOString() : null,
      departure_flight: p.input.departureFlight ?? null,
      departure_at: p.input.departureAt ? new Date(p.input.departureAt).toISOString() : null,
      passengers: p.input.passengers,
    }))

    const { error: itemsErr } = await supabase.from('booking_items').insert(itemRows)
    if (itemsErr) {
      console.error('[transfers/checkout]', reqId, 'items insert failed', itemsErr)
      if (!isReusedRow) {
        await supabase.from('bookings').delete().eq('id', bookingId!)
      }
      return NextResponse.json(
        { error: 'Could not persist transfer items', requestId: reqId },
        { status: 500 },
      )
    }

    // 4. Reuse an in-flight PI if possible.
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('stripe_payment_id')
      .eq('id', bookingId!)
      .maybeSingle()

    if (bookingRow?.stripe_payment_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(bookingRow.stripe_payment_id)
        if (PI_REUSABLE_STATUSES.includes(existingPi.status)) {
          if (existingPi.amount !== amountInCents) {
            try {
              await stripe.paymentIntents.update(existingPi.id, { amount: amountInCents })
            } catch (err) {
              console.warn('[transfers/checkout]', reqId, 'PI update failed', err)
            }
          }
          return NextResponse.json({
            clientSecret: existingPi.client_secret,
            bookingId,
            requestId: reqId,
          })
        }
      } catch (err) {
        console.warn('[transfers/checkout]', reqId, 'stale PI retrieve failed', err)
      }
    }

    // 5. Create PaymentIntent with cart-hash idempotency.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          booking_id: bookingId!,
          booking_type: 'transfer',
          item_count: String(priced.length),
          summary: priced
            .map((p) => `${p.destination!.name}|${p.input.tripType}|${p.input.passengers}pax`)
            .join(', ')
            .slice(0, 490),
        },
        ...(c.email ? { receipt_email: c.email } : {}),
      },
      { idempotencyKey: cartHash },
    )

    // 6. Verified attach.
    const { error: attachErr } = await supabase
      .from('bookings')
      .update({ stripe_payment_id: paymentIntent.id })
      .eq('id', bookingId!)
      .select('id')
      .single()
    if (attachErr) {
      console.error('[transfers/checkout]', reqId, 'PI attach failed', attachErr, paymentIntent.id)
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' })
      } catch {
        /* swallow */
      }
      return NextResponse.json(
        { error: 'Could not attach payment intent', requestId: reqId },
        { status: 500 },
      )
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId,
      requestId: reqId,
    })
  } catch (err) {
    if (err instanceof SchemaNotReadyError) {
      console.error('[transfers/checkout]', reqId, 'schema not ready', err.missing)
      return NextResponse.json(
        { error: 'Booking system not yet configured. Try again in a moment.', requestId: reqId },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[transfers/checkout]', reqId, 'create failed', message)
    return NextResponse.json({ error: message, requestId: reqId }, { status: 500 })
  }
}
