import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { claimEmailChannel, releaseEmailChannel } from '@/lib/email/claim'
import BookingCancelled from '@/emails/BookingCancelled'
import OperatorCancellationAlert from '@/emails/OperatorCancellationAlert'
import RefundRequested from '@/emails/RefundRequested'
import OperatorRefundApproval from '@/emails/OperatorRefundApproval'
import RefundDeclined from '@/emails/RefundDeclined'
import { earliestServiceStart } from '@/lib/booking-window'

/**
 * Cancellation notifications, shared by BOTH refund paths:
 *
 *   • POST /api/bookings/[id]/cancel  (traveler cancels in the app)
 *   • charge.refunded webhook          (someone refunds in the Dashboard)
 *
 * Living here rather than in either caller means a Dashboard refund notifies
 * the traveler and stands the driver down exactly like a self-serve one. A
 * refund that silently leaves a creator holding a slot is the failure this
 * exists to prevent.
 *
 * Every send is guarded by a claimed column, so the webhook's retries (it
 * returns 5xx on failure and Stripe redelivers) cannot double-send.
 */

const CUSTOMER_CHANNEL = 'cancellation_email_sent_at'
const OPS_CHANNEL = 'ops_cancellation_email_sent_at'

// Same distribution list as booking alerts. Kept in sync deliberately: ops
// needs cancellations at the same addresses that receive the bookings.
const OPS_RECIPIENTS_DEFAULT = ['tech@mapltech.com', 'collinsadventuretours@gmail.com']

function resolveOpsRecipients(): string[] {
  const raw = process.env.OPERATIONS_EMAIL
  if (!raw) return OPS_RECIPIENTS_DEFAULT
  const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return parsed.length > 0 ? parsed : OPS_RECIPIENTS_DEFAULT
}

