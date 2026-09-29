import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  AFTER_PAID_DAYS,
  DAY_MS,
  EARLY_TIP_MIN_DAYS_AWAY,
  MIN_GAP_DAYS,
  WEEK_BEFORE_MAX_DAYS,
  WEEK_BEFORE_MIN_DAYS,
  SLOT,
  TIP_KEYS,
  TRACK_KEYS,
  MAX_STAY_DAYS,
  TRIP_GAP_DAYS,
  bookingState,
  cadenceHold,
  groupTrips,
  dayNumber,
  daysAway,
  jamaicaDay,
  legWallClock,
  parseInstant,
  planPerson,
  sendOrder,
  servicesOf,
  type Decision,
  type LedgerRow,
  type PersonInput,
  type TipBooking,
  type TipKey,
} from '@/lib/trip-tips/plan'
import { TIP_TRACK } from '@/lib/trip-tips/emails'
import { rideBooking, tourBooking, wall } from './trip-tips-fakes'

/**
 * The trip tips planner: tracks, every window edge, the cadence, refund
 * states, trip end, and the same answers under four server time zones.
 * All data is synthetic.
 *
 * The run is 14:00 UTC on 1 Oct 2026, which is 09:00 on 1 Oct in Jamaica.
 */
const NOW = Date.parse('2026-10-01T14:00:00Z')
const E = 'guest@example.org'
const iso = (ms: number) => new Date(ms).toISOString()
const ago = (days: number, ms = 0) => iso(NOW - days * DAY_MS - ms)

/** The Jamaica calendar day n days from the run's Jamaica day. */
const jaIn = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)

const ride = (o: { arriveIn?: number | null; arriveAt?: string; departIn?: number | null; departAt?: string; paidDaysAgo?: number } & Partial<Parameters<typeof rideBooking>[0]> = {}) =>
  rideBooking({
    email: E,
    arrival: o.arriveIn == null ? null : `${jaIn(o.arriveIn)}T${o.arriveAt ?? '13:00'}`,
    departure: o.departIn == null ? null : `${jaIn(o.departIn)}T${o.departAt ?? '09:00'}`,
    paidAt: ago(o.paidDaysAgo ?? 30),
    ...o,
  })

const tour = (inDays: number[], o: { paidDaysAgo?: number } & Partial<Parameters<typeof tourBooking>[0]> = {}) =>
  tourBooking({ email: E, dates: inDays.map(jaIn), paidAt: ago(o.paidDaysAgo ?? 30), ...o })

const sent = (key: TipKey, daysAgo: number, status: LedgerRow['status'] = 'sent'): LedgerRow => ({
  email: E,
  tip_key: key,
  track: TIP_TRACK[key],
  status,
  created_at: ago(daysAgo),
  sent_at: status === 'sent' ? ago(daysAgo) : null,
})

const person = (o: Partial<PersonInput> = {}): PersonInput => ({ email: E, joinedAtMs: NOW - 90 * DAY_MS, bookings: [], ledger: [], ...o })

const plan = (o: Partial<PersonInput> = {}, now = NOW) => planPerson(person(o), now)
const key = (d: Decision) => (d.send ? d.key : null)
const reason = (d: Decision) => (d.send ? null : d.reason)

describe('Jamaica time helpers', () => {
  test('the Jamaica day turns at 05:00 UTC', () => {
    expect(jamaicaDay(Date.parse('2026-10-01T04:59:59.999Z'))).toBe('2026-09-30')
    expect(jamaicaDay(Date.parse('2026-10-01T05:00:00Z'))).toBe('2026-10-01')
  })

  test('calendar arithmetic refuses dates that do not exist', () => {
    expect(dayNumber('2026-02-30')).toBeNull()
    expect(dayNumber('2026-13-01')).toBeNull()
    expect(dayNumber('26-10-01')).toBeNull()
    expect(dayNumber('2026-10-01')! - dayNumber('2026-09-30')!).toBe(1)
    expect(daysAway('2026-10-09', NOW)).toBe(8)
    expect(daysAway('2026-09-30', NOW)).toBe(-1)
  })

  test('a stored leg reads back as the wall clock the guest typed, in every stored spelling', () => {
    for (const s of ['2026-10-12T06:30:00+00:00', '2026-10-12T06:30:00Z', '2026-10-12T06:30:00.000Z']) {
      expect(legWallClock(s)).toEqual({ date: '2026-10-12', time: '06:30' })
    }
    expect(legWallClock('not a time')).toBeNull()
  })

  test('HubSpot times parse as ISO or epoch milliseconds', () => {
    expect(parseInstant('2026-09-24T12:00:00.000Z')).toBe(Date.parse('2026-09-24T12:00:00.000Z'))
    expect(parseInstant('1790000000000')).toBe(1790000000000)
    expect(parseInstant(1790000000000)).toBe(1790000000000)
    for (const v of ['', '  ', 'soon', null, undefined, {}]) expect(parseInstant(v)).toBeNull()
  })
})

