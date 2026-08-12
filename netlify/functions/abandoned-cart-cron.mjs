// Netlify scheduled function: runs the abandoned-cart recovery sweep.
//
// It simply calls the app's own secret-protected endpoint, which finds
// pending carts older than 30 minutes that were never paid and sends a
// single branded recovery email each. Keeping the logic in the Next route
// (not duplicated here) means one code path and one place to reason about
// the money-safe guards.
//
// Schedule: hourly. Carts become eligible at 30 min, so hourly gives every
// abandoned checkout a nudge within ~90 minutes without spamming.

export default async () => {
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/abandoned-cart?secret=${encodeURIComponent(secret)}`)
  const body = await res.json().catch(() => null)
  return new Response(JSON.stringify({ ranAt: new Date().toISOString(), status: res.status, result: body }), {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = { schedule: '@hourly' }
