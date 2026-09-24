import { describe, test, expect } from 'vitest'
import {
  calendarEventsForBooking,
  calendarEventId,
  type CalendarBooking,
  type CalendarBookingItem,
} from '../../lib/google-calendar'

/**
 * Synthetic rows, per the money-state testing convention: shapes mirror what
 * the Stripe webhook loads, values are invented. The builder is pure, so
 * these tests pin the three things that would silently corrupt the ops
 * calendar: wall-clock handling (stored +00:00 IS Jamaica local — no shift),
 * deterministic event ids (the idempotency key), and leg semantics
 * (arrival_at = flight lands, departure_at = guest-chosen hotel pickup).
 */

const transferBooking: CalendarBooking = {
  id: 'a1b2c3d4-e5f6-4a0b-8c9d-0a1b2c3d4e5f',
  booking_type: 'transfer',
  first_name: 'Anthony',
  last_name: 'Guest',
  phone: '+1 704 555 0100',
  pickup_time: null,
  pickup: null,
  dropoff: null,
}

const roundTripItem: CalendarBookingItem = {
  title: 'Airport transfer',
  destination: 'Negril',
  travelers: 2,
  date: '2026-09-10',
  item_type: 'transfer',
  hotel: 'Samsara Cliff Resort, Negril',
  trip_type: 'round_trip',
  arrival_flight: 'AA1580',
  arrival_at: '2026-09-10T13:35:00+00:00', // Jamaica wall-clock, fake +00:00
  departure_flight: 'AA1581',
  departure_at: '2026-09-17T09:15:00+00:00',
  passengers: 2,
}

describe('calendarEventsForBooking — transfers', () => {
  test('round trip produces two events at verbatim Jamaica wall-clock times', () => {
    const events = calendarEventsForBooking(transferBooking, [roundTripItem])
    expect(events).toHaveLength(2)

    const [arrival, departure] = events
    // Wall-clock verbatim: 13:35 stays 13:35 — a UTC→Jamaica conversion
    // (the classic bug) would shift it to 08:35.
    expect(arrival.start).toEqual({ dateTime: '2026-09-10T13:35:00', timeZone: 'America/Jamaica' })
    expect(arrival.end).toEqual({ dateTime: '2026-09-10T14:35:00', timeZone: 'America/Jamaica' })
    expect(arrival.summary).toContain('MBJ pickup')
    expect(arrival.summary).toContain('Samsara Cliff Resort')
    expect(arrival.description).toContain('AA1580')
    expect(arrival.description).toContain('13:35 Jamaica time')
    expect(arrival.location).toContain('Sangster')

    expect(departure.start).toEqual({ dateTime: '2026-09-17T09:15:00', timeZone: 'America/Jamaica' })
    expect(departure.summary).toContain('→ MBJ')
    expect(departure.description).toContain('guest-chosen')
    expect(departure.location).toBe('Samsara Cliff Resort, Negril')
  })

  test('one-way produces only the arrival event', () => {
    const events = calendarEventsForBooking(transferBooking, [
      { ...roundTripItem, trip_type: 'one_way', departure_at: null, departure_flight: null },
    ])
    expect(events).toHaveLength(1)
    expect(events[0].summary).toContain('MBJ pickup')
  })

  test('event ids are derived from the booking id and valid for the Calendar API', () => {
    const events = calendarEventsForBooking(transferBooking, [roundTripItem])
    expect(events[0].id).toBe(calendarEventId(transferBooking.id, 0))
    expect(events[1].id).toBe(calendarEventId(transferBooking.id, 1))
    // Calendar event ids must match [a-v0-9]{5,1024}.
    for (const e of events) expect(e.id).toMatch(/^[a-v0-9]{5,1024}$/)
    // Deterministic: the same booking always derives the same ids — this IS
    // the webhook-redelivery idempotency key.
    expect(calendarEventsForBooking(transferBooking, [roundTripItem])[0].id).toBe(events[0].id)
  })
})

describe('calendarEventsForBooking — tours', () => {
  const tourBooking: CalendarBooking = {
    id: 'b2c3d4e5-f6a7-4b1c-9d0e-1b2c3d4e5f6a',
    booking_type: 'tour',
    first_name: 'Linda',
    last_name: 'Guest',
    phone: null,
    pickup_time: '07:30',
    pickup: 'Grand Palladium Jamaica, Lucea',
    dropoff: null,
  }
  const tourItem: CalendarBookingItem = {
    title: 'Blue Hole & Secret Falls',
    destination: 'Ocho Rios',
    travelers: 3,
    date: '2026-09-12',
    item_type: 'experience',
    hotel: null,
    trip_type: null,
    arrival_flight: null,
    arrival_at: null,
    departure_flight: null,
    departure_at: null,
    passengers: null,
  }

  test('a chosen pickup time makes a timed Jamaica event at the hotel', () => {
    const [event] = calendarEventsForBooking(tourBooking, [tourItem])
    expect(event.start).toEqual({ dateTime: '2026-09-12T07:30:00', timeZone: 'America/Jamaica' })
    expect(event.summary).toContain('Blue Hole & Secret Falls')
    expect(event.location).toBe('Grand Palladium Jamaica, Lucea')
    expect(event.description).toContain('No phone on file')
  })

  test('no pickup time falls back to an all-day event, never an invented hour', () => {
    const [event] = calendarEventsForBooking({ ...tourBooking, pickup_time: null }, [tourItem])
    expect(event.start).toEqual({ date: '2026-09-12' })
    expect(event.end).toEqual({ date: '2026-09-13' })
  })

  test('multi-item carts get one event per experience, ids indexed', () => {
    const events = calendarEventsForBooking(tourBooking, [
      tourItem,
      { ...tourItem, title: 'Rick’s Cafe Sunset', date: '2026-09-13' },
    ])
    expect(events).toHaveLength(2)
    expect(new Set(events.map((e) => e.id)).size).toBe(2)
  })
})
