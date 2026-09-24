import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DRIVER } from '@/lib/dispatch'
import { reportServerPurchase } from '@/lib/ga4-server'
import { reportMetaPurchase } from '@/lib/meta-capi'
import { syncBookingToCalendar, removeBookingFromCalendar } from '@/lib/google-calendar'
import { activateGiftCard } from '@/lib/gift-activation'
import { settleGiftClaim, releaseGiftClaim, refundToGiftCard } from '@/lib/gift-redemption'
import { consumeCoupon } from '@/lib/coupon-redemption'
import { sendEmail, operatorAlertRecipients, confirmationBcc } from '@/lib/email/send'
import { sendCancellationEmails } from '@/lib/email/cancellation'
import {
  claimEmailChannel as sharedClaimEmailChannel,
  releaseEmailChannel as sharedReleaseEmailChannel,
  type ClaimOutcome,
} from '@/lib/email/claim'
import BookingConfirmed from '@/emails/BookingConfirmed'
import OperatorBookingAlert from '@/emails/OperatorBookingAlert'
import TransferConfirmed from '@/emails/TransferConfirmed'
import TransferOperatorAlert from '@/emails/TransferOperatorAlert'

/**
 * Stripe webhook, single source of truth for payment status.
 *
 * The client-side `onPaymentSuccess` is only an optimistic UI cue. The flip
 * from 'pending' → 'paid', the confirmation email, and the ops notification
 * all happen HERE so a closed browser / failed redirect can't leave a paid
 * cart unfulfilled.
 *
 * Configure in Stripe dashboard → Developers → Webhooks:
 *   Endpoint URL: https://mapltours.com/api/webhooks/stripe
 *   Events:
 *     - payment_intent.succeeded
 *     - payment_intent.payment_failed
 *     - payment_intent.canceled
 *     - charge.refunded        (full refunds release the trip: -> 'refunded')
 *   Copy the "Signing secret" → STRIPE_WEBHOOK_SECRET env var.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface BookingItemRow {
  experience_id: number | null
  title: string
  destination: string
  travelers: number
  date: string
  price_per_person: number
  line_total: number | null
  // transfer fields (null for experience items)
  item_type: 'experience' | 'transfer'
  airport: string | null
  hotel: string | null
  zone: string | null
  trip_type: 'one_way' | 'round_trip' | null
  arrival_flight: string | null
  arrival_at: string | null
  departure_flight: string | null
  departure_at: string | null
  passengers: number | null
}

interface BookingRow {
  id: string
  status: string
  booking_type: 'tour' | 'transfer'
  /** Loaded via select('*'); read by the default-driver auto-assign. */
  driver_name: string | null
  driver_phone: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  country: string | null
  pickup: string | null
  dropoff: string | null
  /** 'HH:MM' Jamaica local, dispatch information only. */
  pickup_time: string | null
  special_requests: string | null
  total_paid: number
  subtotal: number | null
  booking_fee: number | null
  transport_cost: number | null
  reward_discount: number | null
  currency: string
  stripe_payment_id: string | null
  /** Portion of total_paid redeemed from a gift card, null when none. */
  gift_card_amount: number | null
  confirmation_email_sent_at: string | null
  operator_email_sent_at: string | null
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'webhook_not_configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const raw = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verification_failed'
    console.warn('[stripe-webhook] signature verification failed', msg)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent)
        break
      case 'payment_intent.canceled':
        await handlePaymentCanceled(event.data.object as Stripe.PaymentIntent)
        break
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge)
        break
      default:
        // Ignore unsubscribed events; keep Stripe happy with 200.
        break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'handler_error'
    console.error('[stripe-webhook] handler threw', event.type, msg)
    // Return 500 so Stripe retries. Idempotency in the handlers makes retries safe.
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/**
 * Load booking + line items for a PaymentIntent.
 *
 * Adversarial-review fix: the previous implementation swallowed Supabase
 * lookup errors and returned `booking: null`, which the success handler
 * treated identically to an unknown booking. That meant a transient DB
 * outage during webhook processing caused us to acknowledge a paid charge
 * without flipping the booking row, fulfillment dropped on the floor.
 *
 * Now: lookup errors throw (so the top-level handler returns 500 and
 * Stripe retries), and we use `pi.metadata.booking_id` as a recovery path
 * if the `stripe_payment_id` column was never written (e.g., the PI
 * attach update failed mid-flight in the checkout API).
 */
