import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  PARTY_COPY, PARTY_MAX, bookerName, driverUpdateForParty, partyCap, partyEmail, partyFooter, partyTripLines, signName,
} from '@/lib/travel-party'
import { buildDriverUpdate } from '@/lib/driver-update'
import type { Driver } from '@/lib/drivers'
import DriverUpdate from '@/emails/DriverUpdate'
import TransferDayOf from '@/emails/TransferDayOf'
import TravelPartyTrip from '@/emails/TravelPartyTrip'
import TravelPartyCancelled from '@/emails/TravelPartyCancelled'
import TransferConfirmed from '@/emails/TransferConfirmed'
import BookingConfirmed from '@/emails/BookingConfirmed'

/**
 * The travel party (owner, Nov 24 2026): after paying, a booker adds the
 * people travelling with them, and each gets their own copy of that trip's
 * emails and nothing else. These are the pure rules and every email a party
 * member can receive.
 */

describe('an address', () => {
  test('is stored trimmed and in lower case, or refused', () => {
    expect(partyEmail('  Ana.Brown+trip@Example.COM ')).toBe('ana.brown+trip@example.com')
    for (const bad of ['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', 'a@b.c d', null, undefined, 42, {}]) {
      expect(partyEmail(bad), String(bad)).toBeNull()
    }
    expect(partyEmail(`${'a'.repeat(250)}@x.co`)).toBeNull()
  })

  test('the same shape the database checks (migration 042)', () => {
    const db = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
    for (const raw of ['a@b.co', 'first.last@sub.example.org', 'x+y@ex.travel']) {
      const e = partyEmail(raw)!
      expect(e).toBe(e.trim().toLowerCase())
      expect(db.test(e)).toBe(true)
      expect(e.length).toBeGreaterThanOrEqual(6)
    }
  })
})

describe('how many people a booking may add', () => {
  test('the party size: passengers on a ride, travelers on a tour', () => {
    expect(partyCap([{ item_type: 'transfer', passengers: 4 }])).toBe(4)
    expect(partyCap([{ item_type: 'experience', travelers: 3 }, { item_type: 'experience', travelers: 5 }])).toBe(5)
    expect(partyCap([{ item_type: 'transfer', passengers: 2, travelers: 9 }])).toBe(2)
  })
  test('at least one, at most twelve, whatever the data says', () => {
    expect(partyCap([])).toBe(1)
    expect(partyCap(null)).toBe(1)
    expect(partyCap([{ item_type: 'experience', travelers: 0 }])).toBe(1)
    expect(partyCap([{ item_type: 'experience', travelers: 40 }])).toBe(PARTY_MAX)
    expect(partyCap([{ item_type: 'transfer', passengers: Number.NaN }])).toBe(1)
  })
})

describe('naming the booker', () => {
  test('the first name only, never an address or a link', () => {
    expect(bookerName('  Ana Maria ')).toBe('Ana')
    expect(bookerName('ana@example.com')).toBeNull()
    expect(bookerName('https://x.y')).toBeNull()
    expect(bookerName('')).toBeNull()
    expect(bookerName(null)).toBeNull()
  })
  test('the sign at arrivals shows their name', () => {
    expect(signName('Ana')).toBe("Ana's name")
    expect(signName('James')).toBe("James' name")
    expect(signName(null)).toBe('the name on the booking')
  })
  test('every party email says why it came', () => {
    expect(partyFooter('Ana')).toBe("Ana added your email to their MAPL Tours Jamaica booking, so we email you about this trip, and once after it to ask for a review. We use your address for nothing else.")
    expect(partyFooter(null)).toMatch(/^The person who booked added your email/)
  })
})

