import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_DRIVER } from '@/lib/dispatch'
import { sendEmail, opsBcc } from '@/lib/email/send'
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

  // Mark paid only if we haven't already. We DO NOT short-circuit when
  // status is already 'paid', instead we fall through to the email step
  // which has its own per-channel idempotency. That way a transient
  // Resend outage during the first delivery is healed by Stripe's retry.
  if (booking.status !== 'paid') {
    const { data: transitioned, error } = await supabase
      .from('bookings')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', booking.id)
      .neq('status', 'refunded')
      .select('id')
    if (error) {
      console.error('[stripe-webhook] failed to mark booking paid', error)
      throw new Error(error.message) // → Stripe retries
    }
    if (!transitioned || transitioned.length === 0) {
      // The refund won the race. Leave the booking dead.
      console.log('[stripe-webhook] paid transition skipped, booking already refunded', booking.id)
      return
    }
    booking.status = 'paid'

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
  // 'paid' and 'refunded' are both ahead of 'failed' in the lifecycle: a
  // late-delivered failure from an earlier attempt must not scrub either.
  // In-memory check plus a status predicate on the write for the race.
  if (!booking || booking.status === 'paid' || booking.status === 'refunded') return

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
    .not('status', 'in', '("paid","refunded")')
}

async function handlePaymentCanceled(pi: Stripe.PaymentIntent) {
  const { supabase, booking } = await loadBooking(pi)
  if (!booking || booking.status === 'paid' || booking.status === 'refunded') return
  await supabase.from('bookings').update({ status: 'canceled' }).eq('id', booking.id)
    .not('status', 'in', '("paid","refunded")')
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
  const { data, error } = await supabase
    .from('bookings')
    .update({ [column]: new Date().toISOString() })
    .eq('id', bookingId)
    .is(column, null)
    // Never claim an email channel for a booking that stopped being paid
    // between our read and this write (refund racing the handler).
    .eq('status', 'paid')
    .select('id')
  if (error) {
    console.error('[stripe-webhook] email claim failed', { bookingId, column, error: error.message })
    return false
  }
  return (data?.length ?? 0) > 0
}

async function releaseEmailChannel(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  column: 'confirmation_email_sent_at' | 'operator_email_sent_at',
): Promise<void> {
  await supabase.from('bookings').update({ [column]: null }).eq('id', bookingId)
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
        // Operations and the driver hold exactly what the guest holds.
        bcc: opsBcc(booking.email),
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
        // Operations and the driver hold exactly what the guest holds.
        bcc: opsBcc(booking.email),
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
async function handleChargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  const metaBookingId = typeof charge.metadata?.booking_id === 'string' ? charge.metadata.booking_id : null
  if (!piId && !metaBookingId) return
  const supabase = createServiceClient()

  // Matches EVERY status except 'refunded' itself. Stripe guarantees neither
  // event order nor single delivery, and a refund consumed as a 200 no-op is
  // never redelivered, leaving a later succeeded retry free to resurrect the
  // booking. Three review rounds each found a status being reasoned out of
  // this list ('pending', then 'failed', then 'canceled' via a sibling
  // PaymentIntent cancelling the row while the charging PI refunds), so the
  // rule is now structural: charge.refunded proves money moved, therefore it
  // terminates the booking whatever transient state the row is in. Flipping
  // an already-dead canceled row to refunded is harmless; missing one is not.
  const refundByPi = () => supabase
    .from('bookings').update({ status: 'refunded' }).neq('status', 'refunded')
    .eq('stripe_payment_id', piId!).select('id, dispatch')
  const refundByMeta = () => supabase
    .from('bookings').update({ status: 'refunded' }).neq('status', 'refunded')
    .eq('id', metaBookingId!).select('id, dispatch')

  // Two-step lookup, mirroring loadBooking: an orphan booking whose
  // stripe_payment_id was never healed matches zero rows by PI, and the
  // refund must then resolve through metadata rather than being consumed.
  let data: { id: string; dispatch: unknown }[] | null = null
  let error: { message: string } | null = null
  if (piId) ({ data, error } = await refundByPi())
  if (!error && (!data || data.length === 0) && metaBookingId) ({ data, error } = await refundByMeta())

  if (error) {
    console.error('[stripe-webhook] refund status update failed', { pi: piId, error: error.message })
    throw new Error(error.message)
  }
  if (!data || data.length === 0) {
    // Either an idempotent redelivery (already refunded) or a refund for a
    // booking we cannot resolve. Log it: silence here is how money states
    // drift apart.
    console.warn('[stripe-webhook] charge.refunded matched no refundable booking', { pi: piId, meta: metaBookingId })
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
    console.log('[stripe-webhook] booking refunded, dispatch released', data.map((r: { id: string }) => r.id))
  }
}
