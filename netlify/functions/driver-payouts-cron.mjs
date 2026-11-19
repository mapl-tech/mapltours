/**
 * Daily at 14:30 UTC (09:30 in Jamaica): payouts by Wise (app/api/payouts/route.ts).
 * Built Nov 15 2026, changed Nov 18 2026 to pay before each trip, NOT LIVE.
 *
 * Each run pays every ride half and tour whose send day has come (two
 * business days before its day by default), so it lands before the trip.
 *
 * Inert until launch: unless WISE_PAYOUTS_ENABLED is exactly '1' this
 * function does not even call the route (a dry run is asked for by hand:
 * `curl -H "Authorization: Bearer $CRON_SECRET" https://mapltours.com/api/payouts?dry=1`).
 * The route keeps its own gate as well. The log line is counts only, never a
 * name. Overlapping or repeated runs are harmless: every part is claimed
 * in the ledger (driver_payout_items, one live item per part) before
 * anything is sent, and each Wise transfer carries its own idempotency key.
 *
 * The secret goes in the Authorization header, not the query string, so it
 * never lands in an access log.
 */
export default async () => {
  if (process.env.WISE_PAYOUTS_ENABLED !== '1') {
    console.log('[driver-payouts-cron] payouts are not switched on (WISE_PAYOUTS_ENABLED); nothing run')
    return new Response(JSON.stringify({ skipped: 'not enabled' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[driver-payouts-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log('[driver-payouts-cron]', res.status, countsOnly(body))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

/** The route's answer as a log line: counts only. A plan (names, amounts) is dropped even if it ever arrives. */
export function countsOnly(body) {
  try {
    const j = JSON.parse(body)
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      delete j.plan
      delete j.config_problems
      return JSON.stringify(j).slice(0, 600)
    }
  } catch {}
  return `unreadable answer, ${body.length} bytes`
}

export const config = { schedule: '30 14 * * *' }