describe('the trip in one line per ride or tour', () => {
  test('rides: where and the days, read from the wall clock in any zone', () => {
    expect(partyTripLines([{ item_type: 'transfer', title: null, destination: 'Negril', date: null, hotel: 'Riu Negril', arrival_at: '2026-11-25T23:30:00+00:00', departure_at: '2026-12-02T09:00:00+00:00' }], true))
      .toEqual(['Airport ride · Riu Negril · arrival Wed, Nov 25, departure Wed, Dec 2'])
  })
  test('tours: by day, without any ride line, never money', () => {
    const lines = partyTripLines([
      { item_type: 'experience', title: 'Rick’s Cafe', destination: 'Negril', date: '2026-11-28', hotel: null, arrival_at: null, departure_at: null },
      { item_type: 'transfer', title: 'Transport', destination: 'x', date: '2026-11-20', hotel: 'x', arrival_at: null, departure_at: null },
      { item_type: 'experience', title: 'Dunn’s River Falls', destination: 'Ocho Rios', date: '2026-11-26', hotel: null, arrival_at: null, departure_at: null },
    ], false)
    expect(lines).toEqual(['Dunn’s River Falls · Thu, Nov 26', 'Rick’s Cafe · Sat, Nov 28'])
  })
})

describe('what the booker reads about an address', () => {
  test('plain sentences: no em dash, and the brand in full', () => {
    const all = [
      PARTY_COPY.invalid, PARTY_COPY.own, PARTY_COPY.exists, PARTY_COPY.stopped, PARTY_COPY.full(1), PARTY_COPY.full(4),
      PARTY_COPY.notPaid, PARTY_COPY.notAllowed, PARTY_COPY.busy, PARTY_COPY.failed, PARTY_COPY.added('a@b.co'),
      PARTY_COPY.addedNotSent('a@b.co'), PARTY_COPY.removed('a@b.co'),
    ]
    for (const s of all) {
      expect(s).not.toContain('—')
      expect(s).not.toMatch(/MAPL Tours(?! Jamaica)/)
      expect(s).toMatch(/[.]$/)
    }
    expect(PARTY_COPY.full(1)).toBe('You have added 1 person, the most for this booking. Remove someone to add another.')
    expect(PARTY_COPY.full(4)).toBe('You have added 4 people, the most for this booking. Remove someone to add another.')
  })
})

/* ── The emails ─────────────────────────────────────────────────────── */

const STOP = 'https://mapltours.com/api/travel-party/stop?p=11111111-1111-4111-8111-111111111111&t=sig'

const rideProps = {
  bookingRef: 'MAPL-ABCD1234',
  addedBy: 'Ana',
  kind: 'transfer' as const,
  transfers: [{ destination: 'Riu Negril', tripType: 'round_trip' as const, passengers: 3, arrivalAt: '2026-11-25T15:09:00+00:00', arrivalFlight: 'aa1311', departureAt: '2026-12-02T09:30:00+00:00', departureFlight: 'aa922' }],
  tours: [],
  pickup: null,
  supportEmail: 'contact@mapltours.com',
  stopUrl: STOP,
}

describe("a party member's copy of the confirmation", () => {
  test('the trip and nothing else: no price, no payment, no contact details, no way to cancel', async () => {
    const text = await render(TravelPartyTrip(rideProps), { plainText: true })
    expect(text).toContain('Ana booked this airport ride with MAPL Tours Jamaica and asked us to send you the details.')
    expect(text).toContain('Riu Negril')
    expect(text).toContain('Round trip · 3 passengers')
    expect(text).toMatch(/Wed, Nov 25, 2026, 3:09 PM Jamaica time · flight AA1311/)
    expect(text).toMatch(/Hotel pickup Wed, Dec 2, 2026, 9:30 AM Jamaica time · flight AA922/)
    expect(text).toContain("MAPL Tours Jamaica sign showing Ana's name")
    expect(text).not.toMatch(/\$\s?\d/)
    for (const word of ['Total', 'Paid', 'paid', 'refund', 'Refund', 'cancellation', 'Profile', 'Facebook']) expect(text).not.toContain(word)
    expect(text).not.toContain('—')
  })

  test('ends with why it came and a way to stop them', async () => {
    const html = await render(TravelPartyTrip(rideProps))
    expect(html).toContain('Ana added your email to their MAPL Tours Jamaica booking')
    expect(html).toContain(`href="${STOP.replace(/&/g, '&amp;')}"`)
    expect(html).toContain('Stop these emails')
  })

  test('a tour: the days, the place and the pickup; the guide confirms with the booker', async () => {
    const text = await render(TravelPartyTrip({
      ...rideProps, kind: 'tour', transfers: [], pickup: 'Riu Montego Bay (Montego Bay)',
      tours: [{ title: 'Dunn’s River Falls Climb', destination: 'Ocho Rios', date: '2026-11-26', travelers: 2 }],
    }), { plainText: true })
    expect(text).toContain('Ana booked this tour with MAPL Tours Jamaica')
    expect(text).toContain('Thu, Nov 26, 2026 · Ocho Rios · 2 travelers')
    expect(text).toContain('Riu Montego Bay (Montego Bay)')
    expect(text).toContain('Your guide confirms the pickup time with Ana 24 to 48 hours before.')
    expect(text).not.toMatch(/\$\s?\d/)
  })

  test('with no first name on the booking it still reads', async () => {
    const text = await render(TravelPartyTrip({ ...rideProps, addedBy: null }), { plainText: true })
    expect(text).toContain('Someone you are traveling with booked this airport ride')
    expect(text).toContain('a MAPL Tours Jamaica sign showing the name on the booking')
  })
})

