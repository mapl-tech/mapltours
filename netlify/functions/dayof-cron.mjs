/**
 * Hourly trigger for the transfer day-of emails.
 *
 * Hourly rather than once a day because pickups run from dawn to late night
 * and the send window is relative to each guest's own pickup time. The
 * endpoint is idempotent, so an extra run is always harmless.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[dayof-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/dayof?secret=${encodeURIComponent(secret)}`)
  const body = await res.text()
  console.log('[dayof-cron]', res.status, body.slice(0, 600))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '@hourly' }
