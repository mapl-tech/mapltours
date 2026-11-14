import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DriverDashboard, { TripCard, TourCard, paidStamp } from '../../components/driver/DriverDashboard'
import { driverTrip, type DriverTour } from '../../lib/driver'

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
    expect(text).toContain('Riu Negril to MBJ')
    expect(text).toContain('Hotel pickup')
    expect(text).toMatch(/2:30\s?PM/)
    expect(text).not.toContain('Lands')
    expect(text).not.toContain('MBJ to Riu Negril')
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
    expect(text).toContain('MBJ to Riu Negril')
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
    expect(text).toContain('MBJ to Riu Negril')
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

/**
 * Three fixes that change nothing a driver sees (Nov 14 2026).
 *
 * The portal's look is the one the owner asked to keep ("I like how the driver
 * portal was before"). Putting it back had also undone three repairs that
 * have nothing to do with the look, and these hold them:
 *   - every trip has a heading again, and its button has a short name. The
 *     heading used to sit inside the role=button element, where a screen
 *     reader never finds it (a button's children are presentational), and
 *     the button's name was every word in the header. Now the heading holds
 *     the button, named by the ref and the guest, described by the rest;
 *   - a phone link opens the dialer in place. Sent to a new tab, a tel: link
 *     can leave a blank tab behind on a phone;
 *   - the time on a paid chip is Jamaica's, like every other time on the
 *     page. It was told in whichever zone the phone or laptop was set to.
 *
 * The header stays an element with role=button, tabindex and its own key
 * handler, not a native <button>, on purpose. A native one was tried first
 * and measured against the old page: it needed the site's heading and focus
 * rules undone by hand, Safari's Tab key passed over it, and in Safari the
 * booking reference inside it could no longer be selected. This way the page
 * is the same to the pixel in Chrome and in Safari's engine at 320, 390, 768
 * and 1440px, closed, open, focused, hovered and pressed (the comparison is
 * described in the commit that added this).
 */
