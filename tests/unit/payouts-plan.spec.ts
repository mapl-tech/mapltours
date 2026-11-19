import { describe, test, expect } from 'vitest'
import {
  DEFAULT_LIMITS,
  NO_TOUR_PAYEE,
  dayLabel,
  planPayouts,
  ridePartsOf,
  tourPartOf,
  type PlanInput,
} from '@/lib/payouts/plan'
import { addDays, isBusinessDay, isYmd, jamaicaDay, sendDayFor, usBankHolidays } from '@/lib/payouts/business-days'
import { parseRecipients, readPayoutConfig, payoutsEnabled } from '@/lib/payouts/config'
import { ride, tour } from './payouts-fakes'

/**
 * The payout planner: which parts (ride halves, tours) are owed, to which
 * Wise recipient, and on which day they are sent. Paid BEFORE the trip, two
 * business days ahead by default, by the Jamaica calendar.
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

  test('the send day is the second business day before the trip', () => {
    expect(sendDayFor('2026-11-19', 2)).toBe('2026-11-17') // Thursday trip: sent Tuesday, lands Wednesday
    expect(sendDayFor('2026-11-23', 2)).toBe('2026-11-19') // Monday: sent the Thursday before
    expect(sendDayFor('2026-11-21', 2)).toBe('2026-11-19') // Saturday
    expect(sendDayFor('2026-11-22', 2)).toBe('2026-11-19') // Sunday
    expect(sendDayFor('2026-11-27', 2)).toBe('2026-11-24') // the Friday after Thanksgiving
    expect(sendDayFor('2026-12-28', 2)).toBe('2026-12-23') // the Monday after Christmas
    expect(sendDayFor('2026-11-19', 1)).toBe('2026-11-18')
    expect(sendDayFor('2026-11-19', 3)).toBe('2026-11-16')
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
  test('due on its send day: a Thursday ride on Tuesday, a Friday ride not yet', () => {
    const thu = oneWay('2026-11-19')
    const fri = oneWay('2026-11-20')
    const p = plan({ bookings: [thu, fri] })
    expect(keys(p)).toEqual([`${thu.id.slice(0, 8).toUpperCase().replace(/^/, 'MAPL-')}:first`])
    expect(p.payDay).toBe('2026-11-17')
    expect(p.payees[0].lines[0]).toMatchObject({ serviceDay: '2026-11-19', sendDay: '2026-11-17', label: 'arrival', name: 'Collin' })
    expect(p.skipped.not_due).toBe(1)
  })

  test('the next morning, the Friday ride goes', () => {
    const p = plan({ bookings: [oneWay('2026-11-20')], nowMs: Date.parse('2026-11-18T14:30:00Z') })
    expect(p.payees[0].totalUsd).toBe(51)
  })

  test('a weekend ride goes on the Thursday before', () => {
    const sat = oneWay('2026-11-21')
    expect(plan({ bookings: [sat], nowMs: Date.parse('2026-11-18T14:30:00Z') }).payees).toHaveLength(0)
    expect(plan({ bookings: [sat], nowMs: Date.parse('2026-11-19T14:30:00Z') }).payees[0].totalUsd).toBe(51)
  })

  test('a booking made after its send day is paid on the next run, even on the day of the ride', () => {
    const today = oneWay('2026-11-17')
    const yesterday = oneWay('2026-11-16')
    expect(plan({ bookings: [today, yesterday] }).payees[0].lines).toHaveLength(2)
  })

  test('a round trip pays each half by its own leg: the arrival now, the ride back later', () => {
    const b = ride({ subtotal: 147, arrival: at('2026-11-19'), departure: at('2026-11-26', '09:00') })
    const p = plan({ bookings: [b] })
    expect(p.payees[0].lines.map((l) => [l.part, l.label, l.amountUsd])).toEqual([['first', 'arrival', 73.5]])
    const later = plan({ bookings: [b], nowMs: Date.parse('2026-11-24T14:30:00Z') })
    expect(later.payees[0].lines.map((l) => [l.part, l.label])).toEqual([['first', 'arrival'], ['second', 'ride to the airport']])
  })

  test('a leg\'s day is read from its Jamaica wall clock, never the server zone', () => {
    const lateThu = oneWay('2026-11-19', { arrival: '2026-11-19T23:30:00+00:00' })
    const earlyFri = oneWay('2026-11-20', { arrival: '2026-11-20T00:30:00+00:00' })
    const p = plan({ bookings: [lateThu, earlyFri] })
    expect(p.payees[0].lines.map((l) => l.bookingId)).toEqual([lateThu.id])
  })

  test('the run\'s day is the Jamaica day: 23:30 in Jamaica on Monday is still Monday', () => {
    const p = plan({ bookings: [oneWay('2026-11-19')], nowMs: Date.parse('2026-11-17T04:30:00Z') })
    expect(p.payDay).toBe('2026-11-16')
    expect(p.payees).toHaveLength(0)
  })

  test('a one-way to the airport is labelled as one', () => {
    const b = ride({ trip: 'one_way', arrival: null, departure: at('2026-11-19', '08:00'), subtotal: 51 })
    expect(ridePartsOf(b)).toEqual([{ part: 'first', label: 'ride to the airport', amountUsd: 51, serviceDay: '2026-11-19' }])
  })

  test('the lead can be set: one business day', () => {
    const p = plan({ bookings: [oneWay('2026-11-19')], limits: { ...DEFAULT_LIMITS, leadBusinessDays: 1 } })
    expect(p.payees).toHaveLength(0)
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
    expect(p.payees[0].lines[0]).toMatchObject({ part: 'tour', sendDay: '2026-11-17' })
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
    expect(good.config?.limits).toMatchObject({ maxFeeUsd: 30, leadBusinessDays: 2 })
  })

  test('a start date is required to send, and must be a real date', () => {
    const none = readPayoutConfig({ ...ok, PAYOUT_FROM: '' })
    expect(none.config).toBeNull()
    expect(none.problems).toEqual(['PAYOUT_FROM not set'])
    expect(none.settings.fromDay).toBeNull()
    expect(readPayoutConfig({ ...ok, PAYOUT_FROM: '2026-02-30' }).problems).toEqual(['PAYOUT_FROM is not a date (YYYY-MM-DD)'])
  })

  test('the tour payee must be one of the recipients; the lead a whole number from 1 to 10', () => {
    expect(readPayoutConfig({ ...ok, WISE_TOUR_PAYEE: 'Someone' }).problems).toEqual(['WISE_TOUR_PAYEE is not one of the names in WISE_PAYOUT_RECIPIENTS'])
    expect(readPayoutConfig({ ...ok }).config?.tourPayee).toBeNull()
    expect(readPayoutConfig({ ...ok, PAYOUT_LEAD_BUSINESS_DAYS: '3' }).config?.limits.leadBusinessDays).toBe(3)
    for (const v of ['0', '1.5', '11', 'two']) {
      expect(readPayoutConfig({ ...ok, PAYOUT_LEAD_BUSINESS_DAYS: v }).problems).toEqual(['PAYOUT_LEAD_BUSINESS_DAYS is not a whole number from 1 to 10'])
    }
  })
})
