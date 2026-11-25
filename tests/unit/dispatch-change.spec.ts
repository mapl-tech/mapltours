import { describe, test, expect } from 'vitest'
import {
  DEPARTURE_NOTICE_MIN, bookingAfter, dayOfRunAt, legIsAhead, legPlan, nextHourlyRun, planChange, planKey,
  storedWallClock, timeChangeProblem, driverValues,
} from '@/lib/dispatch-change'
import { isDue } from '@/lib/dayof'
import { legInstantMs } from '@/lib/dispatch'

/**
 * What a guest hears about a change saved from the driver portal
 * (lib/dispatch-change). Owner, Nov 24 2026: the confirmation "should also
 * contain details about when the system will email the customer, if change
 * happens within the time that the customer would have received the email,
 * send the email after a second confirmation popup."
 *
 * The day-of email is what the guest would have received: the rules here are
 * held to the hourly job's own (isDue, the stamp), hour by hour. Made-up
 * guests and drivers.
 */

const HOUR = 3_600_000
const MIN = 60_000
/** Jamaica wall clock carrying +00:00, as checkout stores a ride. */
const wall = (s: string) => `${s}:00+00:00`
/** The real instant of a Jamaica wall-clock "YYYY-MM-DDTHH:MM". */
const ja = (s: string) => Date.parse(`${s}:00Z`) + 5 * HOUR

