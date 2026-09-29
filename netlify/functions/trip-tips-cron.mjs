/**
 * Daily at 14:00 UTC (09:00 in Jamaica): trip tips (app/api/trip-tips/route.ts).
 *
 * Each subscriber gets at most one tip a run, chosen by what they have booked.
 * The route sends nothing unless TRIP_TIPS_ENABLED is '1'; until then every
 * run is a dry run. The log line is counts only, never an address. Overlapping or
 * repeated runs are harmless: each tip is claimed in the ledger
 * (trip_tips_log, unique per address and tip) before it is sent, and Resend
 * dedupes the send itself by idempotency key.
 *
 * The secret goes in the Authorization header, not the query string, so it
 * never lands in an access log.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[trip-tips-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/trip-tips`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log('[trip-tips-cron]', res.status, countsOnly(body))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

/**
 * The route's answer as a log line: counts and codes only. `plans` (masked
 * addresses, which the route sends only for an explicit ?dry=1) is dropped
 * even if it ever arrives, so this log never carries an address.
 */
export function countsOnly(body) {
  try {
    const j = JSON.parse(body)
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      delete j.plans
      return JSON.stringify(j).slice(0, 600)
    }
  } catch {}
  return `unreadable answer, ${body.length} bytes`
}

export const config = { schedule: '0 14 * * *' }
