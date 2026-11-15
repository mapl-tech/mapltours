/**
 * Every ten minutes: the catch-up for @mention emails (app/api/mentions/sweep).
 * The poster's browser normally sends them the moment a comment lands; this
 * picks up anything that call missed and retries failed sends. Idempotent:
 * a run with nothing due finds nothing.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[mention-emails-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  // Secret rides in a header, not the query string (query strings land in request logs).
  const res = await fetch(`${base}/api/mentions/sweep`, { headers: { authorization: `Bearer ${secret}` } })
  const body = await res.text()
  console.log('[mention-emails-cron]', res.status, body.slice(0, 400))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '*/10 * * * *' }
