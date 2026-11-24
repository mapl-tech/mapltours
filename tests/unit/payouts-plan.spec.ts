import { describe, test, expect } from 'vitest'
import {
  DEFAULT_LIMITS,
  NO_TOUR_PAYEE,
  dayLabel,
  planPayouts,
  prepaidFor,
  ridePartsOf,
  tourPartOf,
  type PlanInput,
} from '@/lib/payouts/plan'
import { addDays, arrivalDayFor, isBusinessDay, isYmd, jamaicaDay, landingDayFor, nextBusinessDay, prevBusinessDay, sendDayFor, usBankHolidays } from '@/lib/payouts/business-days'
import { parseRecipients, readPayoutConfig, payoutsEnabled } from '@/lib/payouts/config'
import { ride, tour } from './payouts-fakes'

/**
 * The payout planner: which parts (ride halves, tours) are owed, to which
 * Wise recipient, and on which day they are sent. Paid BEFORE the trip, so
 * the money is in the account the day before it (or on the day, when the
 * banks are shut the day before), with Wise's two business days at the bank,
 * by the Jamaica calendar.
 */

// 09:30 in Jamaica on Tuesday Nov 17 2026.
const TUE_17 = Date.parse('2026-11-17T14:30:00Z')
const at = (day: string, hhmm = '14:30') => `${day}T${hhmm}:00+00:00`

function plan(over: Partial<PlanInput> & Pick<PlanInput, 'bookings'>) {
  return planPayouts({
    ledger: new Set(),
    recipients: { Collin: 900001, 'Marcus Reid': 900002 },
    tourPayee: 'Collin',
    holds: new Map(),
    fromDay: '2026-11-01',
    nowMs: TUE_17,
    limits: DEFAULT_LIMITS,
    ...over,
  })
}
const oneWay = (day: string, more: Parameters<typeof ride>[0] = {}) => ride({ trip: 'one_way', arrival: at(day), departure: null, subtotal: 51, ...more })
const keys = (p: ReturnType<typeof plan>) => p.payees.flatMap((d) => d.lines.map((l) => `${l.ref}:${l.part}`))

