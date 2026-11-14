import { describe, test, expect } from 'vitest'
import {
  scheduleFromBookings, scheduleFromDriver, eventsByDay, nextUp, untilLabel, monthWeeks, shiftMonth, monthLabel,
  daySummary, eventWhen, jamaicaDay, eventInstantMs, serviceMoments, nextService, sameDayOthers, clock, clockFromHHMM,
} from '@/lib/trip-schedule'

/**
 * The trip schedule behind the admin's and the driver's calendars (owner,
 * Nov 13 2026: "it needs to be very clear when there is an upcoming ride").
 * What these hold: every ride LEG is its own event on its own Jamaica day,
 * only paid bookings are anybody's drive, "next" is decided in Jamaica time
 * whatever zone the machine is in, and the month grid is whole weeks.
 */

const rt = (id: string, arrival: string | null, departure: string | null, extra: Record<string, unknown> = {}) => ({
  id, status: 'paid', booking_type: 'transfer', first_name: 'Ride', last_name: id,
  booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Negril', passengers: 2, trip_type: arrival && departure ? 'round_trip' : 'one_way', arrival_at: arrival, arrival_flight: arrival ? 'B6621' : null, departure_at: departure, departure_flight: departure ? 'B6922' : null }],
  ...extra,
})
const tour = (id: string, dates: string[], extra: Record<string, unknown> = {}) => ({
  id, status: 'paid', booking_type: 'tour', first_name: 'Tour', last_name: id,
  booking_items: dates.map((date, n) => ({ item_type: 'experience', title: n === 0 ? "Dunn's River Falls Climb" : 'River Tubing', date, travelers: 4 })),
  ...extra,
})

// 2026-11-14 02:10 UTC is 9:10 pm on Nov 13 in Jamaica.
const NOW = Date.parse('2026-11-14T02:10:00Z')

describe('scheduleFromBookings: one event per leg and per tour day', () => {
  test('a round trip is two drives on two days, each in its own direction', () => {
    const ev = scheduleFromBookings([rt('aaaaaaaa-1', '2026-11-14T17:30:00+00:00', '2026-11-21T09:00:00+00:00')])
    expect(ev.map((e) => [e.kind, e.day, e.from, e.to, e.flight])).toEqual([
      ['arrival', '2026-11-14', 'MBJ', 'Riu Negril', 'B6621'],
      ['departure', '2026-11-21', 'Riu Negril', 'MBJ', 'B6922'],
    ])
    expect(ev[0].ref).toBe('MAPL-AAAAAAAA')
    expect(ev[0].party).toBe('2 passengers')
    expect(ev[0].guest).toBe('Ride aaaaaaaa-1')
  })

  test('a one-way home is one drive from the hotel, and a tour is one event on its day', () => {
    const ev = scheduleFromBookings([rt('b', null, '2026-12-01T06:15:00+00:00'), tour('c', ['2026-11-28'], { pickup_time: '08:30' })])
    expect(ev.map((e) => [e.kind, e.day, e.from, e.to, e.title])).toEqual([
      ['tour', '2026-11-28', null, null, "Dunn's River Falls Climb"],
      ['departure', '2026-12-01', 'Riu Negril', 'MBJ', null],
    ])
    expect(ev[0].pickupTime).toBe('08:30')
    expect(ev[0].party).toBe('4 travelers')
  })

  test('two tours on one day are one event; on two days, two', () => {
    expect(scheduleFromBookings([tour('d', ['2026-11-28', '2026-11-28'])]).map((e) => [e.day, e.title])).toEqual([['2026-11-28', '2 tours']])
    expect(scheduleFromBookings([tour('e', ['2026-11-28', '2026-11-30'])]).map((e) => e.day)).toEqual(['2026-11-28', '2026-11-30'])
  })

  test('only paid bookings: a refunded, pending, failed or canceled booking is nobody\'s drive', () => {
    for (const status of ['refunded', 'pending', 'failed', 'canceled']) {
      expect(scheduleFromBookings([rt('x', '2026-11-14T17:30:00+00:00', null, { status })])).toEqual([])
    }
  })

  test('a leg with no usable time, and a tour with no usable date, are left out rather than guessed', () => {
    expect(scheduleFromBookings([rt('y', 'not a time', null), tour('z', ['soon'])])).toEqual([])
    expect(scheduleFromBookings([{ id: 'w', status: 'paid', booking_type: 'transfer' }])).toEqual([])
  })

  test('sorted soonest first; on one day a tour leads the timed rides', () => {
    const ev = scheduleFromBookings([rt('late', '2026-11-20T09:00:00+00:00', null), rt('early', '2026-11-14T08:00:00+00:00', null), tour('t', ['2026-11-14'])])
    expect(ev.map((e) => e.bookingId)).toEqual(['t', 'early', 'late'])
  })
})

