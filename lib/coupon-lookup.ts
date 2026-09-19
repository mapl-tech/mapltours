import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { applyCoupon, classifyCouponBackendError, couponBackendMessage, couponBlockedMessage, normalizeCouponCode, normalizeEmail, type CouponApplication, type CouponContext, type CouponRow } from '@/lib/coupons'

/**
 * Finding and judging a coupon, the same way in every place that does it:
 * the two checkout routes (for real) and the validate endpoint (preview).
 *
 * The lookup reads the row, counts how many times this guest's address has
 * already redeemed it (paid bookings only, from the ledger: nothing pending
 * ever locks a code), and hands both to the pure rules. Nothing here writes.
 */

type DB = ReturnType<typeof createServiceClient>

/** Every column the rules read. Selected explicitly so a stray column never leaks into a response. */
export const COUPON_COLS = 'id, code, kind, value, applies_to, email, max_uses, uses, uses_per_email, min_total, starts_at, expires_at, status'

export type CouponResolution =
  | { kind: 'ok'; row: CouponRow; check: Extract<CouponApplication, { applicable: true }> }
  | { kind: 'refused'; row: CouponRow | null; reason: Extract<CouponApplication, { applicable: false }>['reason']; message: string }
  | { kind: 'backend'; message: string; status: 500 | 503 }

/** How many paid bookings this address has redeemed the code on. */
export async function countCouponUsesByEmail(db: DB, couponId: string, email: string | null | undefined): Promise<number | null> {
  const norm = normalizeEmail(email)
  if (!norm) return 0
  const { count, error } = await db
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId)
    .eq('email', norm)
  if (error) return null
  return count ?? 0
}

export async function resolveCoupon(
  db: DB,
  input: { code: string } & Omit<CouponContext, 'emailUses'>,
): Promise<CouponResolution> {
  const code = normalizeCouponCode(input.code)
  if (!code) return { kind: 'refused', row: null, reason: 'not_found', message: couponBlockedMessage('not_found') }

  const { data: row, error } = await db.from('coupons').select(COUPON_COLS).eq('code', code).maybeSingle<CouponRow>()
  if (error) {
    const fault = classifyCouponBackendError(error)
    console.error('[coupon] lookup failed', fault, error.message)
    return { kind: 'backend', message: couponBackendMessage(fault), status: fault === 'other' ? 500 : 503 }
  }

  let emailUses = 0
  if (row && row.uses_per_email != null) {
    const n = await countCouponUsesByEmail(db, row.id, input.email)
    if (n == null) return { kind: 'backend', message: couponBackendMessage('other'), status: 500 }
    emailUses = n
  }

  const check = applyCoupon(row ?? null, { ...input, emailUses })
  if (!check.applicable) return { kind: 'refused', row: row ?? null, reason: check.reason, message: couponBlockedMessage(check.reason, row ?? null) }
  return { kind: 'ok', row: row!, check }
}