describe('the banking calendar', () => {
  test('US bank holidays as the Federal Reserve observes them: Sunday moves to Monday, Saturday does not move', () => {
    expect(Array.from(usBankHolidays(2026)).sort()).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19',
      // Independence Day 2026 is a Saturday: the banks are open on Friday Jul 3.
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ])
    expect(Array.from(usBankHolidays(2027)).sort()).toEqual([
      // Juneteenth and Christmas 2027 are Saturdays; Independence Day is a Sunday, observed Monday Jul 5.
      '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-07-05',
      '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25',
    ])
  })

  test('business days skip weekends and holidays', () => {
    expect(isBusinessDay('2026-11-17')).toBe(true) // Tuesday
    expect(isBusinessDay('2026-11-21')).toBe(false) // Saturday
    expect(isBusinessDay('2026-11-22')).toBe(false) // Sunday
    expect(isBusinessDay('2026-11-26')).toBe(false) // Thanksgiving
    expect(isBusinessDay('2026-12-25')).toBe(false)
  })

  test("Wise's two business days, as its estimates on the first real payouts said", () => {
    expect(landingDayFor('2026-11-19', 2)).toBe('2026-11-23') // funded Thursday Nov 19: in the account Monday
    expect(landingDayFor('2026-11-20', 2)).toBe('2026-11-24') // funded Friday: Tuesday
    expect(landingDayFor('2026-11-21', 2)).toBe('2026-11-25') // quoted Saturday: Wednesday
    expect(landingDayFor('2026-11-22', 2)).toBe('2026-11-25') // a Sunday run is a Monday one
    expect(landingDayFor('2026-11-25', 2)).toBe('2026-11-30') // over Thanksgiving
    expect(landingDayFor('2026-11-19', 0)).toBe('2026-11-19')
    expect(nextBusinessDay('2026-11-25')).toBe('2026-11-27')
    expect(prevBusinessDay('2026-11-27')).toBe('2026-11-25')
    expect(prevBusinessDay('2026-11-23')).toBe('2026-11-20')
  })

  test('in the account the day before the trip; on the day when the banks are shut the day before (owner, Nov 21 2026)', () => {
    // [trip day, the day it is in the account, the day it is sent]
    const cases: [string, string, string][] = [
      ['2026-11-17', '2026-11-16', '2026-11-12'], // Tuesday trip: in the account Monday, sent the Thursday before
      ['2026-11-18', '2026-11-17', '2026-11-13'], // Wednesday: Tuesday, sent Friday
      ['2026-11-19', '2026-11-18', '2026-11-16'], // Thursday: Wednesday, sent Monday
      ['2026-11-20', '2026-11-19', '2026-11-17'], // Friday: Thursday, sent Tuesday
      ['2026-11-21', '2026-11-20', '2026-11-18'], // Saturday: Friday, sent Wednesday
      ['2026-11-22', '2026-11-20', '2026-11-18'], // Sunday: no bank day on the day or the day before, so the Friday
      ['2026-11-23', '2026-11-23', '2026-11-19'], // Monday: on the day, sent Thursday
      ['2026-11-26', '2026-11-25', '2026-11-23'], // Thanksgiving Day: the Wednesday, sent Monday
      ['2026-11-27', '2026-11-27', '2026-11-24'], // the Friday after: the banks are shut on Thanksgiving, so on the day
      ['2026-11-28', '2026-11-27', '2026-11-24'], // Saturday: Friday, sent Tuesday
      ['2026-11-29', '2026-11-27', '2026-11-24'], // Sunday
      ['2026-11-30', '2026-11-30', '2026-11-25'], // Monday: on the day, sent the day before Thanksgiving
      ['2026-12-25', '2026-12-24', '2026-12-22'], // Christmas Day: Christmas Eve
      ['2026-12-26', '2026-12-24', '2026-12-22'], // the Saturday after Christmas: Christmas Eve
      ['2026-12-28', '2026-12-28', '2026-12-23'], // the Monday after: on the day
      ['2027-01-02', '2026-12-31', '2026-12-29'], // the Saturday after New Year's Day: New Year's Eve
      ['2027-01-04', '2027-01-04', '2026-12-30'], // Monday Jan 4: on the day
      ['2027-01-18', '2027-01-15', '2027-01-13'], // Martin Luther King Jr. Day, a Monday holiday: the Friday
      ['2027-01-19', '2027-01-19', '2027-01-14'], // the Tuesday after: on the day
    ]
    for (const [trip, arrives, sent] of cases) {
      expect([trip, arrivalDayFor(trip), sendDayFor(trip, 2)]).toEqual([trip, arrives, sent])
      expect([trip, landingDayFor(sent, 2)]).toEqual([trip, arrives])
    }
  })

  test('every trip day for two years, at any transit: sent on a bank day, in the account on its day, never after the trip, never early when it could be later', () => {
    for (let day = '2026-11-01'; day <= '2028-12-31'; day = addDays(day, 1)) {
      const arrives = arrivalDayFor(day)
      const shut = !isBusinessDay(addDays(day, -1)) && !isBusinessDay(day)
      expect(isBusinessDay(arrives)).toBe(true)
      expect(arrives <= day).toBe(true)
      // The day before or the day itself whenever either is a bank day; otherwise the last bank day before.
      if (shut) expect(arrives).toBe(prevBusinessDay(day))
      else expect([addDays(day, -1), day]).toContain(arrives)
      if (isBusinessDay(addDays(day, -1))) expect(arrives).toBe(addDays(day, -1))
      for (const transit of [0, 1, 2, 3]) {
        const sent = sendDayFor(day, transit)
        expect(isBusinessDay(sent)).toBe(true)
        expect(landingDayFor(sent, transit)).toBe(arrives)
        // Sent a bank day later, it would arrive after its day: the send day is the latest that works.
        expect(landingDayFor(nextBusinessDay(sent), transit) > arrives).toBe(true)
      }
    }
  })

  test('dates and the Jamaica day, whatever the server clock', () => {
    expect(isYmd('2026-11-19')).toBe(true)
    expect(isYmd('2026-02-30')).toBe(false)
    expect(isYmd('2026-11-19T00:00:00Z')).toBe(false)
    expect(isYmd(null)).toBe(false)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(jamaicaDay(Date.parse('2026-11-19T04:59:00Z'))).toBe('2026-11-18')
    expect(jamaicaDay(Date.parse('2026-11-19T05:00:00Z'))).toBe('2026-11-19')
    expect(dayLabel('2026-11-19')).toBe('Thu, Nov 19')
  })
})

