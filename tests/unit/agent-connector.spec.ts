/**
 * The connector's tools against the in-browser WebMCP tools: same refusals,
 * same rides, and links that reopen to exactly what was validated.
 */
import { describe, expect, test } from 'vitest'
import { buildConnectorTools } from '@/lib/agent/connector'
import { parseHandoff } from '@/lib/agent/booking-link'
import { capturingTools, rideHandoff, toolNamed } from '@/lib/agent/capture'
import { DESTINATIONS } from '@/lib/airport-transfers'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'

const NOW = new Date('2026-10-01T12:00:00Z')
const now = () => NOW
const O = 'https://mapltours.com'
const tools = buildConnectorTools({ origin: O, via: 'muse', now })
const tool = (name: string) => tools.find((t) => t.name === name)!

// A spread of real hotels across every zone, plus the area fallbacks.
const hotels = [...DESTINATIONS.filter((_, i) => i % 23 === 0).map((d) => d.id), 'riu-negril', 'Sandals Negril', 'nowhere at all']
const shapes: Array<Record<string, unknown>> = [
  { trip_type: 'round_trip', arrival_at: '2027-03-05T14:30', arrival_flight: 'AA1234', departure_flight_at: '2027-03-12T16:05', departure_flight: 'AA1235' },
  { trip_type: 'round_trip', arrival_at: '2027-03-05T14:30', departure_at: '2027-03-12T09:00' },
  { trip_type: 'round_trip' },
  { trip_type: 'one_way', direction: 'airport_to_hotel', arrival_at: '2027-03-05T23:59', arrival_flight: 'b6 77' },
  { trip_type: 'one_way', direction: 'hotel_to_airport', departure_flight_at: '2027-03-12T06:00', departure_flight: 'WS2600' },
  { trip_type: 'one_way' },
  { trip_type: 'one_way', direction: 'airport_to_hotel', departure_at: '2027-03-12T09:00' },
  { trip_type: 'round_trip', arrival_at: '2027-03-12T10:00', departure_at: '2027-03-05T10:00' },
  { trip_type: 'round_trip', arrival_at: '2026-10-02T06:00' },
  { trip_type: 'round_trip', arrival_at: '2027-02-30T10:00' },
  { trip_type: 'round_trip', arrival_at: '2027-03-05' },
  { trip_type: 'sideways' },
]
const parties = [0, 1, 4, 5, 7, 8]

describe('start_transfer_booking matches the in-browser tool case for case', () => {
  const cases = hotels.flatMap((destination) => shapes.flatMap((shape) => parties.map((passengers) => ({ destination, passengers, ...shape }))))
  test(`${cases.length} combinations`, async () => {
    let ok = 0
    for (const input of cases) {
      const { tools: browser, captured } = capturingTools(O, now)
      const expected = await toolNamed(browser, 'start_transfer_booking').execute(input)
      const got = await tool('start_transfer_booking').execute(input)
      if (typeof expected.error === 'string') {
        expect(got, JSON.stringify(input)).toEqual(expected)
        continue
      }
      ok++
      expect(got.status).toBe('booking_link_ready')
      expect(got.ride).toEqual(expected.ride)
      const parsed = parseHandoff(new URL(String(got.bookingUrl)).searchParams, NOW)
      expect(parsed, JSON.stringify(input)).toEqual({ ok: true, handoff: rideHandoff(captured) })
    }
    // The matrix must exercise both outcomes, or it proves nothing.
    expect(ok).toBeGreaterThan(50)
    expect(ok).toBeLessThan(cases.length)
  })
})

