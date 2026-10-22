import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DriverDashboard, { TripCard } from '../../components/driver/DriverDashboard'
import { driverTrip } from '../../lib/driver'

/**
 * What the driver reads for a ride follows the legs it has.
 *
 * The driver's card printed "Lands -" for a hotel-to-airport one-way, always
 * drew an arrival leg ("Map to hotel", airport to hotel), and drew a departure
 * leg only for round trips, so the driver's own app showed no pickup time for
 * that ride. Its calendar link would also have read a second payout leg that a
 * one-way does not have, and quoted "$0.00".
 *
 * Dates are far in the future so the "next pickup" hero is always present.
 */

const booking = (item: Record<string, unknown>) => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  first_name: 'Ada', last_name: 'Lovelace', phone: '+1 555 0100',
  subtotal: 100, special_requests: null, dispatch: {},
  booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', passengers: 2, price_per_person: 126, ...item }],
})

const trip = (item: Record<string, unknown>) => driverTrip(booking(item))!

const departureOnly = trip({
  trip_type: 'one_way', departure_at: '2099-10-18T14:30:00+00:00', departure_flight: 'VS0166',
})
const arrivalOnly = trip({
  trip_type: 'one_way', arrival_at: '2099-10-18T21:05:00+00:00', arrival_flight: 'VS0165',
})
const roundTrip = trip({
  trip_type: 'round_trip',
  arrival_at: '2099-10-11T21:05:00+00:00', arrival_flight: 'VS0165',
  departure_at: '2099-10-18T14:30:00+00:00', departure_flight: 'VS0166',
})

/** The card, opened so its leg timeline is on the page. */
const card = (t: ReturnType<typeof trip>) =>
  renderToStaticMarkup(<TripCard t={t} open onToggle={() => {}} />)

const dashboard = (t: ReturnType<typeof trip>) =>
  renderToStaticMarkup(<DriverDashboard trips={[t]} driverLabel="Collin" />)

/** What a person reads on the page. */
const page = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

/** The distinct Google Calendar links on the page, as { title, location, details }. */
const calendars = (html: string) => {
  const urls = new Set(Array.from(html.matchAll(/href="(https:\/\/calendar\.google\.com\/[^"]*)"/g)).map((m) => m[1].replace(/&amp;/g, '&')))
  return Array.from(urls).map((u) => {
    const p = new URL(u).searchParams
    // \s also reads the narrow no-break space some ICU builds put before "PM".
    const read = (k: string) => (p.get(k) ?? '').replace(/\s/g, ' ')
    return { title: read('text'), location: read('location'), details: read('details') }
  })
}

describe('a hotel-to-airport one-way', () => {
  const html = card(departureOnly)
  const text = page(html)

  test('the card header shows the pickup and the way the ride runs, not "Lands"', () => {
    expect(text).toContain('Riu Negril → MBJ')
    expect(text).toContain('Hotel pickup')
    expect(text).toMatch(/2:30\s?PM/)
    expect(text).not.toContain('Lands')
    expect(text).not.toContain('MBJ → Riu Negril')
  })

  test('the timeline is its departure, with the hotel map the arrival leg would have carried', () => {
    expect(text).toContain('Departure · hotel to airport')
    expect(text).toContain('This is the pickup time the guest requested.')
    expect(text).toContain('Map to hotel')
    expect(text).not.toContain('Arrival · airport to hotel')
  })

  test('its one calendar event is the pickup, paid once in full', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(1)
    expect(cal[0].title).toContain('departure pickup')
    expect(cal[0].location).toBe('Riu Negril')
    expect(cal[0].details).toContain('Hotel pickup 2:30 PM Jamaica time')
    expect(cal[0].details).toContain('Your pay: $100.00')
    expect(cal[0].details).not.toContain('leg 2 of 2')
    expect(cal[0].details).not.toContain('$0.00')
  })

  test('it is paid once, before the ride', () => {
    expect(text).toContain('Before the ride')
    expect(text).toContain('You get $100.00')
  })

  test('the next-pickup hero names it as hotel to airport', () => {
    const t = page(dashboard(departureOnly))
    expect(t).toContain('Next pickup · hotel to airport')
    expect(t).toContain('pickup time requested by the guest')
  })
})

describe('an airport-to-hotel one-way', () => {
  const html = card(arrivalOnly)
  const text = page(html)

  test('is unchanged: lands, an arrival leg and no departure', () => {
    expect(text).toContain('MBJ → Riu Negril')
    expect(text).toContain('Lands')
    expect(text).toMatch(/9:05\s?PM/)
    expect(text).toContain('Arrival · airport to hotel')
    expect(text).toContain('Map to hotel')
    expect(text).not.toContain('Departure ·')
    expect(text).not.toContain('Hotel pickup')
  })

  test('has its one calendar event, paid once in full', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(1)
    expect(cal[0].title).not.toContain('departure')
    expect(cal[0].details).toContain('Your pay: $100.00')
    expect(cal[0].details).not.toContain('leg 1 of 2')
  })
})

describe('a round trip', () => {
  const html = card(roundTrip)
  const text = page(html)

  test('shows its arrival, its return pickup and both legs', () => {
    expect(text).toContain('MBJ → Riu Negril')
    expect(text).toContain('Lands')
    expect(text).toContain('Return pickup')
    expect(text).toContain('Arrival · airport to hotel')
    expect(text).toContain('Departure · hotel to airport')
  })

  test('its two calendar events are legs 1 and 2 of 2, each paid half', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(2)
    expect(cal[0].details).toContain('Your pay: $50.00 (leg 1 of 2)')
    expect(cal[1].details).toContain('Your pay: $50.00 (leg 2 of 2)')
  })

  test('is paid before each pickup', () => {
    expect(text).toContain('Before the arrival pickup')
    expect(text).toContain('Before the departure pickup')
  })
})

describe('rows the old gates already handled are still handled the old way', () => {
  test('a round trip missing its departure time shows its arrival only', () => {
    const t = trip({ trip_type: 'round_trip', arrival_at: '2099-10-11T21:05:00+00:00', arrival_flight: 'VS0165', departure_at: null })
    const html = card(t)
    const text = page(html)
    expect(text).toContain('Lands')
    expect(text).toContain('Arrival · airport to hotel')
    expect(text).not.toContain('Return pickup')
    expect(text).not.toContain('Departure ·')
    expect(calendars(html)).toHaveLength(1)
  })

  test('a one-way carrying both timestamps stays an arrival and ignores the stray departure', () => {
    const t = trip({
      trip_type: 'one_way',
      arrival_at: '2099-10-18T21:05:00+00:00', arrival_flight: 'VS0165',
      departure_at: '2099-10-25T14:30:00+00:00', departure_flight: 'VS0166',
    })
    const html = card(t)
    const text = page(html)
    expect(text).toContain('Lands')
    expect(text).toContain('Arrival · airport to hotel')
    expect(text).not.toContain('Departure ·')
    expect(text).not.toContain('Hotel pickup')
    expect(calendars(html)).toHaveLength(1)
  })
})