describe('when a ride is paid', () => {
  test('due on its send day: a Friday ride on the Tuesday, in the account on the Thursday; a Saturday ride not yet', () => {
    const fri = oneWay('2026-11-20')
    const sat = oneWay('2026-11-21')
    const p = plan({ bookings: [fri, sat] })
    expect(keys(p)).toEqual([`${fri.id.slice(0, 8).toUpperCase().replace(/^/, 'MAPL-')}:first`])
    expect(p.payDay).toBe('2026-11-17')
    expect(p.landsDay).toBe('2026-11-19')
    expect(p.payees[0].lines[0]).toMatchObject({ serviceDay: '2026-11-20', sendDay: '2026-11-17', label: 'arrival', name: 'Collin' })
    expect(p.skipped.not_due).toBe(1)
  })

  test('the next morning, the Saturday ride goes, in the account on the Friday', () => {
    const p = plan({ bookings: [oneWay('2026-11-21')], nowMs: Date.parse('2026-11-18T14:30:00Z') })
    expect(p.payees[0].totalUsd).toBe(51)
    expect(p.landsDay).toBe('2026-11-20')
  })

  test('a weekend ride goes on the Wednesday before, so it is in the account on the Friday', () => {
    for (const day of ['2026-11-21', '2026-11-22']) {
      expect(plan({ bookings: [oneWay(day)] }).payees).toHaveLength(0)
      const wed = plan({ bookings: [oneWay(day)], nowMs: Date.parse('2026-11-18T14:30:00Z') })
      expect(wed.payees[0].totalUsd).toBe(51)
      expect(wed.landsDay).toBe('2026-11-20')
    }
  })

  test('a Monday ride goes on the Thursday before and is in the account on the Monday', () => {
    const mon = oneWay('2026-11-23')
    expect(plan({ bookings: [mon], nowMs: Date.parse('2026-11-18T14:30:00Z') }).payees).toHaveLength(0)
    const thu = plan({ bookings: [mon], nowMs: Date.parse('2026-11-19T14:30:00Z') })
    expect(thu.payees[0].lines[0]).toMatchObject({ serviceDay: '2026-11-23', sendDay: '2026-11-19' })
    expect(thu.landsDay).toBe('2026-11-23')
  })

  test('a booking made after its send day is paid on the next run, even on the day of the ride', () => {
    const today = oneWay('2026-11-17')
    const yesterday = oneWay('2026-11-16')
    const p = plan({ bookings: [today, yesterday] })
    expect(p.payees[0].lines).toHaveLength(2)
    // The bank cannot get it there first: the run says when it arrives, after both trips.
    expect(p.landsDay).toBe('2026-11-19')
  })

  test('a round trip pays each half by its own leg: the arrival now, the ride back later', () => {
    const b = ride({ subtotal: 147, arrival: at('2026-11-19'), departure: at('2026-11-26', '09:00') })
    const p = plan({ bookings: [b] })
    expect(p.payees[0].lines.map((l) => [l.part, l.label, l.amountUsd])).toEqual([['first', 'arrival', 73.5]])
    const later = plan({ bookings: [b], nowMs: Date.parse('2026-11-24T14:30:00Z') })
    expect(later.payees[0].lines.map((l) => [l.part, l.label])).toEqual([['first', 'arrival'], ['second', 'ride to the airport']])
  })

  test('a leg\'s day is read from its Jamaica wall clock, never the server zone', () => {
    const lateFri = oneWay('2026-11-20', { arrival: '2026-11-20T23:30:00+00:00' })
    const earlySat = oneWay('2026-11-21', { arrival: '2026-11-21T00:30:00+00:00' })
    const p = plan({ bookings: [lateFri, earlySat] })
    expect(p.payees[0].lines.map((l) => l.bookingId)).toEqual([lateFri.id])
  })

  test('the run\'s day is the Jamaica day: 23:30 in Jamaica on Monday is still Monday', () => {
    const p = plan({ bookings: [oneWay('2026-11-20')], nowMs: Date.parse('2026-11-17T04:30:00Z') })
    expect(p.payDay).toBe('2026-11-16')
    expect(p.payees).toHaveLength(0)
    expect(plan({ bookings: [oneWay('2026-11-20')], nowMs: Date.parse('2026-11-17T05:00:00Z') }).payees).toHaveLength(1)
  })

  test('a one-way to the airport is labelled as one', () => {
    const b = ride({ trip: 'one_way', arrival: null, departure: at('2026-11-19', '08:00'), subtotal: 51 })
    expect(ridePartsOf(b)).toEqual([{ part: 'first', label: 'ride to the airport', amountUsd: 51, serviceDay: '2026-11-19' }])
  })

  test("Wise's time at the bank can be set: one business day sends later, three sooner", () => {
    expect(plan({ bookings: [oneWay('2026-11-20')], limits: { ...DEFAULT_LIMITS, transitBusinessDays: 1 } }).payees).toHaveLength(0)
    const three = plan({ bookings: [oneWay('2026-11-21')], limits: { ...DEFAULT_LIMITS, transitBusinessDays: 3 } })
    expect(three.payees[0].lines[0]).toMatchObject({ serviceDay: '2026-11-21', sendDay: '2026-11-17' })
    expect(three.landsDay).toBe('2026-11-20')
  })
})