async function loadBooking(pi: Stripe.PaymentIntent) {
  const supabase = createServiceClient()

  // Primary lookup, by stripe_payment_id.
  const { data: byPi, error: byPiErr } = await supabase
    .from('bookings')
    .select('*')
    .eq('stripe_payment_id', pi.id)
    .maybeSingle()

  if (byPiErr) {
    // Schema/database failure, fail closed so Stripe retries.
    console.error('[stripe-webhook] booking lookup by stripe_payment_id failed', byPiErr)
    throw new Error(`booking lookup failed: ${byPiErr.message}`)
  }

  let booking = byPi as BookingRow | null

  // Fallback: pi.metadata.booking_id. Covers the orphan case where checkout
  // created the PI but the attach update never persisted.
  if (!booking) {
    const metaId =
      typeof pi.metadata?.booking_id === 'string' && pi.metadata.booking_id.length > 0
        ? pi.metadata.booking_id
        : null
    if (metaId) {
      const { data: byMeta, error: byMetaErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', metaId)
        .maybeSingle()
      if (byMetaErr) {
        console.error('[stripe-webhook] booking lookup by metadata.booking_id failed', byMetaErr)
        throw new Error(`booking metadata lookup failed: ${byMetaErr.message}`)
      }
      if (byMeta) {
        booking = byMeta as BookingRow
        // Heal the orphan: stamp the PI id onto the row so future webhook
        // deliveries take the fast path.
        if (!booking.stripe_payment_id) {
          await supabase
            .from('bookings')
            .update({ stripe_payment_id: pi.id })
            .eq('id', booking.id)
          booking.stripe_payment_id = pi.id
        }
      }
    }
  }

  if (!booking) {
    return { supabase, booking: null, items: [] as BookingItemRow[] }
  }

  const { data: items, error: itemsErr } = await supabase
    .from('booking_items')
    .select(
      'experience_id, title, destination, travelers, date, price_per_person, line_total, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers',
    )
    .eq('booking_id', booking.id)

  if (itemsErr) {
    console.error('[stripe-webhook] booking_items lookup failed', itemsErr)
    throw new Error(`booking items lookup failed: ${itemsErr.message}`)
  }

  return { supabase, booking, items: (items ?? []) as BookingItemRow[] }
}

async function handlePaymentSucceeded(pi: Stripe.PaymentIntent) {
  // Gift-card purchases are not bookings. Branch before loadBooking, which
  // would otherwise log them as unknown and drop them.
  if (pi.metadata?.kind === 'gift_card') {
    await handleGiftPaid(pi)
    return
  }

  const { supabase, booking, items } = await loadBooking(pi)
  if (!booking) {
    // Truly unknown, neither stripe_payment_id nor metadata.booking_id
    // resolved to a row. Acknowledge so Stripe stops retrying; this is
    // either a webhook for a different system or a permanently lost
    // booking that needs manual reconciliation in the dashboard.
    console.warn('[stripe-webhook] succeeded for unknown booking', pi.id, pi.metadata)
    return
  }

  // 'refunded' is TERMINAL. A refund can land while a succeeded delivery is
  // still in Stripe's retry queue (our own throw-on-transient-email-failure
  // makes multi-day retries normal), and without this gate the retry would
  // resurrect the refunded booking to paid, re-email the guest, and put the
  // dead trip back on the driver's schedule. Belt AND suspenders: an early
  // return here, plus a .neq guard on the write below for the read-update
  // race where the refund commits between our read and our write.
  if (booking.status === 'refunded') {
    console.log('[stripe-webhook] succeeded delivery for refunded booking ignored', booking.id)
    return
  }

  // A SECOND successful intent on an already-paid booking is a double
  // charge, and it used to be absorbed in silence: the row was already
  // 'paid', the email claims were already stamped, so the handler fell
  // through every branch and answered 200 with nothing logged. The guest's
  // first sign of it was their card statement, and ours was the dispute.
  // The checkout route now refuses to mint a second intent on a settled
  // booking, so reaching this line means the guest paid twice through some
  // path that guard did not cover. It cannot be refunded automatically,
  // because which of the two charges the guest wants kept is their call,
  // but it must never again be invisible.
  if (
    booking.status === 'paid' &&
    booking.stripe_payment_id &&
    booking.stripe_payment_id !== pi.id
  ) {
    console.error(
      '[stripe-webhook] CRITICAL: second successful PaymentIntent on a paid booking, guest likely charged twice, refund one in the dashboard',
      { booking_id: booking.id, kept_pi: booking.stripe_payment_id, duplicate_pi: pi.id, duplicate_amount: pi.amount },
    )
    return
  }

  // Mark paid only if we haven't already. We DO NOT short-circuit when
  // status is already 'paid', instead we fall through to the email step
  // which has its own per-channel idempotency. That way a transient
  // Resend outage during the first delivery is healed by Stripe's retry.
  if (booking.status !== 'paid') {
    const { data: transitioned, error } = await supabase
      .from('bookings')
      // stripe_payment_id is re-stamped here with the intent that ACTUALLY
      // paid. The row may still carry a later intent's id (checkout stamps
      // each mint onto the pending row), and if that later intent then also
      // succeeded, the double-charge guard above would compare it against
      // itself and stay silent. Recording the paying intent makes any other
      // intent's success trip the guard.
      .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_id: pi.id })
      .eq('id', booking.id)
      .neq('status', 'refunded')
      // 'paid' is excluded too, so exactly ONE delivery can win this
      // transition. Two intents on one booking succeeding within the same
      // second both read 'pending' above, and with only the refund guard
      // both updates matched (the second re-evaluated against the committed
      // 'paid' row, which is not 'refunded'), so both claimed the win and the
      // duplicate charge passed in silence. The loser now gets zero rows and
      // must find out WHY below.
      .neq('status', 'paid')
      .select('id')
    if (error) {
      console.error('[stripe-webhook] failed to mark booking paid', error)
      throw new Error(error.message) // → Stripe retries
    }
    if (!transitioned || transitioned.length === 0) {
      // Somebody else moved the row between our read and this update. Read
      // it back: a refund means the booking is dead; a paid row means a
      // concurrent delivery won, and whether THAT was the same intent (a
      // Stripe redelivery, harmless) or a different one (a second charge on
      // the same trip) is the whole question.
      const { data: after } = await supabase
        .from('bookings')
        .select('status, stripe_payment_id')
        .eq('id', booking.id)
        .maybeSingle()
      if (after?.status !== 'paid') {
        console.log('[stripe-webhook] paid transition skipped, booking no longer payable', { booking_id: booking.id, status: after?.status })
        return
      }
      if (after.stripe_payment_id && after.stripe_payment_id !== pi.id) {
        console.error(
          '[stripe-webhook] CRITICAL: second successful PaymentIntent on a paid booking (concurrent), guest likely charged twice, refund one in the dashboard',
          { booking_id: booking.id, kept_pi: after.stripe_payment_id, duplicate_pi: pi.id, duplicate_amount: pi.amount },
        )
        return
      }
      // Same intent, concurrent delivery: fall through to the email step,
      // whose per-channel claims make a second pass harmless.
      booking.status = 'paid'
      booking.stripe_payment_id = pi.id
    } else {
    booking.status = 'paid'
    booking.stripe_payment_id = pi.id

    // Server-side purchase for GA4 and Google Ads, exactly once: on the
    // delivery that flipped this booking to paid, so a Stripe redelivery
    // never double counts. The confirm page fires the same transaction id
    // client-side and GA4 dedupes on it; this one lands even when the guest
    // never returns from 3DS or closes the tab. Never fatal.
    await reportServerPurchase(booking)

    // The same purchase to Meta's Conversions API, deduped against the pixel
    // by the booking ref as eventID. Matters more here than for GA: iOS and
    // content blockers suppress the pixel for much of a mobile travel
    // audience, so without this the Facebook/Instagram optimiser barely
    // learns which click paid. Dormant until META_PIXEL_ID/META_CAPI_TOKEN
    // are set; never fatal.
    await reportMetaPurchase(booking)

    // Auto-assign the default driver, exactly once: on the delivery that
    // flipped this booking to paid. Living inside the transition means a
    // Stripe redelivery can never re-stamp a driver an operator deliberately
    // cleared, and a fresh paid transfer always has null driver columns, so
    // nothing manual can be overwritten. Non-fatal: the charge already
    // succeeded, so a failure here is logged for the console rather than
    // failing the webhook; the dispatch console shows the missing driver.
    if (booking.booking_type === 'transfer' && !booking.driver_name && !booking.driver_phone) {
      const { error: driverErr } = await supabase
        .from('bookings')
        .update(DEFAULT_DRIVER)
        .eq('id', booking.id)
        .is('driver_name', null)
        .is('driver_phone', null)
        .eq('status', 'paid')
      if (driverErr) {
        console.warn('[stripe-webhook] default driver assign failed', { booking_id: booking.id, error: driverErr.message })
      } else {
        Object.assign(booking, DEFAULT_DRIVER)
      }
    }
    }
  }

  // Turn any gift-card reservation on this cart into a permanent spend. The
  // balance already came off at checkout — this only closes the ledger row so
  // the stale sweep can never hand the value back on a booking that was paid.
  // amount_received is the arbiter: if Stripe took the FULL total, the charge
  // never carried the discount and the claim is released, not settled.
  await settleGiftClaim(supabase, booking.id, pi.amount_received)

  // Consume the video-upload reward, if one was applied to this checkout.
  // This is THE consume point for card-paid bookings: the client never
  // touches the reward row (a client-side consume used to race this and
  // wipe used_on_booking_id), and the gift-covered path settles server-side
  // in the checkout route. Idempotent, keyed on this booking.
  const rewardId = typeof pi.metadata?.reward_id === 'string' && pi.metadata.reward_id ? pi.metadata.reward_id : null
  const usedStamp = { status: 'used', used_on_booking_id: booking.id, used_at: new Date().toISOString() }
  let consumedId: string | null = null
  if (rewardId) {
    // 1. The reward the intent names, if this booking holds it. The row
    //    count is the real check: zero rows with no error means this
    //    booking does NOT hold that reward any more.
    const { data: consumed, error: rewardErr } = await supabase
      .from('user_rewards')
      .update(usedStamp)
      .eq('id', rewardId)
      .eq('status', 'reserved')
      .eq('used_on_booking_id', booking.id)
      .select('id')
    if (rewardErr) {
      // Non-fatal: the charge already succeeded. Log for reconciliation.
      console.warn('[stripe-webhook] reward consume failed', { reward_id: rewardId, error: rewardErr.message })
    } else if (consumed?.length) {
      consumedId = consumed[0].id
    }
  }
  if (!consumedId) {
    // 2. Whatever reward this booking holds NOW. A re-POST between the mint
    //    and the payment can move the booking's reservation to a newer
    //    reward (all milestones are the same percent, so the intent's
    //    amount is still right): the discount this charge carried is
    //    backed by the reward the booking holds, not by the id the intent
    //    remembers. Consuming the held one keeps "one paid discount, one
    //    used reward" true; consuming the remembered one would have used a
    //    released row and left the held one 'reserved' on a paid booking,
    //    where nothing can ever free it.
    const { data: heldNow } = await supabase
      .from('user_rewards')
      .update(usedStamp)
      .eq('status', 'reserved')
      .eq('used_on_booking_id', booking.id)
      .select('id')
    if (heldNow?.length) {
      consumedId = heldNow[0].id
      if (rewardId && consumedId !== rewardId) {
        console.warn('[stripe-webhook] consumed the reward the booking holds, not the one the intent named', { booking_id: booking.id, named: rewardId, consumed: consumedId })
      }
    }
  }
  if (!consumedId && rewardId) {
    // 3. Nothing held. Either a redelivery already consumed it (routine), or
    //    ANOTHER booking consumed this reward and the discount this charge
    //    carried is backed by nothing: the double-spend the reservation
    //    exists to prevent, and it must never pass in silence.
    const { data: row } = await supabase
      .from('user_rewards').select('status, used_on_booking_id').eq('id', rewardId).maybeSingle()
    if (row?.status === 'used' && row.used_on_booking_id === booking.id) {
      consumedId = rewardId
    } else if (row?.status === 'available' && !row.used_on_booking_id) {
      // Released between mint and payment (intent predates the reservation
      // shipping, or a takeover freed it): the discount was real, so spend
      // it rather than hand the guest a free 5%.
      const { data: late } = await supabase
        .from('user_rewards').update(usedStamp).eq('id', rewardId).eq('status', 'available').is('used_on_booking_id', null).select('id')
      if (late?.length) consumedId = rewardId
    }
    if (!consumedId) {
      console.error(
        '[stripe-webhook] CRITICAL: reward already consumed elsewhere, this charge carried an unbacked discount',
        { reward_id: rewardId, booking_id: booking.id, holder: row?.used_on_booking_id, holder_status: row?.status },
      )
    }
  }
  // 4. A paid booking can back exactly ONE reward. Free any other row still
  //    reserved by it, or it sits there for good: the takeover refuses paid
  //    holders and no release path runs for a settled booking.
  {
    let q = supabase
      .from('user_rewards')
      .update({ status: 'available', used_on_booking_id: null })
      .eq('status', 'reserved')
      .eq('used_on_booking_id', booking.id)
    if (consumedId) q = q.neq('id', consumedId)
    const { data: freed } = await q.select('id')
    if (freed?.length) console.warn('[stripe-webhook] released extra reward reservation(s) on a paid booking', { booking_id: booking.id, rewards: freed.map((r) => r.id) })
  }

  // Count the coupon, if one priced this checkout. Same authority as the
  // reward: this is the only place that sees every successful payment,
  // including 3DS and wallet flows. Idempotent under redelivery (one ledger
  // row per booking); a failure never fails the webhook, it is logged for
  // the desk.
  const couponId = typeof pi.metadata?.coupon_id === 'string' ? pi.metadata.coupon_id : null
  if (couponId) {
    const used = await consumeCoupon(supabase, {
      couponId,
      bookingId: booking.id,
      email: (booking as { email?: string | null }).email ?? null,
      amount: Number(pi.metadata?.coupon_discount ?? 0) || 0,
    })
    if (!used.ok) console.error('[stripe-webhook] CRITICAL: coupon consume failed', { booking_id: booking.id, coupon_id: couponId, error: used.message })
    else if (used.overRedeemed) console.error('[stripe-webhook] CRITICAL: coupon over-redeemed', { booking_id: booking.id, coupon_id: couponId })
  }

  // Emails, gated on per-channel sent-at columns, NOT on booking status.
  // If a previous delivery sent the traveler email but Resend bounced the
  // operator email, the next webhook retry will try only the operator side.
  const traveler = await maybeSendTravelerConfirmation(supabase, booking, items)
  const operator = await maybeSendOperatorAlert(supabase, booking, items)

  // Surface a non-fatal warning if any channel failed. We acknowledge the
  // webhook so Stripe doesn't retry forever, but the operator inbox keeps
  // a paper trail. The next succeeded delivery (if Stripe schedules one)
  // will retry whatever still has a NULL sent-at.
  if (!traveler.ok || !operator.ok) {
    console.warn('[stripe-webhook] partial email delivery', {
      booking_id: booking.id,
      traveler: traveler.ok ? 'sent' : traveler.reason,
      operator: operator.ok ? 'sent' : operator.reason,
    })
    // A TRANSIENT send failure (Resend blip) must NOT be silently dropped,
    // a paid booking with no confirmation / no operator dispatch is a real
    // fulfillment gap. Throw so Stripe re-delivers; the released claim means
    // only the still-unsent channel retries (the other short-circuits).
    const retryable = (!traveler.ok && traveler.retryable) || (!operator.ok && operator.retryable)
    if (retryable) {
      throw new Error(`transient email failure, retrying via Stripe re-delivery (booking ${booking.id})`)
    }
  }

  // Ops calendar, LAST and best-effort: the paid booking appears on the
  // shared "MAPL Bookings" Google Calendar. Event ids derive from the
  // booking id, so a Stripe redelivery re-inserting is a harmless 409, and
  // a failure here is logged, never thrown — the payment path stays sacred.
  const calendar = await syncBookingToCalendar(booking, items)
  if (!calendar.ok && calendar.reason !== 'not configured') {
    console.warn('[stripe-webhook] ops calendar sync failed', { booking_id: booking.id, reason: calendar.reason })
  }
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  // 'paid' and 'refunded' are both ahead of 'failed' in the lifecycle: a
  // late-delivered failure from an earlier attempt must not scrub either.
  // In-memory check plus a status predicate on the write for the race.
  if (!booking || booking.status === 'paid' || booking.status === 'refunded') return

  // Same superseded-intent guard as handlePaymentCanceled: a decline on an
  // intent the checkout has already replaced must not stamp failed_at onto a
  // booking whose CURRENT intent the guest is still paying.
  if (booking.stripe_payment_id && booking.stripe_payment_id !== pi.id) {
    console.log('[stripe-webhook] ignoring failure of superseded intent', {
      booking_id: booking.id, failed_pi: pi.id, current_pi: booking.stripe_payment_id,
    })
    return
  }

  // DELIBERATELY no releaseGiftClaim here. payment_failed fires on every
  // decline while the PaymentIntent is STILL PAYABLE — Stripe Elements
  // retries on the same intent, and that retry regularly succeeds. Releasing
  // on failure returned the balance while the discounted charge could still
  // complete, so one card could fund a second cart and then have the first
  // succeed: two discounts from one balance. The value comes back on
  // payment_intent.canceled (terminal, released below in
  // handlePaymentCanceled) or via the stale-reservation sweep, which cancels
  // the PaymentIntent FIRST and only then releases.

  // The decline reason is logged, never written to the booking. It used to be
  // appended to special_requests, and when the retry on the same intent
  // succeeded, the confirmation email and the driver's trip sheet both
  // carried "[failure: Your card was declined.]" into the guest's inbox.
  const errMsg =
    pi.last_payment_error?.message ??
    pi.last_payment_error?.code ??
    'payment_failed'
  console.log('[stripe-webhook] payment failed', { booking_id: booking.id, reason: errMsg })

  await supabase
    .from('bookings')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .not('status', 'in', '("paid","refunded")')
}

