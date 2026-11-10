/**
 * Daily trigger for the transfer-to-tour upsell.
 *
 * Daily rather than hourly: the send window is measured in days before
 * arrival, so there is no hour to hit precisely, and the endpoint is
 * idempotent, so an extra run is always harmless.
 *
 * 15:00 UTC is 10:00 in Jamaica and late morning to mid afternoon across the
 * US and Canada, where these guests are when they get it. Deliberately an
 * hour after the review job so the two never contend for the same function
 * slot or the same Resend burst.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[tour-upsell-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  // Secret rides in a header, not the query string (query strings land in
  // request logs).
  const res = await fetch(`${base}/api/tour-upsell`, {
    headers: { authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log('[tour-upsell-cron]', res.status, body.slice(0, 600))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '0 15 * * *' }
