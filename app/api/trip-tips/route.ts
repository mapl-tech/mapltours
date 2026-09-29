import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runTripTips, TipsRunError, type TipsReport } from '@/lib/trip-tips/run'
import { NO_STORE_HEADERS } from '@/lib/no-store'

/**
 * Trip tips v2: the daily job (netlify/functions/trip-tips-cron.mjs, 14:00 UTC).
 *
 * Each run sends each subscriber at most one tip, chosen by what they have
 * booked (lib/trip-tips/plan.ts), after checking the Resend "Trip tips"
 * segment, HubSpot's mapl_tips "yes", the ledger and the bookings at send
 * time (lib/trip-tips/run.ts). It replaces the never-enabled Resend automation
 * "Trip tips welcome", which stays disabled and is not touched from here.
 *
 * THE SEND GATE: nothing is ever sent unless TRIP_TIPS_ENABLED is exactly
 * '1'. Otherwise every run, the cron's included, is a dry run. `?dry=1` makes
 * any run dry. A dry run does the reads, builds the emails and claims,
 * sends and writes nothing. Only an explicit `?dry=1` answers with the
 * per-address plan (every address masked); any other run answers counts.
 *
 * Auth: CRON_SECRET in `Authorization: Bearer` only, compared in constant
 * time; no `?secret=` form (a query string lands in access logs). Fails closed
 * when CRON_SECRET is unset.
 *
 * Needs RESEND_API_KEY (reads contacts and the segment, sends), HUBSPOT_SERVICE_KEY
 * (batch-reads consent), TIPS_SEGMENT_ID (the bio's "Trip tips" segment) and,
 * to send, TRIP_TIPS_SECRET (signs the unsubscribe links). The ledger table
 * trip_tips_log is migration 033; before it runs, every run stops at the
 * ledger read and sends nothing.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest, secret: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!m) return false
  const got = Buffer.from(m[1])
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Counts only: the log never carries an address, masked or not. */
function logLine(r: TipsReport) {
  return JSON.stringify({ ...r, plans: undefined })
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS })

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return fail(500, 'CRON_SECRET not set')
  if (!authorized(request, secret)) return fail(401, 'unauthorized')

  const resendKey = process.env.RESEND_API_KEY
  const hubspotKey = process.env.HUBSPOT_SERVICE_KEY
  const segmentId = process.env.TIPS_SEGMENT_ID
  const missing = [!resendKey && 'RESEND_API_KEY', !hubspotKey && 'HUBSPOT_SERVICE_KEY', !segmentId && 'TIPS_SEGMENT_ID'].filter(Boolean)
  if (missing.length) {
    console.error('[trip-tips] not configured; nothing read or sent', missing.join(', '))
    return fail(503, `${missing.join(', ')} not set`)
  }

  const enabled = process.env.TRIP_TIPS_ENABLED === '1'
  const askedDry = request.nextUrl.searchParams.get('dry') === '1'
  const send = enabled && !askedDry
  const tipsSecret = process.env.TRIP_TIPS_SECRET || null
  if (send && !tipsSecret) {
    console.error('[trip-tips] TRIP_TIPS_ENABLED is on but TRIP_TIPS_SECRET is not set; nothing sent')
    return fail(503, 'TRIP_TIPS_SECRET not set')
  }

  try {
    const report = await runTripTips({
      svc: createServiceClient(),
      resendKey: resendKey as string,
      hubspotKey: hubspotKey as string,
      segmentId: segmentId as string,
      secret: tipsSecret,
      send,
    })
    console.log('[trip-tips]', logLine(report))
    if (report.stale_claims > 0 || report.unconfirmed > 0) {
      console.error('[trip-tips] tips whose outcome is unknown; check Resend (tag campaign=trip_tips)', JSON.stringify({ stale_claims: report.stale_claims, unconfirmed: report.unconfirmed }))
    }
    // The masked per-address plan only for a person who asked for it with
    // ?dry=1. A run that is dry only because the gate is off (every cron run
    // until go-live) answers with counts, so the cron's log never holds even
    // a masked address.
    const { plans, ...counts } = report
    return NextResponse.json({ ...counts, ...(askedDry && plans ? { plans } : {}), enabled }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    // A short machine code, never an address.
    const code = err instanceof TipsRunError ? err.message : 'run_failed'
    console.error('[trip-tips] run stopped before sending', code)
    return NextResponse.json({ error: 'trip tips run failed', detail: code }, { status: 500, headers: NO_STORE_HEADERS })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
