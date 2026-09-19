import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { applyCoupon, classifyCouponBackendError, couponBackendMessage, couponBlockedMessage, normalizeCouponCode, type CouponRow } from '@/lib/coupons'
import { rateLimit, getIp } from '@/lib/rate-limit'

/**
 * Check a coupon code against the guest's cart and say what it is worth, so
 * checkout can show the discount before the Pay tap. Reserves nothing and
 * counts nothing: the code is applied for real inside /api/checkout, which
 * re-runs the same rules, and consumed only when the booking is paid.
 *
 * Rate limited hard: a guest types one code, maybe twice.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS = 'id, code, kind, value, applies_to, email, max_uses, uses, min_total, starts_at, expires_at, status'

export async function POST(req: Request) {
  const ip = getIp(req as never)
  if (rateLimit(ip, { bucket: 'coupon-validate', max: 8, windowMs: 60_000 })) {
    return NextResponse.json({ valid: false, message: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 })
  }

  let body: { code?: unknown; email?: unknown; amountCents?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request.' }, { status: 400 })
  }

  const code = normalizeCouponCode(String(body.code ?? ''))
  if (!code) return NextResponse.json({ valid: false, message: couponBlockedMessage('not_found') })

  const amountCents = Number(body.amountCents)
  const baseCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : Number.MAX_SAFE_INTEGER
  const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('coupons').select(COLS).eq('code', code).maybeSingle<CouponRow>()
  if (error) {
    const fault = classifyCouponBackendError(error)
    console.error('[coupon-validate] lookup failed', fault, error.message)
    return NextResponse.json({ valid: false, message: couponBackendMessage(fault) }, { status: fault === 'other' ? 500 : 503 })
  }

  const check = applyCoupon(data ?? null, { baseCents, email, bookingType: 'tour' })
  if (!check.applicable) {
    return NextResponse.json({ valid: false, reason: check.reason, message: couponBlockedMessage(check.reason, data ?? null) })
  }

  return NextResponse.json({
    valid: true,
    code,
    kind: data!.kind,
    value: Number(data!.value),
    // Only meaningful when the client sent its amount; otherwise the client
    // computes the preview with couponDiscountCents on its own base.
    discountCents: baseCents === Number.MAX_SAFE_INTEGER ? null : check.discountCents,
    expiresAt: data!.expires_at ?? null,
  })
}
