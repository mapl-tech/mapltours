import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DispatchConsole from '../../components/admin/DispatchConsole'

/**
 * What the operator sees for a ride follows the legs it has.
 *
 * The console gated the departure on `isRoundTrip` and showed the arrival
 * unconditionally, so a hotel-to-airport one-way opened with an empty "Arrival"
 * block (no date, "Flight lands -"), no pickup time anywhere, no calendar
 * button, no way to send the departure's day-of email, and a driver reminder
 * that sent the driver to the airport on a date of "-".
 */

const booking = (item: Record<string, unknown>) => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  first_name: 'Ada', last_name: 'Lovelace', phone: '+1 555 0100', email: 'ada@example.com', country: 'US',
  status: 'paid', booking_type: 'transfer',
  subtotal: 100, booking_fee: 26, total_paid: 126, coupon_code: null, coupon_discount: null,
  driver_name: 'Collin', driver_phone: '+1 876 919-7534', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PM 9482',
  confirmation_email_sent_at: null,
  dispatch: {},
  booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', passengers: 2, price_per_person: 126, ...item }],
})

const departureOnly = booking({
  trip_type: 'one_way', departure_at: '2026-10-18T14:30:00+00:00', departure_flight: 'VS0166',
})
const arrivalOnly = booking({
  trip_type: 'one_way', arrival_at: '2026-10-18T21:05:00+00:00', arrival_flight: 'VS0165',
})
const roundTrip = booking({
  trip_type: 'round_trip',
  arrival_at: '2026-10-18T21:05:00+00:00', arrival_flight: 'VS0165',
  departure_at: '2026-10-25T14:30:00+00:00', departure_flight: 'VS0166',
})

const markup = (b: ReturnType<typeof booking>) =>
  renderToStaticMarkup(<DispatchConsole booking={b} stripeFee={null} />)

/** What a person reads on the page. */
const page = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/[\u202f\u00a0]/g, ' ').replace(/\s+/g, ' ')

/** The WhatsApp messages the page's buttons would send, decoded. */
const messages = (html: string) =>
  Array.from(html.matchAll(/href="https:\/\/wa\.me\/[^"?]*\?text=([^"]*)"/g))
    .map((m) => decodeURIComponent(m[1]).replace(/[\u202f\u00a0]/g, ' '))

const reminder = (html: string) => messages(html).find((m) => m.includes('TRANSFER REMINDER')) ?? ''

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
  const html = markup(departureOnly)
  const text = page(html)

  test('shows its pickup, not an empty arrival', () => {
    expect(text).toContain('Riu Negril → Sangster International Airport (MBJ)')
    expect(text).toContain('Hotel pickup 2:30 PM')
    expect(text).toContain('Departure')
    expect(text).not.toContain('Flight lands')
    expect(text).not.toContain('Add arrival to Google Calendar')
  })

  test('has its calendar button and its day-of email button', () => {
    expect(text).toContain('Add departure to Google Calendar')
    expect(text).toContain('Send day-of email')
  })

  test('tracks the flight it has', () => {
    expect(text).toContain('Departure flight')
    expect(text).toContain('VS0166')
    expect(text).not.toContain('Arrival flight')
  })

  test('its one calendar event is the pickup, and does not claim to be leg 2 of 2', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(1)
    expect(cal[0].title).toContain('departure pickup')
    expect(cal[0].location).toBe('Riu Negril')
    expect(cal[0].details).toContain('Hotel pickup 2:30 PM Jamaica time')
    expect(cal[0].details).not.toContain('leg 2 of 2')
    // A one-way is paid once, in full.
    expect(cal[0].details).toContain('Driver pay: $100.00')
  })

  test('the driver reminder sends the driver to the hotel, with the date and time', () => {
    const m = reminder(html)
    expect(m).toContain('Pick up: Riu Negril')
    expect(m).toContain('Drop-off: Sangster International Airport (MBJ)')
    expect(m).toContain('Time: 2:30 PM Jamaica time')
    expect(m).not.toContain('Date: -')
    expect(m).not.toContain('Pick up: Sangster')
  })
})

describe('an airport-to-hotel one-way', () => {
  const html = markup(arrivalOnly)
  const text = page(html)

  test('is unchanged: an arrival and no departure', () => {
    expect(text).toContain('Sangster International Airport (MBJ) → Riu Negril')
    expect(text).toContain('Flight lands 9:05 PM')
    expect(text).toContain('Add arrival to Google Calendar')
    expect(text).toContain('Arrival flight')
    expect(text).not.toContain('Departure flight')
    expect(text).not.toContain('Add departure to Google Calendar')
  })

  test('the driver reminder still meets the flight', () => {
    const m = reminder(html)
    expect(m).toContain('Pick up: Sangster International Airport (MBJ)')
    expect(m).toContain('Drop-off: Riu Negril')
    expect(m).toContain('Time: 9:05 PM Jamaica time')
  })

  test('has its one calendar event, for the arrival', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(1)
    expect(cal[0].title).toContain('pickup')
    expect(cal[0].title).not.toContain('departure')
  })
})

describe('a round trip', () => {
  const html = markup(roundTrip)
  const text = page(html)

  test('shows both legs, both calendar buttons and both flights', () => {
    expect(text).toContain('Add arrival to Google Calendar')
    expect(text).toContain('Add departure to Google Calendar')
    expect(text).toContain('Arrival flight')
    expect(text).toContain('Departure flight')
  })

  test('its two calendar events are legs 1 and 2 of 2', () => {
    const cal = calendars(html)
    expect(cal).toHaveLength(2)
    expect(cal[0].details).toContain('(leg 1 of 2)')
    expect(cal[1].details).toContain('(leg 2 of 2)')
  })

  test('the first driver reminder is for the arrival', () => {
    expect(reminder(html)).toContain('Pick up: Sangster International Airport (MBJ)')
  })
})

describe('rows the old gates already handled are still handled the old way', () => {
  test('a round trip missing its departure time keeps its departure flight block, and shows no departure leg', () => {
    const html = markup(booking({
      trip_type: 'round_trip', arrival_at: '2026-10-18T21:05:00+00:00', arrival_flight: 'VS0165', departure_at: null,
    }))
    const text = page(html)
    expect(text).toContain('Arrival flight')
    expect(text).toContain('Departure flight')
    expect(text).not.toContain('Hotel pickup')
    expect(text).not.toContain('Add departure to Google Calendar')
    expect(calendars(html)).toHaveLength(1)
  })

  test('a round trip with no times at all keeps its arrival block and both flight blocks', () => {
    const html = markup(booking({ trip_type: 'round_trip' }))
    const text = page(html)
    expect(text).toContain('Sangster International Airport (MBJ) → Riu Negril')
    expect(text).toContain('Arrival flight')
    expect(text).toContain('Departure flight')
    expect(text).not.toContain('Add departure to Google Calendar')
  })

  test('a one-way carrying both timestamps stays an arrival and ignores the stray departure', () => {
    const html = markup(booking({
      trip_type: 'one_way',
      arrival_at: '2026-10-18T21:05:00+00:00', arrival_flight: 'VS0165',
      departure_at: '2026-10-25T14:30:00+00:00', departure_flight: 'VS0166',
    }))
    const text = page(html)
    expect(text).toContain('Arrival flight')
    expect(text).not.toContain('Departure flight')
    expect(text).not.toContain('Hotel pickup')
    expect(calendars(html)).toHaveLength(1)
  })
})