async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  if (!booking || booking.status === 'paid' || booking.status === 'refunded') return

  // A SUPERSEDED intent's cancellation says nothing about the booking.
  //
  // When checkout replaces a PaymentIntent (cart edited, gift code applied,
  // a transient retrieve failure), it attaches the NEW intent to the row and
  // explicitly cancels the old one. That cancellation still finds this
  // booking through metadata.booking_id, and acting on it released the gift
  // claim out from under a LIVE intent and flipped a payable booking to
  // 'canceled' while the guest sat on the Stripe form. Only the intent the
  // booking currently holds may speak for it.
  if (booking.stripe_payment_id && booking.stripe_payment_id !== pi.id) {
    console.log('[stripe-webhook] ignoring cancellation of superseded intent', {
      booking_id: booking.id, canceled_pi: pi.id, current_pi: booking.stripe_payment_id,
    })
    return
  }

  // Mirror handlePaymentFailed: a cancelled intent must hand the reserved
  // gift-card value back, or the balance stays debited for a booking that
  // will never be paid until the stale sweep catches it.
  await releaseGiftClaim(supabase, booking.id)

  // Same for a reserved reward: cancellation is terminal for this intent, so
  // the discount goes back on the shelf. Conditional on OUR booking holding
  // it, so a reservation this row has already moved on from is untouched.
  await supabase
    .from('user_rewards')
    .update({ status: 'available', used_on_booking_id: null })
    .eq('used_on_booking_id', booking.id)
    .eq('status', 'reserved')

  await supabase.from('bookings').update({ status: 'canceled' }).eq('id', booking.id)
    .not('status', 'in', '("paid","refunded")')
}