describe('booking states', () => {
  const b = (status: string, refund_state: string | null, refunded_at: string | null = null) => ({ status, refund_state, refunded_at })
  test.each([
    [b('paid', 'none'), 'active'],
    [b('paid', null), 'active'],
    [b('paid', 'requested'), 'refund_requested'],
    [b('paid', 'declined'), 'unsettled'],
    [b('paid', 'approved'), 'unsettled'],
    [b('paid', 'none', '2026-09-20T00:00:00Z'), 'unsettled'],
    [b('refunded', 'approved', '2026-09-20T00:00:00Z'), 'inactive'],
    [b('refunded', 'requested'), 'inactive'],
    [b('refunded', 'none'), 'inactive'],
  ])('%o is %s', (input, want) => {
    expect(bookingState(input)).toBe(want)
  })

  test('a transfer item\'s date is never read as a tour, and odd items are ignored', () => {
    const r = ride({ arriveIn: 12, departIn: 19 })
    expect(servicesOf(r).map((s) => s.kind)).toEqual(['arrival', 'departure'])
    const t: TipBooking = { ...tour([5]), booking_items: [
      { item_type: 'experience', date: jaIn(5), title: 'A' },
      { item_type: 'gift', date: jaIn(6), title: 'B' },
      { item_type: 'experience', date: '2026-02-30', title: 'C' },
    ] }
    expect(servicesOf(t).map((s) => s.day)).toEqual([jaIn(5)])
    const odd: TipBooking = { ...ride({ arriveIn: 12 }), booking_items: [{ item_type: 'experience', date: jaIn(3), title: 'X' }] }
    expect(servicesOf(odd)).toEqual([])
  })
})

describe('tracks', () => {
  test('nothing booked, or everything refunded, is PROSPECT', () => {
    expect(plan().send && (plan() as Extract<Decision, { send: true }>).track).toBe('PROSPECT')
    const d = plan({ bookings: [ride({ arriveIn: 20, status: 'refunded', refund_state: 'approved' })] })
    expect(d).toMatchObject({ send: true, track: 'PROSPECT', key: 'p1_ride_costs' })
  })

  test('rides only is RIDE, tours only is TOUR, both is BOTH', () => {
    expect(plan({ bookings: [ride({ arriveIn: 20 })] })).toMatchObject({ track: 'RIDE' })
    expect(plan({ bookings: [tour([20])] })).toMatchObject({ track: 'TOUR' })
    expect(plan({ bookings: [ride({ arriveIn: 20 }), tour([22])] })).toMatchObject({ track: 'BOTH' })
  })

  test('the track is read from what is still to come: an old ride does not make a new tour BOTH', () => {
    const d = plan({ bookings: [ride({ arriveIn: -60, departIn: -50 }), tour([6])] })
    expect(d).toMatchObject({ send: true, track: 'TOUR', key: 't2_week_before_tour' })
  })

  test('a refunded ride beside an active tour leaves the tour', () => {
    const d = plan({ bookings: [ride({ arriveIn: 16, status: 'refunded', refund_state: 'approved' }), tour([16])] })
    expect(d).toMatchObject({ send: true, track: 'TOUR', key: 't1_airport_ride' })
  })

  test('a pending refund request anywhere holds the whole address, even beside a refunded booking', () => {
    expect(reason(plan({ bookings: [ride({ arriveIn: 20, refund_state: 'requested' })] }))).toBe('refund_requested')
    expect(reason(plan({ bookings: [ride({ arriveIn: 20 }), tour([25, 26], { refund_state: 'requested' })] }))).toBe('refund_requested')
    expect(reason(plan({ bookings: [ride({ arriveIn: 20, status: 'refunded', refund_state: 'approved' }), tour([30], { refund_state: 'requested' })] }))).toBe('refund_requested')
  })

  test('a paid booking that is not cleanly active holds the address instead of making it a prospect', () => {
    for (const rs of ['declined', 'approved']) {
      expect(reason(plan({ bookings: [ride({ arriveIn: 20, refund_state: rs })] })), rs).toBe('unsettled_booking')
    }
    const partly: TipBooking = { ...ride({ arriveIn: 20 }), refunded_at: ago(3) }
    expect(reason(plan({ bookings: [partly] }))).toBe('unsettled_booking')
  })

  test('an active booking with no usable time holds rather than ending the series', () => {
    const t: TipBooking = { ...tour([5]), booking_items: [{ item_type: 'experience', date: 'someday', title: 'A' }] }
    expect(reason(plan({ bookings: [t] }))).toBe('no_service_time')
  })
})

describe('PROSPECT', () => {
  test('p1 goes 2 days after they joined, not a millisecond sooner', () => {
    expect(reason(plan({ joinedAtMs: NOW - 2 * DAY_MS + 1 }))).toBe('nothing_due')
    expect(plan({ joinedAtMs: NOW - 2 * DAY_MS })).toMatchObject({ send: true, key: 'p1_ride_costs', bookingId: null, runsLeft: Infinity })
  })

  test('without a join time the first tip waits', () => {
    expect(reason(plan({ joinedAtMs: null }))).toBe('no_joined_at')
  })

  test('each later tip waits 14 days after the one before it, in order', () => {
    expect(reason(plan({ ledger: [sent('p1_ride_costs', 13.9)] }))).toBe('nothing_due')
    expect(key(plan({ ledger: [sent('p1_ride_costs', 14)] }))).toBe('p2_tours')
    expect(key(plan({ ledger: [sent('p1_ride_costs', 60), sent('p2_tours', 44), sent('p3_before_you_land', 14)] }))).toBe('p4_booking_rules')
  })

  test('the 2-in-30 limit pushes p3 until the first of the two is 30 days old', () => {
    const ledger = [sent('p1_ride_costs', 28), sent('p2_tours', 14)]
    expect(reason(plan({ ledger }))).toBe('cadence_30d')
    expect(key(plan({ ledger }, NOW + 2 * DAY_MS))).toBe('p3_before_you_land')
  })

  test('after p4 the series is done', () => {
    const ledger = [sent('p1_ride_costs', 100), sent('p2_tours', 80), sent('p3_before_you_land', 60), sent('p4_booking_rules', 40)]
    expect(reason(plan({ ledger }))).toBe('series_done')
  })

  test('a failed tip is tried again; a claimed one counts as sent', () => {
    expect(key(plan({ ledger: [sent('p1_ride_costs', 10, 'failed')] }))).toBe('p1_ride_costs')
    expect(key(plan({ ledger: [sent('p1_ride_costs', 15, 'claimed')] }))).toBe('p2_tours')
    expect(reason(plan({ ledger: [sent('p1_ride_costs', 3, 'claimed')] }))).toBe('cadence_7d')
  })

  test('a prospect tip carries no trip facts', () => {
    const d = plan()
    expect(d.send && d.facts).toEqual({ firstName: null, hotel: null, zone: null, arrival: null, departure: null, tours: [], passengers: null })
  })

  test('someone who booked never gets a prospect tip, and prospect tips stop when they book', () => {
    for (let n = -3; n <= 60; n++) {
      for (const bookings of [[ride({ arriveIn: n, departIn: n + 7 })], [tour([n])], [ride({ arriveIn: n }), tour([n + 1])]]) {
        const d = plan({ bookings, ledger: [sent('p1_ride_costs', 20)] })
        if (d.send) expect(d.key.startsWith('p'), `${n} ${d.key}`).toBe(false)
      }
    }
  })

  test('a refunded booking paid in the last 2 days still holds a prospect', () => {
    const b = ride({ arriveIn: 20, status: 'refunded', refund_state: 'approved', paidDaysAgo: 1 })
    expect(reason(plan({ bookings: [b] }))).toBe('just_paid')
  })
})

