import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { priceTourCart, assertAmountMatches, PricingError } from '@/lib/checkout-pricing'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'

/**
 * Tour checkout — creates (or atomically reuses) a pending booking row
 * and a matching Stripe PaymentIntent.
 *
 * Hardening against the adversarial review:
 *  • Server-side pricing — we never trust the client's amount. The
 *    canonical price comes from lib/experiences.ts via priceTourCart().
 *  • Atomic idempotency — we rely on the unique partial index added in
 *    migration 007. Concurrent retries with the same cart_hash collide
 *    on the index; the loser falls into the conflict branch and reuses
 *    the winner's row instead of creating an orphan.
 *  • Verified PI attach — if the PaymentIntent id can't be persisted to
 *    the booking row, we fail the request so the webhook never sees a
 *    succeeded charge it can't correlate.
 *  • Schema guard — assertCheckoutSchema() short-circuits with a clear
 *    error if migrations 005/006/007 haven't been applied yet, instead
 *    of a generic Postgres failure.
 */

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface CartItemIn {
  id: number
  title: string
  destination: string
  travelers: number
  date: string
  price: number // ignored — server uses canonical experience.price
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
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // 1. Server-side pricing — single source of truth.
    const pricing = priceTourCart(
      body.items.map((i) => ({ id: i.id, travelers: i.travelers, date: i.date })),
      body.breakdown ?? {},
    )
    assertAmountMatches(body.amount, pricing)
    const amountInCents = Math.round(pricing.total * 100)
    if (amountInCents < 50) {
      return NextResponse.json({ error: 'Amount must be at least $0.50' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 2. Schema guard — fail fast if migrations are missing.
    await assertCheckoutSchema(supabase)

    const cartHash = hashCart(body)
    const c = body.customer ?? {}
    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      email: (c.email ?? '').slice(0, 200),
      phone: c.phone ? c.phone.slice(0, 40) : null,
      country: c.country ? c.country.slice(0, 80) : null,
      pickup: c.pickup ? c.pickup.slice(0, 200) : null,
      dropoff: c.dropoff ? c.dropoff.slice(0, 200) : null,
      special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
    } as const

    const monetaryFields = {
      total_paid: pricing.total,
      subtotal: pricing.subtotal,
      booking_fee: pricing.fee,
      transport_cost: pricing.transport,
      reward_discount: pricing.rewardDiscount,
      currency: 'usd',
    } as const

    // 3. Atomic insert. The unique partial index (cart_hash, booking_type)
    //    where status = 'pending' guarantees only one pending booking per
    //    cart at a time.
    let bookingId: string | null = null
    let isReusedRow = false

    const { data: inserted, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        booking_type: 'tour',
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
      // Unique-violation on the pending-session index — another concurrent
      // request already created the row. Fetch it, refresh mutable fields,
      // replace its line items so we charge the latest itinerary.
      isReusedRow = true
      const { data: existing, error: existingErr } = await supabase
        .from('bookings')
        .select('id')
        .eq('cart_hash', cartHash)
        .eq('booking_type', 'tour')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingErr || !existing) {
        console.error('[checkout]', reqId, 'conflict-fetch failed', existingErr)
        return NextResponse.json(
          { error: 'Could not load existing booking', requestId: reqId },
          { status: 500 },
        )
      }
      bookingId = existing.id
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ ...customerFields, ...monetaryFields })
        .eq('id', bookingId)
      if (updErr) {
        console.error('[checkout]', reqId, 'reuse update failed', updErr)
        return NextResponse.json(
          { error: 'Could not refresh booking', requestId: reqId },
          { status: 500 },
        )
      }
      // Drop existing items so we re-insert the latest priced lines below.
      await supabase.from('booking_items').delete().eq('booking_id', bookingId)
    } else {
      console.error('[checkout]', reqId, 'booking insert failed', insertErr)
      return NextResponse.json(
        {
          error: 'Could not create booking',
          requestId: reqId,
        },
        { status: 500 },
      )
    }

    // 4. Persist line items (server-priced).
    const itemRows = pricing.lines.map((l) => ({
      booking_id: bookingId!,
      item_type: 'experience' as const,
      experience_id: l.experience.id,
      title: l.experience.title.slice(0, 200),
      destination: (l.experience.destination || 'Jamaica').slice(0, 120),
      travelers: l.travelers,
      date: l.date,
      price_per_person: l.pricePerPerson,
    }))
    const { error: itemsErr } = await supabase.from('booking_items').insert(itemRows)
    if (itemsErr) {
      console.error('[checkout]', reqId, 'booking_items insert failed', itemsErr)
      // For a fresh row, roll back so the user can retry cleanly.
      if (!isReusedRow) {
        await supabase.from('bookings').delete().eq('id', bookingId!)
      }
      return NextResponse.json(
        { error: 'Could not persist cart items', requestId: reqId },
        { status: 500 },
      )
    }

    // 5. Reuse an in-flight PaymentIntent if there is one and it's reusable.
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('stripe_payment_id')
      .eq('id', bookingId!)
      .maybeSingle()

    if (bookingRow?.stripe_payment_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(bookingRow.stripe_payment_id)
        if (PI_REUSABLE_STATUSES.includes(existingPi.status)) {
          // If the amount changed (cart edited mid-session), update the PI in place.
          if (existingPi.amount !== amountInCents) {
            try {
              await stripe.paymentIntents.update(existingPi.id, { amount: amountInCents })
            } catch (err) {
              console.warn('[checkout]', reqId, 'PI update failed, falling through to new PI', err)
            }
          }
          return NextResponse.json({
            clientSecret: existingPi.client_secret,
            bookingId,
            requestId: reqId,
          })
        }
      } catch (err) {
        console.warn('[checkout]', reqId, 'stale PI retrieve failed', err)
      }
    }

    // 6. Create the PaymentIntent. The cart_hash is the idempotency key,
    //    so a double-clicked identical request will receive the same PI.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          booking_id: bookingId!,
          booking_type: 'tour',
          item_count: String(pricing.lines.length),
          summary: pricing.lines
            .map((l) => `${l.experience.title.slice(0, 30)}|${l.travelers}x$${l.pricePerPerson}`)
            .join(', ')
            .slice(0, 490),
        },
        ...(c.email ? { receipt_email: c.email } : {}),
      },
      { idempotencyKey: cartHash },
    )

    // 7. Verified attach. If we can't persist the PI id back to the row,
    //    fail the request so the webhook never sees an orphan succeeded
    //    charge it can't correlate.
    const { error: attachErr } = await supabase
      .from('bookings')
      .update({ stripe_payment_id: paymentIntent.id })
      .eq('id', bookingId!)
      // No row updated → undeniably wrong; surface as a hard fail.
      .select('id')
      .single()
    if (attachErr) {
      console.error('[checkout]', reqId, 'PI attach failed', attachErr, paymentIntent.id)
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' })
      } catch {
        /* swallow — best-effort cleanup */
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
    if (err instanceof PricingError) {
      console.warn('[checkout]', reqId, err.code, err.detail)
      return NextResponse.json(
        { error: err.code === 'amount_mismatch' ? 'Cart total mismatch — please reload and try again' : err.detail, requestId: reqId },
        { status: 400 },
      )
    }
    if (err instanceof SchemaNotReadyError) {
      console.error('[checkout]', reqId, 'schema not ready', err.missing)
      return NextResponse.json(
        { error: 'Booking system not yet configured. Try again in a moment.', requestId: reqId },
        { status: 503 },
      )
    }
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[checkout]', reqId, 'create failed', message)
    return NextResponse.json({ error: message, requestId: reqId }, { status: 500 })
  }
}
