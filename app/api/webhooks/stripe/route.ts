import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { sendCancellationEmails } from '@/lib/email/cancellation'
import {
  claimEmailChannel as sharedClaimEmailChannel,
  releaseEmailChannel as sharedReleaseEmailChannel,
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
 *     - charge.refunded
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
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  country: string | null
  pickup: string | null
  dropoff: string | null
  special_requests: string | null
  total_paid: number
  subtotal: number | null
  booking_fee: number | null
  transport_cost: number | null
  reward_discount: number | null
  currency: string
  stripe_payment_id: string | null
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
}

async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  if (!booking || booking.status === 'paid') return
  await supabase.from('bookings').update({ status: 'canceled' }).eq('id', booking.id)
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
  const { data, error } = await supabase
    .from('bookings')
    .select('id, status, total_paid')
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
): Promise<boolean> {
  // Implementation lives in lib/email/claim.ts so the cancellation path
  // shares it. Signature kept column-typed for the callers below.
  return sharedClaimEmailChannel(supabase, bookingId, column)
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

  if (!(await claimEmailChannel(supabase, booking.id, 'confirmation_email_sent_at'))) {
    return { ok: true }
  }

  const bookingRef = humanizeId(booking.id)
  const isTransfer = booking.booking_type === 'transfer'

  const res = isTransfer
    ? await sendEmail({
        to: booking.email,
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
          totalPaid: Number(booking.total_paid),
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
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          paidAt: (booking as { paid_at?: string | null }).paid_at ?? null,
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            pricePerPerson: Number(i.price_per_person),
            linePrice: Number(i.price_per_person) * i.travelers,
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
  'tech@mapltech.com',
  'collinsadventuretours@gmail.com',
]

function resolveOpsRecipients(): string[] {
  // Only OPERATIONS_EMAIL can override, we intentionally do NOT fall back
  // to EMAIL_SUPPORT here so the public contact inbox can never receive
  // booking alerts by accident if OPERATIONS_EMAIL is unset on a deploy.
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
  const opsRecipients = resolveOpsRecipients()
  if (opsRecipients.length === 0) return { ok: false, reason: 'no_ops_email_configured', retryable: false }

  if (!(await claimEmailChannel(supabase, booking.id, 'operator_email_sent_at'))) {
    return { ok: true }
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
          specialRequests: booking.special_requests,
          totalPaid: Number(booking.total_paid),
          currency: booking.currency.toUpperCase(),
          items: items.map((i) => ({
            title: i.title,
            destination: i.destination,
            date: i.date,
            travelers: i.travelers,
            linePrice: Number(i.price_per_person) * i.travelers,
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