describe('RIDE', () => {
  const r = (arriveIn: number, extra: Parameters<typeof ride>[0] = {}) => ride({ arriveIn, departIn: arriveIn + 7, ...extra })

  test('r1 while the arrival is 14 or more days away; the last chance is at 14', () => {
    expect(EARLY_TIP_MIN_DAYS_AWAY).toBe(14)
    expect(plan({ bookings: [r(30)] })).toMatchObject({ send: true, key: 'r1_before_you_fly', runsLeft: 17 })
    expect(plan({ bookings: [r(15)] })).toMatchObject({ send: true, key: 'r1_before_you_fly', runsLeft: 2 })
    expect(plan({ bookings: [r(14)] })).toMatchObject({ send: true, key: 'r1_before_you_fly', runsLeft: 1 })
    // 13 to 9 days out: too late for r1, too early for r2.
    for (const n of [13, 12, 11, 10, 9]) expect(reason(plan({ bookings: [r(n)] })), String(n)).toBe('nothing_due')
  })

  test('r2 when the arrival is 5 to 8 days away, then the window closes', () => {
    expect(plan({ bookings: [r(8)] })).toMatchObject({ send: true, key: 'r2_week_before', runsLeft: 4 })
    expect(plan({ bookings: [r(5)] })).toMatchObject({ send: true, key: 'r2_week_before', runsLeft: 1 })
    expect(reason(plan({ bookings: [r(4)] }))).toBe('nothing_due')
    expect(reason(plan({ bookings: [r(3)] }))).toBe('nothing_due')
  })

  test('nothing in the 2 days before the trip starts', () => {
    for (const n of [2, 1, 0]) expect(reason(plan({ bookings: [r(n, { arriveAt: '23:00' })] })), String(n)).toBe('quiet_before_trip')
  })

  test('the "N days away" count is Jamaica calendar days, whatever the hour', () => {
    // Landing at 00:30 on 9 Oct: at 09:00 on 1 Oct in Jamaica that is 8 days.
    expect(key(plan({ bookings: [ride({ arriveIn: 8, arriveAt: '00:30' })] }))).toBe('r2_week_before')
    // One minute before midnight on 30 Sept in Jamaica it is still 9 days.
    const late = Date.parse('2026-10-01T04:59:00Z')
    expect(reason(plan({ bookings: [ride({ arriveIn: 8, arriveAt: '00:30' })] }, late))).toBe('nothing_due')
    expect(key(plan({ bookings: [ride({ arriveIn: 8, arriveAt: '00:30' })] }, late + 60_000))).toBe('r2_week_before')
  })

  test('r1 then r2 respects the 7-day gap', () => {
    expect(reason(plan({ bookings: [r(8)], ledger: [sent('r1_before_you_fly', 2)] }))).toBe('cadence_7d')
    expect(key(plan({ bookings: [r(5)], ledger: [sent('r1_before_you_fly', 7)] }))).toBe('r2_week_before')
    // Both sent: the cadence answers first while they are recent, then the series is done.
    expect(reason(plan({ bookings: [r(6)], ledger: [sent('r1_before_you_fly', 10), sent('r2_week_before', 8)] }))).toBe('cadence_30d')
    expect(reason(plan({ bookings: [r(6)], ledger: [sent('r1_before_you_fly', 45), sent('r2_week_before', 31)] }))).toBe('series_done')
  })

  test('nothing within 2 days after a booking was paid', () => {
    expect(reason(plan({ bookings: [r(20, { paidDaysAgo: AFTER_PAID_DAYS, paidAt: iso(NOW - AFTER_PAID_DAYS * DAY_MS + 1) })] }))).toBe('just_paid')
    expect(key(plan({ bookings: [r(20, { paidAt: iso(NOW - AFTER_PAID_DAYS * DAY_MS) })] }))).toBe('r1_before_you_fly')
    // Any booking at the address counts, not only the one the tip is about.
    expect(reason(plan({ bookings: [r(20), tour([40], { paidDaysAgo: 1 })] }))).toBe('just_paid')
  })

  test('a ride home only (no arrival) gets nothing', () => {
    expect(reason(plan({ bookings: [ride({ arriveIn: null, departIn: 20 })] }))).toBe('nothing_due')
  })

  test('on the trip now: held; after the last leg: the series stops', () => {
    expect(reason(plan({ bookings: [ride({ arriveIn: -3, departIn: 4 })] }))).toBe('in_trip')
    expect(reason(plan({ bookings: [ride({ arriveIn: -40, departIn: -30 })] }))).toBe('trip_ended')
    expect(reason(plan({ bookings: [ride({ arriveIn: -1 })] }))).toBe('trip_ended')
    // Landed at 06:00 today with no ride back: that was the last service.
    expect(reason(plan({ bookings: [ride({ arriveIn: 0, arriveAt: '06:00' })] }))).toBe('trip_ended')
  })

  test('a trip that ended more than 2 weeks ago does not hold a new one', () => {
    const d = plan({ bookings: [ride({ arriveIn: -30, departIn: -16 }), r(16)] })
    expect(d).toMatchObject({ send: true, key: 'r1_before_you_fly' })
  })

  test('the facts are the ride\'s own, with no tours', () => {
    const b = r(16, { arriveAt: '13:05', departAt: '09:40', hotel: 'Sample Resort Negril', zone: 'negril', passengers: 3 })
    const d = plan({ bookings: [b] })
    expect(d).toMatchObject({ send: true, bookingId: b.id })
    expect(d.send && d.facts).toEqual({
      firstName: 'Ana',
      hotel: 'Sample Resort Negril',
      zone: 'negril',
      arrival: { date: jaIn(16), time: '13:05', flight: 'AA 123' },
      departure: { date: jaIn(23), time: '09:40', flight: 'AA 456' },
      tours: [],
      passengers: 3,
    })
  })

  test('RIDE only ever plans r1 or r2', () => {
    for (let n = -20; n <= 60; n++) {
      const d = plan({ bookings: [r(n)] })
      if (d.send) expect(['r1_before_you_fly', 'r2_week_before'], String(n)).toContain(d.key)
      if (d.send) expect(d.facts.tours).toEqual([])
    }
  })
})