describe('scheduleFromDriver: the same events from the driver-safe shapes', () => {
  test('legs and tour days, with nothing about money', () => {
    const ev = scheduleFromDriver(
      [{ id: 'trip1', ref: 'MAPL-TRIP1', guestName: 'Alex Morgan', passengers: 3, hotel: 'Sandals Negril', airport: 'MBJ', arrivalAt: '2026-11-14T17:30:00+00:00', arrivalFlight: 'AC982', departureAt: '2026-11-21T09:00:00+00:00', departureFlight: null }],
      [{ id: 'tour1', ref: 'MAPL-TOUR1', guestName: 'Sam Lee', items: [{ title: 'River Tubing', date: '2026-11-16', travelers: 2 }] }],
    )
    expect(ev.map((e) => [e.kind, e.day, e.guest])).toEqual([
      ['arrival', '2026-11-14', 'Alex Morgan'], ['tour', '2026-11-16', 'Sam Lee'], ['departure', '2026-11-21', 'Alex Morgan'],
    ])
    expect(JSON.stringify(ev)).not.toMatch(/payout|price|total/i)
  })
})

describe('what is next, in Jamaica time', () => {
  const ev = scheduleFromBookings([
    rt('gone', '2026-11-13T15:00:00+00:00', null),               // landed 3 pm Nov 13 Jamaica: over six hours ago
    rt('justnow', '2026-11-13T20:00:00+00:00', null),            // landed 8 pm: 70 minutes ago, still "next"
    rt('tomorrow', '2026-11-14T17:30:00+00:00', '2026-11-21T09:00:00+00:00'),
    tour('today', ['2026-11-13']),
  ])

  test('Jamaica\'s day, not the machine\'s: 02:10 UTC on the 14th is still the 13th there', () => {
    expect(jamaicaDay(NOW)).toBe('2026-11-13')
    expect(eventInstantMs({ at: '2026-11-13T20:00:00+00:00', day: '2026-11-13' })).toBe(Date.parse('2026-11-14T01:00:00Z'))
  })

  test('a tour today is still next; a drive stays next for two hours past its time, then the following one', () => {
    expect(nextUp(ev, NOW)?.bookingId).toBe('today')
    const rides = ev.filter((e) => e.kind !== 'tour')
    expect(nextUp(rides, NOW)?.bookingId).toBe('justnow')
    expect(nextUp(rides, NOW + 60 * 60_000)?.bookingId).toBe('tomorrow')
    expect(nextUp(rides, Date.parse('2026-12-25T00:00:00Z'))).toBeNull()
  })

  test('a round trip\'s drive back is next once the landing is over', () => {
    const after = Date.parse('2026-11-16T15:00:00Z')
    const n = nextUp(ev.filter((e) => e.bookingId === 'tomorrow'), after)
    expect([n?.kind, n?.day]).toEqual(['departure', '2026-11-21'])
  })

  test('how far off, in the words a person uses', () => {
    const one = (at: string) => scheduleFromBookings([rt('q', at, null)])[0]
    expect(untilLabel(one('2026-11-13T21:50:00+00:00'), NOW)).toBe('in 40 min')
    expect(untilLabel(one('2026-11-13T23:40:00+00:00'), NOW)).toBe('in 3 hrs')
    expect(untilLabel(one('2026-11-13T20:00:00+00:00'), NOW)).toBe('now')
    expect(untilLabel(one('2026-11-14T06:00:00+00:00'), NOW)).toBe('tomorrow')
    expect(untilLabel(one('2026-11-16T06:00:00+00:00'), NOW)).toBe('in 3 days')
    expect(untilLabel(scheduleFromBookings([tour('t', ['2026-11-13'])])[0], NOW)).toBe('today')
  })

  test('the rest of an event\'s day', () => {
    const day = scheduleFromBookings([rt('a', '2026-11-14T08:00:00+00:00', null), rt('b', '2026-11-14T17:30:00+00:00', null), rt('c', '2026-11-15T08:00:00+00:00', null)])
    expect(sameDayOthers(day, day[0]).map((e) => e.bookingId)).toEqual(['b'])
  })
})

