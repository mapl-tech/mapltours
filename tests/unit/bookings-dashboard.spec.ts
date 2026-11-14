import { describe, test, expect } from 'vitest'
import { firstService, viewOf } from '@/components/admin/BookingsDashboard'

/**
 * The admin bookings list (Nov 13 2026 redesign): paid bookings open on the
 * trips still to come, soonest first, because that is what the operator
 * schedules around; one search finds a guest by anything on the booking.
 * Dates are far from today so the split never depends on when this runs.
 */

const TODAY = '2026-11-13'
const ride = (id: string, arrival: string | null, extra: Record<string, unknown> = {}) => ({
  id, status: 'paid', booking_type: 'transfer', created_at: '2026-11-01T10:00:00Z', paid_at: '2026-11-01T10:05:00Z',
  first_name: 'Ride', last_name: id, email: `${id}@example.com`, phone: '+1 555 0100',
  booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', arrival_at: arrival, arrival_flight: 'B6621', departure_at: '2099-12-31T13:00:00+00:00', departure_flight: 'B6922' }],
  ...extra,
})
const tour = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, status: 'paid', booking_type: 'tour', created_at: '2026-11-02T10:00:00Z', paid_at: '2026-11-02T10:05:00Z',
  first_name: 'Tour', last_name: id, email: `${id}@example.com`,
  booking_items: [{ item_type: 'tour', title: "Dunn's River Falls Climb", date }],
  ...extra,
})
const opts = { status: 'paid' as const, when: 'upcoming' as const, kind: 'all' as const, query: '', today: TODAY }
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe('firstService: the moment an operator schedules around', () => {
  test("a ride's landing, its pickup home when that is its only leg, a tour's day", () => {
    expect(firstService(ride('a', '2099-12-03T16:06:00+00:00'))).toEqual({ day: '2099-12-03', at: '2099-12-03T16:06:00+00:00', kind: 'lands' })
    expect(firstService(ride('b', null))).toEqual({ day: '2099-12-31', at: '2099-12-31T13:00:00+00:00', kind: 'pickup' })
    expect(firstService(tour('c', '2099-12-05'))).toEqual({ day: '2099-12-05', at: null, kind: 'tour' })
  })

  test('the earliest of several items, and nothing for a booking with no day', () => {
    const two = tour('d', '2099-12-09', { booking_items: [{ date: '2099-12-09' }, { date: '2099-12-04' }] })
    expect(firstService(two)?.day).toBe('2099-12-04')
    expect(firstService({ booking_items: [{ title: 'x' }] })).toBeNull()
  })
})

describe('viewOf: the list each view shows', () => {
  const rows = [
    ride('late', '2099-12-20T09:00:00+00:00', { paid_at: '2026-11-10T10:00:00Z' }),
    tour('soon', '2099-12-02', { paid_at: '2026-11-03T10:00:00Z' }),
    ride('sameday', '2099-12-02T15:00:00+00:00', { paid_at: '2026-11-04T10:00:00Z' }),
    tour('old', '2001-02-03', { paid_at: '2001-01-20T10:00:00Z' }),
    ride('refunded', '2099-12-10T10:00:00+00:00', { status: 'refunded', paid_at: '2026-11-05T10:00:00Z' }),
    ride('cart', '2099-12-11T10:00:00+00:00', { status: 'pending', created_at: '2026-11-12T10:00:00Z' }),
    ride('cart2', '2099-12-12T10:00:00+00:00', { status: 'pending', created_at: '2026-11-12T12:00:00Z' }),
  ]

  test('upcoming: trips from today on, soonest first, refunds kept in view', () => {
    expect(ids(viewOf(rows, opts))).toEqual(['soon', 'sameday', 'refunded', 'late'])
  })

  test('past: trips before today, latest first; recently paid: newest payment first', () => {
    expect(ids(viewOf(rows, { ...opts, when: 'past' }))).toEqual(['old'])
    expect(ids(viewOf(rows, { ...opts, when: 'recent' }))).toEqual(['late', 'refunded', 'sameday', 'soon', 'old'])
  })

  test('a round trip stays upcoming until its drive back to the airport has run', () => {
    // Landed Nov 10, flies home Nov 17: on the 13th the drive back is still to come.
    const midStay = { ...ride('midstay', '2026-11-10T14:00:00+00:00'), booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', arrival_at: '2026-11-10T14:00:00+00:00', departure_at: '2026-11-17T09:00:00+00:00' }] }
    const done = { ...ride('done', '2026-11-01T14:00:00+00:00'), booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', arrival_at: '2026-11-01T14:00:00+00:00', departure_at: '2026-11-08T09:00:00+00:00' }] }
    const all = [...rows, midStay, done]
    // Soonest drive first: the Nov 17 pickup leads the 2099 trips.
    expect(ids(viewOf(all, opts))).toEqual(['midstay', 'soon', 'sameday', 'refunded', 'late'])
    // Past holds only bookings with nothing ahead, most recently finished first.
    expect(ids(viewOf(all, { ...opts, when: 'past' }))).toEqual(['done', 'old'])
    // On the day of the drive back it is still upcoming; the day after, past.
    expect(ids(viewOf([midStay], { ...opts, today: '2026-11-17' }))).toEqual(['midstay'])
    expect(ids(viewOf([midStay], { ...opts, today: '2026-11-18' }))).toEqual([])
    expect(ids(viewOf([midStay], { ...opts, when: 'past', today: '2026-11-18' }))).toEqual(['midstay'])
  })

  test('abandoned: unpaid carts only, newest first, whatever the trip date', () => {
    expect(ids(viewOf(rows, { ...opts, status: 'abandoned' }))).toEqual(['cart2', 'cart'])
  })

  test('the type filter', () => {
    expect(ids(viewOf(rows, { ...opts, kind: 'tour' }))).toEqual(['soon'])
    expect(ids(viewOf(rows, { ...opts, kind: 'transfer' }))).toEqual(['sameday', 'refunded', 'late'])
  })

  test('search finds a guest by name, email, phone, reference, hotel, tour or flight, in any case', () => {
    const q = (query: string, when: 'upcoming' | 'recent' = 'recent') => ids(viewOf(rows, { ...opts, when, query }))
    expect(q('SOON')).toEqual(['soon'])
    expect(q('late@example.com')).toEqual(['late'])
    expect(q('mapl-sameday')).toEqual(['sameday'])
    expect(q("dunn's")).toEqual(['soon', 'old'])
    expect(q('b6621')).toEqual(['late', 'refunded', 'sameday'])
    expect(q('riu ocho')).toEqual(['late', 'refunded', 'sameday'])
    expect(q('  nobody  ')).toEqual([])
  })
})