describe('TOUR', () => {
  test('t1 while the first tour day is 14 or more days away; the last chance is at 14', () => {
    expect(plan({ bookings: [tour([20])] })).toMatchObject({ send: true, key: 't1_airport_ride', runsLeft: 7 })
    expect(plan({ bookings: [tour([14])] })).toMatchObject({ send: true, key: 't1_airport_ride', runsLeft: 1 })
    for (const n of [13, 12, 11, 10, 9]) expect(reason(plan({ bookings: [tour([n])] })), String(n)).toBe('nothing_due')
  })

  test('t2 when the first tour day is 5 to 8 days away', () => {
    expect(plan({ bookings: [tour([8])], ledger: [sent('t1_airport_ride', 8)] })).toMatchObject({ send: true, key: 't2_week_before_tour', runsLeft: 4 })
    expect(plan({ bookings: [tour([6])] })).toMatchObject({ send: true, key: 't2_week_before_tour', runsLeft: 2 })
    expect(plan({ bookings: [tour([5])] })).toMatchObject({ send: true, key: 't2_week_before_tour', runsLeft: 1 })
    expect(reason(plan({ bookings: [tour([4])] }))).toBe('nothing_due')
  })

  test('quiet in the 2 days before; held on the day; stopped after', () => {
    expect(reason(plan({ bookings: [tour([2])] }))).toBe('quiet_before_trip')
    expect(reason(plan({ bookings: [tour([1])] }))).toBe('quiet_before_trip')
    expect(reason(plan({ bookings: [tour([0])] }))).toBe('in_trip')
    expect(reason(plan({ bookings: [tour([-1])] }))).toBe('trip_ended')
    expect(reason(plan({ bookings: [tour([-3, 4])] }))).toBe('in_trip')
  })

  test('the first FUTURE tour day is the anchor, and the facts list every tour to come', () => {
    const b = tour([-30, 9, 6], { experienceId: 14, title: 'Sample Cliff Tour', travelers: 4 })
    const d = plan({ bookings: [b] })
    expect(d).toMatchObject({ send: true, key: 't2_week_before_tour', bookingId: b.id })
    expect(d.send && d.facts).toEqual({
      firstName: 'Ana',
      hotel: null,
      zone: null,
      arrival: null,
      departure: null,
      tours: [
        { title: 'Sample Cliff Tour', date: jaIn(6), experienceId: 14, travelers: 4 },
        { title: 'Sample Cliff Tour', date: jaIn(9), experienceId: 14, travelers: 4 },
      ],
      passengers: null,
    })
  })

  test('TOUR only ever plans t1 or t2', () => {
    for (let n = -20; n <= 60; n++) {
      const d = plan({ bookings: [tour([n])] })
      if (d.send) expect(['t1_airport_ride', 't2_week_before_tour'], String(n)).toContain(d.key)
    }
  })
})