describe('start_tour_booking', () => {
  test('requires a date, so checkout never opens on a day nobody chose', async () => {
    const r = await tool('start_tour_booking').execute({ tour: 'bamboo-rafting-on-the-martha-brae', guests: 2 })
    expect(String(r.error)).toContain('date is required')
  })

  test('refuses what the in-browser tool refuses', async () => {
    for (const input of [
      { tour: 'zzz', guests: 2, date: '2027-03-07' },
      { tour: 'bamboo-rafting-on-the-martha-brae', guests: 13, date: '2027-03-07' },
      { tour: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2026-10-01' },
      { tour: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '07/03/2027' },
    ]) {
      const { tools: browser } = capturingTools(O, now)
      const expected = await toolNamed(browser, 'start_tour_booking').execute(input)
      expect(await tool('start_tour_booking').execute(input), JSON.stringify(input)).toEqual(expected)
    }
  })

  test('a tour link reopens to the tour, date, party and pickup', async () => {
    const r = await tool('start_tour_booking').execute({ tour: "Rick's Cafe", guests: 4, date: '2027-03-09', pickup_hotel: 'Riu Negril' })
    expect(r.status).toBe('booking_link_ready')
    const parsed = parseHandoff(new URL(String(r.bookingUrl)).searchParams, NOW)
    expect(parsed).toEqual({ ok: true, handoff: { kind: 'tour', slug: 'ricks-cafe-cliff-diving-and-sunset', guests: 4, date: '2027-03-09', pickupHotel: 'Riu Negril' } })
  })
})

describe('get_booking_terms', () => {
  test('states the live cancellation policy and the 24-hour rule', async () => {
    const r = await tool('get_booking_terms').execute({})
    expect(r.cancellation).toEqual({ summary: CANCELLATION_SUMMARY.short, detail: CANCELLATION_SUMMARY.detail })
    expect(JSON.stringify(r)).not.toContain('Free to cancel')
    expect(JSON.stringify(r)).toContain("24 hours' notice")
    expect(JSON.stringify(r)).not.toMatch(/[–—]/)
  })
})

describe('every tool', () => {
  test('descriptions are plain, short, and free of dashes the brand avoids', () => {
    for (const t of tools) {
      expect(t.description.length, t.name).toBeLessThan(900)
      expect(t.description, t.name).not.toMatch(/[–—]/)
      expect(t.title.length, t.name).toBeLessThan(40)
    }
  })

  test('a group too big to book online learns where to go before it asks', () => {
    // Through /mcp the SDK's schema check answers 8+ passengers with only "must be <= 7".
    expect(tool('get_transfer_quote').description).toContain('8 or more are quoted by email at contact@mapltours.com')
  })

  test('nothing listed without the payment switch can charge', () => {
    expect(tools.map((t) => t.name)).not.toContain('book_and_pay_transfer')
    for (const t of tools) expect(t.annotations.readOnlyHint, t.name).toBe(true)
  })
})

describe('every result that hands over a booking link states the cancellation terms', () => {
  // Muse's policies: no non-refundable transaction without notice of the cancellation terms and penalties.
  test.each([
    ['get_transfer_quote', { destination: 'riu-negril', trip_type: 'round_trip', passengers: 2 }],
    ['start_transfer_booking', { destination: 'riu-negril', trip_type: 'round_trip', passengers: 2 }],
    ['start_tour_booking', { tour: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-03-07' }],
  ])('%s', async (name, input) => {
    const r = await tool(name).execute(input)
    expect(typeof r.bookingUrl).toBe('string')
    expect(r.cancellation).toEqual({ summary: CANCELLATION_SUMMARY.short, detail: CANCELLATION_SUMMARY.detail })
    expect(CANCELLATION_SUMMARY.detail).toContain('non-refundable')
  })
})

describe('get_transfer_quote carries a booking link for exactly the quoted ride', () => {
  test.each([
    [{ destination: 'riu-negril' }, { tripType: 'round_trip', passengers: 2, fromAirport: true }],
    [{ destination: 'Riu Negril', trip_type: 'one_way', passengers: 3 }, { tripType: 'one_way', passengers: 3, fromAirport: true }],
    [{ destination: 'riu-negril', trip_type: 'one_way', direction: 'hotel_to_airport', passengers: 6 }, { tripType: 'one_way', passengers: 6, fromAirport: false }],
  ])('%o', async (input, want) => {
    const r = await tool('get_transfer_quote').execute(input)
    expect(typeof r.priceUsd).toBe('number')
    const parsed = parseHandoff(new URL(String(r.bookingUrl)).searchParams, NOW)
    expect(parsed).toEqual({ ok: true, handoff: { kind: 'ride', destinationId: 'riu-negril', ...want } })
    expect(new URL(String(r.bookingUrl)).searchParams.get('utm_content')).toBe('get_transfer_quote')
  })

  test('a refused quote has no link', async () => {
    const r = await tool('get_transfer_quote').execute({ destination: 'riu-negril', passengers: 9 })
    expect(r.error).toBeTruthy()
    expect(r.bookingUrl).toBeUndefined()
  })
})