describe("a party member's cancellation notice", () => {
  test('the trip is off, the trip only, never money', async () => {
    const text = await render(TravelPartyCancelled({ bookingRef: 'MAPL-ABCD1234', addedBy: 'Ana', isTransfer: true, lines: ['Airport ride · Riu Negril · arrival Wed, Nov 25'], supportEmail: 'contact@mapltours.com' }), { plainText: true })
    expect(text.toLowerCase()).toContain('this airport ride is cancelled.')
    expect(text).toContain('Airport ride · Riu Negril · arrival Wed, Nov 25')
    expect(text).toContain('ask Ana or write to')
    expect(text).toContain('This is the last email about this trip.')
    expect(text).not.toMatch(/\$\s?\d|refund|Refund/)
  })
})

const dayOf = {
  bookingRef: 'MAPL-ABCD1234', firstName: 'Ana', leg: 'arrival' as const, whenLabel: 'Wed, Nov 25, 3:09 PM', dayLabel: 'Today' as const,
  pickupLabel: 'Sangster International Airport (MBJ), Montego Bay', dropoffLabel: 'Riu Negril', flight: 'AA1311', passengers: 3,
  driverName: 'Devon Brown', driverPhone: '+1 876 555 0100', driverVehicle: 'Toyota Noah, black', driverPlate: 'PJ 1234', supportEmail: 'contact@mapltours.com',
}

describe('the driver details before pickup', () => {
  test("the booker's copy is exactly as before: their name, the sign with their name", async () => {
    const text = await render(TransferDayOf(dayOf), { plainText: true })
    expect(text.toLowerCase()).toContain('welcome to jamaica, ana.')
    expect(text).toContain('a MAPL Tours Jamaica sign showing your name')
    expect(text).toContain('sign with your name on it')
    expect(text).not.toContain('Stop these emails')
  })
  test("a party member's copy: no name, the sign shows the booker's, and a way to stop", async () => {
    const html = await render(TransferDayOf({ ...dayOf, firstName: null, party: { addedBy: 'Ana', stopUrl: STOP } }))
    const text = await render(TransferDayOf({ ...dayOf, firstName: null, party: { addedBy: 'Ana', stopUrl: STOP } }), { plainText: true })
    expect(text.toLowerCase()).toContain('welcome to jamaica.')
    expect(text.toLowerCase()).not.toContain('welcome to jamaica, ')
    expect(text).toContain("sign showing Ana's name")
    expect(text).toContain("sign with Ana's name on it")
    expect(text).not.toContain('your name')
    expect(text).toContain('Devon Brown')
    expect(text).toContain('PJ 1234')
    expect(html).toContain('Stop these emails')
  })
  test('the departure and tomorrow wording for a party member', async () => {
    const tomorrow = await render(TransferDayOf({ ...dayOf, dayLabel: 'Tomorrow', party: { addedBy: 'Ana', stopUrl: STOP } }), { plainText: true })
    expect(tomorrow.toLowerCase()).toContain('see you tomorrow.')
    const back = await render(TransferDayOf({ ...dayOf, leg: 'departure', party: { addedBy: 'Ana', stopUrl: STOP } }), { plainText: true })
    expect(back.toLowerCase()).toContain('safe travels.')
    expect(back.toLowerCase()).not.toContain('safe travels, ana')
  })
})