describe('the driver portal, repaired where nobody sees it', () => {
  const ID = '1a2b3c4d-0000-0000-0000-000000000000'
  /** The header element's own opening tag and everything inside it. */
  const headerOf = (html: string) => {
    const from = html.indexOf('<span role="button"')
    // The header is the heading's only child, so it ends where the heading does.
    return { tag: html.slice(from, html.indexOf('>', from) + 1), inner: html.slice(html.indexOf('>', from) + 1, html.indexOf('</span></h2>', from)) }
  }

  test('the heading holds the header button, which is named by the ref and the guest', () => {
    const closed = renderToStaticMarkup(<TripCard t={roundTrip} open={false} onToggle={() => {}} />)
    // The heading passes the card's own type through: the site's h2 rules would re-set and re-break every word in it.
    expect(closed).toContain('<h2 style="margin:0;font:inherit;letter-spacing:inherit;text-wrap:inherit"><span role="button"')
    const { tag, inner } = headerOf(closed)
    expect(tag).toBe(`<span role="button" tabindex="0" id="trip-${ID}-btn" aria-expanded="false" aria-label="MAPL-1A2B3C4D, Ada Lovelace" aria-describedby="trip-${ID}-kind trip-${ID}-pay trip-${ID}-sum" class="drv-act" style="display:block;cursor:pointer;padding:15px 20px;background:#FCFBF8">`)
    // Exactly one heading and one header button on a closed card, and the heading is not inside the button.
    expect(closed.split('<h2')).toHaveLength(2)
    expect(closed.split('role="button"')).toHaveLength(2)
    expect(inner).not.toMatch(/<h[1-6]\b/)
    // Only phrasing content inside a heading: no block elements, no links, no nested buttons.
    expect(inner).not.toMatch(/<(div|p|section|article|button|a)\b/)
    // Everything the description points at is on the page, once, inside the header.
    for (const part of ['kind', 'pay', 'sum']) expect(inner.split(`id="trip-${ID}-${part}"`)).toHaveLength(2)
    // Closed, there is no panel and nothing claims to control one; open, the button names the panel that is there.
    expect(closed).not.toContain('aria-controls')
    expect(closed).not.toContain(`id="trip-${ID}-panel"`)
    const open = card(roundTrip)
    expect(headerOf(open).tag).toContain(`aria-expanded="true" aria-controls="trip-${ID}-panel"`)
    expect(headerOf(open).tag).toContain('border-bottom:1px solid #F1ECE3')
    expect(open.split(`id="trip-${ID}-panel"`)).toHaveLength(2)
  })

  test('the header reads as it did: the same words in the same order', () => {
    const text = page(renderToStaticMarkup(<TripCard t={roundTrip} open={false} onToggle={() => {}} />))
    expect(text.trim()).toMatch(/^MAPL-1A2B3C4D Round trip · 2 passengers · Pay pending Ada Lovelace · MBJ to Riu Negril Lands Sun, Oct 11, 2099 · 9:05\sPM Jamaica time Return pickup Sun, Oct 18, 2099 · 2:30\sPM Jamaica time You get \$100\.00 USD$/)
  })

  test("a tour booking's heading holds its header button too, with the same words as before", () => {
    const tour: DriverTour = { id: 't-1', ref: 'MAPL-TOUR0001', guestName: 'Grace Hopper', guestPhone: '+1 555 0101', specialRequests: null, firstDate: '2099-10-12', items: [{ title: "Rick's Cafe Cliff Diving & Sunset", destination: 'Negril', date: '2099-10-12', travelers: 2 }] }
    const closed = renderToStaticMarkup(<TourCard t={tour} open={false} onToggle={() => {}} />)
    const { tag, inner } = headerOf(closed)
    expect(closed).toContain('<h2 style="margin:0;font:inherit;letter-spacing:inherit;text-wrap:inherit"><span role="button"')
    expect(tag).toBe('<span role="button" tabindex="0" id="tour-t-1-btn" aria-expanded="false" aria-label="MAPL-TOUR0001, Grace Hopper" aria-describedby="tour-t-1-kind tour-t-1-sum" class="drv-act" style="display:block;cursor:pointer;padding:15px 20px;background:#FCFBF8">')
    expect(inner).not.toMatch(/<(h[1-6]|div|p|section|article|button|a)\b/)
    for (const part of ['kind', 'sum']) expect(inner.split(`id="tour-t-1-${part}"`)).toHaveLength(2)
    expect(page(closed).trim()).toBe("MAPL-TOUR0001 Tour · 1 experience Grace Hopper · Rick's Cafe Cliff Diving & Sunset · Mon, Oct 12, 2099")
    const open = renderToStaticMarkup(<TourCard t={tour} open onToggle={() => {}} />)
    expect(headerOf(open).tag).toContain('aria-expanded="true" aria-controls="tour-t-1-panel"')
    expect(open.split('id="tour-t-1-panel"')).toHaveLength(2)
    expect(open).toMatch(/<a class="drv-act" href="tel:\+15550101" style=/)
  })

  test('calling the guest opens the dialer in place; web pages still open a new tab', () => {
    const html = card(roundTrip)
    expect(html).toMatch(/<a class="drv-act" href="tel:\+15550100" style=/)
    expect(html).not.toMatch(/href="tel:[^"]*"[^>]*target=/)
    const web = Array.from(html.matchAll(/<a class="drv-act" href="(https:[^"]*)"([^>]*)>/g))
    // WhatsApp, the hotel map, two flight links and two calendar events at least.
    expect(web.length).toBeGreaterThanOrEqual(4)
    for (const [, href, rest] of web) expect(rest, href).toContain('target="_blank" rel="noreferrer"')
  })

  test("the paid chip tells the time on Jamaica's clock, in the same words as before, whatever zone the screen is in", () => {
    const paidAt = '2099-10-02T03:30:00Z' // Oct 1, 10:30 PM in Jamaica; already Oct 2 in UTC, London and Tokyo
    const original = process.env.TZ
    try {
      for (const tz of ['UTC', 'America/Toronto', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo', 'America/Jamaica']) {
        process.env.TZ = tz
        expect(paidStamp(paidAt).replace(/\s/g, ' '), tz).toBe('Oct 1, 10:30 PM')
        const t = driverTrip({ ...booking({ trip_type: 'one_way', arrival_at: '2099-10-11T21:05:00+00:00' }), dispatch: { paid_first: paidAt } })!
        expect(page(card(t)), tz).toMatch(/✓ Paid Oct 1, 10:30\sPM/)
      }
    } finally { process.env.TZ = original }
    // A stamp that is missing or unreadable says "Paid", never "Paid Invalid Date" or a stray space.
    expect(paidStamp(null)).toBe('')
    expect(paidStamp('not a date')).toBe('')
    const noStamp = driverTrip({ ...booking({ trip_type: 'one_way', arrival_at: '2099-10-11T21:05:00+00:00' }), dispatch: { paid_first: 'not a date' } })!
    expect(card(noStamp)).toMatch(/<\/span>Paid<\/span>/)
  })
})
