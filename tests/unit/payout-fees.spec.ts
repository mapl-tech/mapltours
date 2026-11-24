import { describe, test, expect } from 'vitest'
import { feeSourceOf, payoutFees, wiseFeeShares, WISE_FEE_RATE, type WiseItem, type WisePayout } from '@/lib/payout-fees'
import { remitlyEstimate } from '@/lib/dispatch'
import type { PayoutBooking } from '@/lib/payouts/plan'

/**
 * The cash-flow page's payout fees (owner, Nov 21 2026: the new pricing has to
 * show in the cash flow too). Wise has paid the drivers and the tour operator
 * since Nov 19 2026; before that each half was sent by hand through Remitly.
 * Made-up rows; the two Wise payments are the shapes of the first live ones
 * (US$162 for two halves with a US$0.49 fee, US$81 with US$0.24).
 */

const ride = (id: string, over: Partial<PayoutBooking> = {}): PayoutBooking => ({
  id, status: 'paid', booking_type: 'transfer', subtotal: 162, driver_name: 'Devon Brown', dispatch: null,
  booking_items: [{ trip_type: 'round_trip', arrival_at: '2026-11-15T12:50:00Z', departure_at: '2026-11-22T08:45:00Z' }],
  ...over,
})
const tour = (id: string, date: string, subtotal = 280): PayoutBooking => ({
  id, status: 'paid', booking_type: 'tour', subtotal, driver_name: null, dispatch: null, booking_items: [{ date }],
})

describe('sharing a Wise payment\'s fee', () => {
  test('two halves on one payment share its fee in cents that add up to it', () => {
    const payouts: WisePayout[] = [{ id: 'p1', amountUsd: 162, feeUsd: 0.49 }]
    const items: WiseItem[] = [
      { payoutId: 'p1', bookingId: 'b1', part: 'second', amountUsd: 81 },
      { payoutId: 'p1', bookingId: 'b2', part: 'second', amountUsd: 81 },
    ]
    const s = wiseFeeShares(payouts, items)
    const a = s.get('b1|second')!.feeUsd, b = s.get('b2|second')!.feeUsd
    expect(Math.round((a + b) * 100)).toBe(49)
    expect([a, b].sort()).toEqual([0.24, 0.25])
    expect(s.get('b1|second')!.estimated).toBe(false)
  })

  test('uneven parts split by amount, and every cent of the fee is placed once', () => {
    const s = wiseFeeShares([{ id: 'p', amountUsd: 343, feeUsd: 1.03 }], [
      { payoutId: 'p', bookingId: 'a', part: 'tour', amountUsd: 280 },
      { payoutId: 'p', bookingId: 'b', part: 'first', amountUsd: 40 },
      { payoutId: 'p', bookingId: 'c', part: 'second', amountUsd: 23 },
    ])
    const total = ['a|tour', 'b|first', 'c|second'].reduce((x, k) => x + Math.round(s.get(k)!.feeUsd * 100), 0)
    expect(total).toBe(103)
    expect(s.get('a|tour')!.feeUsd).toBeCloseTo(0.84, 2)
  })

  test('a payment Wise has not reported a fee for is estimated at its rate', () => {
    const s = wiseFeeShares([{ id: 'p', amountUsd: 81, feeUsd: null }], [{ payoutId: 'p', bookingId: 'b', part: 'first', amountUsd: 81 }])
    expect(s.get('b|first')).toEqual({ feeUsd: Math.round(81 * WISE_FEE_RATE * 100) / 100, estimated: true })
  })
})

