import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { priceTourCart, assertAmountMatches, withCouponDiscount, PricingError } from '@/lib/checkout-pricing'
import { parseDurationHours, DAILY_HOUR_LIMIT } from '@/lib/cart'
import { isExperienceDateBookable, LEAD_TIME_MESSAGE } from '@/lib/booking-window'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { DEFAULT_DRIVER } from '@/lib/dispatch'
import { sanitizeAttribution } from '@/lib/attribution'
import { claimGiftCard, releaseGiftClaim, settleGiftClaim } from '@/lib/gift-redemption'
import { replaceBookingItems } from '@/lib/booking-items'
import { normalizeGiftCode } from '@/lib/gift-cards'
import { normalizeCouponCode, type CouponRow } from '@/lib/coupons'
import { resolveCoupon } from '@/lib/coupon-lookup'
import { consumeCoupon } from '@/lib/coupon-redemption'
import { maybeSendTravelerConfirmation, maybeSendOperatorAlert, resolveOpsRecipients } from '@/lib/email/booking'
import { sendEmail, operatorAlertRecipients } from '@/lib/email/send'
import OpsAlert from '@/emails/OpsAlert'
import { addSettledBookingToOpsCalendar } from '@/lib/ops-calendar'

/**
 * Tour checkout, creates (or atomically reuses) a pending booking row
 * and a matching Stripe PaymentIntent.
 *
 * Hardening against the adversarial review:
 *  • Server-side pricing, we never trust the client's amount. The
 *    canonical price comes from lib/experiences.ts via priceTourCart().
 *  • Atomic idempotency, we rely on the unique partial index added in
 *    migration 007. Concurrent retries with the same cart_hash collide
 *    on the index; the loser falls into the conflict branch and reuses
 *    the winner's row instead of creating an orphan.
 *  • Verified PI attach, if the PaymentIntent id can't be persisted to
 *    the booking row, we fail the request so the webhook never sees a
 *    succeeded charge it can't correlate.
 *  • Schema guard, assertCheckoutSchema() short-circuits with a clear
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
  price: number // ignored, server uses canonical experience.price
}

interface CheckoutBody {
  amount: number
  items: CartItemIn[]
  /**
   * The guest ticked the liability-waiver box. The server refuses a tour
   * checkout only when this field is PRESENT and not true, and stamps
   * waiver_accepted_at only when it is true. A request without the field is
   * priced and saved unstamped: the one-page quiet save leaves it out on
   * purpose, and the Pay request that follows sends true and stamps the
   * same row. See CLAUDE.md, "One-page checkout".
   */
  waiverAccepted?: boolean
  /** Gift card code the traveler typed at checkout, if any. */
  giftCode?: string
  /** Coupon code the traveler typed at checkout, if any. Tours only. */
  couponCode?: string
  /**
   * Whether the traveler kept their video-upload reward. The PERCENT is never
   * taken from the client, only this yes/no. Omitted (older clients) means
   * "apply if available", preserving the previous behaviour.
   */
  applyReward?: boolean
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
    pickup?: string
    dropoff?: string
    /** 'HH:MM' local Jamaica time the day starts. Dispatch only. */
    pickupTime?: string
    specialRequests?: string
  }
  breakdown?: {
    subtotal?: number
    fee?: number
    transport?: number
    rewardDiscount?: number
  }
}