/**
 * A refund happened on Stripe's side. This exists so refunds issued BY HAND
 * in the Stripe Dashboard land in the database too, instead of leaving the
 * row reading 'paid' while the money has gone back.
 *
 * /api/bookings/[id]/cancel already stamps the row before calling Stripe, so
 * for self-serve cancellations this webhook simply finds the work done and
 * no-ops. It is the manual path that needs it.
 */
// `retryable` distinguishes a transient send failure (worth having Stripe
// re-deliver the webhook) from a permanent one (no email on record, no ops
// address configured) where retrying can never succeed.
type EmailResult = { ok: true } | { ok: false; reason: string; retryable: boolean }

/**
 * Atomically CLAIM one email channel before sending, so two concurrent /
 * duplicate webhook deliveries can't both pass a check-then-act gate and
 * double-send. The conditional UPDATE ... WHERE <col> IS NULL RETURNING is
 * the lock: exactly one delivery flips NULL->now() and proceeds; the loser
 * gets 0 rows and skips. On a send failure we release the claim so a Stripe
 * retry can try again (see `retryable`).
 */
async function claimEmailChannel(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  column: 'confirmation_email_sent_at' | 'operator_email_sent_at',
): Promise<ClaimOutcome> {
  // Implementation lives in lib/email/claim.ts so the cancellation path
  // shares it. The paid-status guard is NON-NEGOTIABLE here: without it a
  // refund racing the handler lets a confirmation email escape for a
  // booking that is no longer paid.
  return sharedClaimEmailChannel(supabase, bookingId, column, 'bookings', { requireStatus: 'paid' })
}