const devon = { driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234' }
const ann = { driver_name: 'Ann Lee', driver_phone: '+1 876 555 0101', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PK 0001' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ride(over: Record<string, any> = {}, item: Record<string, any> = {}) {
  return {
    id: 'abcd1234-6c73-444e-83c6-1f79f15a59d1',
    booking_type: 'transfer', status: 'paid', email: 'guest@example.com', first_name: 'Ana',
    ...devon,
    dispatch: {},
    booking_items: [{
      item_type: 'transfer', hotel: 'Seaview Resort, Negril', trip_type: 'round_trip', passengers: 2,
      arrival_at: wall('2026-11-27T14:10'), arrival_flight: 'AA 1311',
      departure_at: wall('2026-11-30T15:30'), departure_flight: 'AA 1312',
      ...item,
    }],
    ...over,
  }
}

describe('when the hourly job runs and sends', () => {
  test('the next run is the top of the next hour, never this instant', () => {
    expect(nextHourlyRun(ja('2026-11-26T17:00'))).toBe(ja('2026-11-26T18:00'))
    expect(nextHourlyRun(ja('2026-11-26T17:59') + 59_000)).toBe(ja('2026-11-26T18:00'))
    expect(nextHourlyRun(ja('2026-11-26T17:00') + 1)).toBe(ja('2026-11-26T18:00'))
  })

  test('dayOfRunAt is the first hourly run at which isDue says yes, for every pickup hour and every moment before it', () => {
    // Every pickup on the hour and half hour of a day, every hour from two days before.
    for (let h = 0; h < 24; h++) {
      for (const mm of ['00', '30']) {
        const pickup = `2026-11-30T${String(h).padStart(2, '0')}:${mm}`
        const at = ja(pickup)
        for (let now = at - 48 * HOUR + 7 * MIN; now < at; now += HOUR) {
          let expected: number | null = null
          for (let t = nextHourlyRun(now); t < at; t += HOUR) if (isDue(wall(pickup), t)) { expected = t; break }
          expect(dayOfRunAt(wall(pickup), now)).toBe(expected)
        }
      }
    }
  })

  test('a 7 AM pickup is sent the evening before at 6 PM, as the job promises; a 3:30 PM one at 3 AM that day (13 hours before)', () => {
    expect(dayOfRunAt(wall('2026-11-30T07:00'), ja('2026-11-28T09:00'))).toBe(ja('2026-11-29T18:00'))
    expect(dayOfRunAt(wall('2026-11-30T15:30'), ja('2026-11-28T09:00'))).toBe(ja('2026-11-30T03:00'))
    // A 6 PM pickup: 13 hours before is 5 AM, the same moment the same-day rule opens.
    expect(dayOfRunAt(wall('2026-11-30T18:00'), ja('2026-11-28T09:00'))).toBe(ja('2026-11-30T05:00'))
  })

  test('none before a ride that is under an hour away and between runs', () => {
    expect(dayOfRunAt(wall('2026-11-30T15:30'), ja('2026-11-30T15:05'))).toBe(null)
  })
})

describe('what each ride is told, judged on the booking after the change', () => {
  const now = ja('2026-11-28T09:00')

  test('automatic: the day-of email has not gone and will, before the ride', () => {
    const p = legPlan(ride(), 'departure', now, false)
    expect(p).toMatchObject({ leg: 'departure', outcome: 'automatic', why: null, dayOfAt: ja('2026-11-30T03:00'), dayOfSentAt: null })
  })

  test('decide (sent_old): the day-of email already went, with the old details', () => {
    const p = legPlan(ride({ dispatch: { dayof_departure_sent: '2026-11-29T23:00:04.000Z' } }), 'departure', ja('2026-11-30T08:00'), true)
    expect(p).toMatchObject({ outcome: 'decide', why: 'sent_old', dayOfSentAt: '2026-11-29T23:00:04.000Z' })
  })

  test('the day-of stamp written by hand (a custom email marked as covering it) counts as sent', () => {
    const p = legPlan(ride({ dispatch: { dayof_departure_sent: '2026-11-24T20:00:00.000Z' } }), 'departure', now, true)
    expect(p.outcome).toBe('decide')
  })

  test('decide (too_late): a pickup at the hotel the job would reach with less than an hour to spare', () => {
    // Pickup 12:30; the next run is 12:00 (30 minutes before): not enough notice for a hotel pickup.
    const b = ride({}, { departure_at: wall('2026-11-30T12:30') })
    expect(legPlan(b, 'departure', ja('2026-11-30T11:20'), false)).toMatchObject({ outcome: 'decide', why: 'too_late' })
    // Pickup 13:00: the 12:00 run is an hour before, enough.
    const c = ride({}, { departure_at: wall('2026-11-30T13:00') })
    expect(legPlan(c, 'departure', ja('2026-11-30T11:20'), false)).toMatchObject({ outcome: 'automatic', dayOfAt: ja('2026-11-30T12:00') })
    expect(DEPARTURE_NOTICE_MIN).toBe(60)
  })

  test('an arrival needs no notice: an email that lands before the plane does is read on landing', () => {
    const b = ride({}, { arrival_at: wall('2026-11-27T14:30') })
    expect(legPlan(b, 'arrival', ja('2026-11-27T13:20'), false)).toMatchObject({ outcome: 'automatic', dayOfAt: ja('2026-11-27T14:00') })
    // Landed, still within two hours: no day-of email can go any more.
    expect(legPlan(b, 'arrival', ja('2026-11-27T15:00'), false)).toMatchObject({ outcome: 'decide', why: 'too_late' })
  })

  test('over: an arrival two hours after landing, a ride to the airport after its pickup', () => {
    expect(legPlan(ride(), 'arrival', ja('2026-11-27T16:10') + 1, false).outcome).toBe('over')
    expect(legPlan(ride(), 'departure', ja('2026-11-30T15:30'), false).outcome).toBe('over')
    expect(legIsAhead(wall('2026-11-27T14:10'), 'arrival', ja('2026-11-27T16:09'))).toBe(true)
  })

  test('unreachable: no email address on the booking (before any other answer)', () => {
    expect(legPlan(ride({ email: null }), 'departure', now, false).outcome).toBe('unreachable')
    expect(legPlan(ride({ email: '', dispatch: { dayof_departure_sent: 'x' } }), 'departure', now, false).outcome).toBe('unreachable')
  })

  test('no_driver: nothing goes until a driver is assigned', () => {
    expect(legPlan(ride({ driver_name: null, driver_phone: null }), 'departure', now, false).outcome).toBe('no_driver')
    expect(legPlan(ride({ driver_phone: '' }), 'departure', now, false).outcome).toBe('no_driver')
  })
})

describe('the plan for a change', () => {
  const now = ja('2026-11-28T09:00')

  test('a new driver on a round trip touches both rides still ahead, judged with the new driver', () => {
    const p = planChange(ride(), { kind: 'driver', after: ann }, now)
    expect(p.kind).toBe('driver')
    expect(p.leg).toBe(null)
    expect(p.before).toEqual(devon)
    expect(p.after).toEqual(ann)
    // The arrival (Nov 27) is over at Nov 28 9:00; only the ride back is touched.
    expect(p.legs.map((l) => [l.leg, l.outcome])).toEqual([['departure', 'automatic']])
    expect(p.decide).toEqual([])
    const early = planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-26T09:00'))
    expect(early.legs.map((l) => [l.leg, l.outcome])).toEqual([['arrival', 'automatic'], ['departure', 'automatic']])
  })

  test('a new driver after the day-of email went: that ride needs the second question', () => {
    const b = ride({ dispatch: { dayof_departure_sent: '2026-11-29T23:00:04.000Z' } })
    const p = planChange(b, { kind: 'driver', after: ann }, ja('2026-11-30T08:00'))
    expect(p.decide).toEqual(['departure'])
    expect(p.legs[0]).toMatchObject({ outcome: 'decide', why: 'sent_old', told: true })
  })

  test('told reads the booking before the change (an arrival day-of email tells the ride back too)', () => {
    const b = ride({ dispatch: { dayof_arrival_sent: '2026-11-26T23:00:00.000Z' } })
    expect(planChange(b, { kind: 'driver', after: ann }, now).legs[0]).toMatchObject({ leg: 'departure', told: true })
    expect(planChange(ride(), { kind: 'driver', after: ann }, now).legs[0].told).toBe(false)
  })

  test('a new time touches only that ride, judged at the new time', () => {
    const p = planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:00') }, now)
    expect(p.before).toEqual({ at: wall('2026-11-30T15:30') })
    expect(p.after).toEqual({ at: wall('2026-11-30T12:00') })
    expect(p.legs).toHaveLength(1)
    expect(p.legs[0]).toMatchObject({ leg: 'departure', at: wall('2026-11-30T12:00'), outcome: 'automatic', dayOfAt: ja('2026-11-29T23:00') })
  })

  test('moving a ride earlier can bring its day-of email due at once: the next run, and still automatic', () => {
    const p = planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-28T18:00') }, now)
    expect(p.legs[0]).toMatchObject({ outcome: 'automatic', dayOfAt: ja('2026-11-28T10:00') })
  })

  test('moving it to within the hour: the job cannot reach the guest in time, so the question is asked', () => {
    const p = planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-28T09:40') }, now)
    expect(p.decide).toEqual(['departure'])
  })

  test('a tour: no ride, no email, no question', () => {
    const tour = { id: 'b2', booking_type: 'tour', status: 'paid', email: 'g@example.com', pickup_time: null, ...devon, booking_items: [{ item_type: 'experience', date: '2026-12-02' }] }
    const t = planChange(tour, { kind: 'tour_time', time: '08:30' }, now)
    expect(t).toMatchObject({ kind: 'tour_time', before: { pickup_time: null }, after: { pickup_time: '08:30' }, legs: [], decide: [] })
    const d = planChange(tour, { kind: 'driver', after: ann }, now)
    expect(d).toMatchObject({ kind: 'driver', legs: [], decide: [], before: devon, after: ann })
  })

  test('bookingAfter moves only what the change moves', () => {
    const b = ride()
    expect(bookingAfter(b, { kind: 'driver', after: ann })).toMatchObject({ ...ann, email: 'guest@example.com' })
    const t = bookingAfter(b, { kind: 'time', leg: 'arrival', at: wall('2026-11-27T16:00') })
    expect(t.booking_items[0]).toMatchObject({ arrival_at: wall('2026-11-27T16:00'), departure_at: wall('2026-11-30T15:30') })
    expect(b.booking_items[0].arrival_at).toBe(wall('2026-11-27T14:10'))
    expect(driverValues({})).toEqual({ driver_name: null, driver_phone: null, driver_vehicle: null, driver_plate: null })
  })
})

describe('the plan key: what the person confirmed', () => {
  test('the same change and the same outcomes give the same key, an hour later too', () => {
    const a = planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-28T09:00'))
    const b = planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-28T10:30'))
    expect(planKey(a)).toBe(planKey(b))
  })

  test('the day-of email going between the two steps changes the key', () => {
    const before = planChange(ride(), { kind: 'driver', after: ann }, ja('2026-11-30T04:50'))
    const after = planChange(ride({ dispatch: { dayof_departure_sent: '2026-11-30T10:00:03.000Z' } }), { kind: 'driver', after: ann }, ja('2026-11-30T05:01'))
    expect(before.legs[0].outcome).toBe('automatic')
    expect(after.legs[0].outcome).toBe('decide')
    expect(planKey(before)).not.toBe(planKey(after))
  })

  test('a different driver or time changes the key; so does a driver change elsewhere first', () => {
    const now = ja('2026-11-28T09:00')
    const base = planKey(planChange(ride(), { kind: 'driver', after: ann }, now))
    expect(planKey(planChange(ride(), { kind: 'driver', after: { ...ann, driver_plate: 'PK 0002' } }, now))).not.toBe(base)
    expect(planKey(planChange(ride({ driver_plate: 'PJ 9999' }), { kind: 'driver', after: ann }, now))).not.toBe(base)
    const t1 = planKey(planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:00') }, now))
    const t2 = planKey(planChange(ride(), { kind: 'time', leg: 'departure', at: wall('2026-11-30T12:05') }, now))
    expect(t1).not.toBe(t2)
  })
})

describe('a new time: the checks', () => {
  const now = ja('2026-11-28T09:00')

  test('the stored form is the Jamaica wall clock carrying +00:00, and only a real day and time', () => {
    expect(storedWallClock('2026-11-30T12:00')).toBe('2026-11-30T12:00:00+00:00')
    for (const bad of ['2026-11-30', '2026-11-30T24:00', '2026-02-30T12:00', '2026-11-30T12:00Z', '2026-11-30T12:00:00', 'tomorrow', '']) {
      expect(storedWallClock(bad)).toBe(null)
    }
    expect(legInstantMs(storedWallClock('2026-11-30T12:00')!)).toBe(ja('2026-11-30T12:00'))
  })

  test('each refusal, in words', () => {
    expect(timeChangeProblem(ride(), 'departure', '2026-11-30T12:00', now)).toBe(null)
    expect(timeChangeProblem(ride({ booking_type: 'tour' }), 'departure', '2026-11-30T12:00', now)).toBe('Only an airport ride has a ride time.')
    expect(timeChangeProblem(ride({}, { trip_type: 'one_way', departure_at: null }), 'departure', '2026-11-30T12:00', now)).toBe('This booking has no ride to the airport.')
    expect(timeChangeProblem(ride(), 'arrival', '2026-11-27T16:00', now)).toBe('This arrival is over.')
    expect(timeChangeProblem(ride(), 'departure', '2026-11-30 12:00', now)).toBe('Choose a day and a time.')
    expect(timeChangeProblem(ride(), 'departure', '2026-11-30T15:30', now)).toBe('That is the time the ride already has.')
    expect(timeChangeProblem(ride(), 'departure', '2026-11-28T08:59', now)).toBe('Choose a time that has not passed yet.')
    expect(timeChangeProblem(ride(), 'departure', '2027-12-30T12:00', now)).toBe('Choose a time within the next year.')
    expect(timeChangeProblem(ride(), 'departure', '2026-11-27T14:00', ja('2026-11-26T09:00'))).toBe('The ride to the airport has to be after the arrival.')
    expect(timeChangeProblem(ride(), 'arrival', '2026-11-30T15:30', ja('2026-11-26T09:00'))).toBe('The flight has to land before the ride back to the airport.')
  })

  test('a one-way to the airport: its pickup can move freely, with no arrival to stay after', () => {
    const b = ride({}, { trip_type: 'one_way', arrival_at: null })
    expect(timeChangeProblem(b, 'departure', '2026-11-29T06:00', now)).toBe(null)
    expect(timeChangeProblem(b, 'arrival', '2026-11-29T06:00', now)).toBe('This booking has no arrival.')
  })
})