describe('the start date', () => {
  test('nothing before PAYOUT_FROM is ever paid, however long it waits', () => {
    const old = ride({ arrival: at('2026-10-10'), departure: at('2026-11-19') })
    const p = plan({ bookings: [old] })
    expect(p.payees[0].lines.map((l) => l.part)).toEqual(['second'])
    expect(p.skipped.before_start).toBe(1)
  })

  test('a trip on the start day itself is paid', () => {
    const p = plan({ bookings: [oneWay('2026-11-19')], fromDay: '2026-11-19' })
    expect(p.payees[0].totalUsd).toBe(51)
    expect(plan({ bookings: [oneWay('2026-11-19')], fromDay: '2026-11-20' }).payees).toHaveLength(0)
  })

  test('with no start date nothing is paid at all', () => {
    const p = plan({ bookings: [oneWay('2026-11-19'), tour({ dates: ['2026-11-19'] })], fromDay: null })
    expect(p.payees).toHaveLength(0)
    expect(p.skipped.before_start).toBe(2)
    expect(plan({ bookings: [oneWay('2026-11-19')], fromDay: '19-11-2026' }).payees).toHaveLength(0)
  })
})

describe('what is never paid', () => {
  test('unpaid, refunded and refund-requested bookings; a declined refund is paid', () => {
    const d = '2026-11-19'
    const p = plan({
      bookings: [
        oneWay(d, { status: 'pending' }),
        oneWay(d, { status: 'refunded' }),
        oneWay(d, { refunded_at: '2026-11-15T00:00:00Z' }),
        oneWay(d, { refund_state: 'requested' }),
        oneWay(d, { refund_state: 'approved' }),
        oneWay(d, { refund_state: 'declined', subtotal: 100 }),
        tour({ dates: [d], refund_state: 'requested' }),
      ],
    })
    expect(p.skipped.not_paid).toBe(2)
    expect(p.skipped.refunded).toBe(1)
    expect(p.skipped.refund_requested).toBe(3)
    expect(p.refundHeld).toHaveLength(3)
    expect(p.payees).toHaveLength(1)
    expect(p.payees[0].totalUsd).toBe(100)
  })

  test('no driver, no day, a part the console shows paid, a part the ledger holds', () => {
    const d = '2026-11-19'
    const byHand = ride({ arrival: at(d), departure: at('2026-11-20'), dispatch: { paid_first: '2026-11-15T12:00:00Z' } })
    const inLedger = oneWay(d)
    const tourPaid = tour({ dates: [d], dispatch: { paid_tour: '2026-11-15T12:00:00Z' } })
    const p = plan({
      bookings: [oneWay(d, { driver: null }), oneWay(d, { driver: '  ' }), ride({ trip: 'one_way', arrival: null, departure: null }), byHand, inLedger, tourPaid, tour({ dates: [] })],
      ledger: new Set([`${inLedger.id}:first`]),
      nowMs: Date.parse('2026-11-18T14:30:00Z'),
    })
    expect(p.skipped.no_payee).toBe(2)
    expect(p.skipped.no_date).toBe(2)
    expect(p.skipped.paid_by_hand).toBe(2)
    expect(p.skipped.in_ledger).toBe(1)
    expect(p.payees[0].lines.map((l) => `${l.bookingId}:${l.part}`)).toEqual([`${byHand.id}:second`])
  })

  test('other booking types are not this job', () => {
    expect(plan({ bookings: [{ ...oneWay('2026-11-19'), booking_type: 'gift' }] }).payees).toHaveLength(0)
  })
})

