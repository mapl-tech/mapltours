import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { bookingRef } from '@/lib/dispatch'
import ReviewRequest from '@/emails/ReviewRequest'
import {
  reviewRequestBlockedReason,
  describeForReview,
  REVIEW_STAMP_KEY,
  type ReviewableBooking,
  type ReviewSkipReason,
} from '@/lib/review-request'

/**
 * Send one guest their review request, exactly once.
 *
 * Same shape as sendDayOf in lib/dayof.ts, deliberately: the stamp is CLAIMED
 * before the send and conditional on still being absent, so two overlapping
 * cron runs cannot both mail the same guest. If the send then fails, the claim
 * is released so the next run retries rather than silently dropping it.
 *
 * merge_dispatch is an atomic jsonb merge in a single statement, so claiming
 * this key can never erase keys a concurrent writer is setting (day-of stamps,
 * refund timestamps, console step ticks).
 *
 * SAFETY: strictly additive. Reads bookings, writes only the one
 * `dispatch.review_request_sent` key. No money column, booking status, Stripe
 * call or webhook is touched on this path.
 */

/** Where the guest is sent to write the review. */
export const TRIPADVISOR_REVIEW_URL =
  'https://www.tripadvisor.ca/UserReviewEdit-g147311-d34605425-MAPL_Tours_Jamaica-Montego_Bay_Saint_James_Parish_Jamaica.html'

const SUPPORT_EMAIL = process.env.EMAIL_SUPPORT ?? 'contact@mapltours.com'

export interface ReviewRequestResult {
  ok: boolean
  bookingId: string
  sentTo?: string
  skipped?: ReviewSkipReason | 'claimed_elsewhere'
  error?: string
}

export async function sendReviewRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  booking: ReviewableBooking & { first_name?: string | null },
  opts: { force?: boolean } = {},
): Promise<ReviewRequestResult> {
  const base = { bookingId: booking.id }

  const blocked = reviewRequestBlockedReason(booking)
  // `force` bypasses ONLY the already-asked stamp, for an operator resending
  // to a guest who lost the mail. It never bypasses the others: asking someone
  // who has not travelled, or whose trip was refunded, is not a resend.
  if (blocked && !(opts.force && blocked === 'already_asked')) {
    return { ...base, ok: false, skipped: blocked }
  }

  const { isTransfer, tripLabel, tripDates } = describeForReview(booking)
  const claimedAt = new Date().toISOString()

  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: booking.id,
    p_patch: { [REVIEW_STAMP_KEY]: claimedAt },
    p_only_if_absent: opts.force ? null : REVIEW_STAMP_KEY,
  })
  if (!opts.force && (!claimed || claimed.length === 0)) {
    return { ...base, ok: false, skipped: 'claimed_elsewhere' }
  }

  const res = await sendEmail({
    to: booking.email as string,
    subject: 'We have zero reviews. You were there.',
    react: ReviewRequest({
      bookingRef: bookingRef(booking.id),
      firstName: booking.first_name ?? null,
      isTransfer,
      tripLabel,
      tripDates,
      reviewUrl: TRIPADVISOR_REVIEW_URL,
      supportEmail: SUPPORT_EMAIL,
    }),
    tags: [{ name: 'type', value: 'review_request' }],
  })

  if (!res?.ok) {
    // Release the claim so the next run retries. Removing only OUR key
    // atomically; nothing else in dispatch is touched.
    await svc.rpc('merge_dispatch', { p_booking_id: booking.id, p_remove: [REVIEW_STAMP_KEY] })
    return { ...base, ok: false, error: res?.error ?? 'send failed' }
  }

  return { ...base, ok: true, sentTo: booking.email as string }
}

/** Columns the eligibility rules and the email both need. */
export const REVIEW_BOOKING_SELECT =
  'id, email, first_name, status, booking_type, dispatch, booking_items(item_type, title, hotel, destination, trip_type, arrival_at, departure_at, date)'

export function reviewServiceClient() {
  return createServiceClient()
}
