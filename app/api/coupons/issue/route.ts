import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { classifyCouponBackendError, generateCouponCode, normalizeEmail, ISSUED_PERCENT_MAX, type CouponRow } from '@/lib/coupons'
import { rateLimit, getIp } from '@/lib/rate-limit'

/**
 * Issue a coupon to an email address. Called server-to-server by the bio
 * landing page's lead function with a shared key; never by a browser.
 *
 * One live code per address per source: a repeat signup gets the same code
 * back (and is told if it has been used), so a person cannot farm codes by
 * signing up twice, and a daily ceiling per source bounds what a leaked key
 * could mint. Issued codes are always single-use, good on tours and airport
 * rides, and bound to the address they were sent to; the percent is capped
 * by ISSUED_PERCENT_MAX. The bio page now hands out the shared JAMAICA5
 * instead of calling this, but the endpoint stays live for any partner that
 * holds the key.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAILY_CAP = 200
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const COLS = 'id, code, kind, value, applies_to, email, max_uses, uses, uses_per_email, min_total, starts_at, expires_at, status'

function keyMatches(given: string | null): boolean {
  const expected = process.env.COUPON_ISSUE_KEY ?? ''
  if (!expected || !given) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!keyMatches(req.headers.get('x-coupon-issue-key'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const ip = getIp(req as never)
  if (rateLimit(ip, { bucket: 'coupon-issue', max: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let body: { email?: unknown; source?: unknown; kind?: unknown; value?: unknown; days?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '').slice(0, 200)
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  const source = String(body.source ?? 'bio').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'bio'
  const kind = body.kind === 'fixed' ? 'fixed' : 'percent'
  const value = Number(body.value)
  if (!Number.isFinite(value) || value <= 0 || (kind === 'percent' && value > ISSUED_PERCENT_MAX) || (kind === 'fixed' && value > 25)) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 })
  }
  const days = Math.min(365, Math.max(1, Math.round(Number(body.days) || 180)))

  const supabase = createServiceClient()

  // Already issued to this address from this source: hand the same code back.
  const { data: prev, error: prevErr } = await supabase
    .from('coupons')
    .select(COLS)
    .eq('email', email)
    .eq('source', source)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<CouponRow>()
  if (prevErr) {
    console.error('[coupon-issue] lookup failed', classifyCouponBackendError(prevErr), prevErr.message)
    return NextResponse.json({ error: 'backend' }, { status: 503 })
  }
  if (prev) {
    const expired = !!prev.expires_at && Date.parse(prev.expires_at) < Date.now()
    const spent = prev.status !== 'active' || (prev.max_uses != null && Number(prev.uses) >= Number(prev.max_uses)) || expired
    return NextResponse.json({ code: prev.code, kind: prev.kind, value: Number(prev.value), expiresAt: prev.expires_at, reused: true, spent })
  }

  // Daily ceiling per source.
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0)
  const { count, error: countErr } = await supabase
    .from('coupons')
    .select('id', { count: 'exact', head: true })
    .eq('source', source)
    .gte('created_at', dayStart.toISOString())
  if (countErr) return NextResponse.json({ error: 'backend' }, { status: 503 })
  if ((count ?? 0) >= DAILY_CAP) return NextResponse.json({ error: 'daily_cap' }, { status: 429 })

  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateCouponCode()
    const { data, error } = await supabase
      .from('coupons')
      .insert({ code, kind, value, applies_to: 'both', email, max_uses: 1, expires_at: expiresAt, status: 'active', source, note: `Issued to ${email} by ${source}` })
      .select('code, kind, value, expires_at')
      .single()
    if (!error && data) return NextResponse.json({ code: data.code, kind: data.kind, value: Number(data.value), expiresAt: data.expires_at, reused: false, spent: false })
    // 23505 on the code: draw again once. Anything else is the backend.
    if (error?.code !== '23505') {
      console.error('[coupon-issue] insert failed', classifyCouponBackendError(error), error?.message)
      return NextResponse.json({ error: 'backend' }, { status: 503 })
    }
  }
  return NextResponse.json({ error: 'backend' }, { status: 503 })
}
