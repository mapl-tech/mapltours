import { NextRequest, NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/no-store'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { deniedMessage } from '@/lib/referrals/access'
import { composeReferrerView } from '@/lib/referrals/ledger'
import { acceptTerms, checkCode, createCode, getReferrerSession, readLedger, sameSiteRequest, setCodeStatus } from '@/lib/referrals/server'

/**
 * The referral page's API (lib/referrals). Signed-in referrers only, and only
 * ever their own rows: every action names the referrer from the session.
 *
 *   GET                                        the page's view (codes, earnings, payouts, next payout)
 *   GET  ?check=CODE                           is a code allowed and free
 *   POST { action: 'accept_terms', name, business?, accept: true }
 *   POST { action: 'create_code', code, label? }
 *   POST { action: 'code_status', id, action2: 'pause' | 'resume' | 'retire' }
 *
 * Every answer is no-store. A state change must come from the site's own page
 * (sameSiteRequest: Origin and JSON) and is rate limited per address and per
 * IP; the payout account has its own route (./payout-account).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

type Session = Extract<Awaited<ReturnType<typeof getReferrerSession>>, { ok: true }>

async function session(): Promise<{ ok: false; error: NextResponse } | { ok: true; s: Session }> {
  const s = await getReferrerSession()
  if (!s.ok) {
    const status = s.denied === 'unavailable' ? 503 : s.denied === 'not_signed_in' ? 401 : 403
    return { ok: false, error: json(status, { error: deniedMessage(s.denied, s.email), denied: s.denied }) }
  }
  return { ok: true, s }
}

async function view(s: Session) {
  const rows = await readLedger(s.svc, { referrerId: s.referrer.id })
  const fresh = rows.referrers[0] ?? s.referrer
  return composeReferrerView(rows, fresh, Date.now())
}

export async function GET(request: NextRequest) {
  if (rateLimit(getIp(request), { windowMs: 60_000, max: 120, bucket: 'referrals-read' })) return json(429, { error: 'Too many requests. Wait a minute.' })
  const g = await session()
  if (!g.ok) return g.error
  const { s } = g
  try {
    const check = request.nextUrl.searchParams.get('check')
    if (check !== null) {
      if (rateLimit(s.referrer.id, { windowMs: 60_000, max: 40, bucket: 'referrals-check' })) return json(429, { error: 'Too many checks. Wait a minute.' })
      return json(200, await checkCode(s.svc, check))
    }
    return json(200, { view: await view(s) })
  } catch (err) {
    console.error('[referrals] read failed', err instanceof Error ? err.message : 'error')
    return json(503, { error: deniedMessage('unavailable') })
  }
}

export async function POST(request: NextRequest) {
  if (!sameSiteRequest(request)) return json(403, { error: 'That request did not come from the referral page.' })
  if (rateLimit(getIp(request), { windowMs: 60_000, max: 30, bucket: 'referrals-write' })) return json(429, { error: 'Too many requests. Wait a minute.' })
  const g = await session()
  if (!g.ok) return g.error
  const { s } = g
  if (rateLimit(s.referrer.id, { windowMs: 60 * 60_000, max: 60, bucket: 'referrals-write-referrer' })) return json(429, { error: 'Too many changes in an hour. Wait a little.' })
  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return json(400, { error: 'That request could not be read.' })
  }
  let result
  try {
    result =
      body.action === 'accept_terms' ? await acceptTerms(s.svc, s.referrer, s.user, body)
      : body.action === 'create_code' ? await createCode(s.svc, s.referrer, s.user, body)
      : body.action === 'code_status' ? await setCodeStatus(s.svc, s.referrer, s.user, { id: body.id, action: body.action2 })
      : null
  } catch (err) {
    console.error('[referrals] write failed', err instanceof Error ? err.message : 'error')
    return json(500, { error: 'That did not save. Try again in a moment.' })
  }
  if (!result) return json(400, { error: 'Unknown action.' })
  if (!result.ok) return json(result.status, { error: result.message, field: result.field ?? null })
  // Saved. A failed re-read must not read as a failed save: the page reloads instead.
  let fresh = null
  try { fresh = await view(s) } catch { /* fresh stays null */ }
  return json(200, { ok: true, message: result.message ?? null, view: fresh })
}
