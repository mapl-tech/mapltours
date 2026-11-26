import { describe, test, expect } from 'vitest'
import { resolveReferrerAccess, acceptedTerms, mayCreateCodes, deniedMessage, emailKey, type ReferrerRow } from '@/lib/referrals/access'
import { TERMS_VERSION } from '@/lib/referrals/rules'

/**
 * Who opens /referrals (lib/referrals/access): the invitation is the address.
 * Made-up people.
 */

const row = (o: Partial<ReferrerRow> = {}): ReferrerRow => ({
  id: 'r1', email: 'ann@example.com', name: 'Ann Lee', business: null, status: 'active', commission_percent: 3,
  user_id: null, invited_at: '2026-11-26T00:00:00Z', invite_sent_at: null, invite_sends: 0,
  terms_version: TERMS_VERSION, terms_accepted_at: '2026-11-26T01:00:00Z',
  wise_recipient_id: null, payout_holder: null, payout_last4: null, payout_legal_type: null, payout_added_at: null, payout_hold_until: null,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z', ...o,
})

describe('the invitation is the address', () => {
  test('a confirmed sign-in with the invited address, in any case', () => {
    const r = resolveReferrerAccess({ email: ' ANN@Example.com ', confirmed: true, rows: [row()] })
    expect(r).toEqual({ ok: true, referrer: row() })
  })
  test('an invited, paused referrer still opens the page (to see what is held and why)', () => {
    for (const status of ['invited', 'paused'] as const) {
      expect(resolveReferrerAccess({ email: 'ann@example.com', confirmed: true, rows: [row({ status })] }).ok).toBe(true)
    }
  })
  test('refusals', () => {
    expect(resolveReferrerAccess({ email: null, confirmed: true, rows: [] })).toEqual({ ok: false, denied: 'not_signed_in' })
    expect(resolveReferrerAccess({ email: 'ann@example.com', confirmed: false, rows: [row()] })).toEqual({ ok: false, denied: 'unconfirmed' })
    expect(resolveReferrerAccess({ email: 'devon@example.com', confirmed: true, rows: [row()] })).toEqual({ ok: false, denied: 'not_invited' })
    expect(resolveReferrerAccess({ email: 'ann@example.com', confirmed: true, rows: [row({ status: 'removed' })] })).toEqual({ ok: false, denied: 'removed' })
  })
  test('a removed row beside a live one: the live one', () => {
    const live = row({ id: 'r2', status: 'invited' })
    expect(resolveReferrerAccess({ email: 'ann@example.com', confirmed: true, rows: [row({ status: 'removed' }), live] })).toEqual({ ok: true, referrer: live })
  })
  test('two live rows (the unique index would refuse it) are never guessed between', () => {
    expect(resolveReferrerAccess({ email: 'ann@example.com', confirmed: true, rows: [row(), row({ id: 'r2' })] }).ok).toBe(false)
  })
  test('emailKey', () => {
    expect(emailKey('  A@B.C ')).toBe('a@b.c')
    expect(emailKey(undefined)).toBe('')
  })
})

describe('terms and codes', () => {
  test('terms count only at the current version', () => {
    expect(acceptedTerms(row())).toBe(true)
    expect(acceptedTerms(row({ terms_version: '2020-01-01' }))).toBe(false)
    expect(acceptedTerms(row({ terms_accepted_at: null }))).toBe(false)
  })
  test('codes are created only by an active referrer who accepted the terms', () => {
    expect(mayCreateCodes(row())).toBe(true)
    expect(mayCreateCodes(row({ status: 'invited' }))).toBe(false)
    expect(mayCreateCodes(row({ status: 'paused' }))).toBe(false)
    expect(mayCreateCodes(row({ terms_version: 'old' }))).toBe(false)
  })
  test('every refusal says what to do, with no dashes', () => {
    for (const d of ['not_signed_in', 'unconfirmed', 'not_invited', 'removed', 'unavailable'] as const) {
      const m = deniedMessage(d, 'ann@example.com')
      expect(m).toMatch(/\.$/)
      expect(m).not.toMatch(/[–—]/)
    }
    expect(deniedMessage('not_invited', 'devon@example.com')).toContain('devon@example.com')
  })
})
