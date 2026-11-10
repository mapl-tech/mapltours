import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { sendTourUpsell, UPSELL_BOOKING_SELECT, type TourUpsellResult } from '@/lib/email/tour-upsell'
import { upsellRunOverBudget, UPSELL_STAMP_FILTER, UPSELL_TARGET_LEAD_DAYS } from '@/lib/tour-upsell'

/**
 * Daily job: the one tour email to guests who booked a ride and no tour.
 *
 * Runs once a day from netlify/functions/tour-upsell-cron.mjs (15:00 UTC,
 * 10:00 in Jamaica, an hour after trip tips). The rules live in
 * lib/tour-upsell, the checks and the send in lib/email/tour-upsell.
 *
 * The send gate: nothing is sent unless TOUR_UPSELL_ENABLED is exactly "1".
 * Otherwise every run, the cron's included, is a dry run: it reads, plans and
 * checks, and writes nothing. `?dry=1` is always dry. Addresses in the answer
 * are masked.
 *
 * `?bookingId=<uuid>` targets one booking (an operator resend);
 * `?force=1` with it bypasses the already-sent stamp only.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>`, compared in constant time.
 * Fails closed when CRON_SECRET is unset. No query-string secret: query
 * strings land in request logs.
 *
 * SAFETY: reads bookings; writes only `dispatch.tour_upsell_sent`. No money
 * column, status, Stripe call or webhook is touched. Guests whose note
 * mentions an accessibility need or a baby are skipped and never mailed.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Rows to consider per run; already-stamped rows are excluded server side. */
const BATCH = 200

function authorized(request: NextRequest, secret: string): boolean {
  const got = Buffer.from((request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  if (!authorized(request, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const enabled = process.env.TOUR_UPSELL_ENABLED === '1'
  const dry = !enabled || url.searchParams.get('dry') === '1'
  const bookingId = url.searchParams.get('bookingId')
  const force = url.searchParams.get('force') === '1' && !!bookingId

  const svc = createServiceClient()
  const startedAt = Date.now()

  // Paid rides not yet offered. The arrival window is applied in JS: arrival
  // lives on a joined row as Jamaica wall-clock, and the window also depends
  // on created_at, so one rule in lib/tour-upsell beats a second one in SQL.
  const query = bookingId
    ? svc.from('bookings').select(UPSELL_BOOKING_SELECT).eq('id', bookingId).limit(1)
    : svc
        .from('bookings')
        .select(UPSELL_BOOKING_SELECT)
        .eq('status', 'paid')
        .eq('booking_type', 'transfer')
        .is(UPSELL_STAMP_FILTER, null)
        .order('created_at', { ascending: true })
        .limit(BATCH)

  const { data, error } = await query
  if (error) {
    console.error('[tour-upsell] scan failed', error.message)
    return NextResponse.json({ error: 'scan failed' }, { status: 500 })
  }

  const now = Date.now()
  const results: TourUpsellResult[] = []
  const skipped: Record<string, number> = {}
  let attempted = 0

  for (const booking of data ?? []) {
    if (upsellRunOverBudget(attempted, Date.now() - startedAt)) break
    const res = await sendTourUpsell(svc, booking, { now, force, dry })
    if (res.skipped) {
      skipped[res.skipped] = (skipped[res.skipped] ?? 0) + 1
      continue
    }
    if (!dry) attempted++
    results.push(res)
  }

  const report = {
    ok: true,
    enabled,
    dry,
    scanned: data?.length ?? 0,
    sent: dry ? 0 : results.filter((r) => r.ok).length,
    wouldSend: dry ? results.filter((r) => r.ok).length : undefined,
    failed: results.filter((r) => !r.ok && r.error).length,
    skipped,
    targetLeadDays: UPSELL_TARGET_LEAD_DAYS,
    results,
    elapsedMs: Date.now() - startedAt,
  }
  console.log('[tour-upsell]', JSON.stringify({ enabled, dry, scanned: report.scanned, sent: report.sent, wouldSend: report.wouldSend, failed: report.failed, skipped }))
  return NextResponse.json(report)
}
