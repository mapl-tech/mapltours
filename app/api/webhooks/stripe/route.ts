import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendCancellationEmails } from '@/lib/email/cancellation'
import { activateGiftCard } from '@/lib/gift-activation'
import {
  maybeSendTravelerConfirmation,
  maybeSendOperatorAlert,
  type BookingRow,
  type BookingItemRow,
} from '@/lib/email/booking'
import { settleGiftClaim, releaseGiftClaim } from '@/lib/gift-redemption'

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
 *     - charge.refunded
 *   Copy the "Signing secret" → STRIPE_WEBHOOK_SECRET env var.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

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
      'experience_id, title, destination, travelers, date, price_per_person, item_type, airport, hotel, zone, trip_type, arrival_flight, arrival_at, departure_flight, departure_at, passengers',
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

  // Mark paid only if we haven't already. We DO NOT short-circuit when
  // status is already 'paid', instead we fall through to the email step
  // which has its own per-channel idempotency. That way a transient
  // Resend outage during the first delivery is healed by Stripe's retry.
  if (booking.status !== 'paid') {
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (error) {
      console.error('[stripe-webhook] failed to mark booking paid', error)
      throw new Error(error.message) // → Stripe retries
    }
    booking.status = 'paid'
  }

  // Turn any gift-card reservation on this cart into a permanent spend. The
  // balance already came off at checkout — this only closes the ledger row so
  // the stale sweep can never hand the value back on a booking that was paid.
  await settleGiftClaim(supabase, booking.id)

  // Consume the video-upload reward, if one was applied to this checkout.
  // This is the authoritative consume point: a 3DS/redirect payment never
  // runs the client-side consumeReward(), so without this a reward could be
  // re-applied to a later cart. Idempotent, only flips a still-'available'
  // row, keyed on this booking.
  const rewardId = typeof pi.metadata?.reward_id === 'string' ? pi.metadata.reward_id : null
  if (rewardId) {
    const { error: rewardErr } = await supabase
      .from('user_rewards')
      .update({ status: 'used', used_on_booking_id: booking.id, used_at: new Date().toISOString() })
      .eq('id', rewardId)
      .eq('status', 'available')
    if (rewardErr) {
      // Non-fatal: the charge already succeeded. Log for reconciliation.
      console.warn('[stripe-webhook] reward consume failed', { reward_id: rewardId, error: rewardErr.message })
    }
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
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  if (!booking || booking.status === 'paid') return

  const errMsg =
    pi.last_payment_error?.message ??
    pi.last_payment_error?.code ??
    'payment_failed'

  await supabase
    .from('bookings')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      special_requests: booking.special_requests
        ? `${booking.special_requests}\n[failure: ${errMsg}]`
        : `[failure: ${errMsg}]`,
    })
    .eq('id', booking.id)

  // Give back any gift-card value this cart was holding. Without this the
  // balance is debited forever for a payment that never happened — a declined
  // card would silently destroy the whole applied amount.
  await releaseGiftClaim(supabase, booking.id)
}

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
  await activateGiftCard(giftId, pi.id)
}

async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  if (!booking || booking.status === 'paid') return
  await supabase.from('bookings').update({ status: 'canceled' }).eq('id', booking.id)
  // Any gift-card value held against this cart goes back on the card now,
  // rather than waiting for the stale sweep.
  await releaseGiftClaim(supabase, booking.id)
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
async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return

  const supabase = createServiceClient()

  // A refund or chargeback on a GIFT CARD PURCHASE is not a booking refund.
  // The money has left our account, so the card must stop being spendable —
  // otherwise the buyer keeps the value they just clawed back.
  const { data: giftCard } = await supabase
    .from('gift_cards')
    .select('id, status, code')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle()
  if (giftCard) {
    const { data: voided } = await supabase
      .from('gift_cards')
      .update({ status: 'void' })
      .eq('id', giftCard.id)
      .neq('status', 'void')
      .select('id')
      .maybeSingle()
    if (voided) {
      console.warn('[stripe-webhook] gift card voided after refund/chargeback', {
        giftCardId: giftCard.id, code: giftCard.code, paymentIntentId,
      })
    }
    return
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, total_paid, gift_card_id, gift_card_amount')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error(`booking lookup failed: ${error.message}`)
  if (!data || data.status === 'refunded') return

  // Trust Stripe's figure over any local calculation: it is what actually
  // left the account, including a Dashboard refund for an arbitrary amount.
  const refundedCents = charge.amount_refunded ?? 0
  const grossCents = Math.round(Number(data.total_paid ?? 0) * 100)

  await supabase
    .from('bookings')
    .update({
      status: 'refunded',
      // A Dashboard refund IS the decision, so close out any request still
      // sitting in the approval queue rather than leaving it pending forever.
      refund_state: 'approved',
      refund_decided_at: new Date().toISOString(),
      refunded_at: new Date().toISOString(),
      refund_amount: refundedCents / 100,
      admin_charge: Math.max(0, grossCents - refundedCents) / 100,
    })
    .eq('id', data.id)
    .neq('status', 'refunded')

  // Notify on BOTH paths. For a self-serve cancellation the endpoint has
  // already sent these and the claimed columns make this a no-op; for a
  // Dashboard refund this is the only thing that tells the traveler and
  // stands the driver down.
  await sendCancellationEmails(data.id, { source: 'dashboard' })
}

