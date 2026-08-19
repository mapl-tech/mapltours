import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  sendReviewRequest,
  REVIEW_BOOKING_SELECT,
  type ReviewRequestResult,
} from '@/lib/email/review-request'
import { reviewRequestBlockedReason, REVIEW_WINDOW_DAYS } from '@/lib/review-request'

/**
 * Daily job: ask guests whose trip has finished to leave a review.
 *
 * Runs once a day from `netlify/functions/review-request-cron.mjs`. Each run
 * looks at paid bookings whose last leg finished between one and thirty days
 * ago and mails the ones that have not been asked. Everything that makes it
 * safe to run unattended lives in `lib/review-request.ts`: it will not ask
 * twice, will not ask before the trip is over, will not ask about a refunded
 * trip, and will not chase a month-old one.
 *
 * Daily rather than hourly, unlike the day-of job: there is no time-of-day
 * precision to hit here, and a guest asked at an arbitrary hour of the day
 * after is no worse off than one asked on the hour.
 *
 * SAFETY: strictly additive. Reads bookings, writes only the single
 * `dispatch.review_request_sent` key. No money column, booking status, Stripe
 * call or webhook is touched on this path.
 *
 * Auth: shared secret via `?secret=` or `Authorization: Bearer`. Fails closed
 * when CRON_SECRET is unset.
 *
 * `?dry=1` reports exactly what it would send, and sends nothing.
 * `?bookingId=<uuid>` targets one booking, for an operator resend.
 * `?force=1` with a bookingId bypasses the already-asked stamp only.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Rows to consider per run. Comfortably above any realistic day's volume. */
const BATCH = 200

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  const provided =
    request.nextUrl.searchParams.get('secret') ??
    (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const force = request.nextUrl.searchParams.get('force') === '1'
  const bookingId = request.nextUrl.searchParams.get('bookingId')
  const svc = createServiceClient()

  let query = svc
    .from('bookings')
    .select(REVIEW_BOOKING_SELECT)
    .eq('status', 'paid')
    .limit(BATCH)

  if (bookingId) {
    query = svc.from('bookings').select(REVIEW_BOOKING_SELECT).eq('id', bookingId).limit(1)
  } else {
    // Cheap prefilter. The real decision is reviewRequestBlockedReason, which
    // reads the actual leg times; this only keeps the scan small. Paid dates
    // are a proxy for trip dates, so the window is generous on both sides.
    const since = new Date(Date.now() - (REVIEW_WINDOW_DAYS + 400) * 24 * 3_600_000).toISOString()
    query = query.gte('paid_at', since).order('paid_at', { ascending: false })
  }

  const { data: rows, error } = await query
  if (error) {
    return NextResponse.json({ error: 'query failed', detail: error.message }, { status: 500 })
  }

  const results: ReviewRequestResult[] = []
  const considered: { bookingId: string; reason: string }[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rows ?? []) as any[]) {
    const blocked = reviewRequestBlockedReason(b)
    if (blocked && !(force && bookingId && blocked === 'already_asked')) {
      considered.push({ bookingId: b.id, reason: blocked })
      continue
    }
    if (dry) {
      results.push({ ok: true, bookingId: b.id, sentTo: `${b.email} (dry run, not sent)` })
      continue
    }
    results.push(await sendReviewRequest(svc, b, { force: force && !!bookingId }))
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok && r.error)
  if (failed.length) console.error('[review-requests] some sends failed', failed)

  return NextResponse.json({
    ok: true,
    dry,
    scanned: (rows ?? []).length,
    sent,
    results,
    // Only useful when debugging why nothing went out.
    ...(dry ? { considered } : {}),
  })
}