describe('BOTH', () => {
  test('b1 like r1, while the arrival and the earlier of arrival and first tour are 14+ days away', () => {
    const r = ride({ arriveIn: 16, departIn: 23 })
    expect(plan({ bookings: [r, tour([18])] })).toMatchObject({ send: true, key: 'b1_before_you_fly', runsLeft: 3, bookingId: r.id })
    expect(plan({ bookings: [ride({ arriveIn: 14, departIn: 21 }), tour([15])] })).toMatchObject({ send: true, key: 'b1_before_you_fly', runsLeft: 1 })
    expect(key(plan({ bookings: [ride({ arriveIn: 13, departIn: 20 }), tour([15])] }))).toBeNull()
    // A tour before the 14-day mark (b2 is anchored on it): no b1, even with the arrival further out.
    expect(key(plan({ bookings: [ride({ arriveIn: 16, departIn: 23 }), tour([13])] }))).toBeNull()
  })

  test('b2 the week before the earlier of arrival and first tour', () => {
    const r = ride({ arriveIn: 7, departIn: 14 })
    expect(plan({ bookings: [r, tour([9])] })).toMatchObject({ send: true, key: 'b2_week_before', runsLeft: 3, bookingId: r.id })
    // A tour three days before landing is on the same trip: b2 by the tour.
    const t = tour([6])
    expect(plan({ bookings: [ride({ arriveIn: 9, departIn: 16 }), t] })).toMatchObject({ send: true, key: 'b2_week_before', bookingId: t.id })
    expect(plan({ bookings: [ride({ arriveIn: 12, departIn: 19 }), tour([8])] })).toMatchObject({ send: true, key: 'b2_week_before' })
  })

  test('a ride home plus a tour: BOTH with no arrival, b2 by the tour', () => {
    const d = plan({ bookings: [ride({ arriveIn: null, departIn: 10 }), tour([6])] })
    expect(d).toMatchObject({ send: true, track: 'BOTH', key: 'b2_week_before' })
    expect(d.send && d.facts.arrival).toBeNull()
    expect(d.send && d.facts.departure).toEqual({ date: jaIn(10), time: '09:00', flight: 'AA 456' })
  })

  test('the facts carry the legs, the hotel and the tours', () => {
    const d = plan({ bookings: [ride({ arriveIn: 16, departIn: 23 }), tour([18, 19])] })
    expect(d.send && d.facts.arrival).toEqual({ date: jaIn(16), time: '13:00', flight: 'AA 123' })
    expect(d.send && d.facts.tours.map((t) => t.date)).toEqual([jaIn(18), jaIn(19)])
    expect(d.send && d.facts.hotel).toBe('Sample Resort Montego Bay')
  })

  test('a tip already sent under another track fills its slot: r1 blocks b1, r2 blocks b2', () => {
    const bookings = [ride({ arriveIn: 16, departIn: 23 }), tour([18])]
    expect(key(plan({ bookings }))).toBe('b1_before_you_fly')
    expect(reason(plan({ bookings, ledger: [sent('r1_before_you_fly', 9)] }))).toBe('nothing_due')
    const later = [ride({ arriveIn: 6, departIn: 13 }), tour([8])]
    expect(reason(plan({ bookings: later, ledger: [sent('r2_week_before', 8)] }))).toBe('nothing_due')
    expect(reason(plan({ bookings: later, ledger: [sent('t2_week_before_tour', 8)] }))).toBe('nothing_due')
  })

  test('BOTH only ever plans b1 or b2', () => {
    for (let n = -20; n <= 60; n++) {
      const d = plan({ bookings: [ride({ arriveIn: n, departIn: n + 7 }), tour([n + 1])] })
      if (d.send) expect(['b1_before_you_fly', 'b2_week_before'], String(n)).toContain(d.key)
    }
  })
})

describe('trips', () => {
  const ids = (d: Decision) => (d.send ? { arrival: d.facts.arrival?.date ?? null, departure: d.facts.departure?.date ?? null, tours: d.facts.tours.map((t) => t.date) } : null)

  test('a tour in October and a ride in December are two trips: the October tip knows nothing of December', () => {
    const t = tour([19])
    const r = ride({ arriveIn: 61, departIn: 68 })
    const d = plan({ bookings: [t, r] })
    expect(d).toMatchObject({ send: true, track: 'TOUR', key: 't1_airport_ride', bookingId: t.id })
    expect(ids(d)).toEqual({ arrival: null, departure: null, tours: [jaIn(19)] })
  })

  test('day by day through both trips, no tip ever mixes them, and December is planned as a ride once October is over', () => {
    const bookings = [tour([19]), ride({ arriveIn: 61, departIn: 68 })]
    const ledger: LedgerRow[] = []
    const sentLog: Array<{ day: number; key: TipKey; track: string }> = []
    for (let day = 0; day <= 70; day++) {
      const now = NOW + day * DAY_MS
      const d = planPerson(person({ bookings, ledger }), now)
      if (!d.send) continue
      const f = ids(d)!
      const october = f.tours.length > 0
      const december = f.arrival !== null || f.departure !== null
      expect(october && december, `day ${day}: ${d.key}`).toBe(false)
      ledger.push({ email: E, tip_key: d.key, track: d.track, status: 'sent', created_at: iso(now), sent_at: iso(now) })
      sentLog.push({ day, key: d.key, track: d.track })
    }
    expect(sentLog.filter((s) => s.day < 20).every((s) => s.track === 'TOUR')).toBe(true)
    expect(sentLog.filter((s) => s.day > 20).map((s) => s.track)).toContain('RIDE')
    expect(sentLog.map((s) => s.key)).not.toContain('b1_before_you_fly')
    expect(sentLog.map((s) => s.key)).not.toContain('b2_week_before')
  })

  test('landed weeks ago and flying home later: on the trip, whatever the lookback, so no week-before for a tour booked on the island', () => {
    // Round trip 15 Sept to 13 Oct; a tour on 7 Oct booked on 27 Sept.
    const stay = ride({ arriveIn: -15, arriveAt: '10:00', departIn: 12, departAt: '12:00', paidDaysAgo: 21 })
    const t = tour([6], { paidDaysAgo: 4 })
    expect(reason(plan({ bookings: [stay, t] }))).toBe('in_trip')
    // The same stay booked as two one-ways on two bookings is still one stay.
    const inbound = ride({ arriveIn: -30, departIn: null, paidDaysAgo: 40 })
    const home = ride({ arriveIn: null, departIn: 12, paidDaysAgo: 40 })
    expect(reason(plan({ bookings: [inbound, home, t] }))).toBe('in_trip')
  })

  test('an arrival and a departure further apart than a stay are not paired', () => {
    const inbound = ride({ arriveIn: -(MAX_STAY_DAYS - 5), departIn: null, paidDaysAgo: 90 })
    const home = ride({ arriveIn: null, departIn: 6, paidDaysAgo: 90 })
    // Paired, the guest would be on a trip; unpaired, the ride home is its own trip (RIDE, no arrival: nothing to send).
    expect(groupTrips([...servicesOf(inbound), ...servicesOf(home)])).toHaveLength(2)
    expect(reason(plan({ bookings: [inbound, home] }))).toBe('nothing_due')
  })

  test('services within TRIP_GAP_DAYS are one trip; one day more, two', () => {
    const one = tour([10, 10 + TRIP_GAP_DAYS])
    expect(groupTrips(servicesOf(one))).toHaveLength(1)
    const two = tour([10, 11 + TRIP_GAP_DAYS])
    expect(groupTrips(servicesOf(two))).toHaveLength(2)
    // A tour the day after the ride home is still that trip.
    const r = ride({ arriveIn: 20, departIn: 27 })
    const after = tour([28])
    const trips = groupTrips([...servicesOf(r), ...servicesOf(after)])
    expect(trips).toHaveLength(1)
    expect(trips[0].services.map((s) => s.kind)).toEqual(['arrival', 'departure', 'tour'])
  })

  test('a TOUR guest\'s facts carry the tour\'s pickup place as the hotel; RIDE and BOTH keep the ride\'s hotel', () => {
    const t: TipBooking = { ...tour([16]), pickup: 'Riu Negril' }
    expect(plan({ bookings: [t] })).toMatchObject({ send: true, key: 't1_airport_ride', facts: { hotel: 'Riu Negril', passengers: null } })
    const both = plan({ bookings: [ride({ arriveIn: 16, departIn: 23, hotel: 'Sample Resort Montego Bay' }), { ...tour([18]), pickup: 'Riu Negril' }] })
    expect(both).toMatchObject({ send: true, track: 'BOTH', facts: { hotel: 'Sample Resort Montego Bay' } })
  })
})

