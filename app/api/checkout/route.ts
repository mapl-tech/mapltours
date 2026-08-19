import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { priceTourCart, assertAmountMatches, PricingError } from '@/lib/checkout-pricing'
import { isExperienceDateBookable, LEAD_TIME_MESSAGE } from '@/lib/booking-window'
import { assertCheckoutSchema, SchemaNotReadyError } from '@/lib/checkout-schema'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { DEFAULT_DRIVER } from '@/lib/dispatch'
import { sanitizeAttribution } from '@/lib/attribution'
import { claimGiftCard, releaseGiftClaim } from '@/lib/gift-redemption'
import { normalizeGiftCode } from '@/lib/gift-cards'
import { maybeSendTravelerConfirmation, maybeSendOperatorAlert } from '@/lib/email/booking'

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
  /** Gift card code the traveler typed at checkout, if any. */
  giftCode?: string
  /**
   * Whether the traveler kept their video-upload reward. The PERCENT is never
   * taken from the client, only this yes/no. Omitted (older clients) means
   * "apply if available", preserving the previous behaviour.
   */
  applyReward?: boolean
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
          .eq('status', 'available')
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
    const pricing = priceTourCart(
      body.items.map((i) => ({ id: i.id, travelers: i.travelers, date: i.date })),
      body.breakdown ?? {},
      { rewardPercent },
    )
    assertAmountMatches(body.amount, pricing)
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

    const supabase = createServiceClient()

    // 2. Schema guard, fail fast if migrations are missing.
    const schemaFeatures = await assertCheckoutSchema(supabase)

    const cartHash = hashCart(body, amountInCents)
    const c = body.customer ?? {}
    const customerFields = {
      first_name: (c.firstName ?? '').slice(0, 80),
      last_name: (c.lastName ?? '').slice(0, 80),
      email: (c.email ?? '').slice(0, 200),
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
      // Authoritative. price_per_person is a rounded per-head derivation and
      // an indivisible party price does not multiply back to what was
      // charged; receipts read this instead.
      line_total: l.lineTotal,
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

    // 4b. Gift card. The balance comes off HERE, before the PaymentIntent is
    //     sized, because the charge is the total minus the gift — a card that
    //     lowered a charge without being debited first is free money.
    //
    //     A reused pending row may already hold a claim from an earlier
    //     attempt at the same cart; that claim is reused rather than taken
    //     again, so a double-submit debits the card once.
    const { data: giftState } = await supabase
      .from('bookings')
      .select('gift_card_id, gift_card_amount, stripe_payment_id, status')
      .eq('id', bookingId!)
      .maybeSingle()

    let giftAmountCents = 0
    let giftCardId: string | null = (giftState?.gift_card_id as string | null) ?? null

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
          return NextResponse.json(
            { error: 'Could not refresh your gift card. Please try again.', requestId: reqId },
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
        // The booking can't record what the card paid, so nothing downstream
        // (confirmation, refund, reconciliation) would know. Give it back.
        console.error('[checkout]', reqId, 'gift stamp failed', stampErr)
        await releaseGiftClaim(supabase, bookingId!)
        return NextResponse.json(
          { error: 'Could not apply that gift card. Please try again.', requestId: reqId },
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
      const { error: paidErr } = await supabase
        .from('bookings')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', bookingId!)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (paidErr) {
        console.error('[checkout]', reqId, 'gift-covered mark-paid failed', paidErr)
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

      // Consume the reward here too — the webhook normally does this.
      if (rewardId && pricing.rewardDiscount > 0) {
        await supabase
          .from('user_rewards')
          .update({ status: 'used', used_on_booking_id: bookingId, used_at: new Date().toISOString() })
          .eq('id', rewardId)
          .eq('status', 'available')
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
            break
          }
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        }
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
    if (giftState?.status && giftState.status !== 'pending') {
      const settled = giftState.status === 'paid'
      console.warn('[checkout]', reqId, 'checkout re-entered on a non-pending booking', {
        booking: bookingId, status: giftState.status,
      })
      return NextResponse.json(
        settled
          ? { alreadyPaid: true, bookingId, requestId: reqId }
          : {
              error: 'This booking can no longer be paid for. Please start a new one.',
              requestId: reqId,
            },
        { status: settled ? 200 : 409 },
      )
    }

    // 5. Reuse an in-flight PaymentIntent if there is one and it's reusable.
    const bookingRow = giftState

    if (bookingRow?.stripe_payment_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(bookingRow.stripe_payment_id)
        if (PI_REUSABLE_STATUSES.includes(existingPi.status)) {
          // If the amount changed (cart edited mid-session), update the PI in place.
          if (existingPi.amount !== chargeCents) {
            try {
              await stripe.paymentIntents.update(existingPi.id, { amount: chargeCents })
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
          summary: pricing.lines
            .map((l) => `${l.experience.title.slice(0, 30)}|${l.travelers}x$${l.pricePerPerson}`)
            .join(', ')
            .slice(0, 490),
        },
        // Intentionally no `receipt_email`, Stripe would otherwise send
        // its own receipt and customers would receive two emails. Our
        // BookingConfirmed template (sent from the webhook) is the only
        // confirmation we want them to get.
      },
      // Keyed per booking row and per PI generation, NOT per cart. The old
      // cart-hash key outlived the PaymentIntent it created: once that PI
      // was canceled, Stripe served the same dead PI back for 24 hours and
      // the cart became unpurchasable — every declined-then-canceled retry
      // and every second identical booking simply could not pay. Concurrent
      // double-submits still dedupe: same row + same prior generation =
      // same key = one PI.
      { idempotencyKey: `pi:${bookingId}:${giftState?.stripe_payment_id ?? 'v1'}` },
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
        /* swallow, best-effort cleanup */
      }
      await releaseGiftClaim(supabase, bookingId!)
      return NextResponse.json(
        { error: 'Could not attach payment intent', requestId: reqId },
        { status: 500 },
      )
    }

    // A replaced PaymentIntent must not stay payable: two live intents for
    // one booking means two tabs can each complete a different charge for the
    // same trip. Best-effort — an already-canceled intent throws, harmlessly.
    const replacedPi = giftState?.stripe_payment_id
    if (replacedPi && replacedPi !== paymentIntent.id) {
      try {
        await stripe.paymentIntents.cancel(replacedPi, { cancellation_reason: 'duplicate' })
      } catch { /* already terminal, or gone — either is fine */ }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      bookingId,
      giftAmount: giftAmountCents / 100,
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
    return NextResponse.json(
      { error: 'Something went wrong creating your booking. Please try again.', requestId: reqId },
      { status: 500 },
    )
  }
}
