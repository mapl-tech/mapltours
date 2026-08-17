import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import OperatorBookingAlert from '../../emails/OperatorBookingAlert'

/**
 * The pickup time reaching operations.
 *
 * A guest now states when they want collecting, at checkout. If that never
 * reaches the operator alert, the driver schedules off the old assumption and
 * turns up at the wrong time — a booking that is correct in the database and
 * wrong on the road. These assert the value survives the render, and that a
 * booking without one still produces a sane email.
 */

const base = {
  bookingRef: 'MAPL-1A2B3C4D',
  customerName: 'Andre',
  customerEmail: 'andre@example.com',
  customerPhone: '+1 876 555 0100',
  customerCountry: 'Jamaica',
  pickup: 'Half Moon, A RockResort',
  dropoff: 'Half Moon, A RockResort',
  specialRequests: null,
  totalPaid: 351,
  currency: 'USD',
  items: [{ title: "Dunn's River Falls Climb", destination: 'Ocho Rios', date: '2026-09-01', travelers: 2, linePrice: 351 }],
}

describe('operator alert pickup time', () => {
  test('shows the requested time in 12-hour form', async () => {
    const html = await render(OperatorBookingAlert({ ...base, pickupTime: '08:30' }))
    expect(html).toContain('Pickup time')
    expect(html).toContain('8:30 AM')
  })

  test('handles afternoon and midnight without producing 0 or 13 o&apos;clock', async () => {
    const pm = await render(OperatorBookingAlert({ ...base, pickupTime: '14:05' }))
    expect(pm).toContain('2:05 PM')
    const midnight = await render(OperatorBookingAlert({ ...base, pickupTime: '00:15' }))
    expect(midnight).toContain('12:15 AM')
    const noon = await render(OperatorBookingAlert({ ...base, pickupTime: '12:00' }))
    expect(noon).toContain('12:00 PM')
  })

  test('omits the row entirely when no time was given', async () => {
    const html = await render(OperatorBookingAlert({ ...base, pickupTime: null }))
    expect(html).not.toContain('Pickup time')
    // The logistics card must still render the address it does have.
    expect(html).toContain('Half Moon')
  })

  test('the plain-text part carries the time too', async () => {
    const text = await render(OperatorBookingAlert({ ...base, pickupTime: '06:45' }), { plainText: true })
    expect(text).toContain('6:45 AM')
  })
})