describe('tours', () => {
  test('one part for the booking, its subtotal, by its first tour day', () => {
    const t = tour({ subtotal: 260, dates: ['2026-11-21', '2026-11-19', null] })
    expect(tourPartOf(t)).toEqual({ part: 'tour', label: 'tour', amountUsd: 260, serviceDay: '2026-11-19' })
    const p = plan({ bookings: [t] })
    expect(p.payees[0]).toMatchObject({ payee: 'Collin', recipientId: 900001, totalUsd: 260, status: 'ready' })
    expect(p.payees[0].lines[0]).toMatchObject({ part: 'tour', sendDay: '2026-11-16' })
  })

  test('a tour and the operator\'s own rides share one payment', () => {
    const p = plan({ bookings: [tour({ subtotal: 130, dates: ['2026-11-19'] }), oneWay('2026-11-19')] })
    expect(p.payees).toHaveLength(1)
    expect(p.payees[0]).toMatchObject({ payee: 'Collin', totalUsd: 181 })
    expect(p.payees[0].lines.map((l) => l.part).sort()).toEqual(['first', 'tour'])
  })

  test('with no tour payee set, tours are reported and never paid', () => {
    const p = plan({ bookings: [tour({ dates: ['2026-11-19'] })], tourPayee: null })
    expect(p.payees[0]).toMatchObject({ payee: NO_TOUR_PAYEE, recipientId: null, status: 'no_recipient' })
    expect(p.payees[0].reasons[0]).toMatch(/WISE_TOUR_PAYEE is not set/)
  })
})

describe('payees', () => {
  test('names on one recipient share a payment; matched ignoring case and spaces', () => {
    const p = plan({
      recipients: { Collin: 900001, 'Devon Brown': 900001, 'Marcus Reid': 900002 },
      bookings: [oneWay('2026-11-19'), oneWay('2026-11-18', { driver: ' devon brown ', subtotal: 60 }), oneWay('2026-11-19', { driver: 'Marcus Reid', subtotal: 40 })],
    })
    expect(p.payees.map((d) => [d.payee, d.recipientId, d.totalUsd, d.status])).toEqual([
      ['Collin and devon brown', 900001, 111, 'ready'],
      ['Marcus Reid', 900002, 40, 'ready'],
    ])
    expect(p.payees[0].lines.map((l) => l.name)).toEqual(['devon brown', 'Collin'])
  })

  test('a name with no recipient is reported, never paid', () => {
    const p = plan({ bookings: [oneWay('2026-11-19', { driver: 'New Driver' })] })
    expect(p.payees[0]).toMatchObject({ payee: 'New Driver', recipientId: null, status: 'no_recipient' })
  })

  test('held: an open problem on the account, over the payee limit, or over the run limit', () => {
    const held = plan({ bookings: [oneWay('2026-11-19')], holds: new Map([[900001, 'an earlier payout needs a look in Wise']]) })
    expect(held.payees[0]).toMatchObject({ status: 'held', reasons: ['an earlier payout needs a look in Wise'] })

    const big = plan({ bookings: [oneWay('2026-11-19', { subtotal: 3500 })] })
    expect(big.payees[0].status).toBe('held')
    expect(big.payees[0].reasons[0]).toMatch(/over the US\$3000\.00 limit for one payee/)

    const run = plan({ bookings: [oneWay('2026-11-19', { subtotal: 2000 }), oneWay('2026-11-19', { driver: 'Marcus Reid', subtotal: 2000 })], limits: { ...DEFAULT_LIMITS, maxRunUsd: 3000 } })
    expect(run.payees.every((d) => d.status === 'held' && /limit for one run/.test(d.reasons.join(' ')))).toBe(true)
  })
})

