import { describe, test, expect } from 'vitest'
import {
  bookingRef, isTransfer, itemImage, itemParish, splitBookings, nextTrip,
  daysBetween, countdownLabel, profileStats, formatTripDate, formatLongDate,
  todayInJamaica, guestLabel, paymentLabel, earliestDate, latestDate,
  transferLegs, formatLegTime, readableTitle, isUnfiled,
  type ProfileBooking, type ProfileBookingItem,
} from '../../lib/profile-data'
import { experiences } from '../../lib/experiences'

const TODAY = '2026-09-09'

// Real catalog ids so the parish and image lookups exercise real data.
const TOUR_A = experiences[0]
const TOUR_B = experiences.find((e) => e.parish !== TOUR_A.parish)!

function item(over: Partial<ProfileBookingItem> = {}): ProfileBookingItem {
  return { title: 'Tour', destination: 'Ocho Rios', travelers: 2, date: '2026-10-01', experience_id: TOUR_A.id, ...over }
}

function booking(over: Partial<ProfileBooking> = {}): ProfileBooking {
  return {
    id: 'abcdef12-3456-7890-abcd-ef1234567890',
    created_at: '2026-08-01T10:00:00Z',
    paid_at: '2026-08-01T10:01:00Z',
    status: 'paid',
    refund_state: 'none',
    refund_amount: null,
    total_paid: 351,
    booking_items: [item()],
    ...over,
  }
}

describe('booking reference', () => {
  test('matches the format both confirmation pages print', () => {
    expect(bookingRef('abcdef12-3456-7890-abcd-ef1234567890')).toBe('MAPL-ABCDEF12')
  })
})

describe('transfers versus tours', () => {
  test('experience_id 0 is a transfer and has no photo or parish', () => {
    const t = item({ experience_id: 0, title: 'Airport transfer: MBJ to Sandals' })
    expect(isTransfer(t)).toBe(true)
    // The bug this guards: the old code fell back to experiences[0].image,
    // so every transfer showed the first tour's photo.
    expect(itemImage(t)).toBeNull()
    expect(itemParish(t)).toBeNull()
  })

  test('a real catalog id resolves to its own photo and parish', () => {
    const t = item({ experience_id: TOUR_A.id })
    expect(isTransfer(t)).toBe(false)
    expect(itemImage(t)).toBe(TOUR_A.image)
    expect(itemParish(t)).toBe(TOUR_A.parish)
  })

  test('an id the catalog no longer sells is treated as photoless, not as tour one', () => {
    const t = item({ experience_id: 99999 })
    expect(itemImage(t)).toBeNull()
  })
})

describe('splitting upcoming from past', () => {
  test('an undated booking stays visible instead of vanishing', () => {
    // The regression this locks down: `some(d >= today)` and `every(d < today)`
    // are BOTH false for a null date, so the booking matched neither list and
    // disappeared from the guest's profile along with its cancel button.
    const undated = booking({ id: 'u', booking_items: [item({ date: null })] })
    const { upcoming, past } = splitBookings([undated], TODAY)
    expect(upcoming.map((b) => b.id)).toEqual(['u'])
    expect(past).toHaveLength(0)
  })

  test('every booking lands in exactly one list', () => {
    const rows = [
      booking({ id: 'future', booking_items: [item({ date: '2026-12-01' })] }),
      booking({ id: 'pastone', booking_items: [item({ date: '2026-01-01' })] }),
      booking({ id: 'undated', booking_items: [item({ date: null })] }),
      booking({ id: 'today', booking_items: [item({ date: TODAY })] }),
    ]
    const { upcoming, past } = splitBookings(rows, TODAY)
    expect(upcoming.length + past.length).toBe(rows.length)
    expect(past.map((b) => b.id)).toEqual(['pastone'])
    expect(upcoming.map((b) => b.id).sort()).toEqual(['future', 'today', 'undated'])
  })

  test('a booking is past only once its LAST date has gone', () => {
    const mixed = booking({ id: 'm', booking_items: [item({ date: '2026-01-01' }), item({ date: '2026-12-01' })] })
    const { upcoming, past } = splitBookings([mixed], TODAY)
    expect(upcoming.map((b) => b.id)).toEqual(['m'])
    expect(past).toHaveLength(0)
  })

  test('upcoming reads soonest first, past reads most recent first', () => {
    const rows = [
      booking({ id: 'later', booking_items: [item({ date: '2026-12-01' })] }),
      booking({ id: 'sooner', booking_items: [item({ date: '2026-10-01' })] }),
      booking({ id: 'old', booking_items: [item({ date: '2025-01-01' })] }),
      booking({ id: 'recent', booking_items: [item({ date: '2026-08-01' })] }),
    ]
    const { upcoming, past } = splitBookings(rows, TODAY)
    expect(upcoming.map((b) => b.id)).toEqual(['sooner', 'later'])
    expect(past.map((b) => b.id)).toEqual(['recent', 'old'])
  })

  test('earliest and latest read the extremes, and null when there are none', () => {
    const b = booking({ booking_items: [item({ date: '2026-11-05' }), item({ date: '2026-10-02' })] })
    expect(earliestDate(b)).toBe('2026-10-02')
    expect(latestDate(b)).toBe('2026-11-05')
    expect(earliestDate(booking({ booking_items: [item({ date: null })] }))).toBeNull()
  })
})