async function releaseEmailChannel(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  column: 'confirmation_email_sent_at' | 'operator_email_sent_at',
): Promise<void> {
  await sharedReleaseEmailChannel(supabase, bookingId, column)
}

async function maybeSendTravelerConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  booking: BookingRow,
  items: BookingItemRow[],
): Promise<EmailResult> {
  if (booking.confirmation_email_sent_at) return { ok: true }
  if (!booking.email) {
    console.warn('[stripe-webhook] no email on booking', booking.id)
    return { ok: false, reason: 'no_email_on_record', retryable: false }
  }

  {
    // Three outcomes, and only one of them is "someone else is sending".
    // 'error' used to wear the same boolean as 'lost', so a transient
    // database blip during the claim was read as a lost race, the handler
    // answered ok, Stripe got its 200, and a PAID booking's email was
    // dropped forever. An errored claim is now retryable: nobody holds the
    // channel, so asking Stripe to redeliver is safe and correct.
    const claim = await claimEmailChannel(supabase, booking.id, 'confirmation_email_sent_at')
    if (claim === 'lost') return { ok: true }
    if (claim === 'error') return { ok: false, reason: 'claim_error', retryable: true }
  }

  const bookingRef = humanizeId(booking.id)
  const isTransfer = booking.booking_type === 'transfer'

  const res = isTransfer
    ? await sendEmail({
        to: booking.email,
        // Operations and the driver hold exactly what the guest holds.
        bcc: confirmationBcc(booking.email),
        subject: `Transfer confirmed, your Jamaica airport ride (${bookingRef})`,
        react: TransferConfirmed({
          bookingRef,
          firstName: booking.first_name,
          lastName: booking.last_name,
          email: booking.email,
          customerPhone: booking.phone,
          country: booking.country,
          subtotal: booking.subtotal != null ? Number(booking.subtotal) : null,
          bookingFee: booking.booking_fee != null ? Number(booking.booking_fee) : null,
          couponCode: (booking as { coupon_code?: string | null }).coupon_code ?? null,
          couponDiscount: (booking as { coupon_discount?: number | string | null }).coupon_discount != null ? Number((booking as { coupon_discount?: number | string | null }).coupon_discount) : null,
          totalPaid: Number(booking.total_paid),
          // The gift-funded split. total_paid is the gross cart; the card was
          // charged total_paid minus this, and the email must match the card.
          giftApplied: booking.gift_card_amount != null ? Number(booking.gift_card_amount) : null,
          currency: booking.currency.toUpperCase(),
          paidAt: (booking as { paid_at?: string | null }).paid_at ?? null,
          specialRequests: booking.special_requests,
          transfers: items.map((i) => ({
            destination: i.hotel ?? i.destination,
            zone: i.zone ?? '',
            tripType: (i.trip_type ?? 'one_way') as 'one_way' | 'round_trip',
            passengers: i.passengers ?? i.travelers,
            priceUsd: Number(i.price_per_person),
            arrivalFlight: i.arrival_flight,
            arrivalAt: i.arrival_at,
            departureFlight: i.departure_flight,
            departureAt: i.departure_at,
          })),
        }),
        tags: [
          { name: 'category', value: 'transfer_confirmed' },
          { name: 'booking_id', value: booking.id },
        ],
      })
    : await sendEmail({
        to: booking.email,
        // Operations and the driver hold exactly what the guest holds.
        bcc: confirmationBcc(booking.email),
        subject: `Booking confirmed, your Jamaica trip with MAPL (${bookingRef})`,
        react: BookingConfirmed({
          bookingRef,
          firstName: booking.first_name,
          lastName: booking.last_name,
          email: booking.email,
          phone: booking.phone,
          country: booking.country,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          specialRequests: booking.special_requests,
          subtotal: booking.subtotal != null ? Number(booking.subtotal) : null,
          bookingFee: booking.booking_fee != null ? Number(booking.booking_fee) : null,
          transportCost: booking.transport_cost != null ? Number(booking.transport_cost) : null,
          rewardDiscount: booking.reward_discount != null ? Number(booking.reward_discount) : null,
          couponCode: (booking as { coupon_code?: string | null }).coupon_code ?? null,
          couponDiscount: (booking as { coupon_discount?: number | string | null }).coupon_discount != null ? Number((booking as { coupon_discount?: number | string | null }).coupon_discount) : null,
          totalPaid: Number(booking.total_paid),
          // The gift-funded split. total_paid is the gross cart; the card was
          // charged total_paid minus this, and the email must match the card.
          giftApplied: booking.gift_card_amount != null ? Number(booking.gift_card_amount) : null,
          currency: booking.currency.toUpperCase(),
          paidAt: (booking as { paid_at?: string | null }).paid_at ?? null,
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            pricePerPerson: Number(i.price_per_person),
            // Stored total when we have it, the old product for rows written
            // before line_total existed. Multiplying a rounded per-head price
            // back up is what put "$102.99" on a line beside a "$103.00"
            // total; lib/email/booking.ts has read it this way since the
            // column landed, and this duplicate had not caught up.
            linePrice: i.line_total != null ? Number(i.line_total) : Number(i.price_per_person) * i.travelers,
          })),
        }),
        tags: [
          { name: 'category', value: 'booking_confirmed' },
          { name: 'booking_id', value: booking.id },
        ],
      })

  if (res.ok) {
    return { ok: true } // channel already stamped by claimEmailChannel
  }
  await releaseEmailChannel(supabase, booking.id, 'confirmation_email_sent_at')
  return { ok: false, reason: res.error ?? 'unknown_send_error', retryable: true }
}

