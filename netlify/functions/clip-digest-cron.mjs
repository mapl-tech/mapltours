/**
 * Nightly trigger for the clip-review email (app/api/clip-digest): one email
 * per guest about the clips reviewed that day, instead of one per clip.
 *
 * 01:00 UTC is 8 pm in Jamaica all year (no daylight saving there), and 9 pm
 * in Toronto in summer, 8 pm in winter: after a day's reviewing, still the
 * same evening for most guests. It runs again at 01:20 and 01:40, and each
 * run calls the endpoint up to three times: one call stops taking new guests
 * well inside the 10 s a function gets and reports how many it left
 * (deferred), which the next call takes. The endpoint is idempotent, so the
 * extra runs and calls only find nothing due.
 */
export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[clip-digest-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  let status = 0
  let body = ''
  for (let call = 0; call < 3; call++) {
    // Secret rides in a header, not the query string (query strings land in
    // request logs).
    const res = await fetch(`${base}/api/clip-digest`, {
      headers: { authorization: `Bearer ${secret}` },
    })
    status = res.status
    body = await res.text()
    console.log('[clip-digest-cron]', status, body.slice(0, 600))
    let deferred = 0
    try {
      deferred = Number(JSON.parse(body).deferred) || 0
    } catch {
      deferred = 0
    }
    if (!res.ok || deferred <= 0) break
  }
  return new Response(body, { status, headers: { 'content-type': 'application/json' } })
}

export const config = { schedule: '0,20,40 1 * * *' }