describe('cadence', () => {
  test('never two within 7 days', () => {
    expect(cadenceHold([sent('p1_ride_costs', 7, 'sent')], NOW + 1 - 1)).toBeNull()
    expect(cadenceHold([{ ...sent('p1_ride_costs', 0), sent_at: iso(NOW - 7 * DAY_MS + 1) }], NOW)).toBe('cadence_7d')
  })

  test('never more than 2 in any 30 days', () => {
    expect(cadenceHold([sent('p1_ride_costs', 29), sent('p2_tours', 15)], NOW)).toBe('cadence_30d')
    expect(cadenceHold([sent('p1_ride_costs', 30), sent('p2_tours', 15)], NOW)).toBeNull()
  })

  test('failed rows do not count; unreadable times hold', () => {
    expect(cadenceHold([sent('p1_ride_costs', 1, 'failed'), sent('p2_tours', 2, 'failed')], NOW)).toBeNull()
    expect(cadenceHold([{ ...sent('p1_ride_costs', 1), sent_at: null, created_at: 'garbage' }], NOW)).toBe('cadence_7d')
  })

  test('the tour upsell counts toward the 7-day gap but not the 2-in-30 limit', () => {
    const upsell = (daysAgo: number) => ride({ arriveIn: 20, departIn: 27, dispatch: { tour_upsell_sent: ago(daysAgo) } })
    expect(reason(plan({ bookings: [upsell(3)] }))).toBe('cadence_7d')
    expect(key(plan({ bookings: [upsell(8)] }))).toBe('r1_before_you_fly')
    const r = ride({ arriveIn: 6, departIn: 13, dispatch: { tour_upsell_sent: ago(10) } })
    expect(key(plan({ bookings: [r], ledger: [sent('r1_before_you_fly', 20)] }))).toBe('r2_week_before')
  })

  test('the cadence holds before any booking is looked at', () => {
    expect(reason(plan({ bookings: [ride({ arriveIn: 6, departIn: 13 })], ledger: [sent('p1_ride_costs', 1)] }))).toBe('cadence_7d')
  })
})

