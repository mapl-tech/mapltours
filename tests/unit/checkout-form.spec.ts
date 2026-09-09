import { describe, test, expect } from 'vitest'
import {
  validateContact, validateTourForm, validateTransferForm, flightOk, pickupFromFlight, flightFromPickup,
  formatWallClock, formatDate, orderKey, legsFor, PICKUP_LEAD_TEXT,
} from '../../lib/checkout-form'

const NOW = new Date('2026-09-05T15:00:00Z') // 10:00 Jamaica, Sep 5
const contact = { firstName: 'Ann', lastName: 'Lee', email: 'ann@example.com', phone: '+1 416 555 0100' }

describe('contact validation', () => {
  test('accepts a complete contact and names every missing field', () => {
    expect(validateContact(contact)).toEqual({})
    const e = validateContact({})
    expect(Object.keys(e).sort()).toEqual(['email', 'firstName', 'lastName', 'phone'])
    expect(validateContact({ ...contact, email: 'ann@' }).email).toMatch(/does not look right/)
    expect(validateContact({ ...contact, phone: '12' }).phone).toMatch(/too short/)
  })
})

describe('tour form', () => {
  test('needs a pickup place, a bookable date and the waiver', () => {
    expect(validateTourForm({ contact, pickup: 'Sandals Negril Beach Resort', tripDate: '2026-09-07', waiverAccepted: true, now: NOW })).toEqual({})
    const e = validateTourForm({ contact, pickup: '', tripDate: '2026-09-06', waiverAccepted: false, now: NOW })
    expect(e.pickup).toMatch(/Choose where/)
    expect(e.tripDate).toMatch(/earliest date is Mon, Sep 7/)
    expect(e.waiver).toMatch(/waiver/)
    expect(validateTourForm({ contact, pickup: 'x', tripDate: '', waiverAccepted: true, now: NOW }).tripDate).toBe('Pick a date')
  })
})

describe('transfer form', () => {
  const min = '2026-09-06T10:00'
  test('a round trip needs both legs, in order, with flight numbers', () => {
    const ok = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-10-10T14:30', arrivalFlight: 'AA1234', departureAt: '2026-10-17T10:00', departureFlight: 'AA4321' } })
    expect(ok).toEqual({})
    const e = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-10-17T14:30', arrivalFlight: 'A', departureAt: '2026-10-10T10:00', departureFlight: '' } })
    expect(e.arrivalFlight).toMatch(/AA1234/)
    expect(e.departureAt).toMatch(/after you arrive/)
    expect(e.departureFlight).toMatch(/AA4321/)
    expect(validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'round_trip', fromAirport: true, arrivalAt: '2026-09-06T09:00', arrivalFlight: 'AA1', departureAt: '2026-09-20T10:00', departureFlight: 'AA2' } }).arrivalAt).toMatch(/24 hours/)
  })
  test('a one-way carries only its own leg', () => {
    expect(legsFor('one_way', false)).toEqual({ hasArrivalLeg: false, hasDepartureLeg: true })
    const toAirport = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'one_way', fromAirport: false, departureAt: '2026-10-17T10:00', departureFlight: 'AA4321' } })
    expect(toAirport).toEqual({})
    const fromAirport = validateTransferForm({ contact, minDateTime: min, legs: { tripType: 'one_way', fromAirport: true } })
    expect(Object.keys(fromAirport)).toEqual(['arrivalAt', 'arrivalFlight'])
  })
  test('flight numbers are permissive but not empty', () => {
    expect(flightOk('AA1234')).toBe(true); expect(flightOk('521')).toBe(true); expect(flightOk('vs165')).toBe(true)
    expect(flightOk('')).toBe(false); expect(flightOk('AA')).toBe(false); expect(flightOk('12345678901')).toBe(false)
  })
})

describe('departure pickup from the flight time', () => {
  test('is the lead time before the flight, and round-trips back', () => {
    expect(PICKUP_LEAD_TEXT).toBe('3½ hours')
    expect(pickupFromFlight('2026-10-17T13:30')).toBe('2026-10-17T10:00')
    expect(pickupFromFlight('2026-10-17T02:00')).toBe('2026-10-16T22:30')
    expect(flightFromPickup('2026-10-17T10:00')).toBe('2026-10-17T13:30')
    expect(pickupFromFlight('nonsense')).toBe('')
  })
  test('formats wall-clock values without touching the browser zone', () => {
    expect(formatWallClock('2026-10-17T10:00')).toBe('Sat, Oct 17 · 10:00 AM')
    expect(formatWallClock('2026-10-17T00:05')).toBe('Sat, Oct 17 · 12:05 AM')
    expect(formatWallClock('2026-10-17T13:30')).toBe('Sat, Oct 17 · 1:30 PM')
    expect(formatDate('2026-09-07')).toBe('Mon, Sep 7')
  })
})

describe('order key', () => {
  test('ignores key order and changes with any value', () => {
    expect(orderKey({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(orderKey({ a: [{ x: 1, y: 2 }], b: 1 }))
    expect(orderKey({ a: 1 })).not.toBe(orderKey({ a: 2 }))
  })
})