describe('the next trip', () => {
  test('picks the soonest future item and counts the days to it', () => {
    const rows = [
      booking({ id: 'far', booking_items: [item({ date: '2026-12-01' })] }),
      booking({ id: 'near', booking_items: [item({ date: '2026-09-15', title: 'Dunn’s River' })] }),
    ]
    const next = nextTrip(rows, TODAY)
    expect(next?.booking.id).toBe('near')
    expect(next?.date).toBe('2026-09-15')
    expect(next?.daysAway).toBe(6)
  })

  test('skips refunded bookings, because nobody is coming for them', () => {
    const rows = [
      booking({ id: 'refunded', status: 'refunded', booking_items: [item({ date: '2026-09-10' })] }),
      booking({ id: 'live', booking_items: [item({ date: '2026-09-20' })] }),
    ]
    expect(nextTrip(rows, TODAY)?.booking.id).toBe('live')
  })

  test('a trip happening today still counts as next', () => {
    expect(nextTrip([booking({ booking_items: [item({ date: TODAY })] })], TODAY)?.daysAway).toBe(0)
  })

  test('returns null when nothing is coming', () => {
    expect(nextTrip([booking({ booking_items: [item({ date: '2020-01-01' })] })], TODAY)).toBeNull()
    expect(nextTrip([], TODAY)).toBeNull()
  })
})

describe('countdown wording', () => {
  test('reads naturally across the range', () => {
    expect(daysBetween(TODAY, '2026-09-10')).toBe(1)
    expect(daysBetween(TODAY, '2026-09-09')).toBe(0)
    expect(countdownLabel(0)).toBe('Today')
    expect(countdownLabel(1)).toBe('Tomorrow')
    expect(countdownLabel(6)).toBe('In 6 days')
    expect(countdownLabel(21)).toBe('In 3 weeks')
    expect(countdownLabel(90)).toBe('In 3 months')
  })

  test('spans a month boundary and a leap day without drifting', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3)
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3) // 2028 is a leap year
  })
})

describe('the stats under the name', () => {
  test('counts real parishes, not destinations', () => {
    // The bug this guards: the old count was DISTINCT destination, which is a
    // hotel name for a transfer, so two hotels read as two "parishes".
    const rows = [
      booking({ id: '1', booking_items: [item({ experience_id: TOUR_A.id })] }),
      booking({ id: '2', booking_items: [item({ experience_id: TOUR_B.id })] }),
      booking({ id: '3', booking_items: [
        item({ experience_id: 0, destination: 'Sandals Montego Bay' }),
        item({ experience_id: 0, destination: 'Half Moon' }),
      ] }),
    ]
    const s = profileStats(rows, TODAY)
    expect(s.parishes).toBe(2)      // two real parishes, hotels contribute none
    expect(s.tours).toBe(2)
    expect(s.transfers).toBe(2)
  })

  test('the same tour booked twice is one tour and one parish', () => {
    const rows = [
      booking({ id: '1', booking_items: [item({ experience_id: TOUR_A.id })] }),
      booking({ id: '2', booking_items: [item({ experience_id: TOUR_A.id })] }),
    ]
    const s = profileStats(rows, TODAY)
    expect(s.tours).toBe(1)
    expect(s.parishes).toBe(1)
  })

  test('refunded bookings count for nothing', () => {
    const rows = [booking({ status: 'refunded', booking_items: [item({ date: '2026-01-01' })] })]
    expect(profileStats(rows, TODAY)).toEqual({ trips: 0, parishes: 0, tours: 0, transfers: 0 })
  })

  test('trips counts only bookings that have finished', () => {
    const rows = [
      booking({ id: 'done', booking_items: [item({ date: '2026-01-01' })] }),
      booking({ id: 'coming', booking_items: [item({ date: '2026-12-01' })] }),
      booking({ id: 'undated', booking_items: [item({ date: null })] }),
    ]
    expect(profileStats(rows, TODAY).trips).toBe(1)
  })
})

