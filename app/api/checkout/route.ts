import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Create (or reuse) a Stripe PaymentIntent for a cart.
 *
 * Flow:
 *   1. Hash the cart + customer email → idempotency key.
 *   2. If a pending booking with that cart_hash exists, reuse its PI.
 *      This prevents double-charging when a user double-clicks "Pay" or
 *      re-mounts the checkout step.
 *   3. Otherwise insert a 'pending' booking row, then create a PI whose
 *      metadata carries booking_id. The webhook at /api/webhooks/stripe
 *      flips status to 'paid' and sends the confirmation email.
 */

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface CartItemIn {
  id: number
  title: string
  destination: string
  travelers: number
  date: string
  price: number
}

interface CheckoutBody {
  amount: number
  items: CartItemIn[]
  customer?: {
    email?: string
    firstName?: string
    lastName?: string
    phone?: string
    country?: string
    pickup?: string
    dropoff?: string
    specialRequests?: string
  }
  breakdown?: {
    subtotal?: number
    fee?: number
    transport?: number
    rewardDiscount?: number
  }
}

function hashCart(body: CheckoutBody): string {
  const payload = JSON.stringify({
    items: body.items
      .map((i) => `${i.id}:${i.travelers}:${i.date}`)
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
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    const cartHash = hashCart(body)
    const supabase = createServiceClient()

    // 1. Reuse existing pending booking for the same cart.
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, stripe_payment_id, status')
      .eq('cart_hash', cartHash)
      .eq('status', 'pending')
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
        // If the PI is in a terminal state (succeeded / canceled), fall through
        // to creating a fresh booking + PI. The old booking stays as-is.
      } catch (err) {
        console.warn('[checkout] stale PI retrieve failed', err)
      }
    }

    // 2. Create a new pending booking.
    const c = body.customer ?? {}
    const { data: booking, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        first_name: (c.firstName ?? '').slice(0, 80),
        last_name: (c.lastName ?? '').slice(0, 80),
        email: (c.email ?? '').slice(0, 200),
        phone: c.phone ? c.phone.slice(0, 40) : null,
        country: c.country ? c.country.slice(0, 80) : null,
        pickup: c.pickup ? c.pickup.slice(0, 200) : null,
        dropoff: c.dropoff ? c.dropoff.slice(0, 200) : null,
        special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
        total_paid: body.amount,
        subtotal: body.breakdown?.subtotal ?? null,
        booking_fee: body.breakdown?.fee ?? null,
        transport_cost: body.breakdown?.transport ?? null,
        reward_discount: body.breakdown?.rewardDiscount ?? 0,
        cart_hash: cartHash,
        status: 'pending',
        currency: 'usd',
      })
      .select('id')
      .single()

    if (insertErr || !booking) {
      console.error('[checkout] booking insert failed', insertErr)
      return NextResponse.json({ error: 'Could not create booking' }, { status: 500 })
    }

    // 3. Insert line items. RLS is bypassed by service role.
    const itemRows = body.items.map((i) => ({
      booking_id: booking.id,
      experience_id: i.id,
      title: i.title.slice(0, 200),
      destination: (i.destination || 'Jamaica').slice(0, 120),
      travelers: Math.max(1, Math.min(20, i.travelers)),
      date: i.date,
      price_per_person: i.price,
    }))
    const { error: itemsErr } = await supabase.from('booking_items').insert(itemRows)
    if (itemsErr) {
      console.error('[checkout] booking_items insert failed', itemsErr)
      // Roll back the booking so the user can retry cleanly.
      await supabase.from('bookings').delete().eq('id', booking.id)
      return NextResponse.json({ error: 'Could not persist cart items' }, { status: 500 })
    }

    // 4. Create the PaymentIntent. The idempotency key makes double-clicks safe.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          booking_id: booking.id,
          item_count: String(body.items.length),
          summary: body.items
            .map((item) => `${item.title.slice(0, 30)}|${item.travelers}x$${item.price}`)
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
    console.error('[checkout] create failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
