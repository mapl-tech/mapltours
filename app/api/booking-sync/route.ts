import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { runBookingSync, type SyncReport } from '@/lib/booking-sync-run'
import { NO_STORE_HEADERS } from '@/lib/no-store'

/**
 * Booking sync: tells the CRM who booked.
 *
 * Runs every 15 minutes from `netlify/functions/booking-sync-cron.mjs`. Each
 * run takes the bookings whose money state (paid, refunded) has not reached
 * the CRM yet, sets the guest's HubSpot contact to the totals recomputed from
 * all their bookings (lifecycle stage customer, never lowered), and for a new
 * paid booking tells Resend (booking.paid) when the guest is already a Resend
 * contact, which ends the trip tips welcome series. The rules are in
 * lib/booking-sync.ts, the I/O in lib/booking-sync-run.ts.
 *
 * SAFETY: reads bookings; writes only the `dispatch.crm_paid_synced_at` /
 * `dispatch.crm_refund_synced_at` stamps (plus `crm_sync_skipped` beside a
 * skipped one) and, for a failed attempt, the `crm_sync_failures` /
 * `crm_sync_retry_at` / `crm_sync_error` retry keys, all through
 * merge_dispatch. No status, money column, Stripe call or webhook is touched
 * on this path. A booking is stamped only after its CRM writes succeeded, so
 * a failed or killed run is retried later: a failed booking backs off (10
 * minutes, doubling, at most a day) and never holds back a new one.
 *
 * Auth: CRON_SECRET in `Authorization: Bearer` only, compared in constant
 * time. Unlike the older cron routes there is no `?secret=` form: a query
 * string lands in access logs. Fails closed when CRON_SECRET is unset.
 *
 * `?dry=1` does the reads (bookings, and the HubSpot and Resend lookups) and
 * returns, with addresses masked, what a real run would do. It writes
 * nothing and calls no write endpoint.
 *
 * Needs HUBSPOT_SERVICE_KEY (503 without it, nothing stamped) and
 * RESEND_API_KEY (without it, paid bookings whose address needs the Resend
 * check stay unstamped and are retried). That key must be able to READ
 * contacts (GET /contacts/{email}); a sending-only key answers 401 there and
 * every paid booking at a Resend contact backs off as failed. Run the bio's
 * scripts/tips-automation.mts (it defines booking.paid) before this cron is
 * deployed; if Resend refuses an event it does not know, those bookings only
 * back off, they never block others.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Whether the request carries the cron secret as a Bearer token. */
function authorized(request: NextRequest, secret: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!m) return false
  const got = Buffer.from(m[1])
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Counts only: the log never carries an address. */
function logLine(r: SyncReport) {
  return JSON.stringify({ ...r, groups: undefined })
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500, headers: NO_STORE_HEADERS })
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })
  }

  const hubspotKey = process.env.HUBSPOT_SERVICE_KEY
  if (!hubspotKey) {
    console.error('[booking-sync] HUBSPOT_SERVICE_KEY not set; nothing synced')
    return NextResponse.json({ error: 'HUBSPOT_SERVICE_KEY not set' }, { status: 503, headers: NO_STORE_HEADERS })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  try {
    const report = await runBookingSync({
      svc: createServiceClient(),
      hubspotKey,
      resendKey: process.env.RESEND_API_KEY ?? null,
      dry,
    })
    console.log('[booking-sync]', logLine(report))
    if (report.stuck > 0) {
      // Counts and reasons only. The rows carry crm_sync_error in dispatch.
      console.error('[booking-sync] bookings still failing after a day of retries', JSON.stringify({ stuck: report.stuck, errors: report.errors }))
    }
    return NextResponse.json(report, { headers: NO_STORE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync failed'
    console.error('[booking-sync] run failed', message)
    return NextResponse.json({ error: 'sync failed', detail: message }, { status: 500, headers: NO_STORE_HEADERS })
  }
}

export async function GET(request: NextRequest) {
  return handle(request)
}

export async function POST(request: NextRequest) {
  return handle(request)
}