describe('dates on screen', () => {
  test('render the stated day in every timezone, never the one before', () => {
    expect(formatTripDate('2026-10-17')).toBe('Sat, Oct 17')
    expect(formatLongDate('2026-10-17')).toBe('October 17, 2026')
    // A UTC-noon anchor cannot cross a day boundary in any real offset.
    expect(formatTripDate('2026-01-01')).toBe('Thu, Jan 1')
    expect(formatLongDate('2026-12-31')).toBe('December 31, 2026')
  })

  test('say so plainly when there is no date rather than printing Invalid Date', () => {
    expect(formatTripDate(null)).toBe('Date to be confirmed')
    expect(formatLongDate(null)).toBe('Date to be confirmed')
  })

  test('today in Jamaica rolls at the island midnight, not the browser midnight', () => {
    // 02:00 UTC on the 10th is still 21:00 on the 9th in Jamaica.
    expect(todayInJamaica(new Date('2026-09-10T02:00:00Z'))).toBe('2026-09-09')
    expect(todayInJamaica(new Date('2026-09-10T06:00:00Z'))).toBe('2026-09-10')
  })
})

describe('money and guest wording', () => {
  test('guest counts are singular and plural correctly', () => {
    expect(guestLabel(1)).toBe('1 guest')
    expect(guestLabel(3)).toBe('3 guests')
  })

  test('a refunded booking is struck through and says what came back', () => {
    const r = paymentLabel(booking({ status: 'refunded', refund_amount: 280.8 }))
    expect(r).toEqual({ amount: '$351', note: '$281 refunded', struck: true })
  })

  test('a requested cancellation never reads as cancelled', () => {
    // The booking is still live until an admin approves, and a guest who
    // reads "cancelled" here skips a trip they are still booked on.
    const r = paymentLabel(booking({ refund_state: 'requested' }))
    expect(r.struck).toBe(false)
    expect(r.note).toBe('Cancellation under review')
  })

  test('a declined cancellation says the booking still stands', () => {
    expect(paymentLabel(booking({ refund_state: 'declined' })).note).toBe('Still confirmed')
  })

  test('an ordinary paid booking carries no note', () => {
    expect(paymentLabel(booking())).toEqual({ amount: '$351', note: null, struck: false })
  })
})

describe('transfer legs and titles', () => {
  test('a round trip shows both legs in travel order with their flights', () => {
    const legs = transferLegs(item({
      experience_id: 0,
      arrivalAt: '2026-10-17T14:35:00', arrivalFlight: 'AA1234',
      departureAt: '2026-10-24T06:30:00', departureFlight: 'AA4321',
    }))
    expect(legs.map((l) => l.kind)).toEqual(['arrival', 'departure'])
    expect(legs[0]).toMatchObject({ date: '2026-10-17', time: '2:35 PM', flight: 'AA1234' })
    expect(legs[1]).toMatchObject({ date: '2026-10-24', time: '6:30 AM', flight: 'AA4321' })
  })

  test('a one way never invents the leg it does not have', () => {
    const outbound = transferLegs(item({ experience_id: 0, departureAt: '2026-10-24T06:30:00', departureFlight: 'AA4321' }))
    expect(outbound).toHaveLength(1)
    expect(outbound[0].kind).toBe('departure')
    expect(transferLegs(item({ experience_id: 0 }))).toEqual([])
  })

  test('midnight and noon do not flip the meridiem', () => {
    expect(formatLegTime('2026-10-17T00:05:00')).toBe('12:05 AM')
    expect(formatLegTime('2026-10-17T12:00:00')).toBe('12:00 PM')
    expect(formatLegTime(null)).toBeNull()
    expect(formatLegTime('2026-10-17')).toBeNull()
  })

  test('airline jargon is expanded for the guest', () => {
    expect(readableTitle(item({ title: 'Airport transfer: MBJ to Sandals' })))
      .toBe('Airport transfer: Montego Bay airport to Sandals')
  })
})

describe('bookings the page cannot file', () => {
  test('a booking with no line items is flagged, not dereferenced', () => {
    // The crash this guards: the past-trips grid read booking_items[0]
    // .experience_id straight off an empty array, which threw and blanked
    // the whole profile for that customer.
    const empty = booking({ booking_items: [] })
    expect(isUnfiled(empty)).toBe(true)
    expect(() => splitBookings([empty], TODAY)).not.toThrow()
    expect(profileStats([empty], TODAY).trips).toBe(0)
    expect(nextTrip([empty], TODAY)).toBeNull()
  })

  test('an ordinary booking is not flagged', () => {
    expect(isUnfiled(booking())).toBe(false)
  })
})
