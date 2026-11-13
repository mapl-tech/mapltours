import { describe, test, expect } from 'vitest'
import { nextStep, progress } from '@/lib/dispatch'

/**
 * The step the admin bookings list names beside a ride's dispatch progress
 * (Nov 13 2026): the first one still to do, by the same rules as progress(),
 * so "Dispatch: 2 of 14 steps" and "Next: ..." never disagree. Trip dates are
 * far in the future so no time-based step completes by itself.
 */
const ride = (extra: Record<string, unknown> = {}) => ({
  id: 'r1', status: 'paid', booking_type: 'transfer', email: 'guest@example.com', phone: '+1 555 0100',
  booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', trip_type: 'round_trip', passengers: 2, arrival_at: '2099-12-03T16:06:00+00:00', departure_at: '2099-12-07T13:00:00+00:00' }],
  dispatch: {},
  ...extra,
})

const EVERY_STEP = [
  'verified', 'sent_to_driver', 'driver_confirmed', 'customer_confirmed', 'flight_requested', 'driver_reconfirmed', 'paid_first',
  'landed', 'arrival_complete', 'arrival_followup', 'departure_reminded', 'paid_second', 'departure_complete', 'review_requested',
]

describe('nextStep: what the bookings list says is waiting', () => {
  test('a complete booking verifies itself, so sending it to the driver comes next', () => {
    expect(nextStep(ride())?.key).toBe('sent_to_driver')
  })

  test('ticked steps are passed over in step order, and a later tick never hides an earlier step', () => {
    expect(nextStep(ride({ dispatch: { sent_to_driver: 'x' } }))?.key).toBe('driver_confirmed')
    expect(nextStep(ride({ dispatch: { customer_confirmed: 'x' } }))?.key).toBe('sent_to_driver')
  })

  test('agrees with progress: nothing is next exactly when every step is done', () => {
    const done = ride({ dispatch: Object.fromEntries(EVERY_STEP.map((k) => [k, 'x'])) })
    expect(nextStep(done)).toBeNull()
    expect(progress(done).done).toBe(progress(done).total)
    expect(progress(ride()).done).toBeLessThan(progress(ride()).total)
  })

  test('a one-way ride home skips the arrival steps, and paying the driver is never automatic', () => {
    const home = ride({
      booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', trip_type: 'one_way', passengers: 2, departure_at: '2099-12-07T13:00:00+00:00', departure_flight: 'B6922' }],
      dispatch: { sent_to_driver: 'x', driver_confirmed: 'x', customer_confirmed: 'x', driver_reconfirmed: 'x' },
    })
    expect(nextStep(home)?.key).toBe('paid_first')
  })
})
