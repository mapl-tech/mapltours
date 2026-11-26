import { describe, test, expect } from 'vitest'
import {
  codeProblem, codeProblemMessage, normalizeReferralCode, suggestCodes, cleanLabel,
  commissionFor, usd, percentText,
  payableAt, payoutDayFor, payoutDayOnOrAfter, payoutRunInstant, dueOnRun, earningStatus,
  dayText, shortDay,
  DEFAULT_COMMISSION_PERCENT, REFERRAL_DISCOUNT_PERCENT, MAX_LIVE_CODES, PAYOUT_WEEKDAY, MAX_COMMISSION_PERCENT,
  type EarningFacts,
} from '@/lib/referrals/rules'
import { CARD_FIXED, CARD_RATE, getTransferPrice, driverCost, DESTINATIONS } from '@/lib/airport-transfers'
import { couponDiscountCents, normalizeCouponCode } from '@/lib/coupons'
import { weekday } from '@/lib/payouts/business-days'

/**
 * The referral program's pure rules (lib/referrals/rules.ts). The owner, Nov
 * 26 2026: codes give 5% off, max 7 per referrer, the referrer earns "3% of
 * what guest pays", and "make sure everything is secure as well".
 */

describe('the program as the owner set it', () => {
  test('5% off for guests, 3% for the referrer, 7 codes, paid on Mondays', () => {
    expect(REFERRAL_DISCOUNT_PERCENT).toBe(5)
    expect(DEFAULT_COMMISSION_PERCENT).toBe(3)
    expect(MAX_LIVE_CODES).toBe(7)
    expect(PAYOUT_WEEKDAY).toBe(1)
  })
})

describe('codes', () => {
  test('normalized exactly as checkout normalizes a typed code', () => {
    for (const typed of ['villa-mimosa 5', ' Charela5 ', 'idle.awhile', 'NEGRIL2026', 'mo bay 876']) {
      expect(normalizeReferralCode(typed)).toBe(normalizeCouponCode(typed) ?? '')
    }
    expect(normalizeReferralCode('Villa-Mimosa 5')).toBe('VILLAMIMOSA5')
  })

  test('the shape: 4 to 16 letters and digits, two letters at least', () => {
    expect(codeProblem('')).toBe('empty')
    expect(codeProblem('ABC')).toBe('too_short')
    expect(codeProblem('ABCDEFGHIJKLMNOPQ')).toBe('too_long')
    expect(codeProblem('A1234')).toBe('letters')
    expect(codeProblem('1234')).toBe('letters')
    expect(codeProblem('AB-C')).toBe('letters')
    expect(codeProblem('CHARELA5')).toBeNull()
    expect(codeProblem('ABCDEFGHIJKLMNOP')).toBeNull()
  })

  test('nothing that collides with issued coupons and gift cards (MAPL-XXXX-XXXX)', () => {
    expect(codeProblem('MAPLVILLA')).toBe('reserved')
    expect(codeProblem('MAPL5')).toBe('reserved')
    expect(codeProblem('VILLAMAPL')).toBeNull()
  })

  test('no word that promises more than 5% off, and no role it does not have', () => {
    for (const c of ['FREERIDE', 'GETFREE', 'REFUNDME', 'GIFTCARD5', 'ADMIN5', 'STAFFONLY', 'TESTCODE']) expect(codeProblem(c)).toBe('misleading_word')
  })

  test('no number from 6 to 100 at the end, which reads as the discount', () => {
    for (const c of ['VILLA6', 'VILLA10', 'SAVE20', 'NEGRIL50', 'SUITE100']) expect(codeProblem(c)).toBe('misleading_number')
    for (const c of ['VILLA5', 'VILLA1', 'NEGRIL2026', 'MOBAY876', 'ROOM101', 'VILLA05', 'SEVEN7SEAS']) expect(codeProblem(c)).toBeNull()
    expect(codeProblemMessage('misleading_number')).toMatch(/5% off/)
  })

  test('every message is a full sentence with no dashes', () => {
    for (const p of ['empty', 'too_short', 'too_long', 'letters', 'reserved', 'misleading_word', 'misleading_number'] as const) {
      const m = codeProblemMessage(p)
      expect(m).toMatch(/^[A-Z].*\.$/)
      expect(m).not.toMatch(/[–—]/)
    }
  })

  test('suggestions come from the business first, and all pass the rules', () => {
    expect(suggestCodes('Ann Lee', 'Charela Inn')).toEqual(['CHARELA5', 'CHARELAINN', 'CHARELA'])
    expect(suggestCodes('Devon Brown', null)).toEqual(['DEVON5', 'DEVONBROWN', 'DEVON'])
    expect(suggestCodes('Zoë', 'The Café Ltd')).toEqual(['CAFE5', 'CAFE', 'ZOE5'].filter((c) => !codeProblem(c)).slice(0, 3))
    for (const s of suggestCodes('A', 'Mapl Villas')) expect(codeProblem(s)).toBeNull()
    expect(suggestCodes('', '')).toEqual([])
  })

  test('a label is one tidy line, never markup', () => {
    expect(cleanLabel('  Welcome   book  ')).toBe('Welcome book')
    expect(cleanLabel('<script>x</script>')).toBe('script x /script')
    expect(cleanLabel('a'.repeat(80))).toHaveLength(40)
    expect(cleanLabel('   ')).toBeNull()
    expect(cleanLabel(42)).toBeNull()
  })
})

