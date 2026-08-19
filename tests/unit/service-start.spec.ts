import { describe, test, expect } from 'vitest'
import { earliestServiceStart } from '../../lib/booking-window'
import { legInstantMs } from '../../lib/dispatch'
import { quoteRefund } from '../../lib/refund-pricing'

/**
 * When a booking counts as delivered.
 *
 * The refund gate closes at earliestServiceStart(), so this function decides
 * whether a guest keeps the right to cancel. Two things it got wrong, both of
 * them in the operator's favour and both contradicting the published terms
 * ("once an experience or pickup has begun it has been delivered"):
 *
 *   1. A transfer item carries BOTH a leg timestamp and a denormalized date.
 *      Taking the minimum of the two meant midnight Jamaica on the travel day
 *      always won, closing the gate up to a full day before the car came.
 *   2. Leg times are Jamaica wall-clock carrying a Z. Read with a bare
 *      Date.parse they land five hours early.
 *
 * Together, a 9 PM airport pickup was treated as delivered from midnight that
 * morning, 21 hours early.
 */

// A real production booking: Sangster to Negril, arriving 9:05 PM Jamaica.
const TRANSFER = [{
  date: '2026-08-15',
  arrival_at: '2026-08-15T21:05:00+00:00',
  departure_at: '2026-08-25T18:00:00+00:00',
}]

describe('earliestServiceStart', () => {
  test('a transfer starts at its first leg, not at midnight', () => {
    const start = earliestServiceStart(TRANSFER)!
    expect(start.getTime()).toBe(legInstantMs(TRANSFER[0].arrival_at))
    expect(start.toISOString()).toBe('2026-08-16T02:05:00.000Z')
  })

  test('the leg is read as Jamaica wall-clock, so it is five hours after the bare parse', () => {
    const start = earliestServiceStart(TRANSFER)!
    expect(start.getTime() - Date.parse(TRANSFER[0].arrival_at)).toBe(5 * 3_600_000)
  })

  test('a tour keeps the midnight-Jamaica convention', () => {
    expect(earliestServiceStart([{ date: '2026-09-03' }])!.toISOString()).toBe('2026-09-03T05:00:00.000Z')
  })

  test('a departure-only one-way starts at the departure leg', () => {
    const start = earliestServiceStart([{ date: '2026-08-25', departure_at: '2026-08-25T18:00:00+00:00' }])!
    expect(start.toISOString()).toBe('2026-08-25T23:00:00.000Z')
  })

  test('a mixed cart takes the earliest item', () => {
    const start = earliestServiceStart([
      { date: '2026-08-20' },
      { date: '2026-08-15', arrival_at: '2026-08-15T21:05:00+00:00' },
    ])!
    // The tour's midnight on the 20th is later than the transfer on the 15th.
    expect(start.toISOString()).toBe('2026-08-16T02:05:00.000Z')
  })

  test('no usable time reads as unknown, never as already started', () => {
    expect(earliestServiceStart([{ date: null }])).toBeNull()
    expect(earliestServiceStart([])).toBeNull()
    expect(earliestServiceStart([{ date: 'not-a-date' }])).toBeNull()
  })
})

describe('the refund gate that reads it', () => {
  const booking = {
    status: 'paid',
    paid_at: '2026-08-15T12:00:00Z',
    created_at: '2026-08-15T12:00:00Z',
    total_paid: 154,
    serviceStartsAt: earliestServiceStart(TRANSFER)!.toISOString(),
  }

  test('a guest cancelling hours before the pickup is still refunded', () => {
    // 6 PM Jamaica on the travel day. The car comes at 9:05 PM.
    const quote = quoteRefund(booking as never, new Date('2026-08-15T23:00:00Z'))
    expect(quote.refundable).toBe(true)
  })

  test('the gate closes once the pickup time actually arrives', () => {
    const quote = quoteRefund(booking as never, new Date('2026-08-16T02:06:00Z'))
    expect(quote.refundable).toBe(false)
    if (!quote.refundable) expect(quote.reason).toBe('service_started')
  })
})