describe('configuration', () => {
  const ok = { WISE_API_TOKEN: 't', WISE_PROFILE_ID: '154050700', WISE_PAYOUT_RECIPIENTS: '{"Collin": 1}', PAYOUT_FROM: '2026-12-01' }

  test('recipients: a JSON object of names to whole numbers, or refused', () => {
    expect(parseRecipients(undefined)).toEqual({})
    expect(parseRecipients('{"Collin": 123, "Marcus Reid": "456"}')).toEqual({ Collin: 123, 'Marcus Reid': 456 })
    expect(parseRecipients('[1,2]')).toBeNull()
    expect(parseRecipients('{"Collin": -1}')).toBeNull()
    expect(parseRecipients('{"Collin": 1.5}')).toBeNull()
    expect(parseRecipients('not json')).toBeNull()
  })

  test('the send gate is exactly "1"', () => {
    expect(payoutsEnabled({ WISE_PAYOUTS_ENABLED: '1' })).toBe(true)
    for (const v of ['true', 'yes', '01', ' 1', undefined]) expect(payoutsEnabled({ WISE_PAYOUTS_ENABLED: v })).toBe(false)
  })

  test('problems are named, never shown with their values', () => {
    const r = readPayoutConfig({ WISE_API_TOKEN: 'secret-token-value', WISE_PROFILE_ID: 'abc', WISE_PAYOUT_RECIPIENTS: '{bad', PAYOUT_MAX_FEE_USD: '-3', PAYOUT_FROM: '2026-12-01' })
    expect(r.config).toBeNull()
    expect(r.problems.join(' ')).not.toContain('secret-token-value')
    expect(r.problems).toEqual([
      'WISE_PROFILE_ID not set or not a number',
      'WISE_PAYOUT_RECIPIENTS is not a JSON object of driver names to recipient ids',
      'PAYOUT_MAX_FEE_USD is not a positive number',
    ])
    const good = readPayoutConfig({ ...ok, PAYOUT_MAX_FEE_USD: '30', WISE_TOUR_PAYEE: 'collin' })
    expect(good.problems).toEqual([])
    expect(good.config).toMatchObject({ env: 'production', profileId: 154050700, balanceId: null, recipients: { Collin: 1 }, tourPayee: 'collin', fromDay: '2026-12-01' })
    expect(good.config?.limits).toMatchObject({ maxFeeUsd: 30, transitBusinessDays: 2 })
  })

  test('a start date is required to send, and must be a real date', () => {
    const none = readPayoutConfig({ ...ok, PAYOUT_FROM: '' })
    expect(none.config).toBeNull()
    expect(none.problems).toEqual(['PAYOUT_FROM not set'])
    expect(none.settings.fromDay).toBeNull()
    expect(readPayoutConfig({ ...ok, PAYOUT_FROM: '2026-02-30' }).problems).toEqual(['PAYOUT_FROM is not a date (YYYY-MM-DD)'])
  })

  test("the tour payee must be one of the recipients; Wise's transit a whole number from 0 to 10", () => {
    expect(readPayoutConfig({ ...ok, WISE_TOUR_PAYEE: 'Someone' }).problems).toEqual(['WISE_TOUR_PAYEE is not one of the names in WISE_PAYOUT_RECIPIENTS'])
    expect(readPayoutConfig({ ...ok }).config?.tourPayee).toBeNull()
    expect(readPayoutConfig({ ...ok }).config?.limits.transitBusinessDays).toBe(2)
    expect(readPayoutConfig({ ...ok, PAYOUT_TRANSIT_BUSINESS_DAYS: '3' }).config?.limits.transitBusinessDays).toBe(3)
    expect(readPayoutConfig({ ...ok, PAYOUT_TRANSIT_BUSINESS_DAYS: '0' }).config?.limits.transitBusinessDays).toBe(0)
    for (const v of ['-1', '1.5', '11', 'two']) {
      expect(readPayoutConfig({ ...ok, PAYOUT_TRANSIT_BUSINESS_DAYS: v }).problems).toEqual(['PAYOUT_TRANSIT_BUSINESS_DAYS is not a whole number from 0 to 10'])
    }
  })

  test('the old lead setting is refused, not quietly read with its old meaning', () => {
    const r = readPayoutConfig({ ...ok, PAYOUT_LEAD_BUSINESS_DAYS: '2' })
    expect(r.config).toBeNull()
    expect(r.problems).toEqual(['PAYOUT_LEAD_BUSINESS_DAYS is no longer read: remove it (PAYOUT_TRANSIT_BUSINESS_DAYS is the business days Wise takes)'])
    expect(readPayoutConfig({ ...ok, PAYOUT_LEAD_BUSINESS_DAYS: ' ' }).problems).toEqual([])
  })
})

