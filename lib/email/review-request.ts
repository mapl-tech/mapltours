import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { bookingRef } from '@/lib/dispatch'
import ReviewRequest, { type ReviewRequestProps } from '@/emails/ReviewRequest'
import { sendToParty } from '@/lib/travel-party-server'
import { bookerName } from '@/lib/travel-party'
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
 * The travel party (lib/travel-party-server): once the guest's request has
 * gone, each person the guest added gets their own copy (owner, Nov 24 2026).
 * Only then, and only on the daily run: the claim above makes it once per
 * booking, and an operator's forced resend is for the guest who lost theirs.
 * Best effort: a party copy that fails never changes the guest's result.
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
  /** The travel party's copies, when the guest's went on the daily run. */
  party?: { sent: number; failed: number }
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

  const { isTransfer, legs, tripLabel, tripDates } = describeForReview(booking)
  const claimedAt = new Date().toISOString()

  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: booking.id,
    p_patch: { [REVIEW_STAMP_KEY]: claimedAt },
    p_only_if_absent: opts.force ? null : REVIEW_STAMP_KEY,
  })
  if (!opts.force && (!claimed || claimed.length === 0)) {
    return { ...base, ok: false, skipped: 'claimed_elsewhere' }
  }

  const letter: ReviewRequestProps = {
    bookingRef: bookingRef(booking.id),
    firstName: booking.first_name ?? null,
    isTransfer,
    legs,
    tripLabel,
    tripDates,
    reviewUrl: TRIPADVISOR_REVIEW_URL,
    supportEmail: SUPPORT_EMAIL,
  }
  const res = await sendEmail({
    to: booking.email as string,
    // Subject names the trip and asks a question. The previous line ("We
    // have zero reviews. You were there.") announced MAPL's inexperience in
    // the inbox, before the guest had even opened it.
    subject: isTransfer
      ? (booking.first_name?.trim()
          ? `How was the ride, ${booking.first_name.trim()}?`
          : 'How was the ride?')
      : `How was ${tripLabel}?`,
    react: ReviewRequest(letter),
    tags: [{ name: 'type', value: 'review_request' }],
  })

  if (!res?.ok) {
    // Release the claim so the next run retries. Removing only OUR key
    // atomically; nothing else in dispatch is touched.
    await svc.rpc('merge_dispatch', { p_booking_id: booking.id, p_remove: [REVIEW_STAMP_KEY] })
    return { ...base, ok: false, error: res?.error ?? 'send failed' }
  }

  // Each person the guest added: their own copy, no first name (we have
  // none), the booker named in the footer with a stop link. Keyed per person,
  // so a retry inside Resend's window is delivered once.
  let party: ReviewRequestResult['party']
  if (!opts.force) {
    party = await sendToParty(svc, booking.id, 'review', (m) => ({
      subject: isTransfer ? 'How was the ride?' : `How was ${tripLabel}?`,
      react: ReviewRequest({ ...letter, firstName: null, party: { addedBy: bookerName(booking.first_name), stopUrl: m.stopUrl } }),
      key: `travel-party/review/${booking.id}/${m.id}`,
    }))
  }

  return { ...base, ok: true, sentTo: booking.email as string, ...(party ? { party } : {}) }
}

/** Columns the eligibility rules and the email both need. */
export const REVIEW_BOOKING_SELECT =
  'id, email, first_name, status, booking_type, dispatch, booking_items(item_type, title, hotel, destination, trip_type, arrival_at, departure_at, date)'

export function reviewServiceClient() {
  return createServiceClient()
}
