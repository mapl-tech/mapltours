import { NextRequest, NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { referralWiseFromEnv } from '@/lib/referrals/wise-env'
import { deniedMessage } from '@/lib/referrals/access'
import { composeReferrerView } from '@/lib/referrals/ledger'
import { getReferrerSession, readLedger, sameSiteRequest } from '@/lib/referrals/server'
import { savePayoutAccount } from '@/lib/referrals/payout-server'

/**
 * POST: a referrer adds or changes the Wise account they are paid into
 * (lib/referrals/payout-server says every step). The body holds the account
 * and routing numbers, which go to Wise and nowhere else: this route logs
 * nothing from the body, and its answer never echoes them.
 *
 * Signed-in referrers only, from the site's own page, rate limited (5 an hour
 * per referrer, 10 an hour per IP: each attempt asks Wise to create a
 * recipient), and only with a sign-in no older than an hour.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

export async function POST(request: NextRequest) {
  if (!sameSiteRequest(request)) return json(403, { error: 'That request did not come from the referral page.' })
  if (rateLimit(getIp(request), { windowMs: 60 * 60_000, max: 10, bucket: 'referrals-account-ip' })) return json(429, { error: 'Too many tries. Wait an hour, then try again.' })
  const s = await getReferrerSession()
  if (!s.ok) {
    const status = s.denied === 'unavailable' ? 503 : s.denied === 'not_signed_in' ? 401 : 403
    return json(status, { error: deniedMessage(s.denied, s.email), denied: s.denied })
  }
  if (rateLimit(s.referrer.id, { windowMs: 60 * 60_000, max: 5, bucket: 'referrals-account' })) return json(429, { error: 'Too many tries. Wait an hour, then try again.' })
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return json(400, { error: 'That request could not be read.' })
  }
  let result: Awaited<ReturnType<typeof savePayoutAccount>>
  try {
    const w = referralWiseFromEnv()
    result = await savePayoutAccount({ svc: s.svc, wise: w?.wise ?? null, config: w?.config ?? null, nowMs: Date.now() }, s.referrer, s.user, body)
  } catch (err) {
    // Never the body: it holds the account number.
    console.error('[referrals] payout account failed', err instanceof Error ? err.name : 'error')
    return json(500, { error: 'That did not save. Nothing changed. Try again in a moment.' })
  }
  if (!result.ok) return json(result.status, { error: result.message, errors: result.errors ?? null, reauth: result.reauth ?? false })
  // Saved. A failed re-read must not read as a failed save: the page reloads instead.
  let view = null
  try {
    const rows = await readLedger(s.svc, { referrerId: s.referrer.id })
    view = composeReferrerView(rows, rows.referrers[0] ?? s.referrer, Date.now())
  } catch { /* view stays null */ }
  return json(200, { ok: true, kind: result.kind, noticeSent: result.noticeSent, view })
}
