import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import DriverDashboard, { TripCard, TourCard } from '../../components/driver/DriverDashboard'
import { driverTrip, type DriverTour } from '../../lib/driver'

/**
 * The driver portal by role (Nov 24 2026). A regular driver reads the rides
 * given to them with no pay anywhere and nothing to change; a fleet manager
 * gets every change, each opening the confirm-first dialog; with no role the
 * portal is as it always was (tests/unit/driver-dashboard-legs.spec.tsx pins
 * that view word for word). Made-up guests and drivers.
 */

const booking = (item: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  first_name: 'Ada', last_name: 'Lovelace', phone: '+1 555 0100',
  subtotal: 100, special_requests: null, dispatch: { paid_first: '2099-10-10T12:00:00Z' },
  driver_name: 'Devon Brown', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234',
  booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', passengers: 2, ...item }],
  ...over,
})
const roundTrip = (withPay: boolean) => driverTrip(booking({
  trip_type: 'round_trip',
  arrival_at: '2099-10-11T21:05:00+00:00', arrival_flight: 'VS0165',
  departure_at: '2099-10-18T14:30:00+00:00', departure_flight: 'VS0166',
}), { withPay })!
const tour: DriverTour = {
  id: 't-1', ref: 'MAPL-TOUR0001', guestName: 'Grace Hopper', guestPhone: null, specialRequests: null, firstDate: '2099-10-12',
  items: [{ title: 'River rafting', destination: 'Martha Brae', date: '2099-10-12', travelers: 2 }],
  pickup: 'Riu Negril', pickupTime: '08:30', driver: { name: 'Devon Brown', vehicle: 'silver Toyota Hiace', plate: 'PJ 1234' },
}
const page = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const fleet = { lastChange: null, onChange: () => {} }

describe('a regular driver', () => {
  const html = renderToStaticMarkup(<DriverDashboard trips={[roundTrip(false)]} tours={[tour]} driverLabel="Devon" role="driver" showPay={false} />)
  const open = renderToStaticMarkup(<TripCard t={roundTrip(false)} open onToggle={() => {}} showPay={false} />)

  test('never reads pay: no amounts, no paid chips, no pay summary, no pay in the calendar links', () => {
    for (const h of [html, open]) {
      const t = page(h)
      expect(t).not.toMatch(/\$\d|You get|Pay pending|Paid in full|Your pay|Paid to you|Pending \(USD\)/)
      const links = Array.from(h.matchAll(/href="(https:\/\/calendar\.google\.com\/[^"]*)"/g)).map((m) => new URL(m[1].replace(/&amp;/g, '&')).searchParams.get('details') ?? '')
      for (const d of links) expect(d).not.toMatch(/pay|\$/i)
    }
    expect(html).not.toContain('aria-label="Pay summary"')
  })

  test('has nothing to change, and no Drivers tab', () => {
    for (const h of [html, open]) expect(page(h)).not.toMatch(/Change driver|Assign driver|Change pickup time|Change landing time|Set pickup time|Add a driver/)
    expect(html).not.toContain('id="tab-drivers"')
    expect(html).not.toContain('<dialog')
  })

  test('the card header names no pay, and its description points only at what is there', () => {
    const closed = renderToStaticMarkup(<TripCard t={roundTrip(false)} open={false} onToggle={() => {}} showPay={false} />)
    expect(closed).toContain('aria-describedby="trip-1a2b3c4d-0000-0000-0000-000000000000-kind trip-1a2b3c4d-0000-0000-0000-000000000000-sum"')
    expect(closed).not.toContain('-pay"')
  })

  test("the footer sends questions to the fleet manager; a tour shows its pickup and that they drive it", () => {
    expect(page(html)).toContain('Questions about a ride: ask your fleet manager, or write to contact@mapltours.com.')
    const t = page(renderToStaticMarkup(<TourCard t={tour} open onToggle={() => {}} mode="driver" />))
    expect(t).toContain('8:30 AM Jamaica time')
    expect(t).toContain('Riu Negril')
    expect(t).toContain('You are the driver for this tour.')
    expect(t).not.toMatch(/Change|Set pickup time/)
  })
})