// Operations distribution list. Both addresses receive every operator
// alert (tour bookings AND transfer bookings). Override via the
// OPERATIONS_EMAIL env var with a comma-separated list if the recipient
// set ever changes, empty / unset falls back to this default.
const OPS_RECIPIENTS_DEFAULT = [
  'contact@mapltours.com',
  'collinsadventuretours@gmail.com',
]

function resolveOpsRecipients(): string[] {
  // Only OPERATIONS_EMAIL can override. The default is now the same address
  // as EMAIL_SUPPORT by the owner's decision (operator alerts and customer
  // enquiries share one inbox), but it stays written out literally rather
  // than reading EMAIL_SUPPORT: these are different concerns that happen to
  // share a value today, and coupling them means changing the public reply-to
  // would silently redirect every booking alert.
  const raw = process.env.OPERATIONS_EMAIL
  if (!raw) return OPS_RECIPIENTS_DEFAULT
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : OPS_RECIPIENTS_DEFAULT
}

async function maybeSendOperatorAlert(
  supabase: ReturnType<typeof createServiceClient>,
  booking: BookingRow,
  items: BookingItemRow[],
): Promise<EmailResult> {
  if (booking.operator_email_sent_at) return { ok: true }
  // Operations AND the driver. See operatorAlertRecipients: Collins runs the
  // trip, so the alert that announces it has to reach him, not just the inbox
  // that files it.
  const opsRecipients = operatorAlertRecipients(resolveOpsRecipients())
  if (opsRecipients.length === 0) return { ok: false, reason: 'no_ops_email_configured', retryable: false }

  {
    // Three outcomes, and only one of them is "someone else is sending".
    // 'error' used to wear the same boolean as 'lost', so a transient
    // database blip during the claim was read as a lost race, the handler
    // answered ok, Stripe got its 200, and a PAID booking's email was
    // dropped forever. An errored claim is now retryable: nobody holds the
    // channel, so asking Stripe to redeliver is safe and correct.
    const claim = await claimEmailChannel(supabase, booking.id, 'operator_email_sent_at')
    if (claim === 'lost') return { ok: true }
    if (claim === 'error') return { ok: false, reason: 'claim_error', retryable: true }
  }

  const bookingRef = humanizeId(booking.id)
  const customerName =
    `${booking.first_name ?? ''} ${booking.last_name ?? ''}`.trim() || 'Guest'
  const isTransfer = booking.booking_type === 'transfer'

  const res = isTransfer
    ? await sendEmail({
        to: opsRecipients,
        subject: `MAPL Tours · New transfer · ${bookingRef} · ${items.length} ride${items.length !== 1 ? 's' : ''}`,
        react: TransferOperatorAlert({
          bookingRef,
          customerName,
          customerEmail: booking.email ?? '(no email)',
          customerPhone: booking.phone,
          customerCountry: booking.country,
          specialRequests: booking.special_requests,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          transfers: items.map((i) => ({
            destination: i.hotel ?? i.destination,
            zone: i.zone ?? '',
            tripType: (i.trip_type ?? 'one_way') as 'one_way' | 'round_trip',
            passengers: i.passengers ?? i.travelers,
            priceUsd: Number(i.price_per_person),
            arrivalFlight: i.arrival_flight,
            arrivalAt: i.arrival_at,
            departureFlight: i.departure_flight,
            departureAt: i.departure_at,
          })),
        }),
        tags: [
          { name: 'category', value: 'transfer_operator_alert' },
          { name: 'booking_id', value: booking.id },
        ],
      })
    : await sendEmail({
        to: opsRecipients,
        subject: `MAPL Tours · New booking · ${bookingRef} · ${items.length} experience${items.length !== 1 ? 's' : ''}`,
        react: OperatorBookingAlert({
          bookingRef,
          customerName,
          customerEmail: booking.email ?? '(no email)',
          customerPhone: booking.phone,
          customerCountry: booking.country,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          // The time the guest asked to be collected. It reached the operator
          // only on the gift-covered path, which calls lib/email/booking.ts;
          // every card booking, meaning almost all of them, came through this
          // duplicate and dropped it, so the driver never saw a time the guest
          // had explicitly chosen at checkout.
          pickupTime: booking.pickup_time,
          specialRequests: booking.special_requests,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            // Stored total when we have it, the old product for rows written
            // before line_total existed. Multiplying a rounded per-head price
            // back up is what put "$102.99" on a line beside a "$103.00"
            // total; lib/email/booking.ts has read it this way since the
            // column landed, and this duplicate had not caught up.
            linePrice: i.line_total != null ? Number(i.line_total) : Number(i.price_per_person) * i.travelers,
          })),
        }),
        tags: [
          { name: 'category', value: 'operator_alert' },
          { name: 'booking_id', value: booking.id },
        ],
      })

  if (res.ok) {
    return { ok: true }
  }
  await releaseEmailChannel(supabase, booking.id, 'operator_email_sent_at')
  return { ok: false, reason: res.error ?? 'unknown_send_error', retryable: true }
}

// Short, user-friendly booking reference, first 8 of the uuid, upper-cased.
function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

/**
 * A FULL refund releases the trip: the guest is not traveling with us, so the
 * booking leaves the operational world. Setting status to 'refunded' makes
 * every downstream surface drop it at once, because they all filter on
 * status = 'paid': the day-of email cron and its guard, the driver portal,
 * the dispatch console list, and the cash-flow revenue view.
 *
 * Partial refunds (a goodwill credit) leave the trip on: charge.refunded is
 * true only when the charge is fully refunded.
 *
 * Idempotent: the update matches only status = 'paid', so a redelivered
 * event finds zero rows and does nothing. A DB error throws so Stripe
 * retries, the same healing path the paid transition uses.
 */
