/**
 * Every fifteen minutes: driver-portal changes whose guest email nobody
 * settled are told to the office (app/api/driver/change/sweep). Idempotent:
 * a run with nothing open finds nothing.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[dispatch-change-sweep-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  // Secret rides in a header, not the query string (query strings land in request logs).
  const res = await fetch(`${base}/api/driver/change/sweep`, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.text()
  console.log('[dispatch-change-sweep-cron]', res.status, body.slice(0, 400))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '*/15 * * * *' }