describe('the month grid', () => {
  test('whole weeks, Sunday first, with the neighbouring months\' days marked', () => {
    const nov = monthWeeks('2026-11') // Nov 1 2026 is a Sunday
    expect(nov.length).toBe(5)
    expect(nov[0][0]).toEqual({ day: '2026-11-01', inMonth: true })
    expect(nov[4][6]).toEqual({ day: '2026-12-05', inMonth: false })
    const dec = monthWeeks('2026-12') // Dec 1 2026 is a Tuesday
    expect(dec[0].map((c) => c.day.slice(8))).toEqual(['29', '30', '01', '02', '03', '04', '05'])
    expect(dec[0].map((c) => c.inMonth)).toEqual([false, false, true, true, true, true, true])
    for (const m of ['2026-02', '2027-02', '2028-02', '2026-08', '2027-01']) {
      const weeks = monthWeeks(m)
      expect(weeks.every((w) => w.length === 7)).toBe(true)
      const inMonth = weeks.flat().filter((c) => c.inMonth)
      expect(inMonth[0].day).toBe(`${m}-01`)
      expect(new Set(inMonth.map((c) => c.day)).size).toBe(inMonth.length)
      expect(monthWeeks(shiftMonth(m, 1))[0].some((c) => c.inMonth)).toBe(true)
    }
    expect(monthWeeks('2026-02').length).toBe(4) // Feb 2026 starts on a Sunday and has 28 days
    expect(monthWeeks('2028-02').flat().filter((c) => c.inMonth).length).toBe(29)
  })

  test('months step across a year end, and read as words', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(shiftMonth('2026-11', 14)).toBe('2028-01')
    expect(monthLabel('2026-11')).toBe('November 2026')
  })

  test('the same grid whatever zone the machine is in', () => {
    const before = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
        process.env.TZ = tz
        expect(monthWeeks('2026-11')[0][0].day).toBe('2026-11-01')
        expect(monthWeeks('2026-11').flat().filter((c) => c.inMonth).length).toBe(30)
        expect(jamaicaDay(NOW)).toBe('2026-11-13')
      }
    } finally { process.env.TZ = before }
  })
})

describe('words for a day and an event', () => {
  const ev = scheduleFromBookings([rt('a', '2026-11-14T17:30:00+00:00', '2026-11-14T09:05:00+00:00'), tour('t', ['2026-11-14'], { pickup_time: '08:30' }), tour('u', ['2026-11-15'])])
  test('a day says how many rides and tours it holds', () => {
    const days = eventsByDay(ev)
    expect(daySummary(days.get('2026-11-14')!)).toBe('2 rides and 1 tour')
    expect(daySummary(days.get('2026-11-15')!)).toBe('1 tour')
    expect(daySummary([])).toBe('no trips')
    expect(days.get('2026-11-14')!.map((e) => e.kind)).toEqual(['tour', 'departure', 'arrival'])
  })
  test('an event says what happens and when, in the stored Jamaica wall-clock', () => {
    expect(ev.filter((e) => e.day === '2026-11-14').map(eventWhen)).toEqual(['Tour, pickup 8:30 AM', 'Hotel pickup 9:05 AM', 'Lands 5:30 PM'])
    expect(eventWhen(ev.find((e) => e.bookingId === 'u')!)).toBe('Tour')
    expect(clock('2026-11-14T00:05:00+00:00')).toBe('12:05 AM')
    expect(clockFromHHMM('12:00')).toBe('12:00 PM')
    expect(clockFromHHMM('nope')).toBe('')
  })
})

describe('one booking\'s moments, for a list with one row per booking', () => {
  const b = rt('r', '2026-11-10T14:00:00+00:00', '2026-11-17T09:00:00+00:00')
  test('both legs, soonest first', () => {
    expect(serviceMoments(b).map((m) => [m.kind, m.day])).toEqual([['lands', '2026-11-10'], ['pickup', '2026-11-17']])
    expect(serviceMoments(tour('t', ['2026-11-28'])).map((m) => m.kind)).toEqual(['tour'])
    expect(serviceMoments({ booking_items: [{ title: 'x' }] })).toEqual([])
  })
  test('mid-stay, the booking is waiting on its drive back; after it, on nothing', () => {
    expect(nextService(b, '2026-11-09')?.kind).toBe('lands')
    expect(nextService(b, '2026-11-13')).toEqual({ day: '2026-11-17', at: '2026-11-17T09:00:00+00:00', kind: 'pickup' })
    expect(nextService(b, '2026-11-17')?.kind).toBe('pickup')
    expect(nextService(b, '2026-11-18')).toBeNull()
  })
})