/**
 * A gift card was paid for.
 *
 * This is the ONLY place a card becomes spendable. The checkout route creates
 * it 'pending'; if the payment never completes, the row stays inert rather
 * than becoming free credit.
 *
 * The status flip is conditional on still being 'pending', so Stripe's
 * retries cannot re-activate a card that was later voided, and the delivery
 * email is claimed the same way the booking emails are, so a redelivered
 * webhook cannot email the recipient twice.
 */
async function handleGiftPaid(pi: Stripe.PaymentIntent) {
  const giftId = typeof pi.metadata?.gift_card_id === 'string' ? pi.metadata.gift_card_id : null
  if (!giftId) {
    console.warn('[stripe-webhook] gift payment with no gift_card_id', pi.id)
    return
  }
  // Shared with the buyer's own return-from-payment path, so a slow or
  // missing webhook cannot leave a paid card undelivered. Idempotent.
  const { delivered } = await activateGiftCard(giftId, pi.id)

  // Fail the event when the code did not reach the recipient. The card is
  // already active and the flip is conditional, so Stripe's retry re-runs a
  // no-op activation and one more delivery attempt. Answering 200 here meant a
  // transient mail failure was final: money taken, card live, and nobody ever
  // told the recipient what their code was.
  if (!delivered) {
    throw new Error(`gift card ${giftId} activated but delivery email failed`)
  }
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  const metaBookingId = typeof charge.metadata?.booking_id === 'string' ? charge.metadata.booking_id : null
  if (!piId && !metaBookingId) return
  const supabase = createServiceClient()

  // A refunded gift-card PURCHASE, which is not a booking and would otherwise
  // fall straight through: the update below matches on bookings, finds
  // nothing, and the card is left active with its full balance. The buyer
  // gets their money back and the recipient can still spend the card, so the
  // same value leaves twice. handlePaymentSucceeded branches on this metadata
  // for exactly the same reason; this is the other half of that pair.
  if (piId) {
    const { data: card } = await supabase
      .from('gift_cards')
      .select('id, code, status, initial_amount, balance')
      .eq('stripe_payment_id', piId)
      .maybeSingle()
    if (card) {
      const spent = Number(card.initial_amount) - Number(card.balance)
      const { data: voided } = await supabase
        .from('gift_cards')
        .update({ status: 'void', balance: 0 })
        .eq('id', card.id)
        .neq('status', 'void')
        .select('id')
        .maybeSingle()
      if (voided) {
        console.warn('[stripe-webhook] gift card voided after its purchase was refunded', {
          giftCardId: card.id, code: card.code, pi: piId,
        })
      }
      // Value already redeemed cannot be clawed back from the bookings it
      // discounted, so say so loudly rather than quietly zeroing it.
      if (spent > 0) {
        console.error(
          '[stripe-webhook] CRITICAL: refunded gift card had already been spent, manual reconciliation required',
          { giftCardId: card.id, code: card.code, spent, refunded: (charge.amount_refunded ?? 0) / 100 },
        )
      }
      return
    }
  }

  // Matches EVERY status except 'refunded' itself. Stripe guarantees neither
  // event order nor single delivery, and a refund consumed as a 200 no-op is
  // never redelivered, leaving a later succeeded retry free to resurrect the
  // booking. Three review rounds each found a status being reasoned out of
  // this list ('pending', then 'failed', then 'canceled' via a sibling
  // PaymentIntent cancelling the row while the charging PI refunds), so the
  // rule is now structural: charge.refunded proves money moved, therefore it
  // terminates the booking whatever transient state the row is in. Flipping
  // an already-dead canceled row to refunded is harmless; missing one is not.
  // Refund bookkeeping rides on the SAME conditional update that flips the
  // status, so amounts can never be recorded for a row the guard rejected.
  // Stripe's figure is what actually left the account (a Dashboard refund
  // can be any amount); admin_charge is derived from it per row below.
  const refundedCents = charge.amount_refunded ?? 0
  const refundFields = {
    status: 'refunded',
    refund_state: 'approved',
    refund_decided_at: new Date().toISOString(),
    refunded_at: new Date().toISOString(),
    refund_amount: refundedCents / 100,
  }
  const refundByPi = () => supabase
    .from('bookings').update(refundFields).neq('status', 'refunded')
    .eq('stripe_payment_id', piId!).select('id, dispatch, total_paid, gift_card_amount, gift_card_id, refund_quoted_gift')
  // The metadata fallback may only terminate a booking whose current intent
  // IS this charge's intent, or that never had one stamped (the orphan the
  // fallback exists for). When the row holds a DIFFERENT intent, the charge
  // being refunded belongs to a superseded or duplicate intent: the
  // double-charge CRITICAL log tells ops to refund exactly such a charge,
  // and this fallback used to answer that refund by marking the real, kept
  // booking refunded, cancelling the guest and standing the driver down.
  const refundByMeta = () => {
    let q = supabase
      .from('bookings').update(refundFields).neq('status', 'refunded')
      .eq('id', metaBookingId!)
    if (piId) q = q.or(`stripe_payment_id.is.null,stripe_payment_id.eq.${piId}`)
    return q.select('id, dispatch, total_paid, gift_card_amount, gift_card_id, refund_quoted_gift')
  }

  // Two-step lookup, mirroring loadBooking: an orphan booking whose
  // stripe_payment_id was never healed matches zero rows by PI, and the
  // refund must then resolve through metadata rather than being consumed.
  let data: { id: string; dispatch: unknown; total_paid: number | null; gift_card_amount: number | null; gift_card_id: string | null; refund_quoted_gift: number | null }[] | null = null
  let error: { message: string } | null = null
  if (piId) ({ data, error } = await refundByPi())
  if (!error && (!data || data.length === 0) && metaBookingId) ({ data, error } = await refundByMeta())

  if (error) {
    console.error('[stripe-webhook] refund status update failed', { pi: piId, error: error.message })
    throw new Error(error.message)
  }
  if (!data || data.length === 0) {
    // Either an idempotent redelivery (already refunded), a refund for a
    // booking we cannot resolve, or a refund of a charge that is NOT the
    // booking's current intent (see refundByMeta). The last one is the
    // double-charge cleanup and deserves its own, louder line: the booking
    // is deliberately left as it is, and the money movement is Stripe's.
    let foreignIntent = false
    if (metaBookingId && piId) {
      const { data: bk } = await supabase
        .from('bookings').select('status, stripe_payment_id').eq('id', metaBookingId).maybeSingle()
      foreignIntent = !!bk?.stripe_payment_id && bk.stripe_payment_id !== piId
      if (foreignIntent) {
        console.warn('[stripe-webhook] charge.refunded is for a non-current intent on this booking; booking left untouched', {
          booking_id: metaBookingId, booking_status: bk?.status, booking_pi: bk?.stripe_payment_id, refunded_pi: piId,
          refunded: refundedCents / 100,
        })
      }
    }
    if (!foreignIntent) {
      console.warn('[stripe-webhook] charge.refunded matched no refundable booking', { pi: piId, meta: metaBookingId })
    }
  }
  if (data?.length) {
    // Record when we learned of the refund, for support conversations.
    for (const row of data) {
      const { error: stampErr } = await supabase.rpc('merge_dispatch', {
        p_booking_id: row.id,
        p_patch: { refunded_at: new Date().toISOString() },
      })
      if (stampErr) console.error('[stripe-webhook] refunded_at stamp failed', { booking: row.id, error: stampErr.message })
    }
    // What we kept, from Stripe's own figure against the row's gross.
    for (const row of data) {
      // What MAPL kept is measured against what STRIPE actually captured, not
      // against the whole cart. When a gift card funded part of the booking,
      // Stripe only ever took total_paid minus the gift share, so subtracting
      // the refund from the gross billed the gift-funded portion back to the
      // guest as though it were an administration fee.
      const grossCents = Math.round(Number(row.total_paid ?? 0) * 100)
      const giftCents = Math.round(Number(row.gift_card_amount ?? 0) * 100)
      const capturedCents = Math.max(0, grossCents - giftCents)
      const { error: chargeErr } = await supabase
        .from('bookings')
        .update({ admin_charge: Math.max(0, capturedCents - refundedCents) / 100 })
        .eq('id', row.id)
      if (chargeErr) console.error('[stripe-webhook] admin_charge stamp failed', { booking: row.id, error: chargeErr.message })
    }
    // Return the gift-funded share. Stripe's refund only ever covers the CASH
    // it captured; the gift portion never touched Stripe, so without this a
    // Dashboard refund silently destroys it — the guest loses the whole gift
    // share of the booking, and no sweep ever repairs it, because the
    // redemption row sits at 'spent' on a 'refunded' booking forever.
    //
    // Amount owed, in order of authority:
    //   1. refund_quoted_gift — a lodged cancellation request stored the
    //      policy split (cash made whole first, admin charge out of gift).
    //   2. No quote (pure Dashboard refund): a FULL cash refund reads as ops
    //      making the guest whole, so the full gift share returns; a partial
    //      refund returns the gift share pro-rata.
    //
    // Idempotent by construction: this loop only runs for rows the
    // conditional status flip actually matched (first processing), and
    // refundToGiftCard claims the 'spent' ledger row before crediting, so
    // the admin approval route racing this webhook can never double-credit.
    for (const row of data) {
      const giftCents = Math.round(Number(row.gift_card_amount ?? 0) * 100)
      if (!row.gift_card_id || giftCents <= 0) continue

      const { data: ledger } = await supabase
        .from('gift_card_redemptions')
        .select('status')
        .eq('booking_id', row.id)
        .in('status', ['reserved', 'spent'])
        .maybeSingle()

      let ledgerStatus = ledger?.status
      if (ledgerStatus === 'reserved') {
        // Out-of-order delivery: the refund landed before payment_intent
        // .succeeded ever settled the claim. The succeeded handler returns
        // early on refunded bookings, so nothing else will ever release
        // this reservation. Hand the whole claim back now.
        await releaseGiftClaim(supabase, row.id)
        // Then LOOK: a succeeded delivery already past its paid transition
        // can settle this same row to 'spent' between our read and the
        // release, in which case the release matched nothing and the value
        // is still owed. Fall through to the spent path rather than
        // consuming the refund as done.
        const { data: again } = await supabase
          .from('gift_card_redemptions')
          .select('status')
          .eq('booking_id', row.id)
          .in('status', ['reserved', 'spent'])
          .maybeSingle()
        ledgerStatus = again?.status
        if (ledgerStatus === 'spent') {
          console.warn('[stripe-webhook] gift claim was settled under the refund; crediting it back as a spent claim', { booking: row.id })
        } else {
          continue
        }
      }
      if (ledgerStatus !== 'spent') continue // nothing held, nothing owed

      const grossCents = Math.round(Number(row.total_paid ?? 0) * 100)
      const capturedCents = Math.max(0, grossCents - giftCents)
      const quotedGiftCents = row.refund_quoted_gift != null
        ? Math.round(Number(row.refund_quoted_gift) * 100)
        : null
      const owedCents = quotedGiftCents != null
        ? quotedGiftCents
        : capturedCents > 0 && refundedCents < capturedCents
          ? Math.round(giftCents * (refundedCents / capturedCents))
          : giftCents

      if (owedCents <= 0) continue
      const credited = await refundToGiftCard(supabase, row.gift_card_id, row.id, owedCents / 100)
      if (!credited) {
        // refundToGiftCard reverted the ledger row to 'spent', which is the
        // durable marker that this credit is still owed. Scream for a human.
        console.error('[stripe-webhook] CRITICAL: gift share of refund NOT credited', {
          booking: row.id, gift_card: row.gift_card_id, owed: owedCents / 100,
        })
      }
    }
    // Notify on BOTH paths. A self-serve cancellation already sent these and
    // the claimed columns make this a no-op; for a Dashboard refund this is
    // the only thing that tells the traveler and stands the driver down.
    for (const row of data) {
      await sendCancellationEmails(row.id, { source: 'dashboard' })
    }
    // Ops calendar cleanup LAST, after every money and email step: this
    // handler runs its critical section exactly once (the status flip is the
    // gate), so nothing that matters may wait behind a third-party call. The
    // calendar fetches are individually timeboxed and never throw, but even a
    // bounded stall belongs behind the gift credit and the emails, not in
    // front of them. (Audit finding, 2026-08-22.)
    for (const row of data) {
      await removeBookingFromCalendar(row.id)
    }
    console.log('[stripe-webhook] booking refunded, dispatch released', data.map((r: { id: string }) => r.id))
  }
}