function humanizeId(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Row = any

interface CancellationItem {
  title: string
  destination: string
  date: string
  travelers: number
}

/** Shape tour items and transfer legs into one display row set. */
function shapeItems(booking: Row, rows: Row[]): CancellationItem[] {
  const isTransfer = booking.booking_type === 'transfer'
  return (rows ?? []).map((i: Row) =>
    isTransfer
      ? {
          title: `Airport transfer${i.trip_type === 'round_trip' ? ' (round trip)' : ''}: MBJ to ${i.hotel ?? i.destination ?? 'your hotel'}`,
          destination: i.hotel ?? i.destination ?? 'Jamaica',
          date: (i.arrival_at ?? '').slice(0, 10) || '',
          travelers: i.passengers ?? i.travelers ?? 1,
        }
      : {
          title: i.title ?? 'Experience',
          destination: i.destination ?? '',
          date: i.date ?? '',
          travelers: i.travelers ?? 1,
        },
  )
}

export interface CancellationEmailResult {
  customer: 'sent' | 'skipped' | 'failed'
  ops: 'sent' | 'skipped' | 'failed'
}

/**
 * Send both cancellation emails for an already-refunded booking.
 *
 * Never throws: a refund has already succeeded by the time this runs, and
 * failing the caller over an email would misreport the money as un-refunded.
 * Failures are logged and reported in the return value instead.
 */
export async function sendCancellationEmails(
  bookingId: string,
  opts: { source?: 'self-serve' | 'dashboard' } = {},
): Promise<CancellationEmailResult> {
  const result: CancellationEmailResult = { customer: 'skipped', ops: 'skipped' }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('bookings')
      .select(
        'id, email, first_name, last_name, phone, currency, booking_type, total_paid, refund_amount, admin_charge, cancellation_email_sent_at, ops_cancellation_email_sent_at, booking_items(*)',
      )
      .eq('id', bookingId)
      .maybeSingle()

    if (error || !data) {
      console.error('[cancellation-email] booking lookup failed', bookingId, error?.message)
      return { customer: 'failed', ops: 'failed' }
    }

    const booking = data as Row
    const bookingRef = humanizeId(booking.id)
    const currency = (booking.currency ?? 'USD').toUpperCase()
    const isTransfer = booking.booking_type === 'transfer'
    const items = shapeItems(booking, booking.booking_items)

    const totalPaid = Number(booking.total_paid ?? 0)
    const refundAmount = Number(booking.refund_amount ?? 0)
    // Derive rather than trust, so a Dashboard refund of an odd amount still
    // shows a charge line that reconciles against what was actually paid.
    const adminCharge = booking.admin_charge != null
      ? Number(booking.admin_charge)
      : Math.max(0, totalPaid - refundAmount)

    const firstName = booking.first_name ?? null
    const customerName = [booking.first_name, booking.last_name].filter(Boolean).join(' ') || 'Traveler'

    // ── Traveler receipt ──
    if (!booking.email) {
      console.warn('[cancellation-email] no email on booking', bookingId)
      result.customer = 'failed'
    } else if (booking.cancellation_email_sent_at) {
      result.customer = 'skipped'
    } else if (await claimEmailChannel(supabase, bookingId, CUSTOMER_CHANNEL)) {
      const res = await sendEmail({
        to: booking.email,
        subject: `Cancelled: ${bookingRef} · ${currency === 'USD' ? '$' : ''}${refundAmount.toFixed(2)} refunded`,
        react: BookingCancelled({
          bookingRef, firstName, totalPaid, refundAmount, adminCharge, currency, isTransfer, items,
        }),
        tags: [{ name: 'type', value: 'booking-cancelled' }],
      })
      if (res.ok) {
        result.customer = 'sent'
      } else {
        await releaseEmailChannel(supabase, bookingId, CUSTOMER_CHANNEL)
        result.customer = 'failed'
      }
    }

    // ── Ops alert ──
    const opsRecipients = resolveOpsRecipients()
    if (opsRecipients.length === 0) {
      result.ops = 'failed'
    } else if (booking.ops_cancellation_email_sent_at) {
      result.ops = 'skipped'
    } else if (await claimEmailChannel(supabase, bookingId, OPS_CHANNEL)) {
      const res = await sendEmail({
        to: opsRecipients,
        subject: `CANCELLED: ${bookingRef} · ${customerName} · stand down`,
        react: OperatorCancellationAlert({
          bookingRef,
          customerName,
          customerEmail: booking.email ?? null,
          customerPhone: booking.phone ?? null,
          totalPaid, refundAmount, adminCharge, currency, isTransfer,
          source: opts.source ?? 'self-serve',
          items,
        }),
        tags: [{ name: 'type', value: 'ops-cancellation' }],
      })
      if (res.ok) {
        result.ops = 'sent'
      } else {
        await releaseEmailChannel(supabase, bookingId, OPS_CHANNEL)
        result.ops = 'failed'
      }
    }

    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[cancellation-email] threw', bookingId, msg)
    return { customer: 'failed', ops: 'failed' }
  }
}

/* ────────────────────────────────────────────────────────────────────────
 * Approval-flow notifications
 *
 * These fire on the traveler's request and on the admin's decision. Neither
 * is retried by an external system the way the Stripe webhook is, and both
 * call sites are already guarded by a conditional update on refund_state, so
 * they need no claim columns of their own to stay single-send.
 * ──────────────────────────────────────────────────────────────────────── */

