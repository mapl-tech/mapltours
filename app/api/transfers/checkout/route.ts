import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  getDestination,
  getTransferPrice,
  driverCost,
  MAX_TRANSFER_PASSENGERS,
  type TransferTripType,
} from '@/lib/airport-transfers'
import { areTransferLegsBookable, LEAD_TIME_MESSAGE } from '@/lib/booking-window'
import { planTransferLegs } from '@/lib/transfer-legs'
import { replaceBookingItems } from '@/lib/booking-items'
import { abortPendingBooking } from '@/lib/booking-abort'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'
import { claimGiftCard, releaseGiftClaim, settleGiftClaim } from '@/lib/gift-redemption'
import { normalizeGiftCode } from '@/lib/gift-cards'
import type { CouponRow } from '@/lib/coupons'
import { resolveCoupon } from '@/lib/coupon-lookup'
import { consumeCoupon } from '@/lib/coupon-redemption'
import { maybeSendTravelerConfirmation, maybeSendOperatorAlert } from '@/lib/email/booking'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { DEFAULT_DRIVER } from '@/lib/dispatch'
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
  /** True when the ride starts at Sangster. Absent on pre-existing carts. */
  fromAirport?: boolean
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
  /** Coupon code applied at checkout, if any. A price reduction, never tender. */
  couponCode?: string
  /**
   * The pending booking this client previously abandoned (it edited the cart
   * after being issued this id), to be canceled in its favour. Explicit and
   * unguessable on purpose: an earlier email-scoped sweep let anyone who knew
   * a guest's address cancel their live checkout.
   */
  supersedeBookingId?: string
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

