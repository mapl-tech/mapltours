import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { couponBlockedMessage } from '@/lib/coupons'
import { resolveCoupon } from '@/lib/coupon-lookup'
import { rateLimit, getIp } from '@/lib/rate-limit'

/**
 * Check a coupon code against the guest's cart and say what it is worth, so
 * checkout can show the discount before the Pay tap. Reserves nothing and
 * counts nothing: the code is applied for real inside the checkout route,
 * which re-runs the same rules on its own figures, and consumed only when
 * the booking is paid.
 *
 * `bookingType` says which checkout is asking (tours by default), and
 * `marginCents` is the page's own reading of MAPL's margin so the preview
 * shows the capped figure a capped code will really take; the server never
 * trusts either for money, only for the preview.
 *
 * Rate limited hard: a guest types one code, maybe twice.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = getIp(req as never)
  if (rateLimit(ip, { bucket: 'coupon-validate', max: 8, windowMs: 60_000 })) {
    return NextResponse.json({ valid: false, message: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 })
  }

  let body: { code?: unknown; email?: unknown; amountCents?: unknown; bookingType?: unknown; marginCents?: unknown } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request.' }, { status: 400 })
  }

  const code = String(body.code ?? '')
  if (!code.trim()) return NextResponse.json({ valid: false, reason: 'not_found', message: couponBlockedMessage('not_found') })

  const amountCents = Number(body.amountCents)
  const baseCents = Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : Number.MAX_SAFE_INTEGER
  const marginRaw = Number(body.marginCents)
  const marginCents = Number.isFinite(marginRaw) && marginRaw >= 0 ? Math.round(marginRaw) : undefined
  const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''
  const bookingType = body.bookingType === 'transfer' ? 'transfer' : 'tour'

  const r = await resolveCoupon(createServiceClient(), { code, baseCents, email, bookingType, marginCents })
  if (r.kind === 'backend') return NextResponse.json({ valid: false, message: r.message }, { status: r.status })
  if (r.kind === 'refused') return NextResponse.json({ valid: false, reason: r.reason, message: r.message })

  return NextResponse.json({
    valid: true,
    code: r.row.code,
    kind: r.row.kind,
    value: Number(r.row.value),
    // Only meaningful when the client sent its amount; otherwise the client
    // computes the preview with couponDiscountCents on its own base.
    discountCents: baseCents === Number.MAX_SAFE_INTEGER ? null : r.check.discountCents,
    expiresAt: r.row.expires_at ?? null,
  })
}
