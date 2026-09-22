import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { aggregateBookings, parseWindow, type ReportBookingRow } from '@/lib/weekly-report'

/**
 * Bookings numbers for the Monday performance email.
 *
 * GET /api/report/bookings?since=<ISO>&until=<ISO>, window [since, until),
 * at most 62 days. Read-only: it selects from `bookings` with the service role
 * and returns aggregates only, never an email, name or phone. Test bookings
 * (example.com, Resend inboxes, the team) are dropped in lib/weekly-report.
 *
 * Auth: header `x-report-key` must equal REPORT_KEY. Header only, never the
 * query string, so the key stays out of access logs. Fails closed when
 * REPORT_KEY is unset. Its own key, not CRON_SECRET: the bio site holds this
 * one, and a leak there must not be able to fire the email crons.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
const PAGE = 1000

const BASE_COLUMNS =
  'id,email,booking_type,status,total_paid,paid_at,created_at,refunded_at,refund_amount,attribution'
const WITH_COUPONS = `${BASE_COLUMNS},coupon_code,coupon_discount`

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.REPORT_KEY
  const given = req.headers.get('x-report-key')
  if (!secret || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// A database that drifted behind the migrations (031/032) has no coupon
// columns; PostgREST reports that as 42703 or "column ... does not exist".
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '42703' || /column .* does not exist/i.test(err.message ?? '')
}

type Client = ReturnType<typeof createServiceClient>

async function fetchRows(
  supabase: Client,
  columns: string,
  since: string,
  until: string
): Promise<{ rows: ReportBookingRow[]; error: { code?: string; message?: string } | null }> {
  const s = `"${since}"`
  const u = `"${until}"`
  // Every row that can move a number: created, paid or refunded in the window.
  const filter = [
    `and(created_at.gte.${s},created_at.lt.${u})`,
    `and(paid_at.gte.${s},paid_at.lt.${u})`,
    `and(refunded_at.gte.${s},refunded_at.lt.${u})`,
  ].join(',')

  const rows: ReportBookingRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookings')
      .select(columns)
      .or(filter)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { rows, error }
    const page = (data ?? []) as unknown as ReportBookingRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return { rows, error: null }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401)

  const params = req.nextUrl.searchParams
  const window = parseWindow(params.get('since'), params.get('until'))
  if ('error' in window) return json({ error: window.error }, 400)
  const { since, until } = window

  let supabase: Client
  try {
    supabase = createServiceClient()
  } catch {
    return json({ error: 'Database is not configured.' }, 500)
  }

  let result = await fetchRows(supabase, WITH_COUPONS, since, until)
  if (isMissingColumn(result.error)) {
    result = await fetchRows(supabase, BASE_COLUMNS, since, until)
  }
  if (result.error) {
    console.error('[report/bookings] query failed:', result.error.code ?? '', result.error.message ?? '')
    return json({ error: 'Could not read bookings.' }, 500)
  }

  return json({ ok: true, since, until, ...aggregateBookings(result.rows, since, until) })
}