function hashCart(items: TransferItemIn[], amountCents: number, email: string, giftCode = '', couponCode = ''): string {
  const payload = JSON.stringify({
    items: items
      .map(
        (i) =>
          // Direction is part of the cart's identity: two one-ways between
          // the same pair differ only by it, and without it they would share
          // an idempotency key and a pending-booking row.
          `${i.destinationId}:${i.tripType}:${i.fromAirport === false ? 'to-mbj' : 'from-mbj'}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: amountCents,
    email: (email ?? '').toLowerCase().trim(),
    // A transfer paid partly by gift card is a different charge from the same
    // transfer paid in full; it must not reuse the other's PaymentIntent.
    gift: giftCode,
    // Same for a coupon: the net cents above already differ, the code makes
    // the identity explicit.
    coupon: couponCode,
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
  // A gift claim THIS request debited: non-null from the claim until the
  // value is spent (gift-covered settle) or an intent is attached that the
  // webhook/sweep will own. Every failure exit in between hands the balance
  // back, including the catch-all, which used to strand it on a pending row
  // with no intent (nothing ever cancels that) until the 30-minute sweep.
  let releaseClaimedGift: (() => Promise<void>) | null = null
  let bookingIdOut: string | null = null
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
    // One transfer per booking. The client enforces this too, but a transfer
    // reserves a specific vehicle and driver against a specific flight, so a
    // multi-line cart reaching here would dispatch one booking for two rides.
    // Fail closed rather than half-fulfil it.
    if (body.items.length > 1) {
      return NextResponse.json(
        { error: 'We book one transfer at a time. Please book the second separately.' },
        { status: 400 },
      )
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
      // Exactly one end of a transfer is Sangster, and `destinationId` names
      // the OTHER end — always a hotel. The UI derives one side from the
      // other so a resort-to-resort or airport-to-airport pair cannot be
      // built, and this is the model-level backstop for the same rule.
      // Checked before the generic lookup so the guest gets a sentence rather
      // than "Unknown destination: __mbj__".
      if (item.destinationId.startsWith('__')) {
        return NextResponse.json(
          { error: 'A transfer runs between the airport and a hotel. Please pick one of each.', requestId: reqId },
          { status: 400 },
        )
      }
      const dest = getDestination(item.destinationId)
      // Pax parses BEFORE pricing: parties of 5+ price per person, so the
      // server-computed price (margin and fees included via
      // getTransferPrice) must see the real party size.
      const pax = Math.round(item.passengers)
      if (!Number.isFinite(pax) || pax < 1 || pax > MAX_TRANSFER_PASSENGERS) {
        return NextResponse.json(
          { error: `Passengers must be between 1 and ${MAX_TRANSFER_PASSENGERS}.` },
          { status: 400 },
        )
      }
      const price = getTransferPrice(item.destinationId, item.tripType, pax)
      if (!dest || price === null) {
        return NextResponse.json(
          { error: `Unknown destination: ${item.destinationId}` },
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
      // Which legs this booking actually has, derived from the STATED
      // direction (the full rationale, including the legacy-cart inference,
      // lives with the derivation in lib/transfer-legs.ts).
      const { hasArrivalLeg, hasDepartureLeg, strayLeg } = planTransferLegs(item)
      // A leg the stated direction says does not exist must not arrive on
      // the wire at all. itemRows below persists the leg columns verbatim,
      // and every downstream consumer (dispatch, the day-of email, the
      // driver board) treats "timestamp set" as "leg exists" — so a one_way
      // payload smuggling the other leg's timestamp and flight booked a
      // phantom second ride: two legs dispatched and day-of-emailed, one
      // priced, paid, and payout-split. Reject rather than silently strip,
      // the same posture as the '__' destination backstop above: the client
      // never produces this shape, so it is a stale or crafted payload and
      // must learn so (audit 2026-08-22).
      if (strayLeg === 'arrival') {
        return NextResponse.json(
          { error: 'This one-way transfer runs to the airport, so it has no arrival pickup. Remove the arrival details or book a round trip.', requestId: reqId },
          { status: 400 },
        )
      }
      if (strayLeg === 'departure') {
        return NextResponse.json(
          { error: 'This one-way transfer runs from the airport, so it has no ride back. Remove the departure details or book a round trip.', requestId: reqId },
          { status: 400 },
        )
      }
      // Every leg this booking HAS must say when it happens. The flight
      // number alone cannot stand in for the timestamp: dispatch, the
      // lead-time gate, the refund service-start rule and the day-of email
      // all read the timestamp column.
      if (hasArrivalLeg && !item.arrivalAt) {
        return NextResponse.json(
          { error: 'Please add your arrival date and time so we can meet your flight.', requestId: reqId },
          { status: 400 },
        )
      }
      if (hasDepartureLeg && !item.departureAt) {
        return NextResponse.json(
          { error: 'Please add your hotel pickup date and time for the ride to the airport.', requestId: reqId },
          { status: 400 },
        )
      }
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
      subtotal += driverCost(item.destinationId, item.tripType, pax) ?? 0
      total += price
    }

    // Customers see one all-in price; MAPL's margin is whatever is left after
    // the driver's cost (it covers the 10% markup, 5% Remitly cover, and card processing).
    const fee = round2(total - subtotal)
    let amountInCents = Math.round(total * 100)
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

    // 1b. Coupon: looked up and checked server-side against the all-in
    //     fare, AFTER the amount assertion (the client keeps claiming the
    //     pre-coupon fare) and BEFORE the gift card (a gift is drawn against
    //     what is owed after the code). A price reduction, never tender:
    //     total_paid becomes net of it; `subtotal`, the driver's payout, is
    //     never touched, and the discount is capped at MAPL's margin so it
    //     cannot reach the driver's rate. Nothing is reserved here; the code
    //     is counted when the booking is paid.
    let coupon: CouponRow | null = null
    let couponDiscountCents = 0
    if (body.couponCode) {
      const r = await resolveCoupon(supabase, {
        code: body.couponCode,
        baseCents: amountInCents,
        email: body.customer?.email,
        bookingType: 'transfer',
        marginCents: Math.max(0, Math.round(fee * 100)),
      })
      if (r.kind === 'backend') {
        return NextResponse.json({ error: r.message, couponCode: true, requestId: reqId }, { status: r.status })
      }
      if (r.kind === 'refused') {
        return NextResponse.json({ error: r.message, couponCode: true, requestId: reqId }, { status: 400 })
      }
      coupon = r.row
      couponDiscountCents = r.check.discountCents
      amountInCents = r.check.chargeCents
      total = amountInCents / 100
    }
    const couponDiscount = couponDiscountCents / 100

    const c = body.customer ?? {}
    const cartHash = hashCart(body.items, amountInCents, c.email ?? '', normalizeGiftCode(body.giftCode ?? '') ?? '', coupon?.code ?? '')

    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      // Normalized once at the boundary. Stored raw, ' Alex@Gmail.com' and
      // 'alex@gmail.com' were different guests to the cart hash and to the
      // supersede check, though every mailbox treats them as one.
      email: (c.email ?? '').trim().toLowerCase().slice(0, 200),
      phone: c.phone ? c.phone.slice(0, 40) : null,
      country: c.country ? c.country.slice(0, 80) : null,
      special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
    } as const

    // Same boundary rule as the tour route: the confirmation, the day-of
    // email and the driver dispatch all ride on this address, so a blank or
    // junk email must never reach a payable booking.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerFields.email)) {
      return NextResponse.json(
        { error: 'A valid email address is required — your confirmation is sent there.', requestId: reqId },
        { status: 400 },
      )
    }

    // ONE transfer per booking. The entire dispatch model is keyed to a single
    // leg pair: firstLeg() reads booking_items[0], the driver columns live on
    // the booking row, and the day-of stamps are 'dayof_arrival_sent' /
    // 'dayof_departure_sent' with no item dimension. A two-transfer booking
    // therefore took the money for both and dispatched only the first — the
    // second guest stands at MBJ with no driver and no day-of email, while
    // the driver payout covers the whole subtotal.
    //
    // Refused at the boundary rather than reshaping dispatch, because taking
    // money for a ride nobody is scheduled to drive is the failure that
    // actually costs a guest their trip. Booking them one at a time works.
    if (priced.length > 1) {
      console.warn('[transfers/checkout]', reqId, 'refused multi-transfer cart', { count: priced.length })
      return NextResponse.json(
        {
          error: 'Please book one transfer at a time so we can assign a driver to each. Remove the extra transfer and book it separately.',
          requestId: reqId,
        },
        { status: 400 },
      )
    }

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
      // The guest now states the direction at quote time. Fall back to the
      // old inference (a one-way with no arrival details must be a departure)
      // only for carts persisted before the field existed.
      const stated = (p.input as { fromAirport?: boolean }).fromAirport
      const departureOnly =
        stated === undefined
          ? p.input.tripType === 'one_way' && !p.input.arrivalAt && !p.input.arrivalFlight
          : p.input.tripType === 'one_way' && stated === false
      return departureOnly
        ? { pickup: hotel, dropoff: AIRPORT_LABEL }
        : { pickup: AIRPORT_LABEL, dropoff: hotel }
    })()

    const monetaryFields = {
      // Net of the coupon. `subtotal` is what the driver is paid, untouched;
      // `booking_fee` stays the gross margin so the receipt's lines add up,
      // and the coupon is its own line taken from that margin.
      total_paid: total,
      subtotal,
      booking_fee: fee,
      ...(schemaFeatures.hasCoupon
        ? { coupon_code: coupon?.code ?? null, coupon_discount: coupon ? couponDiscount : 0 }
        : {}),
      currency: 'usd',
    } as const

    // 2. Atomic insert against the unique partial index.
    let bookingId: string | null = null
    let isReusedRow = false
    // The PaymentIntent already attached to a reused row, READ at reuse time:
    // it is what the items-failure compensation must kill (and CAS on) before
    // the row may die (audit 2026-08-22).
    let reusedPaymentId: string | null = null

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
      bookingIdOut = bookingId
    } else if (insertErr?.code === '23505') {
      isReusedRow = true
      const { data: existing, error: existingErr } = await supabase
        .from('bookings')
        .select('id, stripe_payment_id')
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
      bookingIdOut = bookingId
      reusedPaymentId = (existing.stripe_payment_id as string | null) ?? null
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
      // Items are refreshed atomically at step 3 (replaceBookingItems). The
      // separate DELETE that lived here was one half of a two-statement
      // replace, and a concurrent same-cart request could land between the
      // halves, leaving the reused row with doubled or zero item rows under
      // a still-payable intent (audit 2026-08-22). It also meant any early
      // return between here and step 3 (the supersede block can answer
      // alreadyPaid/paymentProcessing) left the row with no items at all.
    } else {
      console.error('[transfers/checkout]', reqId, 'booking insert failed', insertErr)
      return NextResponse.json(
        { error: 'Could not create booking', requestId: reqId },
        { status: 500 },
      )
    }



    // 3a. Supersede the pending booking THIS CLIENT abandoned, and only
    //     that one.
    //
    //     Editing the cart after a PaymentIntent exists changes the cart
    //     hash, so a fresh row is created and the previous one strands as
    //     pending: its intent stays payable and the abandoned-cart cron later
    //     emails a guest who already paid the edited cart. The client
    //     therefore passes back the bookingId it was issued, and that
    //     explicit, unguessable id is the whole authority to cancel.
    //
    //     An earlier draft swept every pending row matching the request's
    //     EMAIL, and adversarial review broke it twice: any stranger who
    //     knew a guest's address could cancel their live checkout from an
    //     unauthenticated POST, and two genuinely concurrent checkouts from
    //     one guest annihilated each other mid-flight. Scoping to the
    //     client-supplied id removes both: you can only kill what you were
    //     given, and only if it still matches your own email and type.
    const supersedeId = typeof body.supersedeBookingId === 'string' ? body.supersedeBookingId : null
    if (supersedeId && supersedeId !== bookingId && /^[0-9a-f-]{36}$/i.test(supersedeId)) {
      try {
        const { data: prev } = await supabase
          .from('bookings')
          .select('id, email, stripe_payment_id, status, booking_type')
          .eq('id', supersedeId)
          .eq('booking_type', 'transfer')
          .eq('status', 'pending')
          .maybeSingle()
        // customerFields.email is already trimmed and lowercased; rows
        // inserted before that normalization shipped carry the raw form, so
        // normalize the STORED side too or those rows can never be
        // superseded by their own guest.
        if (prev && (prev.email ?? '').trim().toLowerCase() === customerFields.email) {
          let intentGone = !prev.stripe_payment_id
          if (prev.stripe_payment_id) {
            try {
              await stripe.paymentIntents.cancel(prev.stripe_payment_id, {
                cancellation_reason: 'duplicate',
              })
              intentGone = true
            } catch {
              // Processing or succeeded: money may be moving. Leave the row
              // for its own webhook; never mark it canceled underneath.
              // And do not hand this guest a SECOND payable intent for a trip
              // the first one is settling: tell them the truth about the
              // old one instead, and drop the row this request just made.
              const live = await stripe.paymentIntents.retrieve(prev.stripe_payment_id).catch(() => null)
              if (live && (live.status === 'succeeded' || live.status === 'processing' || live.status === 'requires_capture')) {
                if (bookingId && bookingId !== prev.id) {
                  await supabase.from('bookings').update({ status: 'canceled' })
                    .eq('id', bookingId).eq('status', 'pending').is('stripe_payment_id', null)
                }
                console.warn('[transfer-supersede]', reqId, 'superseded intent is settling, refusing a second intent', { prev: prev.id, pi: live.id, status: live.status })
                return live.status === 'succeeded'
                  ? NextResponse.json({ alreadyPaid: true, bookingId: prev.id, requestId: reqId })
                  : NextResponse.json(
                      { paymentProcessing: true, bookingId: prev.id, error: 'Your payment is still being confirmed. Give it a moment, we will email your confirmation as soon as it clears.', requestId: reqId },
                      { status: 409 },
                    )
              }
            }
          }
          if (intentGone) {
            // A CAS on the intent state that was READ. Between the read and
            // this flip a concurrent request on the old row can attach a
            // fresh, payable intent; cancelling the row then (and releasing
            // its gift claim) would leave that intent live at a discount the
            // balance no longer backs. Zero rows: leave the row alone.
            const flipQ = supabase
              .from('bookings')
              .update({ status: 'canceled' })
              .eq('id', prev.id)
              .eq('status', 'pending')
            const { data: flipped } = await (prev.stripe_payment_id
              ? flipQ.eq('stripe_payment_id', prev.stripe_payment_id)
              : flipQ.is('stripe_payment_id', null)
            ).select('id')
            // Hand the dead row's gift value back NOW, not when its
            // canceled-intent webhook eventually lands: this same request
            // claims the card a few steps below, and with the old claim
            // still debited the guest was told their own balance was spent.
            if (flipped?.length) await releaseGiftClaim(supabase, prev.id)
          }
        }
      } catch (err) {
        // Cleanup, not correctness: this checkout proceeds on its own row.
        console.warn('[transfer-supersede]', reqId, 'failed', err)
      }
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

    // Atomic delete + insert (migration 025). On a fresh row the delete half
    // is a no-op; on a reused row it replaces the two auto-committed
    // statements whose interleavings doubled or zeroed the item rows under a
    // still-payable intent (audit 2026-08-22).
    const { error: itemsErr } = await replaceBookingItems(supabase, bookingId!, itemRows)
    if (itemsErr) {
      console.error('[transfers/checkout]', reqId, 'items insert failed', itemsErr)
      if (!isReusedRow) {
        await supabase.from('bookings').delete().eq('id', bookingId!)
      } else {
        // A reused row left 'pending' here kept its attached PaymentIntent
        // payable while (on the legacy two-statement fallback) its items were
        // already gone: the guest could still pay from a mounted panel and
        // capture money for a transfer with no legs, no pickup, no flight —
        // the exact worst case the leg derivation above exists to prevent.
        // Kill the intent, hand back any reserved gift value, and drop the
        // row like the fresh-path compensation does, so the re-POST builds a
        // coherent fresh one. 'kept' means the row could not safely be killed
        // (settling intent, or a concurrent request owns it): leave it to its
        // owner, but say so loudly (audit 2026-08-22).
        const outcome = await abortPendingBooking(supabase, stripe.paymentIntents, bookingId!, reusedPaymentId)
        if (outcome === 'kept') {
          console.error('[transfers/checkout]', reqId, 'CRITICAL: reused row kept after items failure, verify its items and intent', {
            booking: bookingId, pi: reusedPaymentId,
          })
        }
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
      .select('stripe_payment_id, gift_card_id, status')
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
      if (!giftAmountCents) {
        // The claim was released (stale sweep, failed attempt) but the stamp
        // survived. Left in place, the guest is charged FULL price while the
        // row still testifies a gift paid part of it — and a later refund
        // would then re-credit gift value that was already handed back.
        // Clear the stamp so row and ledger agree, then let a giftCode on
        // this request claim afresh below.
        giftCardId = null
        const { error: unstampErr } = await supabase
          .from('bookings')
          .update({ gift_card_id: null, gift_card_amount: null })
          .eq('id', bookingId!)
        if (unstampErr) {
          console.error('[transfers/checkout]', reqId, 'stale gift stamp clear failed', unstampErr)
          return NextResponse.json(
            { error: 'Could not refresh your gift card. Please try again.', bookingId, requestId: reqId },
            { status: 500 },
          )
        }
      }
    }
    if (!giftCardId && body.giftCode) {
      const claimed = await claimGiftCard(supabase, body.giftCode, amountInCents, bookingId!)
      if (!claimed.ok) {
        return NextResponse.json({ error: claimed.message, giftCode: true, bookingId, requestId: reqId }, { status: 400 })
      }
      giftAmountCents = claimed.claim.amountCents
      giftCardId = claimed.claim.giftCardId
      releaseClaimedGift = () => releaseGiftClaim(supabase, bookingId!)
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
          { error: 'Could not apply that gift card. Please try again.', bookingId, requestId: reqId },
          { status: 500 },
        )
      }
    }

    let chargeCents = Math.max(0, amountInCents - giftAmountCents)

    // Stripe's minimum charge is $0.50. A card whose balance covers all but
    // a few cents would otherwise hand Stripe an unchargeable amount and
    // dead-end the checkout with the balance still reserved. MAPL absorbs
    // the remainder (at most 49 cents) and the booking completes as fully
    // covered.
    if (giftAmountCents > 0 && chargeCents > 0 && chargeCents < 50) {
      console.warn('[transfers/checkout]', reqId, 'absorbing sub-minimum gift remainder', { chargeCents })
      chargeCents = 0
    }

    // 3c. Fully covered: no card payment, so no PaymentIntent and no webhook
    //     will fire. Settle here using the same confirmation senders.
    if (giftAmountCents > 0 && chargeCents === 0) {
      const { data: transitioned, error: paidErr } = await supabase
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
          { error: 'Could not complete your booking. Please try again.', bookingId, requestId: reqId },
          { status: 500 },
        )
      }
      // The TRANSITION is the proof, not the absence of an error: zero rows
      // means a concurrent request superseded this row between insert and
      // settle, and spending the gift on a canceled booking is money gone for
      // a trip nobody will run. Same guard as the tour route.
      if (!transitioned) {
        // Losing the transition does NOT mean the booking died. A guest who
        // double-submits a fully-covered cart sends two of THIS request, and
        // the other one may have just marked the row paid, spent the gift and
        // sent the emails. Releasing the claim here would hand the balance
        // back on a booking that is confirmed: a free trip. Only a row that
        // is genuinely not paid gets its value back.
        const { data: after } = await supabase
          .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
        if (after?.status === 'paid') {
          console.warn('[transfers/checkout]', reqId, 'gift-covered settle lost to a concurrent settle of the same booking', { booking: bookingId })
          return NextResponse.json({ fullyCoveredByGift: true, alreadyPaid: true, bookingId, requestId: reqId })
        }
        console.warn('[transfers/checkout]', reqId, 'gift-covered settle lost the transition race', { booking: bookingId, status: after?.status })
        await releaseGiftClaim(supabase, bookingId!)
        return NextResponse.json(
          { error: 'This booking can no longer be paid for. Please start a new one.', bookingId, requestId: reqId },
          { status: 409 },
        )
      }

      // We won the transition, so this request owns the settle. Zero rows
      // back from the spend-mark means the reserved claim is not there to
      // spend (a sweep released it in flight); settleGiftClaim knows how to
      // repair exactly that, including re-debiting a released claim, and 0
      // captured cents is the truth for a gift-covered sale.
      releaseClaimedGift = null
      const { data: spentRows } = await supabase
        .from('gift_card_redemptions')
        .update({ status: 'spent', settled_at: new Date().toISOString() })
        .eq('booking_id', bookingId!)
        .eq('status', 'reserved')
        .select('id')
      if (!spentRows?.length) {
        console.warn('[transfers/checkout]', reqId, 'gift-covered spend-mark matched no reserved claim, running settle repair', { booking: bookingId })
        await settleGiftClaim(supabase, bookingId!, 0)
      }

      // And the coupon: no webhook will ever run for this booking.
      if (coupon && couponDiscountCents > 0) {
        const used = await consumeCoupon(supabase, { couponId: coupon.id, bookingId: bookingId!, email: customerFields.email, amount: couponDiscount })
        if (!used.ok) console.error('[transfers/checkout]', reqId, 'CRITICAL: coupon consume failed on gift-covered booking', { booking: bookingId, coupon: coupon.code, error: used.message })
        else if (used.overRedeemed) console.error('[transfers/checkout]', reqId, 'CRITICAL: coupon over-redeemed', { booking: bookingId, coupon: coupon.code })
      }

      const { data: paidBooking } = await supabase
        .from('bookings').select('*').eq('id', bookingId!).maybeSingle()
      const { data: paidItems } = await supabase
        .from('booking_items')
        .select('experience_id, title, destination, travelers, date, price_per_person, line_total, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers')
        .eq('booking_id', bookingId!)

      // A gift-covered booking makes no Stripe charge, so no
      // payment_intent.succeeded ever fires and the webhook's default-driver
      // assignment never runs for it. Every booking on this route IS a
      // transfer, so without this the guest reaches dispatch with no driver:
      // the day-of email has no name, plate or WhatsApp to promise, and the
      // board shows an unassigned ride. Same null-and-paid predicates as the
      // webhook, so a real assignment is never overwritten.
      if (paidBooking && !paidBooking.driver_name && !paidBooking.driver_phone) {
        const { error: drvErr } = await supabase
          .from('bookings')
          .update(DEFAULT_DRIVER)
          .eq('id', bookingId!)
          .is('driver_name', null)
          .is('driver_phone', null)
          .eq('status', 'paid')
        if (drvErr) console.warn('[transfers-checkout]', reqId, 'default driver assign failed', drvErr.message)
        else Object.assign(paidBooking, DEFAULT_DRIVER)
      }

      if (paidBooking) {
        // A gift-covered booking never reaches the webhook, so there is no
        // Stripe re-delivery to heal a transient email failure — this request
        // is the only chance either message gets. Retry retryable failures
        // in-process; a booking left paid-but-unannounced means MAPL keeps
        // the full gift value for a trip no operator was ever told to run.
        for (let attempt = 0; attempt < 3; attempt++) {
          const traveler = await maybeSendTravelerConfirmation(supabase, paidBooking as never, (paidItems ?? []) as never)
          const operator = await maybeSendOperatorAlert(supabase, paidBooking as never, (paidItems ?? []) as never)
          if (traveler.ok && operator.ok) break
          const retryable = (!traveler.ok && traveler.retryable) || (!operator.ok && operator.retryable)
          if (!retryable || attempt === 2) {
            console.error('[transfers/checkout]', reqId, 'CRITICAL: gift-covered booking emails undelivered', {
              booking: bookingId,
              traveler: traveler.ok ? 'sent' : traveler.reason,
              operator: operator.ok ? 'sent' : operator.reason,
            })
            break
          }
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        }
      }

      return NextResponse.json({
        fullyCoveredByGift: true,
        bookingId,
        giftAmount: giftAmountCents / 100,
        couponDiscount,
        requestId: reqId,
      })
    }

    // Never issue a second PaymentIntent for a booking that is already paid.
    // The row is selected as 'pending', but the webhook can flip it to 'paid'
    // in the window between that select and this point — a guest who pays and
    // then refreshes the checkout step is the ordinary way in. Without this
    // the route would mint a fresh intent against a settled booking and a
    // second confirmation would charge them twice for one trip. Send them to
    // the confirmation they have already earned instead.
    // Re-read the status NOW rather than trusting the bookingRow snapshot
    // taken before the gift work: a concurrent request for this same booking
    // can settle it fully by gift in that window, and a stale 'pending' here
    // would mint a payable intent against a booking that is already paid.
    const { data: statusNow } = await supabase
      .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
    const currentStatus = statusNow?.status ?? bookingRow?.status
    if (currentStatus && currentStatus !== 'pending') {
      const settled = currentStatus === 'paid'
      console.warn('[transfers/checkout]', reqId, 'checkout re-entered on a non-pending booking', {
        booking: bookingId, status: currentStatus,
      })
      // A dead booking has no intent, so no canceled webhook will ever hand
      // back the gift value this request just debited. Do it here.
      if (!settled && releaseClaimedGift) await releaseClaimedGift()
      return NextResponse.json(
        settled
          ? { alreadyPaid: true, bookingId, requestId: reqId }
          : {
              error: 'This booking can no longer be paid for. Please start a new one.',
              bookingId,
              requestId: reqId,
            },
        { status: settled ? 200 : 409 },
      )
    }

    // 4. Reuse an in-flight PI if possible.

    // True once the attached intent is PROVEN dead (canceled or gone at
    // Stripe), so the post-attach tripwire below knows a re-mint over it is
    // routine rather than an invariant break worth an error log.
    let replacedPiProvenDead = false

    if (bookingRow?.stripe_payment_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(bookingRow.stripe_payment_id)

        // Stripe is the arbiter here, not the booking row.
        //
        // The alreadyPaid guard above reads bookings.status, which only the
        // webhook flips. Between the guest confirming payment and that webhook
        // landing, the row still says 'pending' while the intent is already
        // `processing` or `succeeded`. A refresh in that window fell straight
        // past the reuse test (those statuses are deliberately not reusable)
        // and minted a SECOND intent against the same booking, which the guest
        // could then pay: one trip, charged twice.
        if (existingPi.status === 'succeeded' || existingPi.status === 'requires_capture') {
          console.warn('[checkout]', reqId, 'existing PI is already settled, refusing a second intent', {
            booking: bookingId, pi: existingPi.id, status: existingPi.status,
          })
          return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
        }
        if (existingPi.status === 'processing') {
          return NextResponse.json(
            {
              paymentProcessing: true,
              bookingId,
              error: 'Your payment is still being confirmed. Give it a moment, we will email your confirmation as soon as it clears.',
              requestId: reqId,
            },
            { status: 409 },
          )
        }
        if (existingPi.status === 'canceled') replacedPiProvenDead = true

        if (PI_REUSABLE_STATUSES.includes(existingPi.status)) {
          // Compare against what we intend to CHARGE (gross minus gift), not
          // the gross. Comparing to amountInCents let a gift card applied on
          // a retry silently reuse the full-price PI: the guest paid the
          // whole total while the card balance was already debited.
          let reusable = true
          if (existingPi.amount !== chargeCents) {
            try {
              await stripe.paymentIntents.update(existingPi.id, { amount: chargeCents })
            } catch (err) {
              // A failed resize must NOT hand back the old secret (the guest
              // would pay an amount the summary no longer shows) — but
              // minting on faith is worse. Stripe rejects amount updates
              // exactly when the intent has moved on (guest mid-3DS or
              // confirming in another tab), and the post-mint best-effort
              // cancel cannot kill a settling intent: one trip, two payable
              // intents. Prove the old intent dead FIRST; mint only on proof.
              console.warn('[transfers/checkout]', reqId, 'PI update failed, proving the old intent dead before minting', err)
              try {
                await stripe.paymentIntents.cancel(existingPi.id, { cancellation_reason: 'duplicate' })
                reusable = false // provably dead, safe to mint the replacement
                replacedPiProvenDead = true
              } catch {
                // Cancel is rejected precisely when the intent is settling or
                // settled. Re-read it once and route on the truth.
                let live: Stripe.PaymentIntent | null = null
                try {
                  live = await stripe.paymentIntents.retrieve(existingPi.id)
                } catch {
                  /* unreadable → fall through to the 503 below */
                }
                if (live?.status === 'canceled') {
                  reusable = false
                  replacedPiProvenDead = true
                } else if (live?.status === 'succeeded' || live?.status === 'requires_capture') {
                  return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
                } else if (live?.status === 'processing') {
                  return NextResponse.json(
                    {
                      paymentProcessing: true,
                      bookingId,
                      error: 'Your payment is still being confirmed. Give it a moment, we will email your confirmation as soon as it clears.',
                      requestId: reqId,
                    },
                    { status: 409 },
                  )
                } else {
                  // Same retryable exit as the retrieve-failure branch: the
                  // gift claim stays with this pending row.
                  return NextResponse.json(
                    { error: 'Could not confirm your payment state just now. Please try again in a moment.', bookingId, requestId: reqId },
                    { status: 503 },
                  )
                }
              }
            }
          }
          if (reusable) {
            return NextResponse.json({
              clientSecret: existingPi.client_secret,
              bookingId,
              giftAmount: giftAmountCents / 100,
              couponDiscount,
              amountDue: chargeCents / 100,
              requestId: reqId,
            })
          }
        }
      } catch (err) {
        // Fall through to minting ONLY when Stripe definitively reports the
        // intent gone (same hardening the tour route gained in the
        // 2026-08-22 audit). Any other retrieve failure is a network/API
        // fault: the succeeded/processing guards above never ran, so the
        // attached intent may be settling, and the best-effort cancel below
        // cannot kill a settling intent — minting here handed the guest a
        // second payable clientSecret for one trip.
        const gone = err instanceof Stripe.errors.StripeError && err.code === 'resource_missing'
        if (!gone) {
          console.error('[transfers/checkout]', reqId, 'stale PI retrieve failed, refusing to mint a replacement', err)
          // Retryable, not terminal, so the gift claim stays with this
          // pending row: its attached intent is exactly what the webhook and
          // the stale sweep own, and the retry re-enters here.
          return NextResponse.json(
            { error: 'Could not confirm your payment state just now. Please try again in a moment.', bookingId, requestId: reqId },
            { status: 503 },
          )
        }
        console.warn('[transfers/checkout]', reqId, 'attached PI no longer exists at Stripe, minting a replacement', bookingRow.stripe_payment_id)
        replacedPiProvenDead = true
      }
    }

    // 5. Create PaymentIntent with cart-hash idempotency.
    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        booking_id: bookingId!,
        booking_type: 'transfer',
        item_count: String(priced.length),
        ...(giftAmountCents > 0 ? { gift_card_amount: String(giftAmountCents / 100) } : {}),
        // The webhook counts the coupon on payment success, keyed on this.
        ...(coupon && couponDiscountCents > 0
          ? { coupon_id: coupon.id, coupon_code: coupon.code, coupon_discount: String(couponDiscount) }
          : {}),
        summary: priced
          .map((p) => `${p.destination!.name}|${p.input.tripType}|${p.input.passengers}pax`)
          .join(', ')
          .slice(0, 490),
      },
      // Intentionally no `receipt_email`, TransferConfirmed (sent from
      // the webhook) is the only customer-facing receipt; Stripe's would
      // duplicate it.
    }
    // Keyed per booking row and per PI generation, NOT per cart. The old
    // cart-hash key outlived the PaymentIntent it created: once that PI
    // was canceled, Stripe served the same dead PI back for 24 hours and
    // the cart became unpurchasable — every declined-then-canceled retry
    // and every second identical booking simply could not pay. Concurrent
    // double-submits still dedupe: same row + same prior generation =
    // same key = one PI.
    let paymentIntent = await stripe.paymentIntents.create(piParams, {
      idempotencyKey: `pi:${bookingId}:${bookingRow?.stripe_payment_id ?? 'v1'}`,
    })
    // Stripe's idempotency cache can also replay an intent a failed EARLIER
    // attempt already canceled (mint → attach failed → cancel → 500 → the
    // retry re-enters with the same generation key, for up to 24h). A
    // canceled intent can never be paid — handing its secret to the client
    // strands the guest. Bump the generation exactly like any other: key the
    // re-mint on the dead intent's own id, deterministic across retries.
    if (paymentIntent.status === 'canceled') {
      console.warn('[transfers/checkout]', reqId, 'idempotency replayed a canceled intent, minting a fresh generation', paymentIntent.id)
      paymentIntent = await stripe.paymentIntents.create(piParams, {
        idempotencyKey: `pi:${bookingId}:${paymentIntent.id}`,
      })
    }

    // 6. Verified attach, ONLY while the row is still pending. The webhook
    //    re-stamps stripe_payment_id with the intent that actually paid, and
    //    an unconditional write here could land after it and replace the
    //    paying intent with this unpaid one: the booking would then say
    //    'paid' while naming an intent nobody paid, which blinds the
    //    double-charge guard and misroutes a later refund. Zero rows means
    //    the booking settled while this intent was being minted.
    const { data: attached, error: attachErr } = await supabase
      .from('bookings')
      .update({ stripe_payment_id: paymentIntent.id })
      .eq('id', bookingId!)
      .eq('status', 'pending')
      .select('id')
    if (attachErr || !attached?.length) {
      try {
        await stripe.paymentIntents.cancel(paymentIntent.id, { cancellation_reason: 'abandoned' })
      } catch {
        /* best-effort */
      }
      if (!attachErr) {
        const { data: after } = await supabase
          .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
        console.warn('[transfers/checkout]', reqId, 'booking left pending during mint, intent canceled', { booking: bookingId, status: after?.status })
        if (after?.status === 'paid') {
          return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
        }
        if (releaseClaimedGift) await releaseClaimedGift()
        return NextResponse.json(
          { error: 'This booking can no longer be paid for. Please start a new one.', bookingId, requestId: reqId },
          { status: 409 },
        )
      }
      console.error('[transfers/checkout]', reqId, 'PI attach failed', attachErr, paymentIntent.id)
      // Only the claim THIS request made: on a reused row the live claim can
      // belong to an earlier attempt whose intent is still payable.
      if (releaseClaimedGift) await releaseClaimedGift()
      return NextResponse.json(
        { error: 'Could not attach payment intent', bookingId, requestId: reqId },
        { status: 500 },
      )
    }

    // A replaced PaymentIntent must not stay payable: two live intents for
    // one booking means two tabs can each complete a different charge for the
    // same trip. Skipped when the reuse step already PROVED the old intent
    // dead — cancelling a canceled/gone intent always throws, and logging
    // that on every routine re-mint would bury the one log line that matters.
    const replacedPi = bookingRow?.stripe_payment_id
    if (replacedPi && replacedPi !== paymentIntent.id && !replacedPiProvenDead) {
      try {
        await stripe.paymentIntents.cancel(replacedPi, { cancellation_reason: 'duplicate' })
      } catch (cancelErr) {
        // Terminal or gone is fine — but a PROCESSING intent cannot be
        // canceled and will settle alongside the fresh one. The resize-
        // failure branch above proves the old intent dead before minting, so
        // reaching here with a live intent should be impossible; log loudly
        // rather than swallow, so ops sees it if that invariant ever breaks.
        console.error('[transfers/checkout]', reqId, 'replaced PI cancel failed — verify it is not settling', { pi: replacedPi, err: cancelErr })
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId,
      giftAmount: giftAmountCents / 100,
      couponDiscount,
      amountDue: chargeCents / 100,
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
    if (releaseClaimedGift) await releaseClaimedGift().catch(() => {})
    return NextResponse.json(
      { error: 'Something went wrong creating your transfer. Please try again.', bookingId: bookingIdOut ?? undefined, requestId: reqId },
      { status: 500 },
    )
  }
}
