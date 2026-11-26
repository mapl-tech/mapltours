/**
 * Daily at 14:45 UTC (09:45 in Jamaica): referral payouts by Wise
 * (app/api/referrals/payouts/route.ts). Built Nov 26 2026.
 *
 * Each run pays every referrer the commissions whose payout day has come: the
 * Monday after the guest's trip (and after the 48-hour cancellation window).
 * It runs every day so a Monday that fails is caught up on the Tuesday; on
 * other days it usually has nothing to pay. 15 minutes after the driver
 * payouts (driver-payouts-cron.mjs), so the two never share a minute.
 *
 * Inert until launch: unless REFERRAL_PAYOUTS_ENABLED is exactly '1' this
 * function does not even call the route (a dry run is asked for by hand:
 * `curl -H "Authorization: Bearer $CRON_SECRET" https://mapltours.com/api/referrals/payouts?dry=1`).
 * The route keeps its own gate as well. The log line is counts only, never a
 * name. Overlapping or repeated runs are harmless: every commission is
 * claimed in the ledger (referral_payout_items, one live item per earning)
 * before anything is sent, and each Wise transfer carries its own idempotency key.
 */
export default async () => {
  if (process.env.REFERRAL_PAYOUTS_ENABLED !== '1') {
    console.log('[referral-payouts-cron] referral payouts are not switched on (REFERRAL_PAYOUTS_ENABLED); nothing run')
    return new Response(JSON.stringify({ skipped: 'not enabled' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const base = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://mapltours.com'
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[referral-payouts-cron] CRON_SECRET not set')
    return new Response(JSON.stringify({ error: 'CRON_SECRET not set' }), { status: 500 })
  }
  const res = await fetch(`${base}/api/referrals/payouts`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` } })
  const body = await res.text()
  console.log('[referral-payouts-cron]', res.status, countsOnly(body))
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}

/** The route's answer as a log line: counts only. A plan (names, amounts) is dropped even if it ever arrives. */
export function countsOnly(body) {
  try {
    const j = JSON.parse(body)
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      delete j.plan
      return JSON.stringify(j).slice(0, 600)
    }
  } catch {}
  return `unreadable answer, ${body.length} bytes`
}

export const config = { schedule: '45 14 * * *' }
