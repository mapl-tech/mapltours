import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getDestination,
  getTransferPrice,
  driverCost,
  type TransferTripType,
} from '@/lib/airport-transfers'
import { areTransferLegsBookable, LEAD_TIME_MESSAGE } from '@/lib/booking-window'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'
import { claimGiftCard, releaseGiftClaim } from '@/lib/gift-redemption'
import { normalizeGiftCode } from '@/lib/gift-cards'
import { maybeSendTravelerConfirmation, maybeSendOperatorAlert } from '@/lib/email/booking'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { sanitizeAttribution } from '@/lib/attribution'

/**
 * Transfers checkout, sibling of /api/checkout, with the same hardening:
 *   • Server-side pricing (rates from lib/airport-transfers, 10% margin + 5% Remitly cover)
 *   • Atomic idempotency via the unique partial index on bookings
 *   • Verified PI attach
 *   • Schema guard
 *
 * Adversarial-review fixes:
 *   • body.amount is no longer trusted; we recompute the grand total
 *     from the rate table and use that for the PaymentIntent.
 *   • The select-then-insert race is replaced with a try-insert /
 *     catch-23505 / refresh path against the unique partial index.
 *   • PI attach is verified, if it can't be persisted, the request
 *     fails closed.
 */

const round2 = (n: number) => Math.round(n * 100) / 100

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
  /** Gift card code applied at checkout, if any. */
  giftCode?: string
  attribution?: unknown
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