describe('a fleet manager', () => {
  const card = page(renderToStaticMarkup(<TripCard t={roundTrip(true)} open onToggle={() => {}} fleet={fleet} />))

  test('sees the driver and can change the driver and each ride still ahead', () => {
    expect(card).toContain('Driver Devon Brown silver Toyota Hiace · PJ 1234')
    expect(card).toContain('Change driver')
    expect(card).toContain('Change landing time')
    expect(card).toContain('Change pickup time')
    // Pay is still theirs to see.
    expect(card).toContain('You get paid for this trip')
  })

  test('a ride that is over offers no change to its time; a booking with no driver offers Assign', () => {
    const past = driverTrip(booking({ trip_type: 'one_way', arrival_at: '2001-10-11T21:05:00+00:00' }, { driver_name: null, driver_vehicle: null, driver_plate: null }))!
    const t = page(renderToStaticMarkup(<TripCard t={past} open onToggle={() => {}} fleet={fleet} />))
    expect(t).toContain('No driver yet')
    expect(t).not.toMatch(/Change landing time|Assign driver|Change driver/)
    const ahead = driverTrip(booking({ trip_type: 'one_way', arrival_at: '2099-10-11T21:05:00+00:00' }, { driver_name: null, driver_vehicle: null, driver_plate: null }))!
    expect(page(renderToStaticMarkup(<TripCard t={ahead} open onToggle={() => {}} fleet={fleet} />))).toContain('Assign driver')
  })

  test('the last change is shown with who and when, and a change not yet emailed says so', () => {
    const last = { kind: 'time' as const, leg: 'departure' as const, text: 'Hotel pickup moved to 12:00 noon', by: 'Lee Grant', at: '2026-11-24T21:12:00Z', open: true, changeId: 'c1' }
    const t = page(renderToStaticMarkup(<TripCard t={roundTrip(true)} open onToggle={() => {}} fleet={{ ...fleet, lastChange: last }} />))
    expect(t).toContain('Last change: Hotel pickup moved to 12:00 noon · Lee Grant · Nov 24, 4:12 PM')
    expect(t).toContain('Not emailed yet. Ada has not been told about this change by email.')
    expect(t).toContain('Email Ada or not')
    // A pickup a fleet manager set is no longer called the guest's request.
    expect(t).toContain('This pickup time was set by Lee Grant.')
    expect(t).not.toContain('This is the pickup time the guest requested.')
  })

  test('a tour: pickup time and driver, each changeable', () => {
    const t = page(renderToStaticMarkup(<TourCard t={{ ...tour, pickupTime: null }} open onToggle={() => {}} mode="fleet" fleet={fleet} />))
    expect(t).toContain('Pickup time not set')
    expect(t).toContain('Set pickup time')
    expect(t).toContain('Change driver')
  })

  test('the dashboard says the role and has the Drivers tab', () => {
    const html = renderToStaticMarkup(<DriverDashboard trips={[roundTrip(true)]} tours={[tour]} driverLabel="Lee" role="fleet_manager" drivers={[{ id: 'd1', name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: null, active: true, role: 'driver' }]} changes={{}} />)
    expect(page(html)).toContain('Lee · Fleet manager · MAPL Tours Jamaica')
    expect(html).toContain('id="tab-drivers"')
    expect(html).toContain('aria-label="Pay summary"')
  })
})

describe('with no role, the portal as it always was', () => {
  test('no controls, no dialog, the old footer', () => {
    const html = renderToStaticMarkup(<DriverDashboard trips={[roundTrip(true)]} driverLabel="Collin" />)
    expect(page(html)).not.toMatch(/Change driver|Fleet manager|Drivers/)
    expect(html).not.toContain('<dialog')
    expect(page(html)).toContain('Pay is your agreed rate per trip')
  })
})

/**
 * The Drivers tab (Nov 25 2026): every working driver can be changed, the
 * fleet manager's own row included, with the name and sign-in email locked
 * there; a fleet manager is never retired from the portal. The admin preview
 * shows this same tab, as the fleet manager sees it.
 */
describe('the Drivers tab', () => {
  const people = [
    { id: 'd1', name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: 'devon@example.com', active: true, role: 'driver' as const },
    { id: 'd2', name: 'Lee Grant', whatsapp: '+1 876 555 0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', email: 'lee@example.com', active: true, role: 'fleet_manager' as const },
    { id: 'd3', name: 'Sam Hill', whatsapp: '+1 876 555 0103', vehicle: 'Toyota Voxy', colour: 'grey', plate: 'PS 0003', email: null, active: false, role: 'driver' as const },
  ]

  test('Edit on every working driver, the fleet manager included; Retire and Bring back only for a regular driver', async () => {
    const { default: DriversPanel } = await import('../../components/driver/fleet/DriversPanel')
    const html = renderToStaticMarkup(<DriversPanel drivers={people} selfId="d2" />)
    expect(html).toContain('aria-label="Edit Devon Brown"')
    expect(html).toContain('aria-label="Edit Lee Grant"')
    expect(html).toContain('aria-label="Retire Devon Brown"')
    expect(html).not.toContain('aria-label="Retire Lee Grant"')
    expect(html).toContain('aria-label="Bring back Sam Hill"')
    expect(html).not.toContain('aria-label="Edit Sam Hill"')
    // Lee's own row is marked.
    expect(page(html)).toMatch(/Lee Grant Fleet manager You/)
  })

  test("the fleet manager's own form: name and sign-in email read only, with why; the rest open, and a review before saving", async () => {
    const { DriverForm } = await import('../../components/driver/fleet/DriversPanel')
    const html = renderToStaticMarkup(<DriverForm target={people[1]} returnTo={null} onClose={() => {}} onAdded={() => {}} onEdited={() => {}} />)
    const input = (label: string) => html.match(new RegExp(`<input[^>]*id="[^"]*-${label}"[^>]*>`))?.[0] ?? ''
    expect(input('name')).toContain('readonly=""')
    expect(input('name')).toContain('value="Lee Grant"')
    expect(input('email')).toContain('readonly=""')
    for (const k of ['whatsapp', 'vehicle', 'colour', 'plate']) expect(input(k)).not.toContain("readonly")
    const t = page(html)
    expect(t).toContain('Payments are matched by this name, so only MAPL Tours Jamaica changes it.')
    expect(t).toContain('The address you sign in with, so only MAPL Tours Jamaica changes it.')
    expect(t).toContain('Change Lee Grant')
    expect(t).toContain('Review changes')
    expect(t).toContain('Nothing is saved or sent until you confirm on the next screen.')
    expect(t).toMatch(/Change Check/)
    // A regular driver's form has nothing locked.
    const devon = renderToStaticMarkup(<DriverForm target={people[0]} returnTo={null} onClose={() => {}} onAdded={() => {}} onEdited={() => {}} />)
    expect(devon).not.toContain("readonly")
  })

  test('the admin preview says it is exactly what the fleet manager sees', () => {
    const html = renderToStaticMarkup(<DriverDashboard trips={[roundTrip(true)]} tours={[tour]} driverLabel="Lee" adminPreview role="fleet_manager" drivers={people} changes={{}} selfDriverId="d2" />)
    expect(page(html)).toContain('Admin preview: exactly what Lee sees as fleet manager, with the same controls and no customer totals, fees or margin.')
    expect(html).toContain('id="tab-drivers"')
  })
})
