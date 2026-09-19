import { describe, it, expect } from 'vitest'
import {
  applyCoupon, couponDiscountCents, normalizeCouponCode, generateCouponCode, describeCoupon,
  couponBlockedMessage, COUPON_FLOOR_CENTS, type CouponRow,
} from '@/lib/coupons'

const base = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c1', code: 'MAPL-AAAA-AAAA', kind: 'percent', value: 5, applies_to: 'tour', email: null,
  max_uses: 1, uses: 0, uses_per_email: null, min_total: null, starts_at: '2026-01-01T00:00:00Z', expires_at: '2027-03-17T00:00:00Z', status: 'active',
  ...over,
})
const NOW = new Date('2026-09-19T00:00:00Z')

describe('normalizeCouponCode', () => {
  it('canonicalises issued codes however they are typed', () => {
    expect(normalizeCouponCode('mapl-aacd-2346')).toBe('MAPL-AACD-2346')
    expect(normalizeCouponCode(' MAPLAACD2346 ')).toBe('MAPL-AACD-2346')
    expect(normalizeCouponCode('mapl aacd 2346')).toBe('MAPL-AACD-2346')
  })
  it('treats a MAPL-prefixed string with look-alike characters as a word code, never as an issued one', () => {
    // O and I are not in the issued alphabet, so this can only be a word code; the lookup then simply finds nothing
    expect(normalizeCouponCode('MAPL-OOOO-IIII')).toBe('MAPLOOOOIIII')
  })
  it('accepts admin word codes, uppercased', () => {
    expect(normalizeCouponCode('welcome5')).toBe('WELCOME5')
    expect(normalizeCouponCode('  jamaica-2026 ')).toBe('JAMAICA2026')
  })
  it('refuses empty and out-of-range input', () => {
    expect(normalizeCouponCode('')).toBeNull()
    expect(normalizeCouponCode('abc')).toBeNull()
    expect(normalizeCouponCode('x'.repeat(25))).toBeNull()
  })
})

describe('generateCouponCode', () => {
  it('has the gift-code shape and alphabet', () => {
    for (let i = 0; i < 100; i++) expect(generateCouponCode()).toMatch(/^MAPL-[ACDEFHJKLMNPQRTUVWXY2346789]{4}-[ACDEFHJKLMNPQRTUVWXY2346789]{4}$/)
  })
  it('round-trips through the normaliser', () => {
    const c = generateCouponCode()
    expect(normalizeCouponCode(c.toLowerCase().replace(/-/g, ''))).toBe(c)
  })
})

describe('couponDiscountCents', () => {
  it('rounds a percent to the nearest cent', () => {
    expect(couponDiscountCents('percent', 5, 10300)).toBe(515)   // $103 tour
    expect(couponDiscountCents('percent', 5, 25500)).toBe(1275)  // $255
    expect(couponDiscountCents('percent', 5, 12800)).toBe(640)
  })
  it('caps a fixed amount at the base and both at the floor', () => {
    expect(couponDiscountCents('fixed', 10, 25500)).toBe(1000)
    expect(couponDiscountCents('fixed', 500, 25500)).toBe(25500 - COUPON_FLOOR_CENTS)
    expect(couponDiscountCents('percent', 100, 25500)).toBe(25500 - COUPON_FLOOR_CENTS)
  })
  it('returns 0 for nonsense', () => {
    expect(couponDiscountCents('percent', 5, 0)).toBe(0)
    expect(couponDiscountCents('percent', 0, 1000)).toBe(0)
    expect(couponDiscountCents('fixed', NaN, 1000)).toBe(0)
    expect(couponDiscountCents('percent', 5, 50)).toBe(0) // under the floor already
  })
})

