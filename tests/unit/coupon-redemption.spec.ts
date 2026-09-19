import { describe, it, expect } from 'vitest'
import { consumeCoupon } from '@/lib/coupon-redemption'

/**
 * A fake of the two tables the consumer touches, faithful to the parts of
 * PostgREST it relies on: the unique index on coupon_redemptions.booking_id
 * (23505) and the compare-and-swap on coupons.uses.
 */
function fakeDb(seed: { uses: number; max_uses: number | null }, opts: { raceOnce?: boolean } = {}) {
  const coupon = { id: 'c1', ...seed }
  const redemptions: Record<string, unknown>[] = []
  let raced = false
  const from = (table: string) => {
    if (table === 'coupon_redemptions') {
      return {
        insert: async (row: Record<string, unknown>) => {
          if (redemptions.some((r) => r.booking_id === row.booking_id)) return { error: { code: '23505', message: 'duplicate' } }
          redemptions.push(row)
          return { error: null }
        },
      }
    }
    if (table === 'coupons') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { uses: coupon.uses, max_uses: coupon.max_uses }, error: null }) }) }),
        update: (patch: { uses: number }) => ({
          eq: (_c: string, id: string) => ({
            eq: (_u: string, expected: number) => ({
              select: () => ({
                maybeSingle: async () => {
                  // Simulate another booking winning the swap first, once.
                  if (opts.raceOnce && !raced) { raced = true; coupon.uses += 1; return { data: null, error: null } }
                  if (id !== coupon.id || coupon.uses !== expected) return { data: null, error: null }
                  coupon.uses = patch.uses
                  return { data: { id }, error: null }
                },
              }),
            }),
          }),
        }),
      }
    }
    throw new Error('unexpected table ' + table)
  }
  return { coupon, redemptions, db: { from } as never }
}

describe('consumeCoupon', () => {
  it('counts a paid booking once and records the ledger row', async () => {
    const f = fakeDb({ uses: 0, max_uses: 1 })
    const r = await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b1', email: 'a@example.com', amount: 12.75 })
    expect(r).toEqual({ ok: true, alreadyCounted: false, overRedeemed: false })
    expect(f.coupon.uses).toBe(1)
    expect(f.redemptions).toHaveLength(1)
  })
  it('is idempotent under webhook redelivery', async () => {
    const f = fakeDb({ uses: 0, max_uses: 1 })
    await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b1', email: null, amount: 5 })
    const again = await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b1', email: null, amount: 5 })
    expect(again).toEqual({ ok: true, alreadyCounted: true, overRedeemed: false })
    expect(f.coupon.uses).toBe(1)
    expect(f.redemptions).toHaveLength(1)
  })
  it('retries the swap when another booking moved the count first', async () => {
    const f = fakeDb({ uses: 0, max_uses: 5 }, { raceOnce: true })
    const r = await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b2', email: null, amount: 5 })
    expect(r).toEqual({ ok: true, alreadyCounted: false, overRedeemed: false })
    expect(f.coupon.uses).toBe(2)
  })
  it('flags an over-redemption instead of hiding it', async () => {
    const f = fakeDb({ uses: 1, max_uses: 1 })
    const r = await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b9', email: null, amount: 5 })
    expect(r).toEqual({ ok: true, alreadyCounted: false, overRedeemed: true })
    expect(f.coupon.uses).toBe(2)
  })
  it('an unlimited code is never over-redeemed', async () => {
    const f = fakeDb({ uses: 500, max_uses: null })
    const r = await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b500', email: null, amount: 5 })
    expect(r).toEqual({ ok: true, alreadyCounted: false, overRedeemed: false })
    expect(f.coupon.uses).toBe(501)
  })
  it('stores the ledger email lowercased so the per-address count can match it', async () => {
    const f = fakeDb({ uses: 0, max_uses: null })
    await consumeCoupon(f.db, { couponId: 'c1', bookingId: 'b1', email: '  Jane@Example.COM ', amount: 5 })
    expect(f.redemptions[0].email).toBe('jane@example.com')
  })
})