describe('the week-before tip takes priority over the early tip', () => {
  /**
   * Day by day from the day after booking to the trip, every tip sent is
   * written to the ledger as the job would. `jitterMin` moves each day's run
   * by a few minutes (the cron never fires to the second): the worst case is
   * the early tip sent late in its run and the day-7 run starting early.
   */
  function simulate(bookings: TipBooking[], lastDay: number, jitterMin: (day: number) => number = () => 0) {
    const ledger: LedgerRow[] = []
    const sentOn: Array<{ day: number; key: TipKey }> = []
    for (let day = 0; day <= lastDay; day++) {
      const now = NOW + day * DAY_MS + jitterMin(day) * 60_000
      const d = planPerson(person({ bookings, ledger }), now)
      if (!d.send) continue
      ledger.push({ email: E, tip_key: d.key, track: d.track, status: 'sent', created_at: iso(now), sent_at: iso(now) })
      sentOn.push({ day, key: d.key })
    }
    return sentOn
  }
  // Late on every even day, early on every odd day: covers both orders for a day-14 send and a day-7 run.
  const worst = (day: number) => (day % 2 === 0 ? 10 : -10)
  const cases = [
    { name: 'RIDE', early: 'r1_before_you_fly', week: 'r2_week_before', make: (n: number) => [ride({ arriveIn: n, departIn: n + 7, paidDaysAgo: 3 })] },
    { name: 'TOUR', early: 't1_airport_ride', week: 't2_week_before_tour', make: (n: number) => [tour([n], { paidDaysAgo: 3 })] },
    { name: 'BOTH', early: 'b1_before_you_fly', week: 'b2_week_before', make: (n: number) => [ride({ arriveIn: n, departIn: n + 7, paidDaysAgo: 3 }), tour([n + 1], { paidDaysAgo: 3 })] },
  ] as const

  test.each(cases)('$name: whenever the trip is booked, the week-before tip is still sent, and the early tip only 14+ days out', ({ early, week, make }) => {
    for (let n = WEEK_BEFORE_MIN_DAYS; n <= 60; n++) {
      for (const jitter of [() => 0, worst, (d: number) => -worst(d)]) {
        const log = simulate(make(n), n, jitter)
        const keys = log.map((x) => x.key)
        expect(keys, `booked ${n} days out`).toContain(week)
        const w = log.find((x) => x.key === week)!
        // "day" here counts from today; the anchor is n days away, so the tip went (n - w.day) days before it.
        expect(n - w.day, `booked ${n} days out`).toBeGreaterThanOrEqual(WEEK_BEFORE_MIN_DAYS)
        expect(n - w.day, `booked ${n} days out`).toBeLessThanOrEqual(WEEK_BEFORE_MAX_DAYS)
        const e = log.find((x) => x.key === early)
        if (e) {
          expect(n - e.day, `booked ${n} days out`).toBeGreaterThanOrEqual(EARLY_TIP_MIN_DAYS_AWAY)
          expect(w.day - e.day).toBeGreaterThanOrEqual(MIN_GAP_DAYS)
        }
        // The early tip goes whenever there was a day 14+ out to send it on.
        if (n >= EARLY_TIP_MIN_DAYS_AWAY) expect(keys, `booked ${n} days out`).toContain(early)
        else expect(keys, `booked ${n} days out`).not.toContain(early)
      }
    }
  })

  test('the edge: an early tip sent on day 14 leaves day 7 when the runs keep time, and days 6 and 5 always', () => {
    const bookings = [ride({ arriveIn: 14, departIn: 21 })]
    expect(key(plan({ bookings }))).toBe('r1_before_you_fly')
    const ledger = [sent('r1_before_you_fly', 0)]
    const day = (n: number, min = 0) => plan({ bookings, ledger }, NOW + (14 - n) * DAY_MS + min * 60_000)
    expect(reason(day(8))).toBe('cadence_7d')
    expect(key(day(7))).toBe('r2_week_before')
    expect(reason(day(7, -1))).toBe('cadence_7d')
    expect(key(day(6, -600))).toBe('r2_week_before')
    expect(key(day(5, -600))).toBe('r2_week_before')
  })

  test('an early tip that would fill the 2-in-30 limit through the week-before window is not sent', () => {
    // p1 went 8 days ago; the ride is 20 days out. r1 now would make 2 tips inside 30 days on every day of r2's window.
    const bookings = [ride({ arriveIn: 20, departIn: 27 })]
    expect(reason(plan({ bookings, ledger: [sent('p1_ride_costs', 8)] }))).toBe('nothing_due')
    const later = (n: number) => plan({ bookings, ledger: [sent('p1_ride_costs', 8 + n)] }, NOW + n * DAY_MS)
    expect(key(later(12))).toBe('r2_week_before') // 8 days out
    // The same p1 60 days ago is outside the window by then: r1 goes.
    expect(key(plan({ bookings, ledger: [sent('p1_ride_costs', 60)] }))).toBe('r1_before_you_fly')
    // p1 22 days ago: gone from the 30 days by r2's last run (15 days from now), so r1 goes.
    expect(key(plan({ bookings, ledger: [sent('p1_ride_costs', 22)] }))).toBe('r1_before_you_fly')
    // The same for t1 and b1.
    expect(reason(plan({ bookings: [tour([20])], ledger: [sent('p1_ride_costs', 8)] }))).toBe('nothing_due')
    expect(reason(plan({ bookings: [ride({ arriveIn: 20, departIn: 27 }), tour([21])], ledger: [sent('p1_ride_costs', 8)] }))).toBe('nothing_due')
    // A tip with no readable time counts as recent: hold.
    expect(reason(plan({ bookings, ledger: [{ ...sent('p1_ride_costs', 40), sent_at: null, created_at: 'garbage' }] }))).toBe('cadence_7d')
    // Once the week-before slot is used, the guard has nothing to protect: r2 sent 8 days ago would otherwise hold r1.
    expect(key(plan({ bookings, ledger: [sent('p1_ride_costs', 40), sent('r2_week_before', 8)] }))).toBe('r1_before_you_fly')
  })

  test('the guard judges the window by its last Jamaica day, so a run a few minutes off its time never loses the week-before tip', () => {
    // p2 went 16 days ago, 5 minutes into its run. The ride is 19 days out, so
    // r2's last day (5 days out) is exactly 30 days after the day p2 went.
    const p2At = NOW - 16 * DAY_MS + 5 * 60_000
    const bookings = [ride({ arriveIn: 19, departIn: 26 })]
    const ledger: LedgerRow[] = [sent('p1_ride_costs', 30), { ...sent('p2_tours', 16), created_at: iso(p2At), sent_at: iso(p2At) }]
    // Today's run starts 10 minutes late. At this time of day p2 would have
    // aged out of the 30 days by r2's last day, but that day's run on time
    // (5 minutes earlier in the day than p2 went) still counts it: r1 waits.
    expect(reason(plan({ bookings, ledger }, NOW + 10 * 60_000))).toBe('nothing_due')
    // Day by day from here, runs on time: r2 goes in its window, and nothing else.
    const log: LedgerRow[] = [...ledger]
    const got: Array<{ out: number; key: TipKey }> = []
    for (let d = 0; d <= 14; d++) {
      const now = NOW + d * DAY_MS + (d === 0 ? 10 * 60_000 : 0)
      const r = planPerson(person({ bookings, ledger: log }), now)
      if (!r.send) continue
      log.push({ email: E, tip_key: r.key, track: r.track, status: 'sent', created_at: iso(now), sent_at: iso(now) })
      got.push({ out: 19 - d, key: r.key })
    }
    expect(got.map((g) => g.key)).toEqual(['r2_week_before'])
    expect(got[0].out).toBeGreaterThanOrEqual(WEEK_BEFORE_MIN_DAYS)
    expect(got[0].out).toBeLessThanOrEqual(WEEK_BEFORE_MAX_DAYS)
  })

  test.each(cases)('$name: a subscriber who got prospect tips and then books never loses the week-before tip to the early tip', ({ early, week, make }) => {
    let lostToEarly = 0
    for (let bookDay = 1; bookDay <= 30; bookDay += 1) {
      for (let lead = 9; lead <= 40; lead += 1) {
        const ledger: LedgerRow[] = []
        const log: TipKey[] = []
        // Joined two days before day 0, so p1 goes on day 0 (and p2 on day 14); booked on bookDay for a trip `lead` days later.
        const shifted = make(bookDay + lead).map((b) => ({ ...b, paid_at: iso(NOW + bookDay * DAY_MS - 3_600_000) }))
        for (let d = 0; d <= bookDay + lead; d++) {
          const now = NOW + d * DAY_MS
          const r = planPerson(person({ joinedAtMs: NOW - 2 * DAY_MS, bookings: d >= bookDay ? shifted : [], ledger }), now)
          if (!r.send) continue
          ledger.push({ email: E, tip_key: r.key, track: r.track, status: 'sent', created_at: iso(now), sent_at: iso(now) })
          log.push(r.key)
        }
        if (!log.includes(week) && log.includes(early)) lostToEarly++
      }
    }
    expect(lostToEarly).toBe(0)
  })

  test('under the old 10-day rule the same booking lost its week-before tip; now day 11 sends nothing', () => {
    // Booked 11 days out: r1 on day 11 would have held the address through day 4, past the window.
    expect(reason(plan({ bookings: [ride({ arriveIn: 11, departIn: 18 })] }))).toBe('nothing_due')
    expect(simulate([ride({ arriveIn: 11, departIn: 18 })], 11).map((x) => x.key)).toEqual(['r2_week_before'])
  })
})

