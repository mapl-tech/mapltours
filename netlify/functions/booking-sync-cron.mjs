/**
 * Every 15 minutes: tell the CRM who booked (app/api/booking-sync/route.ts).
 *
 * Often rather than daily because the Resend half is time-sensitive: a guest
 * on the trip tips welcome series should stop getting "book your ride" tips
 * soon after they book one. The endpoint is idempotent (it sets totals, never
 * adds them, and stamps each booking once), so an extra or overlapping run is
 * always harmless.
 *
 * The secret goes in the Authorization header, not the query string, so it
 * never lands in an access log. The log line is the route's counts only; the
 * route never returns a raw address.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[booking-sync-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/booking-sync`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log('[booking-sync-cron]', res.status, body.slice(0, 600))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '*/15 * * * *' }