describe('applyCoupon', () => {
  it('applies a live 5% code to a tour', () => {
    const r = applyCoupon(base(), { baseCents: 25500, now: NOW })
    expect(r).toEqual({ applicable: true, discountCents: 1275, chargeCents: 24225 })
  })
  it('refuses every dead state with its own reason', () => {
    expect(applyCoupon(null, { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'not_found' })
    expect(applyCoupon(base({ status: 'void' }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'not_active' })
    expect(applyCoupon(base({ status: 'paused' }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'not_active' })
    expect(applyCoupon(base({ starts_at: '2030-01-01T00:00:00Z' }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'not_started' })
    expect(applyCoupon(base({ expires_at: '2026-01-01T00:00:00Z' }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'expired' })
    expect(applyCoupon(base({ uses: 1 }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'exhausted' })
    expect(applyCoupon(base({ applies_to: 'transfer' }), { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'not_rides' })
    expect(applyCoupon(base(), { baseCents: 25500, now: NOW, bookingType: 'transfer' })).toEqual({ applicable: false, reason: 'not_tours' })
  })
  it('a code for both works on either checkout, a one-sided code only on its own', () => {
    const both = base({ applies_to: 'both' })
    expect(applyCoupon(both, { baseCents: 12600, now: NOW, bookingType: 'transfer' })).toEqual({ applicable: true, discountCents: 630, chargeCents: 11970 })
    expect(applyCoupon(both, { baseCents: 12600, now: NOW, bookingType: 'tour' }).applicable).toBe(true)
    expect(applyCoupon(base({ applies_to: 'transfer' }), { baseCents: 12600, now: NOW, bookingType: 'transfer' }).applicable).toBe(true)
    expect(applyCoupon(base({ applies_to: 'transfer' }), { baseCents: 12600, now: NOW, bookingType: 'tour' })).toEqual({ applicable: false, reason: 'not_rides' })
  })
  it('a shared code has no overall limit and one use per address', () => {
    const shared = base({ code: 'JAMAICA5', applies_to: 'both', max_uses: null, uses: 9999, uses_per_email: 1, expires_at: null })
    expect(applyCoupon(shared, { baseCents: 25500, now: NOW, email: 'jane@example.com', emailUses: 0 }).applicable).toBe(true)
    expect(applyCoupon(shared, { baseCents: 25500, now: NOW, email: 'jane@example.com' }).applicable).toBe(true)
    expect(applyCoupon(shared, { baseCents: 25500, now: NOW, email: 'jane@example.com', emailUses: 1 })).toEqual({ applicable: false, reason: 'email_limit' })
    expect(applyCoupon(base({ max_uses: null, uses: 5, uses_per_email: null }), { baseCents: 25500, now: NOW, emailUses: 40 }).applicable).toBe(true)
  })
  it('never takes more than MAPL\'s margin on the booking', () => {
    // A $50 code on a ride whose margin is $12.40: the driver's rate is untouchable.
    expect(applyCoupon(base({ kind: 'fixed', value: 50 }), { baseCents: 7500, now: NOW, marginCents: 1240 })).toEqual({ applicable: true, discountCents: 1240, chargeCents: 6260 })
    // 5% of $126 is $6.30, under a $26 margin: uncapped.
    expect(applyCoupon(base(), { baseCents: 12600, now: NOW, marginCents: 2600 })).toEqual({ applicable: true, discountCents: 630, chargeCents: 11970 })
    // No margin left (a reward already ate it): nothing to give.
    expect(applyCoupon(base(), { baseCents: 12600, now: NOW, marginCents: 0 })).toEqual({ applicable: false, reason: 'no_margin' })
    // A margin that is not a number cannot poison the arithmetic.
    expect(applyCoupon(base(), { baseCents: 12600, now: NOW, marginCents: NaN })).toEqual({ applicable: true, discountCents: 630, chargeCents: 11970 })
  })
  it('binds a code to the address it was sent to, case-insensitively', () => {
    const row = base({ email: 'jane@example.com' })
    expect(applyCoupon(row, { baseCents: 25500, now: NOW, email: ' Jane@Example.com ' }).applicable).toBe(true)
    expect(applyCoupon(row, { baseCents: 25500, now: NOW, email: 'bob@example.com' })).toEqual({ applicable: false, reason: 'wrong_email' })
    expect(applyCoupon(row, { baseCents: 25500, now: NOW })).toEqual({ applicable: false, reason: 'wrong_email' })
  })
  it('enforces the minimum total', () => {
    expect(applyCoupon(base({ min_total: 200 }), { baseCents: 12800, now: NOW })).toEqual({ applicable: false, reason: 'min_total' })
    expect(applyCoupon(base({ min_total: 200 }), { baseCents: 20000, now: NOW }).applicable).toBe(true)
  })
  it('never charges under the floor', () => {
    const r = applyCoupon(base({ kind: 'fixed', value: 300 }), { baseCents: 12800, now: NOW })
    expect(r).toEqual({ applicable: true, discountCents: 12700, chargeCents: 100 })
    expect(applyCoupon(base(), { baseCents: 80, now: NOW })).toEqual({ applicable: false, reason: 'too_small' })
  })
  it('reads numeric strings the way PostgREST returns them', () => {
    const r = applyCoupon(base({ value: '5.00', min_total: '100.00' }), { baseCents: 25500, now: NOW })
    expect(r).toEqual({ applicable: true, discountCents: 1275, chargeCents: 24225 })
  })
})

describe('copy', () => {
  it('has a sentence for every reason', () => {
    for (const r of ['not_found', 'not_active', 'not_started', 'expired', 'exhausted', 'wrong_email', 'email_limit', 'min_total', 'not_tours', 'not_rides', 'too_small', 'no_margin'] as const) {
      expect(couponBlockedMessage(r, { min_total: 200, email: null }).length).toBeGreaterThan(10)
    }
    expect(couponBlockedMessage('min_total', { min_total: 200, email: null })).toContain('$200')
  })
  it('describes a rule in plain words', () => {
    expect(describeCoupon(base({ email: 'jane@example.com' }))).toBe('5% off tours, one use, for jane@example.com, until Mar 16, 2027')
    expect(describeCoupon(base({ kind: 'fixed', value: 10, max_uses: 50, expires_at: null }))).toBe('$10 off tours, 50 uses')
    expect(describeCoupon(base({ code: 'JAMAICA5', applies_to: 'both', max_uses: null, uses_per_email: 1, expires_at: null }))).toBe('5% off tours and rides, unlimited uses, one per guest')
    expect(describeCoupon(base({ applies_to: 'transfer', max_uses: 200, uses_per_email: 2, expires_at: null }))).toBe('5% off airport rides, 200 uses, 2 per guest')
  })
})