function hashCart(items: TransferItemIn[], amountCents: number, email: string, giftCode = ''): string {
  const payload = JSON.stringify({
    items: items
      .map(
        (i) =>
          `${i.destinationId}:${i.tripType}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: amountCents,
    email: (email ?? '').toLowerCase().trim(),
    // A transfer paid partly by gift card is a different charge from the same
    // transfer paid in full; it must not reuse the other's PaymentIntent.
    gift: giftCode,
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

    if (rateLimit(getIp(request), { windowMs: 60_000, max: 10, bucket: 'transfers-checkout' })) {
      return NextResponse.json(
        { error: 'Too many checkout attempts, please wait a moment and try again.' },
        { status: 429 },
      )
    }

    const body = (await request.json()) as CheckoutBody
    if (!body.items?.length) {
      return NextResponse.json({ error: 'No transfers selected' }, { status: 400 })
    }

    // 1. Server-side pricing: validate every line and rebuild the total.
    let subtotal = 0
    let total = 0
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
      // Flight numbers are REQUIRED for every leg the booking has: the
      // flight tracker, the day-of email's promises, and the driver's
      // timing all depend on them. Deliberately permissive shape check
      // (guests type "AA1234", "vs165", or just "521"): non-empty, at
      // least one digit, at most 10 chars.
      const flightOk = (v: string | undefined | null) => {
        const t = (v ?? '').trim()
        return t.length >= 2 && t.length <= 10 && /\d/.test(t)
      }
      const hasArrivalLeg = !!item.arrivalAt
      const hasDepartureLeg = item.tripType === 'round_trip' || !item.arrivalAt
      if (hasArrivalLeg && !flightOk(item.arrivalFlight)) {
        return NextResponse.json(
          { error: 'Please add your arrival flight number (e.g. AA1234). We use it to track your flight and time your pickup.', requestId: reqId },
          { status: 400 },
        )
      }
      if (hasDepartureLeg && !flightOk(item.departureFlight)) {
        return NextResponse.json(
          { error: 'Please add your departure flight number (e.g. AA4321). We use it to time your hotel pickup.', requestId: reqId },
          { status: 400 },
        )
      }

      // 24-hour lead time on every scheduled leg. Exact here, because
      // transfers store real pickup timestamps. Subsumes the old past-date
      // check: a pickup already gone is inside the window by definition.
      if (!areTransferLegsBookable({ arrivalAt: item.arrivalAt, departureAt: item.departureAt })) {
        return NextResponse.json(
          { error: LEAD_TIME_MESSAGE, requestId: reqId },
          { status: 400 },
        )
      }
      // Round-trip departure must be strictly after arrival.
      if (
        item.tripType === 'round_trip' &&
        item.arrivalAt &&
        item.departureAt &&
        new Date(item.departureAt).getTime() <= new Date(item.arrivalAt).getTime()
      ) {
        return NextResponse.json(
          { error: 'Departure must be after arrival.', requestId: reqId },
          { status: 400 },
        )
      }
      priced.push({ input: { ...item, passengers: pax }, destination: dest, price })
      // `price` is the ALL-IN price the customer pays; `subtotal` tracks what
      // the driver is owed, so the split stored on the booking stays
      // supplier-cost vs MAPL-margin.
      subtotal += driverCost(item.destinationId, item.tripType) ?? 0
      total += price
    }

    // Customers see one all-in price; MAPL's margin is whatever is left after
    // the driver's cost (it covers the 10% markup, 5% Remitly cover, and card processing).
    const fee = round2(total - subtotal)
    const amountInCents = Math.round(total * 100)
    if (amountInCents < 50) {
      return NextResponse.json({ error: 'Amount must be at least $0.50' }, { status: 400 })
    }

    // The client derives its total from the same pure rate table, so any
    // disagreement means a stale cart or tampering. A $1 tolerance used to let
    // a retired fare through and charge a different amount than the page
    // displayed, so this now matches to the cent.
    const claimed = Number(body.amount)
    if (Number.isFinite(claimed) && Math.abs(claimed - total) > 0.01) {
      console.warn('[transfers/checkout]', reqId, 'amount mismatch', { claimed, total })
      return NextResponse.json(
        { error: 'Cart total mismatch, please reload and try again', requestId: reqId },
        { status: 400 },
      )
    }

    const supabase = createServiceClient()
    const schemaFeatures = await assertCheckoutSchema(supabase)

    const c = body.customer ?? {}
    const cartHash = hashCart(body.items, amountInCents, c.email ?? '', normalizeGiftCode(body.giftCode ?? '') ?? '')

    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      email: (c.email ?? '').slice(0, 200),
      phone: c.phone ? c.phone.slice(0, 40) : null,
      country: c.country ? c.country.slice(0, 80) : null,
      special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
    } as const

    // Surface the transfer route on the booking ROW itself (pickup/dropoff),
    // not only inside booking_items, so the ops/bookings table reads
    // airport↔hotel at a glance instead of showing blank pickup/dropoff.
    // Round-trip and arrival legs read airport→hotel; a departure-only
    // one-way reverses to hotel→airport. All MAPL transfers use MBJ.
    const AIRPORT_LABEL = 'Montego Bay Airport (MBJ)'
    const transferRoute = (() => {
      if (priced.length !== 1) {
        return {
          pickup: AIRPORT_LABEL,
          dropoff: priced.map((p) => p.destination!.name).join(' + ').slice(0, 200),
        }
      }
      const p = priced[0]
      const hotel = p.destination!.name
      const departureOnly =
        p.input.tripType === 'one_way' && !p.input.arrivalAt && !p.input.arrivalFlight
      return departureOnly
        ? { pickup: hotel, dropoff: AIRPORT_LABEL }
        : { pickup: AIRPORT_LABEL, dropoff: hotel }
    })()

    const monetaryFields = {
      total_paid: total,
      subtotal,
      booking_fee: fee,
      currency: 'usd',
    } as const

    // 2. Atomic insert against the unique partial index.
    let bookingId: string | null = null
    let isReusedRow = false

    // Attribution is best-effort garnish: sanitized, size-capped, and GATED on
    // the live schema actually having the column (adversarial-review fix), so
    // a code-before-migration deploy skips it instead of 500ing the checkout.
    const attr = schemaFeatures.hasAttribution ? sanitizeAttribution(body.attribution) : null
    const attributionField = attr ? { attribution: attr } : {}

    const { data: inserted, error: insertErr } = await supabase
      .from('bookings')
      .insert({
        booking_type: 'transfer',
        ...customerFields,
        ...transferRoute,
        ...monetaryFields,
        ...attributionField,
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
        .update({ ...customerFields, ...transferRoute, ...monetaryFields, ...attributionField })
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
          ? `Airport transfer, ${p.destination!.name} (round-trip)`
          : `Airport transfer, ${p.destination!.name} (one-way)`,
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

    // 3b. Gift card. Same rules as the tour checkout: the balance comes off
    //     here, BEFORE the PaymentIntent is sized, because a card that lowered
    //     a charge without being debited first is free money. A reused pending
    //     row keeps its existing claim rather than debiting twice.
    const { data: bookingRow } = await supabase
      .from('bookings')
      .select('stripe_payment_id, gift_card_id')
      .eq('id', bookingId!)
      .maybeSingle()

    let giftAmountCents = 0
    let giftCardId: string | null = (bookingRow?.gift_card_id as string | null) ?? null

    if (giftCardId) {
      const { data: live } = await supabase
        .from('gift_card_redemptions')
        .select('amount')
        .eq('booking_id', bookingId!)
        .in('status', ['reserved', 'spent'])
        .maybeSingle()
      giftAmountCents = live ? Math.round(Number(live.amount) * 100) : 0
      if (!giftAmountCents) giftCardId = null
    } else if (body.giftCode) {
      const claimed = await claimGiftCard(supabase, body.giftCode, amountInCents, bookingId!)
      if (!claimed.ok) {
        return NextResponse.json({ error: claimed.message, giftCode: true, requestId: reqId }, { status: 400 })
      }
      giftAmountCents = claimed.claim.amountCents
      giftCardId = claimed.claim.giftCardId
      const { error: stampErr } = await supabase
        .from('bookings')
        .update({ gift_card_id: giftCardId, gift_card_amount: claimed.claim.amount })
        .eq('id', bookingId!)
        .select('id')
        .single()
      if (stampErr) {
        console.error('[transfers/checkout]', reqId, 'gift stamp failed', stampErr)
        await releaseGiftClaim(supabase, bookingId!)
        return NextResponse.json(
          { error: 'Could not apply that gift card. Please try again.', requestId: reqId },
          { status: 500 },
        )
      }
    }

    const chargeCents = Math.max(0, amountInCents - giftAmountCents)

    // 3c. Fully covered: no card payment, so no PaymentIntent and no webhook
    //     will fire. Settle here using the same confirmation senders.
    if (giftAmountCents > 0 && chargeCents === 0) {
      const { error: paidErr } = await supabase
        .from('bookings')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', bookingId!)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (paidErr) {
        console.error('[transfers/checkout]', reqId, 'gift-covered mark-paid failed', paidErr)
        await releaseGiftClaim(supabase, bookingId!)
        return NextResponse.json(
          { error: 'Could not complete your booking. Please try again.', requestId: reqId },
          { status: 500 },
        )
      }

      await supabase
        .from('gift_card_redemptions')
        .update({ status: 'spent', settled_at: new Date().toISOString() })
        .eq('booking_id', bookingId!)
        .eq('status', 'reserved')

      const { data: paidBooking } = await supabase
        .from('bookings').select('*').eq('id', bookingId!).maybeSingle()
      const { data: paidItems } = await supabase
        .from('booking_items')
        .select('experience_id, title, destination, travelers, date, price_per_person, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers')
        .eq('booking_id', bookingId!)

      if (paidBooking) {
        await maybeSendTravelerConfirmation(supabase, paidBooking as never, (paidItems ?? []) as never)
        await maybeSendOperatorAlert(supabase, paidBooking as never, (paidItems ?? []) as never)
      }

      return NextResponse.json({
        fullyCoveredByGift: true,
        bookingId,
        giftAmount: giftAmountCents / 100,
        requestId: reqId,
      })
    }

    // 4. Reuse an in-flight PI if possible.

    if (bookingRow?.stripe_payment_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(bookingRow.stripe_payment_id)
        if (PI_REUSABLE_STATUSES.includes(existingPi.status)) {
          if (existingPi.amount !== amountInCents) {
            try {
              await stripe.paymentIntents.update(existingPi.id, { amount: chargeCents })
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
        amount: chargeCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          booking_id: bookingId!,
          booking_type: 'transfer',
          item_count: String(priced.length),
          ...(giftAmountCents > 0 ? { gift_card_amount: String(giftAmountCents / 100) } : {}),
          summary: priced
            .map((p) => `${p.destination!.name}|${p.input.tripType}|${p.input.passengers}pax`)
            .join(', ')
            .slice(0, 490),
        },
        // Intentionally no `receipt_email`, TransferConfirmed (sent from
        // the webhook) is the only customer-facing receipt; Stripe's would
        // duplicate it.
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
      await releaseGiftClaim(supabase, bookingId!)
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
    // Don't leak the raw internal error to the client, log + generic message.
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[transfers/checkout]', reqId, 'create failed', message)
    return NextResponse.json(
      { error: 'Something went wrong creating your transfer. Please try again.', requestId: reqId },
      { status: 500 },
    )
  }
}