describe('keys, tracks and order', () => {
  test('the planner\'s tracks and the email builder\'s agree for every key', () => {
    for (const k of TIP_KEYS) {
      const track = (Object.keys(TRACK_KEYS) as Array<keyof typeof TRACK_KEYS>).find((t) => TRACK_KEYS[t].includes(k))
      expect(track, k).toBe(TIP_TRACK[k])
      expect(SLOT[k], k).toBeTruthy()
    }
  })

  test('the most urgent window goes first; prospects last; ties by address', () => {
    const rows = [
      { email: 'b@x.org', runsLeft: Infinity },
      { email: 'a@x.org', runsLeft: Infinity },
      { email: 'c@x.org', runsLeft: 1 },
      { email: 'd@x.org', runsLeft: 3 },
    ]
    expect([...rows].sort(sendOrder).map((r) => r.email)).toEqual(['c@x.org', 'd@x.org', 'a@x.org', 'b@x.org'])
  })
})

describe.each(['UTC', 'America/Los_Angeles', 'Asia/Tokyo'])('the same answers when the server runs in %s', (tz) => {
  const original = process.env.TZ
  beforeAll(() => { process.env.TZ = tz })
  afterAll(() => { process.env.TZ = original })

  test('the zone really changed', () => {
    const offset = new Date(NOW).getTimezoneOffset()
    expect(offset).toBe({ UTC: 0, 'America/Los_Angeles': 420, 'Asia/Tokyo': -540 }[tz])
  })

  test('Jamaica days and stored legs do not move', () => {
    expect(jamaicaDay(Date.parse('2026-10-01T04:59:59Z'))).toBe('2026-09-30')
    expect(jamaicaDay(NOW)).toBe('2026-10-01')
    expect(legWallClock(wall('2026-10-12T06:30'))).toEqual({ date: '2026-10-12', time: '06:30' })
    expect(daysAway('2026-10-11', NOW)).toBe(10)
  })

  test('every window edge lands on the same day', () => {
    const r = (n: number, at = '13:00') => ride({ arriveIn: n, arriveAt: at, departIn: n + 7 })
    expect(key(plan({ bookings: [r(14, '00:05')] }))).toBe('r1_before_you_fly')
    expect(key(plan({ bookings: [r(13, '23:55')] }))).toBeNull()
    expect(key(plan({ bookings: [r(9, '23:55')] }))).toBeNull()
    expect(key(plan({ bookings: [r(8, '23:55')] }))).toBe('r2_week_before')
    expect(key(plan({ bookings: [r(5, '00:05')] }))).toBe('r2_week_before')
    expect(reason(plan({ bookings: [r(2, '23:55')] }))).toBe('quiet_before_trip')
    expect(key(plan({ bookings: [tour([14])] }))).toBe('t1_airport_ride')
    expect(key(plan({ bookings: [tour([13])] }))).toBeNull()
    expect(key(plan({ bookings: [tour([8])] }))).toBe('t2_week_before_tour')
    expect(key(plan({ bookings: [tour([5])] }))).toBe('t2_week_before_tour')
    expect(key(plan({ bookings: [r(14, '00:05'), tour([16])] }))).toBe('b1_before_you_fly')
    expect(key(plan({ bookings: [r(13, '23:55'), tour([15])] }))).toBeNull()
    expect(key(plan({ bookings: [r(16), tour([13])] }))).toBeNull()
    expect(key(plan({ bookings: [r(14), tour([8])] }))).toBe('b2_week_before')
    expect(reason(plan({ bookings: [tour([0])] }))).toBe('in_trip')
    expect(key(plan({ joinedAtMs: NOW - 2 * DAY_MS }))).toBe('p1_ride_costs')
    const late = Date.parse('2026-10-01T04:59:00Z')
    expect(key(plan({ bookings: [ride({ arriveIn: 8, arriveAt: '00:30' })] }, late))).toBeNull()
    expect(key(plan({ bookings: [ride({ arriveIn: 8, arriveAt: '00:30' })] }, late + 60_000))).toBe('r2_week_before')
  })
})