/** Shared loader for the approval-flow emails. */
async function loadForRefundEmail(bookingId: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, email, first_name, last_name, phone, currency, booking_type, total_paid, refund_quoted_amount, refund_quoted_admin_charge, booking_items(*)',
    )
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !data) {
    console.error('[refund-email] lookup failed', bookingId, error?.message)
    return null
  }
  const booking = data as Row
  const totalPaid = Number(booking.total_paid ?? 0)
  const refundAmount = Number(booking.refund_quoted_amount ?? 0)
  const adminCharge = booking.refund_quoted_admin_charge != null
    ? Number(booking.refund_quoted_admin_charge)
    : Math.max(0, totalPaid - refundAmount)
  return {
    booking,
    bookingRef: humanizeId(booking.id),
    currency: (booking.currency ?? 'USD').toUpperCase(),
    isTransfer: booking.booking_type === 'transfer',
    items: shapeItems(booking, booking.booking_items),
    totalPaid,
    refundAmount,
    adminCharge,
    firstName: booking.first_name ?? null,
    customerName: [booking.first_name, booking.last_name].filter(Boolean).join(' ') || 'Traveler',
  }
}

/**
 * Traveler asked to cancel: acknowledge to them, and put it in front of ops.
 * Money has NOT moved at this point and both emails say so.
 */
export async function sendRefundRequestEmails(
  bookingId: string,
): Promise<CancellationEmailResult> {
  const result: CancellationEmailResult = { customer: 'skipped', ops: 'skipped' }
  try {
    const ctx = await loadForRefundEmail(bookingId)
    if (!ctx) return { customer: 'failed', ops: 'failed' }
    const {
      booking, bookingRef, currency, isTransfer, items,
      totalPaid, refundAmount, adminCharge, firstName, customerName,
    } = ctx

    if (booking.email) {
      const res = await sendEmail({
        to: booking.email,
        subject: `Cancellation requested: ${bookingRef}`,
        react: RefundRequested({
          bookingRef, firstName, totalPaid, refundAmount, adminCharge, currency, isTransfer,
        }),
        tags: [{ name: 'type', value: 'refund-requested' }],
      })
      result.customer = res.ok ? 'sent' : 'failed'
    } else {
      result.customer = 'failed'
    }

    const opsRecipients = resolveOpsRecipients()
    if (opsRecipients.length) {
      const start = earliestServiceStart(booking.booking_items ?? [])
      const res = await sendEmail({
        to: opsRecipients,
        subject: `APPROVAL NEEDED: ${bookingRef} · ${customerName} · refund requested`,
        react: OperatorRefundApproval({
          bookingRef,
          bookingId: booking.id,
          customerName,
          customerEmail: booking.email ?? null,
          customerPhone: booking.phone ?? null,
          totalPaid, refundAmount, adminCharge, currency, isTransfer,
          serviceStartsAt: start ? start.toISOString() : null,
          items,
        }),
        tags: [{ name: 'type', value: 'ops-refund-approval' }],
      })
      result.ops = res.ok ? 'sent' : 'failed'
    } else {
      result.ops = 'failed'
    }
    return result
  } catch (err) {
    console.error('[refund-email] request threw', bookingId, err instanceof Error ? err.message : 'unknown')
    return { customer: 'failed', ops: 'failed' }
  }
}

/**
 * Admin declined. Only the traveler is told; ops made the decision.
 */
export async function sendRefundDeclinedEmail(
  bookingId: string,
  reason: string | null,
): Promise<CancellationEmailResult> {
  try {
    const ctx = await loadForRefundEmail(bookingId)
    if (!ctx) return { customer: 'failed', ops: 'skipped' }
    if (!ctx.booking.email) return { customer: 'failed', ops: 'skipped' }

    const res = await sendEmail({
      to: ctx.booking.email,
      subject: `About your cancellation request: ${ctx.bookingRef}`,
      react: RefundDeclined({
        bookingRef: ctx.bookingRef,
        firstName: ctx.firstName,
        isTransfer: ctx.isTransfer,
        reason: reason && reason.trim() ? reason.trim() : null,
      }),
      tags: [{ name: 'type', value: 'refund-declined' }],
    })
    return { customer: res.ok ? 'sent' : 'failed', ops: 'skipped' }
  } catch (err) {
    console.error('[refund-email] decline threw', bookingId, err instanceof Error ? err.message : 'unknown')
    return { customer: 'failed', ops: 'skipped' }
  }
}