describe('a booking\'s payout fees', () => {
  test('a round trip paid half by hand before Wise and half by Wise: Remitly for the one, Wise\'s own fee for the other', () => {
    const shares = wiseFeeShares([{ id: 'p', amountUsd: 81, feeUsd: 0.24 }], [{ payoutId: 'p', bookingId: 'b', part: 'second', amountUsd: 81 }])
    const f = payoutFees(ride('b'), shares, '2026-11-19')
    expect(f.parts.map((p) => [p.part, p.source, p.feeUsd])).toEqual([
      ['first', 'remitly_est', remitlyEstimate(81, 1)],
      ['second', 'wise', 0.24],
    ])
    expect(f.feeUsd).toBe(Math.round((remitlyEstimate(81, 1) + 0.24) * 100) / 100)
    expect(feeSourceOf(f.parts)).toBe('mixed')
  })

  test('a ride the job will pay is Wise\'s rate; one wholly before Wise is exactly what the page counted before', () => {
    const later = ride('c', { booking_items: [{ trip_type: 'round_trip', arrival_at: '2026-12-10T14:30:00Z', departure_at: '2026-12-15T12:30:00Z' }] })
    const f = payoutFees(later, new Map(), '2026-11-19')
    // Each half is its own Wise payment, charged on its own: nothing since Nov 23 2026, when the job
    // began paying Collin's own Wise account (it was US$0.24 on US$81 to his Payoneer account, Nov 20).
    expect(WISE_FEE_RATE).toBe(0)
    expect(f.parts.map((p) => p.feeUsd)).toEqual([0, 0])
    expect(f.feeUsd).toBe(0)
    expect(feeSourceOf(f.parts)).toBe('wise_est')

    const old = ride('d', { booking_items: [{ trip_type: 'round_trip', arrival_at: '2026-10-01T14:30:00Z', departure_at: '2026-10-08T12:30:00Z' }] })
    expect(payoutFees(old, new Map(), '2026-11-19').feeUsd).toBe(remitlyEstimate(162, 2))
    // Without PAYOUT_FROM the job pays nothing, so everything not paid by Wise was paid by hand.
    expect(payoutFees(later, new Map(), null).feeUsd).toBe(remitlyEstimate(162, 2))
  })

  test('a half ticked paid by hand is Remitly whatever its day, as the payout job skips it; a Wise stamp is not', () => {
    // Arrival on PAYOUT_FROM itself, paid by hand the day before; the ride back paid by Wise.
    const b = ride('g', {
      booking_items: [{ trip_type: 'round_trip', arrival_at: '2026-11-19T12:50:00Z', departure_at: '2026-11-22T08:45:00Z' }],
      dispatch: { paid_first: '2026-11-18T13:32:36Z', paid_second: '2026-11-19T16:21:48Z', paid_second_via: 'wise:2505126230' },
    })
    const shares = wiseFeeShares([{ id: 'p', amountUsd: 81, feeUsd: 0.25 }], [{ payoutId: 'p', bookingId: 'g', part: 'second', amountUsd: 81 }])
    const f = payoutFees(b, shares, '2026-11-19')
    expect(f.parts.map((p) => p.source)).toEqual(['remitly_est', 'wise'])
    expect(f.feeUsd).toBe(Math.round((remitlyEstimate(81, 1) + 0.25) * 100) / 100)
    // A Wise stamp whose payment record is not in hand is still Wise, never a hand send.
    const w = payoutFees(ride('h', { dispatch: { paid_first: 'x', paid_first_via: 'wise:1' }, booking_items: [{ trip_type: 'one_way', arrival_at: '2026-11-25T10:00:00Z' }], subtotal: 81 }), new Map(), '2026-11-19')
    expect(w.parts.map((p) => p.source)).toEqual(['wise_est'])
  })

  test('the hand sends are rounded once over the booking, so an old trip reads exactly as before', () => {
    const old = ride('i', { subtotal: 108, booking_items: [{ trip_type: 'round_trip', arrival_at: '2026-10-01T14:30:00Z', departure_at: '2026-10-08T12:30:00Z' }] })
    expect(remitlyEstimate(108, 2)).toBe(8.07)
    expect(payoutFees(old, new Map(), '2026-11-19').feeUsd).toBe(8.07)
  })

  test('a tour is one part by its first day; a ride with no legs on record is one hand payment', () => {
    expect(payoutFees(tour('t1', '2026-12-01'), new Map(), '2026-11-19').feeUsd).toBe(Math.round(280 * WISE_FEE_RATE * 100) / 100)
    expect(payoutFees(tour('t2', '2026-11-02'), new Map(), '2026-11-19').feeUsd).toBe(remitlyEstimate(280, 1))
    const bare = payoutFees(ride('e', { booking_items: [] }), new Map(), '2026-11-19')
    expect(bare.feeUsd).toBe(remitlyEstimate(162, 1))
    expect(payoutFees(ride('f', { subtotal: 0, booking_items: [] }), new Map(), '2026-11-19').feeUsd).toBe(0)
  })
})