// Hash from the SERVER-priced total (not the client's body.amount) so the
// idempotency/dedup key is deterministic and can't drift within the $1
// client-tolerance, otherwise two near-identical retries would miss the
// unique pending index and leave orphan pending bookings + extra PIs.
function hashCart(body: CheckoutBody, serverTotalCents: number): string {
  const payload = JSON.stringify({
    items: body.items
      .map((i) => `${i.id}:${i.travelers}:${i.date}`)
      .sort(),
    cents: serverTotalCents,
    email: (body.customer?.email ?? '').toLowerCase().trim(),
    // A cart paid partly by gift card is a different charge from the same
    // cart paid in full, and must not collide with it on the pending-booking
    // index or reuse its PaymentIntent.
    gift: normalizeGiftCode(body.giftCode ?? '') ?? '',
    // Same for a coupon: the discounted cart is a different charge.
    coupon: normalizeCouponCode(body.couponCode ?? '') ?? '',
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

/**
 * Hand back a reward reservation held by a booking whose checkout failed.
 *
 * The reserve step below flips the row to 'reserved' BEFORE the gift card is
 * debited and before Stripe is called, which means every error exit after it
 * used to strand the row: reserved, held by a pending booking that will never
 * pay, invisible to the guest (the client shows reserved rewards as theirs)
 * and unclaimable by any other checkout until the dead-holder takeover
 * happened to run. Guarded on reserved-by-THIS-booking so it can never yank
 * a reservation another booking took over, and never touches a consumed
 * ('used') row.
 */
async function releaseRewardReservation(
  supabase: ReturnType<typeof createServiceClient>,
  rewardId: string,
  bookingId: string,
  reqId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_rewards')
    .update({ status: 'available', used_on_booking_id: null })
    .eq('id', rewardId)
    .eq('status', 'reserved')
    .eq('used_on_booking_id', bookingId)
  if (error) console.error('[checkout]', reqId, 'reward reservation release failed', error)
}

const PI_REUSABLE_STATUSES: Stripe.PaymentIntent.Status[] = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]

export async function POST(request: NextRequest) {
  let reqId = ''
  // Non-null from the moment this request's booking HOLDS the reward
  // reservation until an exit where someone else owns the row's fate (the
  // webhook or the gift-covered settle consumes it). Every failure exit in
  // between, including the catch-all, must call it or the reward bricks.
  let releaseHeldReward: (() => Promise<void>) | null = null
  // Same idea for a gift claim THIS request debited: non-null from the
  // claim until the value is spent (gift-covered settle) or an intent is
  // attached that the webhook/sweep will own. Every failure exit in between
  // hands the balance back, including the catch-all.
  let releaseClaimedGift: (() => Promise<void>) | null = null
  let bookingIdOut: string | null = null
  try {
    reqId = crypto.randomBytes(6).toString('hex')

    // Light per-IP throttle so scripted checkout-attempts can't spam Stripe
    // PaymentIntent creation. Real users complete checkout once or twice.
    if (rateLimit(getIp(request), { windowMs: 60_000, max: 10, bucket: 'checkout' })) {
      return NextResponse.json(
        { error: 'Too many checkout attempts, please wait a moment and try again.' },
        { status: 429 },
      )
    }

    const body = (await request.json()) as CheckoutBody
    if (!body.items?.length) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
    }

    // The waiver tick must reach the server to be worth anything: activities
    // like cliff jumping need durable evidence of acceptance, not a checkbox
    // that lived and died in the browser. The evidence is the
    // waiver_accepted_at stamp, written only for a request carrying true.
    // This gate refuses only a field that is PRESENT and not true. An absent
    // field is allowed and left unstamped, and that is permanent, not a
    // transition: the one-page quiet save omits it on purpose so the pending
    // row exists before the guest has ticked anything, and the Pay request
    // then sends true and stamps that same row (same cart hash).
    // Do NOT hard-require the field. It would 400 every tour quiet save, so
    // abandoned checkouts would vanish from the admin and the recovery
    // email, and Pay would lose the saved row and intent it reuses.
    if ('waiverAccepted' in body && body.waiverAccepted !== true) {
      return NextResponse.json(
        { error: 'Please accept the participation waiver to continue.', requestId: reqId },
        { status: 400 },
      )
    }

    // 0. Resolve the authenticated user (checkout requires login) and look
    //    up their REAL reward server-side. The client-supplied discount is
    //    never trusted, an anonymous or reward-less request gets 0%.
    let rewardPercent = 0
    let rewardId: string | null = null
    try {
      const authClient = createServerSupabase()
      const { data: { user } } = await authClient.auth.getUser()
      if (user) {
        const { data: reward } = await authClient
          .from('user_rewards')
          .select('id, percent, status')
          .eq('user_id', user.id)
          // 'reserved' is included ON PURPOSE. A re-POST for a booking that
          // already holds the reservation (cart edited, gift code applied)
          // must keep pricing with the discount, or the server would quote
          // full price against a client total that includes it and 400 on its
          // own amount check forever. Pricing is optimistic; the reservation
          // step below is the arbiter, and a reward genuinely held by another
          // live checkout fails there with an explicit rewardConflict.
          .in('status', ['available', 'reserved'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (reward && Number.isFinite(Number(reward.percent))) {
          rewardPercent = Number(reward.percent)
          rewardId = reward.id
        }
      }
      // Honour a DECLINED reward. The discount is the traveler's to refuse,
      // and force-applying it made the server price a cart the client had
      // quoted at full price: assertAmountMatches then rejected every attempt
      // and checkout 400'd with no way out but rediscovering the tickbox. The
      // percent stays server-verified; only the yes/no comes from the request.
      if (body.applyReward === false) {
        rewardPercent = 0
        rewardId = null
      }
    } catch (err) {
      // Reward lookup is best-effort, never block a paid checkout over it.
      console.warn('[checkout]', reqId, 'reward lookup failed', err)
    }

    // 1. Server-side pricing, single source of truth. Reward comes from the
    //    server-verified percent above, NOT from the request body.
    let pricing = priceTourCart(
      body.items.map((i) => ({ id: i.id, travelers: i.travelers, date: i.date })),
      body.breakdown ?? {},
      { rewardPercent },
    )
    // The client claims the total BEFORE any coupon; a code that dies between
    // apply and pay is then a clean refusal below, never a cart mismatch.
    assertAmountMatches(body.amount, pricing)

    const supabase = createServiceClient()

    // 1b. Coupon: looked up and checked server-side against that same total
    //     (after the reward). A price reduction, never tender: total_paid
    //     becomes net of it. Any rule that fails refuses the checkout with a
    //     message the page shows, and the page drops the code, rather than
    //     silently charging full price. Nothing is reserved here; the code is
    //     counted when the booking is paid.
    let coupon: CouponRow | null = null
    if (body.couponCode) {
      const r = await resolveCoupon(supabase, {
        code: body.couponCode,
        baseCents: Math.round(pricing.totalBeforeCoupon * 100),
        email: body.customer?.email,
        bookingType: 'tour',
        // Out of MAPL's margin only: the fee after the reward already taken
        // from it. The operator's price is never touched.
        marginCents: Math.max(0, Math.round((pricing.fee - pricing.rewardDiscount) * 100)),
      })
      if (r.kind === 'backend') {
        return NextResponse.json({ error: r.message, couponCode: true, requestId: reqId }, { status: r.status })
      }
      if (r.kind === 'refused') {
        return NextResponse.json({ error: r.message, couponCode: true, requestId: reqId }, { status: 400 })
      }
      coupon = r.row
      pricing = withCouponDiscount(pricing, r.check.discountCents)
    }
    const amountInCents = Math.round(pricing.total * 100)
    if (amountInCents < 50) {
      return NextResponse.json({ error: 'Amount must be at least $0.50' }, { status: 400 })
    }

    // Enforce the 24-hour lead time (the date pickers also set `min`, but
    // never trust the client). This subsumes the old past-date check: a date
    // already gone is by definition inside the window.
    const tooSoon = pricing.lines.some(
      (l) => l.date && !isExperienceDateBookable(l.date),
    )
    if (tooSoon) {
      return NextResponse.json(
        { error: LEAD_TIME_MESSAGE, requestId: reqId },
        { status: 400 },
      )
    }

    // Enforce the per-day hour cap at the boundary too. The cart UI blocks a
    // day over DAILY_HOUR_LIMIT, but a direct POST could stack unlimited
    // tours on one date — a day no guide can physically run. Food stops exist
    // only client-side, so this sums experience durations alone: strictly
    // laxer than the UI's own check, so it can never falsely reject a cart
    // the UI allowed.
    const hoursByDate: Record<string, number> = {}
    for (const l of pricing.lines) {
      const key = l.date || 'unset'
      hoursByDate[key] = (hoursByDate[key] ?? 0) + parseDurationHours(l.experience.duration)
    }
    if (Object.values(hoursByDate).some((h) => h > DAILY_HOUR_LIMIT)) {
      return NextResponse.json(
        {
          error: `That is more than ${DAILY_HOUR_LIMIT} hours of tours in one day. Please split the trip across separate days.`,
          requestId: reqId,
        },
        { status: 400 },
      )
    }

    // 2. Schema guard, fail fast if migrations are missing.
    const schemaFeatures = await assertCheckoutSchema(supabase)

    const cartHash = hashCart(body, amountInCents)
    const c = body.customer ?? {}
    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      // Normalized once at the boundary. Stored raw, ' Alex@Gmail.com' and
      // 'alex@gmail.com' were different guests to the cart hash and to the
      // supersede check, though every mailbox treats them as one.
      email: (c.email ?? '').trim().toLowerCase().slice(0, 200),
      phone: c.phone ? c.phone.slice(0, 40) : null,
      country: c.country ? c.country.slice(0, 80) : null,
      pickup: c.pickup ? c.pickup.slice(0, 200) : null,
      dropoff: c.dropoff ? c.dropoff.slice(0, 200) : null,
      // Validated shape, not trusted length. Deliberately NOT fed into
      // earliestServiceStart(): the refund window stays on the midnight
      // assumption so capturing a start time cannot shorten anyone's right
      // to cancel.
      ...(schemaFeatures.hasPickupTime && /^\d{2}:\d{2}$/.test(c.pickupTime ?? '')
        ? { pickup_time: c.pickupTime }
        : {}),
      // Stamp WHEN the guest accepted — only for requests that actually
      // carried the tick (a quiet save, which leaves the field out, must not
      // be stamped as accepted). Optional-write contract like pickup_time:
      // a deploy that lands before migration 028 skips the stamp instead of
      // 500ing.
      ...(schemaFeatures.hasWaiver && body.waiverAccepted === true
        ? { waiver_accepted_at: new Date().toISOString() }
        : {}),
      special_requests: c.specialRequests ? c.specialRequests.slice(0, 2000) : null,
    } as const

    // The confirmation and the operator dispatch both ride on this address; a
    // direct POST with a blank or junk email used to produce a PAID booking
    // whose confirmation could never be sent. The client form validates too —
    // this is the boundary that actually holds.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerFields.email)) {
      return NextResponse.json(
        { error: 'A valid email address is required, your confirmation is sent there.', requestId: reqId },
        { status: 400 },
      )
    }

    const monetaryFields = {
      total_paid: pricing.total,
      subtotal: pricing.subtotal,
      booking_fee: pricing.fee,
      transport_cost: pricing.transport,
      reward_discount: pricing.rewardDiscount,
      // Gated on migration 031 having run, like attribution and pickup_time.
      ...(schemaFeatures.hasCoupon
        ? { coupon_code: coupon?.code ?? null, coupon_discount: coupon ? pricing.couponDiscount : 0 }
        : {}),
      currency: 'usd',
    } as const

    // 3. Atomic insert. The unique partial index (cart_hash, booking_type)
    //    where status = 'pending' guarantees only one pending booking per
    //    cart at a time.
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
        booking_type: 'tour',
        ...customerFields,
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
      // Unique-violation on the pending-session index, another concurrent
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
      bookingIdOut = bookingId
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ ...customerFields, ...monetaryFields, ...attributionField })
        .eq('id', bookingId)
      if (updErr) {
        console.error('[checkout]', reqId, 'reuse update failed', updErr)
        return NextResponse.json(
          { error: 'Could not refresh booking', requestId: reqId },
          { status: 500 },
        )
      }
      // Existing items are replaced at step 4 via replaceBookingItems. The
      // unguarded DELETE that lived here, paired with step 4's blind INSERT,
      // was two auto-committed statements a concurrent same-cart request
      // could interleave with, doubling every line on the reused row while
      // its intent stayed payable (audit 2026-08-22).
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



    // 4a. Supersede the pending booking THIS CLIENT abandoned, and only
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
          .eq('booking_type', 'tour')
          // 'failed' matches too (audit 2026-08-22). A declined intent is not
          // dead: Stripe leaves it at requires_payment_method and the guest's
          // still-mounted form can retry it to success, so a failed row handed
          // to us must get the same cancel-intent-first treatment as a pending
          // one — skipping it left a second payable intent for the same trip.
          .in('status', ['pending', 'failed'])
          .maybeSingle()
        // customerFields.email is already trimmed and lowercased; rows
        // inserted before that normalization shipped carry the raw form, so
        // normalize the STORED side too or those rows can never be
        // superseded by their own guest.
        // The row is the guest's own if the email matches, OR if it holds
        // the reward this request was priced with: rewards are looked up by
        // the authenticated user's id, so a booking reserving one is that
        // user's checkout whatever email they typed into it. Without the
        // second arm, correcting a typo in the email stranded the earlier
        // row, its intent and its reward for good.
        let ownRow = !!prev && (prev.email ?? '').trim().toLowerCase() === customerFields.email
        if (prev && !ownRow && rewardId) {
          const { data: holds } = await supabase
            .from('user_rewards').select('id').eq('id', rewardId).eq('used_on_booking_id', prev.id).maybeSingle()
          ownRow = !!holds
        }
        if (prev && ownRow) {
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
              if (live?.status === 'canceled') {
                // Already dead (canceled out of band, its webhook not landed
                // yet): Stripe refuses to cancel it twice, but it is exactly
                // as dead as one we just killed. Same rule as the declined-
                // twin sweep below; without it the row stayed pending and
                // kept its gift claim and reward hold.
                intentGone = true
              } else if (live && (live.status === 'succeeded' || live.status === 'processing' || live.status === 'requires_capture')) {
                if (bookingId && bookingId !== prev.id) {
                  await supabase.from('bookings').update({ status: 'canceled' })
                    .eq('id', bookingId).eq('status', 'pending').is('stripe_payment_id', null)
                }
                console.warn('[tour-supersede]', reqId, 'superseded intent is settling, refusing a second intent', { prev: prev.id, pi: live.id, status: live.status })
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
            // 'failed' is flippable for the same reason the lookup matches it
            // (audit 2026-08-22), mirroring the reward-holder kill below.
            const flipQ = supabase
              .from('bookings')
              .update({ status: 'canceled' })
              .eq('id', prev.id)
              .in('status', ['pending', 'failed'])
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
        console.warn('[tour-supersede]', reqId, 'failed', err)
      }
    }

    // 4a-bis. Terminate DECLINED twins of this exact cart (audit 2026-08-22).
    //
    //     The pending unique index covers only status='pending', so after a
    //     card decline (the webhook flips the row to 'failed' while Stripe
    //     leaves its intent payable at requires_payment_method) a re-POST of
    //     the same cart inserts a brand-new row without colliding — and a
    //     fresh tab never sends supersedeBookingId, so the supersede above
    //     cannot help. Left alone, the guest pays the new intent AND can
    //     later retry the old tab's declined form to success: one trip, two
    //     charges. Keyed on the server-derived cart_hash, which embeds the
    //     normalized email, so a matching row is this same guest's same cart.
    //     Cancel-intent-first, mirroring the reward-takeover below: only an
    //     intent Stripe let us kill proves the row is dead.
    try {
      const { data: declinedTwins, error: twinsErr } = await supabase
        .from('bookings')
        .select('id, stripe_payment_id')
        .eq('cart_hash', cartHash)
        .eq('booking_type', 'tour')
        .eq('status', 'failed')
        .neq('id', bookingId!)
      if (twinsErr) {
        // Unread twins are unproven-dead twins. Do not guess an empty set;
        // the declined intent stays for the next POST or the stale sweep.
        console.error('[checkout]', reqId, 'declined-twin sweep read failed', twinsErr)
      }
      for (const twin of declinedTwins ?? []) {
        let intentGone = !twin.stripe_payment_id
        if (twin.stripe_payment_id) {
          try {
            await stripe.paymentIntents.cancel(twin.stripe_payment_id, {
              cancellation_reason: 'duplicate',
            })
            intentGone = true
          } catch {
            // "Already canceled" is fine; already succeeded means money moved
            // and the row belongs to the webhook's paid path; anything
            // unprovable is treated as live. Only Stripe can say which.
            const live = await stripe.paymentIntents.retrieve(twin.stripe_payment_id).catch(() => null)
            if (live?.status === 'canceled') {
              intentGone = true
            } else if (live && (live.status === 'succeeded' || live.status === 'processing' || live.status === 'requires_capture')) {
              console.error('[checkout]', reqId, "CRITICAL: declined twin's intent has settled, leaving the row to the webhook", {
                twin: twin.id, pi: live.id, status: live.status,
              })
            } else {
              console.warn('[checkout]', reqId, "could not prove declined twin's intent dead, leaving it", { twin: twin.id })
            }
          }
        }
        if (!intentGone) continue
        // CAS on the exact state that was read, like the supersede flip and
        // the reward-holder kill: zero rows back means a concurrent request
        // moved the row (retried it, attached a fresh intent), so it is live
        // again and not ours to cancel.
        const flipQ = supabase
          .from('bookings')
          .update({ status: 'canceled' })
          .eq('id', twin.id)
          .eq('status', 'failed')
        const { data: flipped } = await (twin.stripe_payment_id
          ? flipQ.eq('stripe_payment_id', twin.stripe_payment_id)
          : flipQ.is('stripe_payment_id', null)
        ).select('id')
        if (flipped?.length) {
          // The dead row's gift value comes back NOW, same reasoning as the
          // supersede: this very request may be about to claim the same card,
          // and with the old claim still debited the guest's own balance
          // reads as spent.
          await releaseGiftClaim(supabase, twin.id)
        }
      }
    } catch (err) {
      // Cleanup, not correctness: this checkout proceeds on its own row and
      // any surviving declined intent waits for the next POST or the sweep.
      console.error('[checkout]', reqId, 'declined-twin sweep failed', err)
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
      // Authoritative. price_per_person is a rounded per-head derivation and
      // an indivisible party price does not multiply back to what was
      // charged; receipts read this instead.
      line_total: l.lineTotal,
    }))
    // One transaction (migration 025's RPC), not DELETE then INSERT: the
    // pending index funnels concurrent same-cart POSTs onto ONE reused row,
    // and the two-statement form let a loser's delete land between the
    // winner's row insert and its items insert, leaving every line doubled
    // on the booking the confirmation and dispatch render (audit 2026-08-22).
    // For a fresh row the delete inside matches nothing and this is a plain
    // insert.
    const { error: itemsErr } = await replaceBookingItems(supabase, bookingId!, itemRows)
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

    // 4b. Gift card. The balance comes off HERE, before the PaymentIntent is
    //     sized, because the charge is the total minus the gift — a card that
    //     lowered a charge without being debited first is free money.
    //
    //     A reused pending row may already hold a claim from an earlier
    //     attempt at the same cart; that claim is reused rather than taken
    //     again, so a double-submit debits the card once.
    // 4b. RESERVE the reward this cart was priced with, BEFORE the gift card
    //     can be debited and BEFORE any intent is sized against that price.
    //
    //     Position matters twice over. The rewardConflict 409 below must fire
    //     while nothing else has been taken from the guest, or an abandoned
    //     row strands real debited gift value. And the fully-gift-covered
    //     settle further down consumes this reward with the reserved-by-us
    //     guard, which only works if the reservation ran first; when it sat
    //     after that settle, a fully-covered cart skipped arbitration
    //     entirely and could ride on a reward another booking held.
    //
    //     The percent was verified server-side, but nothing held the row: two
    //     tabs could each read the same 'available' reward, price both carts
    //     with it, and pay both, and only one consume would find a row to
    //     flip. The conditional UPDATE is the claim; the OR arm makes a
    //     re-POST for this same booking (cart edited, gift code applied)
    //     re-reserve what it already holds instead of failing its own claim.
    if (rewardId && pricing.rewardDiscount > 0) {
      // Three claimable states: free, already ours, or an orphaned
      // reservation whose holder column is NULL (nothing can release or
      // steal a null holder through the paths below, so it must be
      // claimable directly or the reward is dead forever).
      // FRESH arms take the row; the OWN arm merely re-matches a hold this
      // booking already has. The two are kept apart because only the
      // request that TOOK the row may give it back on failure: two requests
      // sharing one reused booking row both re-match the own arm, and when
      // the loser's gift claim failed it released the reservation the
      // winner was about to pay against.
      const FRESH = `status.eq.available,and(status.eq.reserved,used_on_booking_id.is.null)`
      const OWN = `and(status.eq.reserved,used_on_booking_id.eq.${bookingId})`
      let tookIt = false
      let { data: held, error: holdErr } = await supabase
        .from('user_rewards')
        .update({ status: 'reserved', used_on_booking_id: bookingId })
        .eq('id', rewardId)
        .or(FRESH)
        .select('id')
      if (!holdErr && held?.length) tookIt = true
      if (!holdErr && !held?.length) {
        ;({ data: held, error: holdErr } = await supabase
          .from('user_rewards')
          .update({ status: 'reserved', used_on_booking_id: bookingId })
          .eq('id', rewardId)
          .or(OWN)
          .select('id'))
      }
      if (holdErr) {
        console.error('[checkout]', reqId, 'reward reserve errored', holdErr)
        return NextResponse.json(
          { error: 'Could not apply your reward just now. Please try again.', bookingId, requestId: reqId },
          { status: 503 },
        )
      }
      if (!held?.length) {
        // Someone holds it. If that someone is a checkout that died, the
        // reservation is stale and this cart may take it over; if the holder
        // is live (pending or paid), this cart must not carry the discount.
        const { data: holder } = await supabase
          .from('user_rewards')
          .select('used_on_booking_id, status, bookings!user_rewards_used_on_booking_id_fkey(status, stripe_payment_id, email, created_at)')
          .eq('id', rewardId)
          .maybeSingle()
        const hb = holder?.bookings as
          | { status?: string; stripe_payment_id?: string | null; email?: string | null; created_at?: string }
          | null
        const holderStatus = hb?.status
        const otherBooking =
          holder?.status === 'reserved' && !!holder.used_on_booking_id && holder.used_on_booking_id !== bookingId
        // 'failed' is NOT instantly dead: a declined intent sits at
        // requires_payment_method and the guest's form can still retry it,
        // so it goes through the cancel-first branch below like 'pending'.
        let holderDead =
          otherBooking && holderStatus != null && !['pending', 'paid', 'failed'].includes(holderStatus)
        // A 'pending' holder older than the abandoned-cart grace window is a
        // checkout this same guest walked away from: the tab is gone, so the
        // client can never send its id to supersede, its intent sits at
        // requires_payment_method forever (no canceled webhook ever fires),
        // and nothing else moves a pending row. Left alone it held the reward
        // for the rest of the guest's life, and every later checkout quietly
        // priced at full price. Stripe is the arbiter, as in the stale gift
        // sweep: cancel its intent first, and only if that succeeds (money is
        // not moving) is the row dead and the reward ours to take. A holder
        // YOUNGER than the window is a live second tab and keeps its claim.
        // No email gate: the reward was looked up by the authenticated
        // user's id, so whichever booking holds it is this user's own. A
        // 'failed' holder needs no age gate either, its card was declined.
        if (
          !holderDead &&
          otherBooking &&
          hb != null &&
          (holderStatus === 'failed' ||
            (holderStatus === 'pending' && hb?.created_at && Date.now() - Date.parse(hb.created_at) > 30 * 60_000))
        ) {
          let intentGone = !hb.stripe_payment_id
          if (hb.stripe_payment_id) {
            try {
              await stripe.paymentIntents.cancel(hb.stripe_payment_id, { cancellation_reason: 'abandoned' })
              intentGone = true
            } catch {
              // Processing or succeeded: its own webhook owns this reward.
            }
          }
          if (intentGone) {
            // CAS on the intent state that was read, like the supersede flip:
            // a concurrent request on the holder row may have just attached
            // a fresh intent, and that row is then live, not abandoned.
            const killQ = supabase
              .from('bookings')
              .update({ status: 'canceled' })
              .eq('id', holder!.used_on_booking_id!)
              .in('status', ['pending', 'failed'])
            const { data: killed } = await (hb.stripe_payment_id
              ? killQ.eq('stripe_payment_id', hb.stripe_payment_id)
              : killQ.is('stripe_payment_id', null)
            ).select('id')
            holderDead = (killed?.length ?? 0) > 0
            if (holderDead) console.warn('[checkout]', reqId, 'took over a reward from an abandoned checkout', { abandoned: holder!.used_on_booking_id, booking: bookingId })
          }
        }
        const stealable = holderDead
        let stolen = false
        if (stealable) {
          const { data: takeover } = await supabase
            .from('user_rewards')
            .update({ status: 'reserved', used_on_booking_id: bookingId })
            .eq('id', rewardId)
            .eq('status', 'reserved')
            .eq('used_on_booking_id', holder!.used_on_booking_id!)
            .select('id')
          stolen = (takeover?.length ?? 0) > 0
          if (stolen) tookIt = true
        }
        if (!stolen) {
          // One plain retry before giving up: the holder's canceled-intent
          // webhook can land between our failed claim and here, releasing
          // the row to 'available' a moment after we read it. Without this,
          // that razor-thin race 409s a reward that is free again.
          const { data: retry } = await supabase
            .from('user_rewards')
            .update({ status: 'reserved', used_on_booking_id: bookingId })
            .eq('id', rewardId)
            .or(FRESH)
            .select('id')
          stolen = (retry?.length ?? 0) > 0
          if (stolen) tookIt = true
          if (!stolen) {
            // A concurrent request for this same booking may have taken it
            // in the meantime; that is our booking's hold, so proceed, but
            // it is that request's to release, not ours.
            const { data: own } = await supabase
              .from('user_rewards')
              .update({ status: 'reserved', used_on_booking_id: bookingId })
              .eq('id', rewardId)
              .or(OWN)
              .select('id')
            stolen = (own?.length ?? 0) > 0
          }
        }
        if (!stolen) {
          // A row this booking already CONSUMED means the webhook settled
          // it while this re-POST was in flight (tab 2 re-entering checkout
          // as tab 1 paid). Answering rewardConflict here made the client
          // untick the reward and re-price, which hashed to a NEW pending
          // booking with a payable full-price intent for a trip that was
          // already paid. Look at the booking before blaming the reward.
          const { data: bkNow } = await supabase
            .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
          if (bkNow?.status === 'paid') {
            return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
          }
          if (bkNow?.status && bkNow.status !== 'pending') {
            return NextResponse.json(
              { error: 'This booking can no longer be paid for. Please start a new one.', bookingId, requestId: reqId },
              { status: 409 },
            )
          }
          // The cart was priced WITH a discount this checkout cannot honour.
          // Sending the guest into Stripe at the discounted amount would
          // apply a reward someone else holds; silently repricing would trip
          // the client's own amount check and 400 forever, the exact loop the
          // applyReward fix closed. Say what happened and let the client
          // retry without the reward.
          return NextResponse.json(
            {
              error: 'Your reward is already in use on another checkout, so this booking is priced without it.',
              rewardConflict: true,
              bookingId,
              requestId: reqId,
            },
            { status: 409 },
          )
        }
      }
      // Reaching here means the reservation is HELD by this booking. Only
      // the request that TOOK it (fresh, takeover or retry) arms the release;
      // a request that re-matched an existing hold leaves it to its owner.
      if (tookIt) {
        const heldReward = rewardId
        const heldBy = bookingId!
        releaseHeldReward = () => releaseRewardReservation(supabase, heldReward, heldBy, reqId)
      }
    }
    // This booking may hold at most the ONE reward it is priced with. A
    // reused pending row can carry a reservation from an earlier POST: a
    // newer reward was granted in between (every milestone is 5%, so the
    // cart hash is identical and the same row is reused), or the guest has
    // since unticked the reward and is paying full price. Either way the
    // older reservation would otherwise sit 'reserved' on a booking that
    // then pays, and nothing ever frees a reward held by a paid booking.
    {
      let orphanQ = supabase
        .from('user_rewards')
        .update({ status: 'available', used_on_booking_id: null })
        .eq('status', 'reserved')
        .eq('used_on_booking_id', bookingId!)
      if (rewardId && pricing.rewardDiscount > 0) orphanQ = orphanQ.neq('id', rewardId)
      const { data: freed, error: freedErr } = await orphanQ.select('id')
      if (freedErr) console.error('[checkout]', reqId, 'orphan reward release failed', freedErr)
      else if (freed?.length) console.warn('[checkout]', reqId, 'released reward(s) this booking no longer prices with', { booking: bookingId, rewards: freed.map((r) => r.id) })
    }


    const { data: giftState } = await supabase
      .from('bookings')
      .select('gift_card_id, gift_card_amount, stripe_payment_id, status')
      .eq('id', bookingId!)
      .maybeSingle()

    let giftAmountCents = 0
    let giftCardId: string | null = (giftState?.gift_card_id as string | null) ?? null
    const releaseHeldRewardUnlessSibling = async () => {
      if (!releaseHeldReward) return
      const { data: sibling } = await supabase
        .from('gift_card_redemptions')
        .select('id')
        .eq('booking_id', bookingId!)
        .in('status', ['reserved', 'spent'])
        .limit(1)
      if (sibling?.length) {
        console.warn('[checkout]', reqId, 'gift claim lost to a concurrent request on this booking, keeping the reward reservation for it', { booking: bookingId })
        return
      }
      await releaseHeldReward()
    }

    if (giftCardId) {
      // Existing claim on this cart. Trust the ledger, not the request.
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
          console.error('[checkout]', reqId, 'stale gift stamp clear failed', unstampErr)
          if (releaseHeldReward) await releaseHeldReward()
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
        // Not a server error — the traveler mistyped or the card is spent.
        // Fail the checkout rather than silently charging them full price.
        // The reward reservation goes back too, so the guest's next POST
        // (gift removed or corrected) re-reserves it through the fresh arms.
        // UNLESS a sibling request on this same booking holds the gift
        // debit: then this request lost the balance race to a twin that is
        // about to mint a discounted intent naming this reward, and handing
        // the reward back would let a third cart take it while that intent
        // stays payable. The sibling's outcome owns the reservation.
        //
        // Look at the BOOKING before blaming the card (audit 2026-08-22),
        // the same re-check the reward conflict exit above does: a twin of
        // this request can settle this very booking fully by gift, depleting
        // the card before this claim ran. Answering giftCode then made the
        // client drop the code and re-POST at full price, which hashed to a
        // NEW pending booking with a payable full-price intent for a trip
        // that was already paid.
        const { data: bkNow } = await supabase
          .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
        if (bkNow?.status === 'paid') {
          return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
        }
        await releaseHeldRewardUnlessSibling()
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
        // The booking can't record what the card paid, so nothing downstream
        // (confirmation, refund, reconciliation) would know. Give it back.
        console.error('[checkout]', reqId, 'gift stamp failed', stampErr)
        await releaseGiftClaim(supabase, bookingId!)
        await releaseHeldRewardUnlessSibling()
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
      console.warn('[checkout]', reqId, 'absorbing sub-minimum gift remainder', { chargeCents })
      chargeCents = 0
    }

    // 4c. Fully covered by the gift card: there is no card payment to take,
    //     so no PaymentIntent exists and no Stripe webhook will ever fire for
    //     this booking. Settle it here instead, using the same confirmation
    //     senders the webhook uses.
    if (giftAmountCents > 0 && chargeCents === 0) {
      const { data: transitioned, error: paidErr } = await supabase
        .from('bookings')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', bookingId!)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (paidErr) {
        console.error('[checkout]', reqId, 'gift-covered mark-paid failed', paidErr)
        await releaseGiftClaim(supabase, bookingId!)
        if (releaseHeldReward) await releaseHeldReward()
        return NextResponse.json(
          { error: 'Could not complete your booking. Please try again.', bookingId, requestId: reqId },
          { status: 500 },
        )
      }
      // The TRANSITION is the proof, not the absence of an error. Zero rows
      // back means the row was no longer pending, e.g. a concurrent request
      // superseded it between our insert and this settle. Spending the gift
      // here anyway would debit the balance for a booking that is canceled,
      // which is money gone for a trip nobody will run. Hand it back and say
      // the booking cannot be paid.
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
          console.warn('[checkout]', reqId, 'gift-covered settle lost to a concurrent settle of the same booking', { booking: bookingId })
          return NextResponse.json({ fullyCoveredByGift: true, alreadyPaid: true, bookingId, requestId: reqId })
        }
        console.warn('[checkout]', reqId, 'gift-covered settle lost the transition race', { booking: bookingId, status: after?.status })
        await releaseGiftClaim(supabase, bookingId!)
        if (releaseHeldReward) await releaseHeldReward()
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
        console.warn('[checkout]', reqId, 'gift-covered spend-mark matched no reserved claim, running settle repair', { booking: bookingId })
        await settleGiftClaim(supabase, bookingId!, 0)
      }

      // Consume the reward here too — the webhook normally does this. Same
      // shape as the webhook's consume: the row is 'reserved' by this booking
      // when the reservation ran, 'available' only for intents minted before
      // it shipped, and it must never be flipped out from under ANOTHER
      // booking's reservation.
      if (rewardId && pricing.rewardDiscount > 0) {
        const { data: consumed } = await supabase
          .from('user_rewards')
          .update({ status: 'used', used_on_booking_id: bookingId, used_at: new Date().toISOString() })
          .eq('id', rewardId)
          .in('status', ['available', 'reserved'])
          .or(`used_on_booking_id.is.null,used_on_booking_id.eq.${bookingId}`)
          .select('id')
        if (!consumed?.length) {
          console.error('[checkout]', reqId, 'CRITICAL: gift-covered booking carried a reward another booking consumed', {
            booking: bookingId, reward: rewardId,
          })
        }
      }
      // And the coupon, for the same reason: no webhook will ever run for
      // this booking.
      if (coupon && pricing.couponDiscount > 0) {
        const used = await consumeCoupon(supabase, { couponId: coupon.id, bookingId: bookingId!, email: customerFields.email, amount: pricing.couponDiscount })
        if (!used.ok) console.error('[checkout]', reqId, 'CRITICAL: coupon consume failed on gift-covered booking', { booking: bookingId, coupon: coupon.code, error: used.message })
        else if (used.overRedeemed) console.error('[checkout]', reqId, 'CRITICAL: coupon over-redeemed', { booking: bookingId, coupon: coupon.code })
      }

      const { data: paidBooking } = await supabase
        .from('bookings').select('*').eq('id', bookingId!).maybeSingle()
      const { data: paidItems } = await supabase
        .from('booking_items')
        .select('experience_id, title, destination, travelers, date, price_per_person, line_total, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers')
        .eq('booking_id', bookingId!)

      // A gift-covered booking never reaches the webhook, so the default-driver
      // assignment that lives there would never run for it. Mirror it here, with
      // the same null-and-paid predicates, or a transfer paid entirely by gift
      // card reaches dispatch with no driver.
      if (paidBooking && paidBooking.booking_type === 'transfer' && !paidBooking.driver_name && !paidBooking.driver_phone) {
        const { error: drvErr } = await supabase
          .from('bookings')
          .update(DEFAULT_DRIVER)
          .eq('id', bookingId!)
          .is('driver_name', null)
          .is('driver_phone', null)
          .eq('status', 'paid')
        if (drvErr) console.warn('[checkout]', reqId, 'default driver assign failed', drvErr.message)
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
            console.error('[checkout]', reqId, 'CRITICAL: gift-covered booking emails undelivered', {
              booking: bookingId,
              traveler: traveler.ok ? 'sent' : traveler.reason,
              operator: operator.ok ? 'sent' : operator.reason,
            })
            // A log line nobody reads is not an alert. This booking is PAID
            // (gift value spent) and either the guest or the operator does
            // not know — page ops so a human sends the message by hand.
            // Best-effort: the sale itself is already settled, so an alert
            // failure must never break the response.
            // Same validated-recipient path and empty-list guard every other
            // ops email takes; Resend rejects an empty `to`.
            const opsTo = operatorAlertRecipients(resolveOpsRecipients())
            if (opsTo.length === 0) {
              console.error('[checkout]', reqId, 'gift-covered ops alert dropped: no_ops_email_configured', { booking: bookingId })
              break
            }
            try {
              await sendEmail({
                to: opsTo,
                subject: `ACTION NEEDED: gift-covered booking ${bookingId} emails undelivered`,
                react: OpsAlert({
                  title: 'Gift-covered booking emails undelivered',
                  body: 'A booking paid in full by gift card is settled, but its confirmation emails failed all retries. There is no Stripe webhook redelivery for gift-covered sales, so nothing will retry this automatically — contact the guest and the operator by hand.',
                  lines: [
                    `Booking: ${bookingId}`,
                    `Traveler email: ${traveler.ok ? 'sent' : `FAILED (${traveler.reason})`}`,
                    `Operator email: ${operator.ok ? 'sent' : `FAILED (${operator.reason})`}`,
                  ],
                }),
                tags: [
                  { name: 'category', value: 'ops_alert' },
                  { name: 'booking_id', value: bookingId! },
                ],
              })
            } catch (alertErr) {
              console.error('[checkout]', reqId, 'ops alert send failed', alertErr)
            }
            break
          }
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        }
        // Ops calendar, last and best-effort, as in the webhook: no intent
        // means no webhook, so this is the only sync this booking gets.
        await addSettledBookingToOpsCalendar(paidBooking as never, (paidItems ?? []) as never, `[checkout] ${reqId}`)
      }

      return NextResponse.json({
        fullyCoveredByGift: true,
        bookingId,
        giftAmount: giftAmountCents / 100,
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
    // Re-read the status NOW rather than trusting the giftState snapshot
    // taken before the gift work: a concurrent request for this same booking
    // can settle it fully by gift in that window, and a stale 'pending' here
    // would mint a payable intent against a booking that is already paid.
    const { data: statusNow } = await supabase
      .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
    const currentStatus = statusNow?.status ?? giftState?.status
    if (currentStatus && currentStatus !== 'pending') {
      const settled = currentStatus === 'paid'
      console.warn('[checkout]', reqId, 'checkout re-entered on a non-pending booking', {
        booking: bookingId, status: currentStatus,
      })
      // A dead booking (canceled, refunded) can never consume the reward it
      // reserved; hand the reservation back now instead of waiting for a
      // takeover. A PAID booking's reward belongs to the webhook's consume.
      // Release the hold whenever THIS request took it, settled or not. A
      // hold taken FRESH after the booking was already paid cannot be the
      // reward backing that charge (the webhook consumed that one, and a
      // pre-existing hold would have matched the OWN arm, leaving nothing
      // armed); left alone it sat 'reserved' on a paid booking with no
      // release path at all. releaseRewardReservation only touches a row
      // still 'reserved' by this booking, so a consumed reward is untouched.
      if (releaseHeldReward) await releaseHeldReward()
      // The gift value THIS request just debited goes back as well: a dead
      // booking has no intent, so no canceled webhook will ever do it.
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

    // 5. Reuse an in-flight PaymentIntent if there is one and it's reusable.
    const bookingRow = giftState

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
          // Resize in place when the cart changed, and re-point the intent's
          // reward_id at the reward THIS request reserved. The webhook
          // consumes whatever reward the intent names, so a reused intent
          // still naming an earlier reward would consume that one (leaving
          // the reserved one stranded), or consume a reward the guest has
          // since declined while paying full price. '' deletes the key.
          const wantReward = rewardId && pricing.rewardDiscount > 0 ? rewardId : null
          const hadReward =
            typeof existingPi.metadata?.reward_id === 'string' && existingPi.metadata.reward_id
              ? existingPi.metadata.reward_id
              : null
          let reusable = true
          if (existingPi.amount !== chargeCents || hadReward !== wantReward) {
            try {
              await stripe.paymentIntents.update(existingPi.id, {
                amount: chargeCents,
                metadata: { reward_id: wantReward ?? '' },
              })
            } catch (err) {
              // A failed resize must not hand back the old secret (the guest
              // would pay an amount the summary no longer shows) — but
              // minting on faith is worse. Stripe rejects amount updates
              // exactly when the intent has moved on (guest mid-3DS or
              // confirming in another tab), and the post-mint best-effort
              // cancel cannot kill a settling intent: one trip, two payable
              // intents. Prove the old intent dead FIRST; mint only on proof.
              console.warn('[checkout]', reqId, 'PI update failed, proving the old intent dead before minting', err)
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
                  // reward hold and gift claim stay with this pending row.
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
              couponDiscount: pricing.couponDiscount,
              amountDue: chargeCents / 100,
              requestId: reqId,
            })
          }
        }
      } catch (err) {
        // Fall through to minting ONLY when Stripe definitively reports the
        // intent gone (audit 2026-08-22). Any other retrieve failure is a
        // network/API fault: the succeeded/processing guards above never ran,
        // so the attached intent may be settling, and the best-effort cancel
        // below cannot kill a settling intent — minting here handed the guest
        // a second payable clientSecret for one trip. Same principle as
        // cancelPaymentIntent in lib/gift-redemption.ts: could not prove the
        // payment is dead, so treat it as still live and let the guest retry.
        const gone = err instanceof Stripe.errors.StripeError && err.code === 'resource_missing'
        if (!gone) {
          console.error('[checkout]', reqId, 'stale PI retrieve failed, refusing to mint a replacement', err)
          // Retryable, not terminal, so the reward hold and gift claim stay
          // with this pending row: its attached intent is exactly what the
          // webhook and the stale sweep own, and the retry re-enters here.
          return NextResponse.json(
            { error: 'Could not confirm your payment state just now. Please try again in a moment.', bookingId, requestId: reqId },
            { status: 503 },
          )
        }
        console.warn('[checkout]', reqId, 'attached PI no longer exists at Stripe, minting a replacement', bookingRow.stripe_payment_id)
        replacedPiProvenDead = true
      }
    }

    // 6. Create the PaymentIntent. The cart_hash is the idempotency key,
    //    so a double-clicked identical request will receive the same PI.
    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        booking_id: bookingId!,
        booking_type: 'tour',
        item_count: String(pricing.lines.length),
        ...(giftAmountCents > 0 ? { gift_card_amount: String(giftAmountCents / 100) } : {}),
        // The webhook flips this reward to 'used' on payment success
        // (idempotent), so a 3DS/redirect flow that never runs the
        // client-side consume still can't double-spend the reward.
        ...(rewardId && pricing.rewardDiscount > 0 ? { reward_id: rewardId } : {}),
        // The webhook counts the coupon on payment success, keyed on this.
        ...(coupon && pricing.couponDiscount > 0
          ? { coupon_id: coupon.id, coupon_code: coupon.code, coupon_discount: String(pricing.couponDiscount) }
          : {}),
        summary: pricing.lines
          .map((l) => `${l.experience.title.slice(0, 30)}|${l.travelers}x$${l.pricePerPerson}`)
          .join(', ')
          .slice(0, 490),
      },
      // Intentionally no `receipt_email`, Stripe would otherwise send
      // its own receipt and customers would receive two emails. Our
      // BookingConfirmed template (sent from the webhook) is the only
      // confirmation we want them to get.
    }
    // Keyed per booking row and per PI generation, NOT per cart. The old
    // cart-hash key outlived the PaymentIntent it created: once that PI
    // was canceled, Stripe served the same dead PI back for 24 hours and
    // the cart became unpurchasable — every declined-then-canceled retry
    // and every second identical booking simply could not pay. Concurrent
    // double-submits still dedupe: same row + same prior generation =
    // same key = one PI.
    let paymentIntent = await stripe.paymentIntents.create(piParams, {
      idempotencyKey: `pi:${bookingId}:${giftState?.stripe_payment_id ?? 'v1'}`,
    })
    // Stripe's idempotency cache can also replay an intent a failed EARLIER
    // attempt already canceled (mint → attach failed → cancel → 500 → the
    // retry re-enters with the same generation key, for up to 24h). A
    // canceled intent can never be paid — handing its secret to the client
    // strands the guest. Bump the generation exactly like any other: key the
    // re-mint on the dead intent's own id, deterministic across retries.
    if (paymentIntent.status === 'canceled') {
      console.warn('[checkout]', reqId, 'idempotency replayed a canceled intent, minting a fresh generation', paymentIntent.id)
      paymentIntent = await stripe.paymentIntents.create(piParams, {
        idempotencyKey: `pi:${bookingId}:${paymentIntent.id}`,
      })
    }

    // 7. Verified attach. If we can't persist the PI id back to the row,
    //    fail the request so the webhook never sees an orphan succeeded
    //    charge it can't correlate.
    // Attach ONLY while the row is still pending. The webhook re-stamps
    // stripe_payment_id with the intent that actually paid, and an
    // unconditional write here could land after it and replace the paying
    // intent with this unpaid one: the booking would then say 'paid' while
    // naming an intent nobody paid, which blinds the double-charge guard and
    // misroutes a later refund. Zero rows means the booking settled while
    // this intent was being minted, so this intent must die unpaid.
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
        /* swallow, best-effort cleanup */
      }
      if (!attachErr) {
        const { data: after } = await supabase
          .from('bookings').select('status').eq('id', bookingId!).maybeSingle()
        console.warn('[checkout]', reqId, 'booking left pending during mint, intent canceled', { booking: bookingId, status: after?.status })
        if (after?.status === 'paid') {
          return NextResponse.json({ alreadyPaid: true, bookingId, requestId: reqId })
        }
        if (releaseClaimedGift) await releaseClaimedGift()
        if (releaseHeldReward) await releaseHeldReward()
        return NextResponse.json(
          { error: 'This booking can no longer be paid for. Please start a new one.', bookingId, requestId: reqId },
          { status: 409 },
        )
      }
      console.error('[checkout]', reqId, 'PI attach failed', attachErr, paymentIntent.id)
      // Only the claim THIS request made. On a reused row the live claim can
      // belong to an earlier attempt whose intent is still attached and
      // payable at the discounted amount; releasing it would put the value
      // back on the card while that intent still charges the lower price.
      if (releaseClaimedGift) await releaseClaimedGift()
      if (releaseHeldReward) await releaseHeldReward()
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
    const replacedPi = giftState?.stripe_payment_id
    if (replacedPi && replacedPi !== paymentIntent.id && !replacedPiProvenDead) {
      try {
        await stripe.paymentIntents.cancel(replacedPi, { cancellation_reason: 'duplicate' })
      } catch (cancelErr) {
        // Terminal or gone is fine — but a PROCESSING intent cannot be
        // canceled and will settle alongside the fresh one. The resize-
        // failure branch above proves the old intent dead before minting, so
        // reaching here with a live intent should be impossible; log loudly
        // rather than swallow, so ops sees it if that invariant ever breaks.
        console.error('[checkout]', reqId, 'replaced PI cancel failed — verify it is not settling', { pi: replacedPi, err: cancelErr })
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId,
      giftAmount: giftAmountCents / 100,
      couponDiscount: pricing.couponDiscount,
      amountDue: chargeCents / 100,
      requestId: reqId,
    })
  } catch (err) {
    if (err instanceof PricingError) {
      console.warn('[checkout]', reqId, err.code, err.detail)
      return NextResponse.json(
        { error: err.code === 'amount_mismatch' ? 'Cart total mismatch, please reload and try again' : err.detail, requestId: reqId },
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
    // Never leak the raw internal error (Postgres/Stripe column/constraint
    // names) to the browser, log it, return a generic message + the
    // requestId the user can quote to support.
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[checkout]', reqId, 'create failed', message)
    if (releaseHeldReward) await releaseHeldReward().catch(() => {})
    if (releaseClaimedGift) await releaseClaimedGift().catch(() => {})
    return NextResponse.json(
      { error: 'Something went wrong creating your booking. Please try again.', bookingId: bookingIdOut ?? undefined, requestId: reqId },
      { status: 500 },
    )
  }
}