describe('the commission', () => {
  test('3% of what the guest paid, to the cent', () => {
    // Sandals Negril round trip for 2: $194, 5% off is $9.70, the guest pays $184.30.
    const P = getTransferPrice('sandals-negril', 'round_trip', 2)!
    const S = driverCost('sandals-negril', 'round_trip', 2)!
    expect(P).toBe(194)
    const T = (Math.round(P * 100) - couponDiscountCents('percent', 5, Math.round(P * 100))) / 100
    expect(T).toBe(184.3)
    expect(commissionFor({ totalPaid: T, subtotal: S, percent: 3 })).toEqual({ cents: 553, capped: false, valid: true })
  })

  test('never more than MAPL keeps after the card fee', () => {
    // Paid $100, supplier $90, card fee 3.7% + 30c = $4.00: MAPL keeps $6.00.
    expect(commissionFor({ totalPaid: 100, subtotal: 90, percent: 10 })).toEqual({ cents: 600, capped: true, valid: true })
    // Nothing left at all: nothing owed.
    expect(commissionFor({ totalPaid: 100, subtotal: 99, percent: 3 })).toEqual({ cents: 0, capped: true, valid: true })
    expect(CARD_RATE).toBe(0.037)
    expect(CARD_FIXED).toBe(0.3)
  })

  test('every ride fare with the code and 3% leaves MAPL above $0', () => {
    let checked = 0
    for (const d of DESTINATIONS) {
      for (const t of ['one_way', 'round_trip'] as const) {
        for (let p = 1; p <= 7; p++) {
          const P = getTransferPrice(d.id, t, p)
          const S = driverCost(d.id, t, p)
          if (P == null || S == null) continue
          const base = Math.round(P * 100)
          const T = base - Math.min(couponDiscountCents('percent', 5, base), Math.round((P - S) * 100))
          const c = commissionFor({ totalPaid: T / 100, subtotal: S, percent: DEFAULT_COMMISSION_PERCENT })
          const mapl = T - Math.round(S * 100) - (Math.round(T * CARD_RATE) + 30) - c.cents
          expect(c.valid).toBe(true)
          expect(c.capped).toBe(false)
          expect(mapl).toBeGreaterThan(0)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(2000)
  })

  test('figures that cannot be read owe nothing', () => {
    expect(commissionFor({ totalPaid: null, subtotal: 10, percent: 3 }).valid).toBe(false)
    expect(commissionFor({ totalPaid: 'x', subtotal: 10, percent: 3 }).valid).toBe(false)
    expect(commissionFor({ totalPaid: 100, subtotal: null, percent: 3 }).valid).toBe(false)
    expect(commissionFor({ totalPaid: 100, subtotal: 50, percent: -1 }).valid).toBe(false)
    expect(commissionFor({ totalPaid: 100, subtotal: 50, percent: MAX_COMMISSION_PERCENT + 1 }).valid).toBe(false)
    expect(commissionFor({ totalPaid: 0, subtotal: 0, percent: 3 }).cents).toBe(0)
  })

  test('money reads with its currency every time', () => {
    expect(usd(553)).toBe('US$5.53')
    expect(usd(1200)).toBe('US$12')
    expect(usd(123456)).toBe('US$1,234.56')
    expect(usd(-553)).toBe('−US$5.53')
    expect(percentText(3)).toBe('3%')
    expect(percentText('2.50')).toBe('2.5%')
  })
})

describe('when a commission is paid', () => {
  // Jamaica is UTC-5 all year. 2026-12-07 is a Monday.
  const at = (s: string) => Date.parse(`${s}:00Z`) + 5 * 3_600_000 // a Jamaica wall-clock time
  test('payout days are Mondays', () => {
    expect(weekday('2026-12-07')).toBe(1)
    expect(payoutDayOnOrAfter('2026-12-07')).toBe('2026-12-07')
    expect(payoutDayOnOrAfter('2026-12-08')).toBe('2026-12-14')
    expect(payoutDayOnOrAfter('2026-12-13')).toBe('2026-12-14')
    expect(payoutRunInstant('2026-12-07')).toBe(at('2026-12-07T09:45'))
  })

  test('payable the day after the trip, and never inside the 48-hour cancellation window', () => {
    // Booked long before, trip ends Saturday Dec 5: payable from Sunday 00:00, paid Monday Dec 7.
    expect(payableAt('2026-12-05', '2026-11-01T12:00:00Z')).toBe(at('2026-12-06T00:00'))
    expect(payoutDayFor(payableAt('2026-12-05', '2026-11-01T12:00:00Z')!)).toBe('2026-12-07')
    // Booked Saturday 20:00 for a Saturday-night ride: the window closes Monday 20:00,
    // after the Monday run, so it waits for the next Monday.
    const booked = new Date(at('2026-12-05T20:00')).toISOString()
    expect(payableAt('2026-12-05', booked)).toBe(at('2026-12-07T20:00'))
    expect(payoutDayFor(payableAt('2026-12-05', booked)!)).toBe('2026-12-14')
    // A trip ending on Sunday is paid the next day.
    expect(payoutDayFor(payableAt('2026-12-06', '2026-11-01T12:00:00Z')!)).toBe('2026-12-07')
    // A trip ending on the Monday itself waits a week.
    expect(payoutDayFor(payableAt('2026-12-07', '2026-11-01T12:00:00Z')!)).toBe('2026-12-14')
  })

  test('unreadable days or times are not payable', () => {
    expect(payableAt(null, '2026-11-01T12:00:00Z')).toBeNull()
    expect(payableAt('2026-02-30', '2026-11-01T12:00:00Z')).toBeNull()
    expect(payableAt('2026-12-05', 'yesterday')).toBeNull()
  })

  test('a run pays on its payout day, and a missed run catches up the next day', () => {
    const p = at('2026-12-06T00:00')
    expect(dueOnRun(p, at('2026-12-06T12:00'))).toBe(false) // Sunday: not a payout day
    expect(dueOnRun(p, at('2026-12-07T09:45'))).toBe(true) // the Monday run
    expect(dueOnRun(p, at('2026-12-08T09:45'))).toBe(true) // Tuesday, after a missed Monday
    expect(dueOnRun(at('2026-12-07T20:00'), at('2026-12-07T21:00'))).toBe(false) // payable after Monday's run: next Monday
    expect(dueOnRun(at('2026-12-07T20:00'), at('2026-12-14T09:45'))).toBe(true)
  })

  const facts = (o: Partial<EarningFacts> = {}): EarningFacts => ({
    bookingStatus: 'paid', refundState: 'none', refundedAt: null, createdAt: '2026-11-01T12:00:00Z',
    lastServiceDay: '2026-12-05', voided: false, paid: false, sending: false, ...o,
  })

  test('the status, in the order that matters', () => {
    const now = at('2026-12-01T12:00')
    expect(earningStatus(facts(), now)).toEqual({ status: 'upcoming', payDay: '2026-12-07' })
    expect(earningStatus(facts(), at('2026-12-06T08:00')).status).toBe('ready')
    expect(earningStatus(facts({ voided: true, paid: true }), now).status).toBe('void')
    expect(earningStatus(facts({ paid: true, refundedAt: '2026-12-10T00:00:00Z' }), now).status).toBe('paid')
    expect(earningStatus(facts({ sending: true, bookingStatus: 'refunded' }), now).status).toBe('sending')
    expect(earningStatus(facts({ bookingStatus: 'refunded' }), now).status).toBe('cancelled')
    expect(earningStatus(facts({ refundedAt: '2026-11-02T00:00:00Z' }), now).status).toBe('cancelled')
    expect(earningStatus(facts({ refundState: 'requested' }), now).status).toBe('held')
    expect(earningStatus(facts({ refundState: 'approved' }), now).status).toBe('held')
    expect(earningStatus(facts({ refundState: 'declined' }), at('2026-12-06T08:00')).status).toBe('ready')
    expect(earningStatus(facts({ lastServiceDay: null }), now).status).toBe('check')
  })
})

describe('dates for people', () => {
  test('Jamaica calendar days, the year only when it is not this one', () => {
    expect(dayText('2026-12-07', { weekday: true })).toBe('Monday, December 7')
    expect(dayText('2027-01-04', { weekday: true, todayYmd: '2026-12-30' })).toBe('Monday, January 4, 2027')
    expect(shortDay('2026-12-07')).toBe('Dec 7')
    expect(shortDay('2027-01-04', '2026-12-30')).toBe('Jan 4, 2027')
    expect(dayText('not a day')).toBe('')
  })
})
