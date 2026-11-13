import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DispatchConsole from '../../components/admin/DispatchConsole'
import { MIN_PICKUP_LEAD_MIN } from '../../lib/booking-window'

/**
 * The dispatch console as it first renders (Nov 13 2026 pass): the page
 * outline, the workflow ticks' names and states, the honest pickup-lead note
 * (it said 4 hours while checkout uses MIN_PICKUP_LEAD_MIN), and the way
 * back to this booking. The save behaviour (revert on failure, the payout
 * question) runs in the browser and was checked there.
 */

const booking = {
  id: '1a2b3c4d-0000-4000-8000-000000000000', status: 'paid', booking_type: 'transfer',
  first_name: 'Ana', last_name: 'Example', phone: '+1 305 555 0101',
  subtotal: 140, booking_fee: 21, total_paid: 161, dispatch: { sent_to_driver: '2099-01-01T12:00:00Z' },
  driver_name: 'Collin', driver_phone: '+1 876 555 0199', driver_vehicle: null, driver_plate: null,
  booking_items: [{ item_type: 'transfer', hotel: 'Sandals Royal Caribbean', airport: 'MBJ', trip_type: 'round_trip', passengers: 2, arrival_flight: 'WS2702', arrival_at: '2099-02-01T16:05:00+00:00', departure_flight: 'WS2703', departure_at: '2099-02-08T09:30:00+00:00' }],
}
const html = renderToStaticMarkup(<DispatchConsole booking={booking} stripeFee={6.58} />)

describe('the dispatch console', () => {
  test('the cards are headings under the page heading', () => {
    expect(html).toMatch(/<h1[^>]*>Dispatch<\/h1>/)
    for (const t of ['Money', 'Trip (Jamaica time)', 'Flight tracking', 'Driver + vehicle', 'Workflow']) expect(html).toContain(`>${t}</h2>`)
  })

  test('each tick is a 44px button named by its step, pressed when done', () => {
    expect(html).toMatch(/id="tick-sent_to_driver" class="adm-dsp-tick" aria-pressed="true" aria-label="Mark step \d+ not done: Send booking to your Jamaica driver"/)
    expect(html).toMatch(/id="tick-paid_first" class="adm-dsp-tick" aria-pressed="false" aria-label="Mark step \d+ done: Pay driver/)
  })

  test('the pickup note states the lead checkout uses', () => {
    const h = Math.floor(MIN_PICKUP_LEAD_MIN / 60), m = MIN_PICKUP_LEAD_MIN % 60
    expect(html).toContain(`Checkout suggests a departure pickup ${h} h ${m} min before the flight`)
    expect(html).not.toContain('minus 4 hours')
  })

  test('the way back opens this booking in the bookings list', () => {
    expect(html).toContain('href="/admin/bookings?booking=1a2b3c4d-0000-4000-8000-000000000000"')
  })
})
