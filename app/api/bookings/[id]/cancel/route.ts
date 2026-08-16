import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { quoteRefund, refundBlockedMessage, type RefundableBooking } from '@/lib/refund-pricing'
import { earliestServiceStart } from '@/lib/booking-window'
import { sendRefundRequestEmails } from '@/lib/email/cancellation'

/**
 * Traveler-facing cancellation REQUEST for their own booking.
 *
 *   GET   quote the refund without changing anything (drives the confirm dialog)
 *   POST  lodge a cancellation request for admin approval
 *
 * This route deliberately does NOT call Stripe. Money only moves once an
 * admin approves, in /api/admin/refunds/[id]. Until then the booking stays
 * 'paid' and the trip stays live, so a request that is later declined leaves
 * the traveler exactly where they started.
 *
 * The refund amount is quoted here, from the stored booking row, and SAVED.
 * Approval may land hours later, after the 48-hour window has closed; the
 * traveler is owed what they were quoted when they asked, so the approver
 * pays the stored figure rather than re-quoting.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BookingRow extends RefundableBooking {
  id: string
  user_id: string | null
  email: string | null
  stripe_payment_id: string | null
  currency: string | null
  refund_state: string | null
  booking_items: Array<{
    date?: string | null
    arrival_at?: string | null
    departure_at?: string | null
  }> | null
}

const SELECT =
  'id, user_id, email, status, paid_at, created_at, total_paid, gift_card_amount, stripe_payment_id, currency, refund_state, booking_items(date, arrival_at, departure_at)'

/**
 * Load the booking only if the caller owns it.
 *
 * Ownership mirrors /api/profile/bookings: by user_id, or by VERIFIED email
 * for a guest checkout that has not been claimed yet. An unverified email is
 * never enough — otherwise signing up with someone else's address would let
 * you cancel their trip.
 */
async function loadOwnedBooking(id: string) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { error: 'unauthorized' as const, status: 401 }

  const svc = createServiceClient()
  const { data, error } = await svc.from('bookings').select(SELECT).eq('id', id).maybeSingle()
  if (error) return { error: 'lookup_failed' as const, status: 500 }
  if (!data) return { error: 'not_found' as const, status: 404 }

  const booking = data as unknown as BookingRow
  const verifiedEmail = user.email_confirmed_at && user.email ? user.email.toLowerCase() : null
  const owns =
    booking.user_id === user.id ||
    (!!verifiedEmail && (booking.email ?? '').toLowerCase() === verifiedEmail)

  // 404 rather than 403: don't confirm the existence of someone else's booking.
  if (!owns) return { error: 'not_found' as const, status: 404 }

  return { svc, booking }
}

/** Booking row + the derived service start the refund rules need. */
function withServiceStart(booking: BookingRow): RefundableBooking {
  const start = earliestServiceStart(booking.booking_items ?? [])
  return { ...booking, serviceStartsAt: start ? start.toISOString() : null }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const loaded = await loadOwnedBooking(params.id)
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  }
  const { booking } = loaded

  if (booking.refund_state === 'requested') {
    return NextResponse.json({
      refundable: false,
      reason: 'already_requested',
      message: 'A cancellation request for this booking is already awaiting review.',
    })
  }

  const quote = quoteRefund(withServiceStart(booking))
  return NextResponse.json(
    quote.refundable
      ? {
          refundable: true,
          refundCents: quote.refundCents,
          adminChargeCents: quote.adminChargeCents,
          grossCents: quote.grossCents,
          deadline: quote.deadline.toISOString(),
          /** Nothing is refunded until an admin approves. */
          requiresApproval: true,
        }
      : { refundable: false, reason: quote.reason, message: refundBlockedMessage(quote.reason) },
  )
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const loaded = await loadOwnedBooking(params.id)
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  }
  const { svc, booking } = loaded

  const quote = quoteRefund(withServiceStart(booking))
  if (!quote.refundable) {
    return NextResponse.json(
      { error: quote.reason, message: refundBlockedMessage(quote.reason) },
      { status: 409 },
    )
  }
  // A booking paid for entirely with a gift card has no PaymentIntent, and
  // that is legitimate — the refund goes back onto the card instead of through
  // Stripe. Only a booking that owes CASH back needs a payment reference.
  if (quote.cashRefundCents > 0 && !booking.stripe_payment_id) {
    console.error('[cancel] booking owes a cash refund but has no PaymentIntent', booking.id)
    return NextResponse.json(
      { error: 'no_payment_reference', message: 'We could not locate the payment. Please contact support.' },
      { status: 409 },
    )
  }

  // CLAIM the request slot. `.eq('refund_state','none')` is the concurrency
  // gate, so a double-click lodges one request, not two. Booking status is
  // deliberately untouched: nothing has been refunded yet.
  const { data: claimed, error: claimErr } = await svc
    .from('bookings')
    .update({
      refund_state: 'requested',
      refund_requested_at: new Date().toISOString(),
      refund_quoted_amount: quote.refundCents / 100,
      refund_quoted_admin_charge: quote.adminChargeCents / 100,
      refund_quoted_cash: quote.cashRefundCents / 100,
      refund_quoted_gift: quote.giftRefundCents / 100,
    })
    .eq('id', booking.id)
    .eq('status', 'paid')
    .eq('refund_state', 'none')
    .select('id')

  if (claimErr) {
    console.error('[cancel] request claim failed', booking.id, claimErr.message)
    return NextResponse.json({ error: 'request_failed' }, { status: 500 })
  }
  if (!claimed?.length) {
    return NextResponse.json(
      { error: 'already_requested', message: 'A cancellation request for this booking is already awaiting review.' },
      { status: 409 },
    )
  }

  // Tell the traveler we have it, and put it in front of ops. Awaited rather
  // than fire-and-forget because serverless freezes the instance once the
  // response returns. Never throws, so a mail failure cannot make a lodged
  // request look failed.
  const emails = await sendRefundRequestEmails(booking.id)

  return NextResponse.json({
    ok: true,
    state: 'requested',
    refundCents: quote.refundCents,
    adminChargeCents: quote.adminChargeCents,
    currency: booking.currency ?? 'usd',
    emails,
  })
}
