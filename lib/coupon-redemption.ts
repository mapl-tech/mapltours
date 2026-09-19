import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'

/**
 * Consuming a coupon.
 *
 * Nothing is reserved while a booking is pending; the code is counted once,
 * when the booking is PAID, so an abandoned checkout never locks a code.
 * Two things make that safe under redelivery and races:
 *
 *  - the redemption row is inserted FIRST, under the unique index on
 *    booking_id, so a redelivered webhook (or the in-request settle running
 *    twice) finds 23505 and stops: one booking counts once;
 *  - the use count moves by a compare-and-swap that names the value it read,
 *    so two bookings paying the same code at the same instant cannot both
 *    turn 0 into 1 and lose one. If the swap keeps losing, or the code was
 *    already at its limit (two checkouts priced it before either paid), the
 *    booking still keeps the discount it was charged with; the admin sees the
 *    extra use on the desk and the log says CRITICAL.
 */

type DB = ReturnType<typeof createServiceClient>

export interface CouponConsumeInput {
  couponId: string
  bookingId: string
  /** The guest's email as stored on the booking. */
  email: string | null
  /** Dollars taken off, as stored on the booking. */
  amount: number
}

export type CouponConsumeResult =
  | { ok: true; alreadyCounted: boolean; overRedeemed: boolean }
  | { ok: false; message: string }

export async function consumeCoupon(supabase: DB, input: CouponConsumeInput): Promise<CouponConsumeResult> {
  // 1. The ledger row, once per booking.
  const { error: insErr } = await supabase.from('coupon_redemptions').insert({
    coupon_id: input.couponId,
    booking_id: input.bookingId,
    email: input.email,
    amount: input.amount,
  })
  if (insErr) {
    if (insErr.code === '23505') return { ok: true, alreadyCounted: true, overRedeemed: false }
    return { ok: false, message: `ledger insert failed: ${insErr.message}` }
  }

  // 2. The use count, by compare-and-swap.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error: readErr } = await supabase
      .from('coupons')
      .select('uses, max_uses')
      .eq('id', input.couponId)
      .maybeSingle()
    if (readErr) return { ok: false, message: `coupon read failed: ${readErr.message}` }
    if (!row) return { ok: false, message: 'coupon vanished' }

    const uses = Number(row.uses)
    const { data: swapped, error: swapErr } = await supabase
      .from('coupons')
      .update({ uses: uses + 1, updated_at: new Date().toISOString() })
      .eq('id', input.couponId)
      .eq('uses', uses)
      .select('id')
      .maybeSingle()
    if (swapErr) return { ok: false, message: `coupon swap failed: ${swapErr.message}` }
    if (swapped) return { ok: true, alreadyCounted: false, overRedeemed: uses + 1 > Number(row.max_uses) }
  }
  return { ok: false, message: 'coupon use count kept moving underneath the swap' }
}