describe('money already sent for a ride half (owner, Nov 24 2026: the US$1 test to a new account)', () => {
  const late = Date.parse('2026-11-30T14:30:00Z')
  const rt = (dispatch: Record<string, unknown>) => ride({ subtotal: 216, arrival: at('2026-11-25'), departure: at('2026-11-28', '09:00'), dispatch })

  test('comes off that half, and the payment is the rest', () => {
    const b = rt({ paid_second_prepaid_usd: 1, paid_second_prepaid_note: 'the test payment to your new Wise account on Nov 24' })
    const p = plan({ bookings: [b], nowMs: late })
    expect(p.payees[0].lines.map((l) => [l.part, l.amountUsd, l.prepaidUsd ?? 0])).toEqual([['first', 108, 0], ['second', 107, 1]])
    expect(p.payees[0].lines[1].prepaidNote).toBe('the test payment to your new Wise account on Nov 24')
    expect(p.payees[0].totalUsd).toBe(215)
    expect(p.payees[0].status).toBe('ready')
  })

  test('once: after that half is paid, nothing comes off any other part', () => {
    const b = rt({ paid_second_prepaid_usd: 1 })
    const other = rt({})
    const p = plan({ bookings: [b, other], nowMs: late, ledger: new Set([`${b.id}:second`]) })
    expect(p.payees[0].lines.map((l) => l.amountUsd)).toEqual([108, 108, 108])
    expect(p.payees[0].totalUsd).toBe(324)
  })

  test('all of it already sent: the half counts as paid and is never sent', () => {
    const p = plan({ bookings: [rt({ paid_second_prepaid_usd: 108 })], nowMs: late })
    expect(p.payees[0].lines.map((l) => l.part)).toEqual(['first'])
    expect(p.skipped.paid_by_hand).toBe(1)
  })

  test('an amount that is not dollars and cents holds the payment instead of guessing; so does one on a tour', () => {
    for (const bad of ['1', -1, 0, 0.005, Number.NaN, {}]) {
      const p = plan({ bookings: [rt({ paid_second_prepaid_usd: bad })], nowMs: late })
      expect(p.payees[0].status, String(bad)).toBe('held')
      expect(p.payees[0].reasons.join(' '), String(bad)).toMatch(/paid_second_prepaid_usd/)
    }
    const p = plan({ bookings: [tour({ dates: ['2026-11-28'], dispatch: { paid_tour_prepaid_usd: 1 } })], nowMs: late })
    expect(p.payees[0].status).toBe('held')
  })

  test('cents are read exactly, and nothing recorded means nothing comes off', () => {
    expect(prepaidFor({ paid_first_prepaid_usd: 0.1 + 0.2 }, 'first')).toEqual({ usd: 0.3, note: null, invalid: false })
    expect(prepaidFor({ paid_first_prepaid_usd: 1.005 }, 'first').invalid).toBe(true)
    expect(prepaidFor({}, 'first')).toEqual({ usd: 0, note: null, invalid: false })
    expect(prepaidFor(null, 'second')).toEqual({ usd: 0, note: null, invalid: false })
  })
})