const driver: Driver = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000', email: null, active: true,
}
const rideBooking = {
  id: 'abcd1234-6c73-444e-83c6-1f79f15a59d1',
  booking_type: 'transfer', status: 'paid', email: 'guest@example.com', first_name: 'Ana',
  driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PJ 1234',
  dispatch: { dayof_arrival_sent: '2026-11-18T06:00:54.936Z' },
  booking_items: [{
    hotel: 'Grand Palladium Jamaica, Lucea', trip_type: 'round_trip', passengers: 2,
    arrival_at: '2026-11-18T13:09:00+00:00', arrival_flight: '521', departure_at: '2026-11-25T16:22:00+00:00', departure_flight: '922',
  }],
}

describe('a driver change', () => {
  test("the party's copy differs from the booker's only where the sign names someone, plus why it came", async () => {
    const { props } = buildDriverUpdate(rideBooking as never, 'arrival', driver, Date.parse('2026-11-18T13:35:00Z'))
    // The booker's wording this depends on. If it changes, this test says so before a party member is told "your name".
    expect(props.lead).toContain('sign showing your name')
    expect(props.steps.flat().some((p) => p.t === ' sign with your name on it.')).toBe(true)

    const party = driverUpdateForParty(props, 'Ana', STOP)
    const text = await render(DriverUpdate(party), { plainText: true })
    expect(text).not.toContain('your name')
    expect(text).toContain("sign showing Ana's name")
    expect(text).toContain("sign with Ana's name on it")
    expect(text).toContain('Ana added your email to their MAPL Tours Jamaica booking')
    expect(await render(DriverUpdate(party))).toContain('Stop these emails')
    // Everything else is the booker's email, line for line.
    expect({ ...party, lead: props.lead, steps: props.steps, party: undefined }).toEqual({ ...props, party: undefined })
    // And the booker's own copy never carries a stop link.
    expect(await render(DriverUpdate(props))).not.toContain('Stop these emails')
  })
})

describe("the booker's confirmation", () => {
  const base = {
    bookingRef: 'MAPL-ABCD1234', firstName: 'Ana', customerPhone: null, totalPaid: 194, currency: 'USD',
    transfers: rideProps.transfers.map((t) => ({ ...t, zone: 'D', priceUsd: 194 })),
  }
  test('carries the travel party link only when there is one', async () => {
    const url = 'https://mapltours.com/travel-party?b=abcd1234-6c73-444e-83c6-1f79f15a59d1&trip_proof=b_x'
    const withLink = await render(TransferConfirmed({ ...base, travelPartyUrl: url }))
    expect(withLink).toContain('Traveling with others?')
    expect(withLink).toContain('Add your travel party')
    expect(withLink).toContain(url.replace(/&/g, '&amp;'))
    const without = await render(TransferConfirmed(base))
    expect(without).not.toContain('Add your travel party')
  })
  test('the tour confirmation too', async () => {
    const tour = {
      bookingRef: 'MAPL-ABCD1234', firstName: 'Ana', phone: null, pickup: null, dropoff: null, totalPaid: 228, currency: 'USD',
      items: [{ title: 'Dunn’s River Falls Climb', destination: 'Ocho Rios', date: '2026-11-26', travelers: 2, linePrice: 228 }],
    }
    expect(await render(BookingConfirmed({ ...tour, travelPartyUrl: 'https://mapltours.com/travel-party?b=x' }))).toContain('Add your travel party')
    expect(await render(BookingConfirmed(tour))).not.toContain('Add your travel party')
  })
})
