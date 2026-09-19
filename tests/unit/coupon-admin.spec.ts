import { describe, it, expect } from 'vitest'
import { parseCouponFields } from '@/lib/coupon-admin'

const NOW = Date.parse('2026-09-19T12:00:00Z')

describe('parseCouponFields', () => {
  it('accepts the public-code shape: 5%, both, unlimited, once per guest, never expires', () => {
    const r = parseCouponFields({ kind: 'percent', value: 5, appliesTo: 'both', maxUses: '', usesPerEmail: 1, expiresAt: '', note: 'The public code' }, NOW)
    expect(r).toEqual({ ok: true, fields: { kind: 'percent', value: 5, applies_to: 'both', max_uses: null, uses_per_email: 1, min_total: null, expires_at: null, note: 'The public code' } })
  })
  it('defaults applies_to to both and blanks to no limit', () => {
    const r = parseCouponFields({ kind: 'fixed', value: 25 }, NOW)
    expect(r.ok && r.fields.applies_to).toBe('both')
    expect(r.ok && r.fields.max_uses).toBeNull()
    expect(r.ok && r.fields.uses_per_email).toBeNull()
  })
  it('refuses every wrong shape with a sentence', () => {
    const bad = (b: Record<string, unknown>) => { const r = parseCouponFields(b, NOW); return r.ok ? 'accepted' : r.error }
    expect(bad({ kind: 'nope', value: 5 })).toMatch(/percent or a fixed/)
    expect(bad({ kind: 'percent', value: 0 })).toMatch(/above zero/)
    expect(bad({ kind: 'percent', value: 12.5 })).toMatch(/whole number/)
    expect(bad({ kind: 'percent', value: 101 })).toMatch(/1 to 100/)
    expect(bad({ kind: 'fixed', value: 1001 })).toMatch(/1,000/)
    expect(bad({ kind: 'percent', value: 5, appliesTo: 'cruise' })).toMatch(/tours, airport rides, or both/)
    expect(bad({ kind: 'percent', value: 5, maxUses: 0 })).toMatch(/unlimited/)
    expect(bad({ kind: 'percent', value: 5, maxUses: 'lots' })).toMatch(/unlimited/)
    expect(bad({ kind: 'percent', value: 5, usesPerEmail: 0 })).toMatch(/Per guest/)
    expect(bad({ kind: 'percent', value: 5, usesPerEmail: 101 })).toMatch(/Per guest/)
    expect(bad({ kind: 'percent', value: 5, minTotal: -1 })).toMatch(/dollar amount/)
    expect(bad({ kind: 'percent', value: 5, expiresAt: 'tomorrow' })).toMatch(/not a date/)
    expect(bad({ kind: 'percent', value: 5, expiresAt: '2020-01-01' })).toMatch(/in the past/)
  })
  it('rounds and normalises what it accepts', () => {
    const r = parseCouponFields({ kind: 'percent', value: '10', maxUses: '50.4', usesPerEmail: '2', minTotal: '200', expiresAt: '2027-03-18T23:59:59-05:00', note: ' x '.repeat(200) }, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.fields.max_uses).toBe(50)
      expect(r.fields.uses_per_email).toBe(2)
      expect(r.fields.min_total).toBe(200)
      expect(r.fields.expires_at).toBe('2027-03-19T04:59:59.000Z')
      expect(r.fields.note!.length).toBe(300)
    }
  })
})
