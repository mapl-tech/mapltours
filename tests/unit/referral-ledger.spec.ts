import { describe, test, expect } from 'vitest'
import { composeReferrerView, composeAdminView, tripLabel, type LedgerRows, type LedgerBooking, type EarningRow } from '@/lib/referrals/ledger'
import type { ReferrerRow } from '@/lib/referrals/access'
import { TERMS_VERSION } from '@/lib/referrals/rules'

/**
 * What the referral page and the admin page show (lib/referrals/ledger),
 * from made-up rows. The referrer's view must never carry a guest's name,
 * email, phone, hotel, flight or booking reference.
 */

const at = (s: string) => Date.parse(`${s}:00Z`) + 5 * 3_600_000
const NOW = at('2026-12-03T12:00') // a Thursday

const referrer = (o: Partial<ReferrerRow> = {}): ReferrerRow => ({
  id: 'r1', email: 'ann@example.com', name: 'Ann Lee', business: 'Charela Inn', status: 'active', commission_percent: 3, user_id: 'u1',
  invited_at: '2026-11-01T00:00:00Z', invite_sent_at: '2026-11-01T00:00:00Z', invite_sends: 1, terms_version: TERMS_VERSION, terms_accepted_at: '2026-11-01T01:00:00Z',
  wise_recipient_id: 2001, payout_holder: 'Ann Lee', payout_last4: '4567', payout_legal_type: 'PRIVATE', payout_added_at: '2026-11-01T02:00:00Z', payout_hold_until: '2026-11-04T02:00:00Z',
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o,
})
const B = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`
const booking = (id: string, o: Partial<LedgerBooking> = {}): LedgerBooking => ({
  id, status: 'paid', booking_type: 'transfer', total_paid: 184.3, subtotal: 162, coupon_discount: 9.7, refund_state: 'none', refunded_at: null,
  created_at: '2026-11-20T12:00:00Z', booking_items: [{ item_type: 'transfer', trip_type: 'round_trip', arrival_at: '2026-11-25T14:00:00+00:00', departure_at: '2026-11-29T10:00:00+00:00' }], ...o,
})
const earning = (id: string, bookingId: string, o: Partial<EarningRow> = {}): EarningRow => ({
  id, booking_id: bookingId, referrer_id: 'r1', coupon_id: 'c1', code: 'CHARELA5', commission_percent: 3, recorded_late: false,
  voided_at: null, void_reason: null, voided_by: null, created_at: '2026-11-20T12:00:00Z', ...o,
})

function rows(o: Partial<LedgerRows> = {}): LedgerRows {
  return {
    referrers: [referrer()],
    codes: [
      { id: 'c1', referrer_id: 'r1', code: 'CHARELA5', note: 'Welcome book', status: 'active', referral_hold: false, uses: 3, created_at: '2026-11-01T03:00:00Z', retired_at: null },
      { id: 'c2', referrer_id: 'r1', code: 'CHARELAWA', note: null, status: 'paused', referral_hold: true, uses: 0, created_at: '2026-11-02T03:00:00Z', retired_at: null },
      { id: 'c3', referrer_id: 'r1', code: 'OLDCODE', note: null, status: 'void', referral_hold: false, uses: 0, created_at: '2026-10-02T03:00:00Z', retired_at: '2026-11-01T00:00:00Z' },
    ],
    earnings: [
      earning('e1', B(1)),
      earning('e2', B(2)),
      earning('e3', B(3)),
      earning('e4', B(4), { voided_at: '2026-11-22T00:00:00Z', void_reason: 'Your own booking' }),
    ],
    bookings: [
      booking(B(1)), // trip ended Nov 29: ready, paid Monday Nov 30... but already in a payout below
      booking(B(2), { booking_items: [{ item_type: 'transfer', trip_type: 'one_way', arrival_at: '2026-12-10T14:00:00+00:00' }], total_paid: 102.6, subtotal: 90 }),
      booking(B(3), { status: 'refunded', refunded_at: '2026-11-21T00:00:00Z' }),
      booking(B(4)),
    ],
    payouts: [{ id: 'p1', referrer_id: 'r1', payee: 'Ann Lee (Charela Inn)', recipient_id: 2001, account_last4: '4567', amount_usd: 5.53, fee_usd: 0, status: 'sent', wise_transfer_id: 777, pay_day: '2026-11-30', error: null, created_at: '2026-11-30T14:45:00Z', funded_at: '2026-11-30T14:45:05Z', sent_at: '2026-11-30T14:45:09Z', resolved_at: null }],
    items: [{ id: 'i1', payout_id: 'p1', earning_id: 'e1', booking_id: B(1), amount_usd: 5.53, active: true }],
    events: [{ id: 'v1', referrer_id: 'r1', kind: 'code_created', detail: { code: 'CHARELA5' }, actor: 'ann@example.com', created_at: '2026-11-01T03:00:00Z' }],
    ...o,
  }
}

describe("the referrer's page", () => {
  const v = composeReferrerView(rows(), referrer(), NOW)

  test('codes: live first, retired last, each with what it has done', () => {
    expect(v.codes.map((c) => [c.code, c.state])).toEqual([['CHARELA5', 'active'], ['CHARELAWA', 'held'], ['OLDCODE', 'retired']])
    expect(v.liveCodes).toBe(2)
    const main = v.codes[0]
    // Counted: e1 (paid) and e2 (upcoming). Refunded and not-counted ones are left out.
    expect(main).toMatchObject({ bookings: 2, earnedCents: 553 + 308, paidCents: 553, waitingCents: 308, guestsSavedCents: 970 + 970 })
  })

  test('each booking: what, days, the guest paid, the commission, the status', () => {
    const byId = Object.fromEntries(v.earnings.map((e) => [e.id, e]))
    expect(byId.e1).toMatchObject({ what: 'Airport ride, round trip', days: 'Nov 25 to Nov 29', status: 'paid', paidDay: '2026-11-30', commissionCents: 553, guestPaidCents: 18430 })
    expect(byId.e2).toMatchObject({ what: 'Airport ride, one way', status: 'upcoming', payDay: '2026-12-14', commissionCents: 308 })
    expect(byId.e3.status).toBe('cancelled')
    expect(byId.e4).toMatchObject({ status: 'void', note: 'Your own booking' })
  })

  test('totals and the next payout', () => {
    expect(v.totals).toEqual({ earnedCents: 861, paidCents: 553, waitingCents: 308, bookings: 2 })
    expect(v.next).toEqual({ day: '2026-12-07', amountCents: 0, block: null, holdUntilDay: null })
    expect(v.payouts).toEqual([{ id: 'p1', day: '2026-11-30', amountCents: 553, trips: 1, last4: '4567', state: 'sent' }])
  })

  test('a status line for a returning visit', () => {
    expect(v.latest).toBe('Latest: we sent you US$5.53 on Nov 30.')
  })

  test('nothing about a guest, ever', () => {
    const text = JSON.stringify(v)
    expect(text).not.toMatch(/MAPL-[0-9A-F]{8}/)
    expect(text).not.toMatch(/guest@|\+1 876|hotel|flight/i)
    for (const e of v.earnings) expect(e.ref).toBeUndefined()
  })

  test('why the next payout will not go', () => {
    expect(composeReferrerView(rows(), referrer({ status: 'paused' }), NOW).next.block).toBe('paused')
    expect(composeReferrerView(rows(), referrer({ wise_recipient_id: null, payout_last4: null, payout_holder: null, payout_legal_type: null }), NOW).next.block).toBe('no_account')
    const held = composeReferrerView(rows(), referrer({ payout_hold_until: new Date(at('2026-12-08T00:00')).toISOString() }), NOW)
    expect(held.next).toMatchObject({ block: 'account_hold', holdUntilDay: '2026-12-08' })
    expect(held.account?.onHold).toBe(true)
  })

  test("another referrer's rows never appear", () => {
    const r = rows()
    r.earnings.push(earning('x1', B(5), { referrer_id: 'r2' }))
    r.bookings.push(booking(B(5)))
    r.codes.push({ id: 'cx', referrer_id: 'r2', code: 'OTHER5', note: null, status: 'active', referral_hold: false, uses: 1, created_at: '2026-11-01T00:00:00Z', retired_at: null })
    const v2 = composeReferrerView(r, referrer(), NOW)
    expect(v2.earnings.map((e) => e.id)).not.toContain('x1')
    expect(v2.codes.map((c) => c.code)).not.toContain('OTHER5')
  })

  test('trip labels never name the hotel or the guest', () => {
    expect(tripLabel(booking(B(1), { booking_type: 'tour', booking_items: [{ title: "Dunn's River Falls Climb", date: '2026-12-02' }, { title: 'Bamboo Rafting', date: '2026-12-03' }] }))).toBe("Dunn's River Falls Climb and 1 more")
    expect(tripLabel(null)).toBe('A booking that no longer exists')
  })
})

describe("the admin's page", () => {
  test('booking references, money in full, and what needs a look', () => {
    const r = rows()
    // Paid, then refunded: the admin hears about it.
    r.bookings[0] = { ...r.bookings[0], status: 'refunded', refunded_at: '2026-12-01T00:00:00Z' }
    const a = composeAdminView(r, NOW)
    const one = a.referrers[0]
    expect(one.earnings.find((e) => e.id === 'e1')).toMatchObject({ ref: 'MAPL-11111111', paidThenRefunded: true, status: 'paid' })
    expect(one.attention.join(' ')).toMatch(/MAPL-11111111: US\$5\.53 was paid, then the booking was refunded/)
    expect(one.events).toEqual([{ kind: 'code_created', detail: { code: 'CHARELA5' }, actor: 'ann@example.com', at: '2026-11-01T03:00:00Z' }])
    expect(a.totals).toMatchObject({ active: 1, invited: 0, paused: 0, liveCodes: 1 })
  })

  test('a payout that needs a look, until resolved', () => {
    const r = rows({ payouts: [{ ...rows().payouts[0], status: 'needs_review', error: 'transfer 777 unknown' }] })
    expect(composeAdminView(r, NOW).referrers[0].attention.join(' ')).toMatch(/needs a look in Wise/)
    const resolved = rows({ payouts: [{ ...rows().payouts[0], status: 'needs_review', resolved_at: '2026-12-01T00:00:00Z' }] })
    expect(composeAdminView(resolved, NOW).referrers[0].attention).toEqual([])
  })

  test('removed referrers sort last', () => {
    const r = rows({ referrers: [referrer({ id: 'r9', name: 'Zed', status: 'removed', email: 'zed@example.com' }), referrer()] })
    expect(composeAdminView(r, NOW).referrers.map((x) => x.status)).toEqual(['active', 'removed'])
  })
})
