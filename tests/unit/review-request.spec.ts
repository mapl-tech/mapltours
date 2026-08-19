import { describe, test, expect } from 'vitest'
import {
  lastServiceEndMs,
  reviewRequestBlockedReason,
  describeForReview,
  REVIEW_STAMP_KEY,
  REVIEW_DELAY_HOURS,
  REVIEW_WINDOW_DAYS,
  type ReviewableBooking,
} from '../../lib/review-request'

/**
 * When a guest may be asked for a review, and what they are asked about.
 *
 * The rule that matters most: never ask before the LAST leg is done. A
 * round-trip guest still needs collecting from their hotel, and asking them to
 * review the service while you still owe them half of it is both premature and
 * a service risk. The bug that would cause it is comparing against the first
 * leg, or against the paid date.
 *
 * Leg timestamps are Jamaica wall-clock with a Z suffix (the lib/dispatch
 * convention), so '...T12:00:00Z' means noon in Jamaica, whose real instant is
 * 17:00 UTC.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (iso: string) => new Date(iso).getTime()

function booking(over: Partial<ReviewableBooking> = {}): ReviewableBooking {
  return {
    id: 'b1',
    status: 'paid',
    email: 'guest@example.com',
    booking_type: 'transfer',
    dispatch: {},
    booking_items: [],
    ...over,
  }
}

const roundTrip = (arrive: string, depart: string) => booking({
  booking_items: [{
    item_type: 'transfer', hotel: 'Azul Beach Resort Negril',
    trip_type: 'round_trip', arrival_at: arrive, departure_at: depart,
  }],
})

describe('the trip is over when the LAST leg is over', () => {
  test('a round trip ends at the departure leg, not the arrival', () => {
    const b = roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z')
    // Jamaica 18:00 on the 25th is 23:00 UTC.
    expect(lastServiceEndMs(b)).toBe(at('2026-08-25T23:00:00Z'))
  })

  test('a guest mid-trip is not asked', () => {
    const b = roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z')
    // The 19th: arrival long done, departure still six days out.
    expect(reviewRequestBlockedReason(b, at('2026-08-19T12:00:00Z'))).toBe('trip_not_finished')
  })

  test('the same guest IS asked the day after the return leg', () => {
    const b = roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z')
    expect(reviewRequestBlockedReason(b, at('2026-08-27T00:00:00Z'))).toBeNull()
  })

  test('the delay is honoured to the hour', () => {
    const b = roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z')
    const end = at('2026-08-25T23:00:00Z')
    expect(reviewRequestBlockedReason(b, end + REVIEW_DELAY_HOURS * HOUR - 1)).toBe('trip_not_finished')
    expect(reviewRequestBlockedReason(b, end + REVIEW_DELAY_HOURS * HOUR)).toBeNull()
  })

  test('a month-old trip is not chased', () => {
    const b = roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z')
    const end = at('2026-08-25T23:00:00Z')
    expect(reviewRequestBlockedReason(b, end + (REVIEW_WINDOW_DAYS - 1) * DAY)).toBeNull()
    expect(reviewRequestBlockedReason(b, end + (REVIEW_WINDOW_DAYS + 1) * DAY)).toBe('too_long_ago')
  })

  test('a tour day ends at Jamaica midnight, not UTC midnight', () => {
    const b = booking({
      booking_type: 'tour',
      booking_items: [{ item_type: 'experience', title: "Dunn's River Falls Climb", date: '2026-09-20' }],
    })
    // Jamaica midnight ending the 20th is 05:00 UTC on the 21st.
    expect(lastServiceEndMs(b)).toBe(at('2026-09-21T05:00:00Z'))
    // Still the evening of the tour in Jamaica: not finished.
    expect(reviewRequestBlockedReason(b, at('2026-09-20T22:00:00Z'))).toBe('trip_not_finished')
  })

  test('the latest of several tour dates governs', () => {
    const b = booking({
      booking_type: 'tour',
      booking_items: [
        { item_type: 'experience', title: 'A', date: '2026-09-20' },
        { item_type: 'experience', title: 'B', date: '2026-09-24' },
      ],
    })
    expect(lastServiceEndMs(b)).toBe(at('2026-09-25T05:00:00Z'))
  })
})

describe('it fails closed', () => {
  const done = () => roundTrip('2026-08-15T21:05:00Z', '2026-08-16T18:00:00Z')
  const later = at('2026-09-01T12:00:00Z')

  test('a refunded trip is never asked about', () => {
    expect(reviewRequestBlockedReason({ ...done(), status: 'refunded' }, later)).toBe('not_paid')
  })

  test('an unpaid or cancelled booking is never asked about', () => {
    for (const status of ['pending', 'failed', 'canceled']) {
      expect(reviewRequestBlockedReason({ ...done(), status }, later)).toBe('not_paid')
    }
  })

  test('no email means no send', () => {
    expect(reviewRequestBlockedReason({ ...done(), email: null }, later)).toBe('no_email')
  })

  test('asking twice is refused', () => {
    const b = { ...done(), dispatch: { [REVIEW_STAMP_KEY]: '2026-08-18T00:00:00Z' } }
    expect(reviewRequestBlockedReason(b, later)).toBe('already_asked')
  })

  test('a booking with no usable time is skipped, not assumed finished', () => {
    expect(reviewRequestBlockedReason(booking({ booking_items: [] }), later)).toBe('no_service_time')
    expect(lastServiceEndMs(booking({ booking_items: [] }))).toBeNull()
  })

  test('an unreadable date is skipped rather than treated as long past', () => {
    const b = booking({ booking_type: 'tour', booking_items: [{ item_type: 'experience', date: 'not-a-date' }] })
    expect(reviewRequestBlockedReason(b, later)).toBe('no_service_time')
  })
})

describe('it asks about what they actually booked', () => {
  test('a transfer names the hotel and both leg days', () => {
    const d = describeForReview(roundTrip('2026-08-15T21:05:00Z', '2026-08-25T18:00:00Z'))
    expect(d.isTransfer).toBe(true)
    expect(d.tripLabel).toBe('Azul Beach Resort Negril')
    expect(d.tripDates).toBe('15 August to 25 August')
  })

  test('a one-way transfer names a single day', () => {
    const b = booking({
      booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', trip_type: 'one_way', arrival_at: '2026-08-15T21:05:00Z' }],
    })
    expect(describeForReview(b).tripDates).toBe('15 August')
  })

  test('a single tour is named exactly', () => {
    const b = booking({
      booking_type: 'tour',
      booking_items: [{ item_type: 'experience', title: "Dunn's River Falls Climb", date: '2026-09-20' }],
    })
    const d = describeForReview(b)
    expect(d.isTransfer).toBe(false)
    expect(d.tripLabel).toBe("Dunn's River Falls Climb")
    expect(d.tripDates).toBe('20 September')
  })

  test('several tours summarise rather than listing everything', () => {
    const b = booking({
      booking_type: 'tour',
      booking_items: [
        { item_type: 'experience', title: "Dunn's River Falls Climb", date: '2026-09-20' },
        { item_type: 'experience', title: 'Blue Hole & Secret Falls', date: '2026-09-21' },
        { item_type: 'experience', title: 'River Tubing', date: '2026-09-22' },
      ],
    })
    const d = describeForReview(b)
    expect(d.tripLabel).toBe("Dunn's River Falls Climb and 2 more")
    expect(d.tripDates).toBe('20 September to 22 September')
  })

  test('a tour booking is never described as a transfer', () => {
    const b = booking({
      booking_type: 'tour',
      booking_items: [{ item_type: 'experience', title: 'River Tubing', date: '2026-09-20' }],
    })
    expect(describeForReview(b).isTransfer).toBe(false)
  })
})
