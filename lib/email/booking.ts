import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, opsBcc } from '@/lib/email/send'
import {
  claimEmailChannel as sharedClaimEmailChannel,
  releaseEmailChannel as sharedReleaseEmailChannel,
} from '@/lib/email/claim'
import BookingConfirmed from '@/emails/BookingConfirmed'
import OperatorBookingAlert from '@/emails/OperatorBookingAlert'
import TransferConfirmed from '@/emails/TransferConfirmed'
import TransferOperatorAlert from '@/emails/TransferOperatorAlert'

/**
 * Confirmation + operations email for a paid booking.
 *
 * This lived inside the Stripe webhook until gift cards arrived. A booking
 * paid for entirely with a gift card has no PaymentIntent and so no webhook
 * ever fires for it, but it still has to produce exactly the same traveler
 * confirmation and the same operator dispatch. Two copies of that logic would
 * have drifted, so it lives here and both callers share it.
 *
 * Behaviour is unchanged from the webhook original, including the per-channel
 * claim gates that make repeat delivery safe.
 */

export interface BookingItemRow {
  experience_id: number | null
  title: string
  destination: string
  travelers: number
  date: string
  price_per_person: number
  /** Exact amount charged for this line. Null on rows written before 020. */
  line_total?: number | null
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
export interface BookingRow {
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

// `retryable` distinguishes a transient send failure (worth having Stripe
// re-deliver the webhook) from a permanent one (no email on record, no ops
// address configured) where retrying can never succeed.
export type EmailResult = { ok: true } | { ok: false; reason: string; retryable: boolean }

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
  // The paid-status guard matches the webhook: these senders only ever run
  // for a booking already marked paid (the gift-covered path marks it before
  // calling), so a refund landing in between must not let an email escape.
  return sharedClaimEmailChannel(supabase, bookingId, column, 'bookings', { requireStatus: 'paid' })
}

async function releaseEmailChannel(
  supabase: ReturnType<typeof createServiceClient>,
  bookingId: string,
  column: 'confirmation_email_sent_at' | 'operator_email_sent_at',
): Promise<void> {
  await sharedReleaseEmailChannel(supabase, bookingId, column)
}

export async function maybeSendTravelerConfirmation(
  supabase: ReturnType<typeof createServiceClient>,
  booking: BookingRow,
  items: BookingItemRow[],
): Promise<EmailResult> {
  if (booking.confirmation_email_sent_at) return { ok: true }
  if (!booking.email) {
    console.warn('[booking-email] no email on booking', booking.id)
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
        subject: `Booking confirmed, your Jamaica trip with MAPL Tours (${bookingRef})`,
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
            // Stored total when we have it; the old product for rows written
            // before line_total existed.
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

export async function maybeSendOperatorAlert(
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
            // Stored total when we have it; the old product for rows written
            // before line_total existed.
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
