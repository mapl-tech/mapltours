/**
 * Daily trigger for the post-trip review request.
 *
 * Daily rather than hourly, unlike the day-of job: there is no time-of-day
 * precision to hit here. A guest whose trip ended yesterday is equally happy
 * to be asked at any hour, and the endpoint is idempotent, so an extra run is
 * always harmless.
 *
 * 14:00 UTC is 09:00 in Jamaica and mid-morning to early afternoon across the
 * North American east coast, where most guests are by the time they get this.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[review-request-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/review-requests?secret=${encodeURIComponent(secret)}`)
  const body = await res.text()
  console.log('[review-request-cron]', res.status, body.slice(0, 600))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '0 14 * * *' }
