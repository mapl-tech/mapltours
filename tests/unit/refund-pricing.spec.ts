import { describe, test, expect } from 'vitest'
import {
  quoteRefund,
  formatCents,
  ADMIN_CHARGE_RATE,
  CANCELLATION_WINDOW_HOURS,
  type RefundableBooking,
} from '../../lib/refund-pricing'

const BOOKED_AT = '2026-08-01T12:00:00.000Z'
const hoursAfterBooking = (h: number) => new Date(Date.parse(BOOKED_AT) + h * 3_600_000)

function booking(over: Partial<RefundableBooking> = {}): RefundableBooking {
  return { status: 'paid', paid_at: BOOKED_AT, created_at: BOOKED_AT, total_paid: 600, ...over }
}

describe('the 48-hour window', () => {
  test('refundable immediately after booking', () => {
    const q = quoteRefund(booking(), hoursAfterBooking(0))
    expect(q.refundable).toBe(true)
  })

  test('refundable just inside the boundary', () => {
    const q = quoteRefund(booking(), hoursAfterBooking(47.99))
    expect(q.refundable).toBe(true)
  })

  test('refundable AT exactly 48h, the customer keeps the boundary', () => {
    const q = quoteRefund(booking(), hoursAfterBooking(CANCELLATION_WINDOW_HOURS))
    expect(q.refundable).toBe(true)
  })

  test('blocked one second past 48h', () => {
    const q = quoteRefund(booking(), new Date(hoursAfterBooking(CANCELLATION_WINDOW_HOURS).getTime() + 1000))
    expect(q.refundable).toBe(false)
    if (!q.refundable) expect(q.reason).toBe('window_closed')
  })

  test('window runs from paid_at, not created_at', () => {
    // Cart created Aug 1, abandoned, paid Aug 10. Cancelling Aug 11 is in window.
    const q = quoteRefund(
      booking({ created_at: '2026-08-01T12:00:00.000Z', paid_at: '2026-08-10T12:00:00.000Z' }),
      new Date('2026-08-11T00:00:00.000Z'),
    )
    expect(q.refundable).toBe(true)
  })

  test('falls back to created_at when paid_at is null', () => {
    const q = quoteRefund(booking({ paid_at: null }), hoursAfterBooking(1))
    expect(q.refundable).toBe(true)
  })

  test('exposes the deadline for "cancel until…" copy', () => {
    const q = quoteRefund(booking(), hoursAfterBooking(1))
    expect(q.deadline?.toISOString()).toBe('2026-08-03T12:00:00.000Z')
  })
})

describe('the administration charge', () => {
  test('retains 20% of the full amount paid', () => {
    const q = quoteRefund(booking({ total_paid: 600 }), hoursAfterBooking(1))
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.grossCents).toBe(60_000)
    expect(q.adminChargeCents).toBe(12_000)
    expect(q.refundCents).toBe(48_000)
  })

  test('charge and refund always sum to exactly what was paid', () => {
    // Half-cent cases are where independent rounding of both parts drifts.
    for (const total of [0.51, 10.01, 33.33, 99.99, 123.45, 1234.56, 7.77]) {
      const q = quoteRefund(booking({ total_paid: total }), hoursAfterBooking(1))
      if (!q.refundable) throw new Error(`expected refundable for ${total}`)
      expect(q.adminChargeCents + q.refundCents).toBe(q.grossCents)
      expect(q.grossCents).toBe(Math.round(total * 100))
    }
  })

  test('never refunds more than was captured', () => {
    for (const total of [0.5, 1, 55, 145.5, 9999.99]) {
      const q = quoteRefund(booking({ total_paid: total }), hoursAfterBooking(1))
      if (!q.refundable) throw new Error(`expected refundable for ${total}`)
      expect(q.refundCents).toBeLessThanOrEqual(q.grossCents)
      expect(q.refundCents).toBeGreaterThanOrEqual(0)
    }
  })

  test('accepts the numeric-as-string shape Supabase returns', () => {
    const q = quoteRefund(booking({ total_paid: '600.00' }), hoursAfterBooking(1))
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.refundCents).toBe(48_000)
  })

  test('rate is the published 20%', () => {
    expect(ADMIN_CHARGE_RATE).toBe(0.20)
  })
})

describe('non-refundable states', () => {
  test('pending booking has nothing to refund', () => {
    const q = quoteRefund(booking({ status: 'pending' }), hoursAfterBooking(1))
    expect(q.refundable).toBe(false)
    if (!q.refundable) expect(q.reason).toBe('not_paid')
  })

  test('already-refunded booking is blocked, guarding double refunds', () => {
    const q = quoteRefund(booking({ status: 'refunded' }), hoursAfterBooking(1))
    expect(q.refundable).toBe(false)
    if (!q.refundable) expect(q.reason).toBe('already_refunded')
  })

  test('already-refunded wins over window_closed', () => {
    const q = quoteRefund(booking({ status: 'refunded' }), hoursAfterBooking(500))
    if (!q.refundable) expect(q.reason).toBe('already_refunded')
  })

  test('zero-value booking is not refundable', () => {
    const q = quoteRefund(booking({ total_paid: 0 }), hoursAfterBooking(1))
    expect(q.refundable).toBe(false)
  })

  test('unparseable timestamps fail closed rather than refunding', () => {
    const q = quoteRefund(booking({ paid_at: 'not-a-date', created_at: 'also-bad' }), hoursAfterBooking(1))
    expect(q.refundable).toBe(false)
    if (!q.refundable) expect(q.reason).toBe('unknown_booking_time')
  })
})

test('formatCents renders money to two places', () => {
  expect(formatCents(48_000)).toBe('$480.00')
  expect(formatCents(1)).toBe('$0.01')
  expect(formatCents(0)).toBe('$0.00')
})

describe('cash is capped at what Stripe actually captured (audit 2026-08-22)', () => {
  // Checkout absorbs a sub-minimum gift remainder (1-49c): the booking
  // settles fully covered with NO PaymentIntent while gift_card_amount stays
  // a few cents short of total_paid. The quote must not demand cash Stripe
  // never captured, or the cancel route 409s the missing payment reference
  // forever and the refund is permanently wedged.
  test('the $99.80-card-on-a-$100-cart absorption refunds entirely as gift credit', () => {
    const q = quoteRefund(
      booking({ total_paid: 100, gift_card_amount: 99.8, stripe_payment_id: null }),
      hoursAfterBooking(2),
    )
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.refundCents).toBe(8_000)
    expect(q.cashCapturedCents).toBe(0)
    expect(q.cashRefundCents).toBe(0)
    expect(q.giftRefundCents).toBe(8_000)
  })

  test('absorption at the widest gap, 49 cents, is still all gift credit', () => {
    const q = quoteRefund(
      booking({ total_paid: 100, gift_card_amount: 99.51, stripe_payment_id: null }),
      hoursAfterBooking(2),
    )
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.cashCapturedCents).toBe(0)
    expect(q.cashRefundCents).toBe(0)
    expect(q.giftRefundCents).toBe(q.refundCents)
  })

  test('halves still sum to the total refund when nothing was captured', () => {
    const q = quoteRefund(
      booking({ total_paid: 100, gift_card_amount: 99.8, stripe_payment_id: null }),
      hoursAfterBooking(2),
    )
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.cashRefundCents + q.giftRefundCents).toBe(q.refundCents)
  })

  test('a part-gift booking WITH an intent keeps the cash-first split', () => {
    const q = quoteRefund(
      booking({ total_paid: 500, gift_card_amount: 200, stripe_payment_id: 'pi_live_123' }),
      hoursAfterBooking(2),
    )
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.cashCapturedCents).toBe(30_000)
    expect(q.cashRefundCents).toBe(30_000)
    expect(q.giftRefundCents).toBe(10_000)
  })

  test('a caller that never selected stripe_payment_id keeps the legacy derivation', () => {
    const q = quoteRefund(booking({ total_paid: 500, gift_card_amount: 200 }), hoursAfterBooking(2))
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.cashCapturedCents).toBe(30_000)
    expect(q.cashRefundCents).toBe(30_000)
  })

  test('a NO-gift booking missing its intent still quotes cash, so downstream fails loudly', () => {
    // A paid booking with neither gift share nor PaymentIntent is a data
    // anomaly. Quoting its refund as gift credit would let the approval route
    // mark it refunded while paying out nothing (there is no card to credit);
    // the cash quote instead trips the cancel route's no_payment_reference
    // guard and sends the guest to support.
    const q = quoteRefund(booking({ total_paid: 100, stripe_payment_id: null }), hoursAfterBooking(2))
    if (!q.refundable) throw new Error('expected refundable')
    expect(q.cashCapturedCents).toBe(10_000)
    expect(q.cashRefundCents).toBe(8_000)
    expect(q.giftRefundCents).toBe(0)
  })
})

describe('delivered services are not refundable', () => {
  const BOOKED = '2026-08-01T12:00:00.000Z'
  const b = (over: Partial<RefundableBooking> = {}): RefundableBooking =>
    ({ status: 'paid', paid_at: BOOKED, created_at: BOOKED, total_paid: 600, ...over })

  test('refundable while the service is still in the future', () => {
    const q = quoteRefund(
      b({ serviceStartsAt: '2026-08-05T14:00:00.000Z' }),
      new Date('2026-08-02T09:00:00.000Z'),
    )
    expect(q.refundable).toBe(true)
  })

  test('closes the take-the-tour-then-refund gap', () => {
    // Booked Aug 1 12:00 for a tour starting Aug 2 05:00. Cancelling Aug 2
    // 22:00 is still inside the 48-hour window, but the tour has happened.
    const q = quoteRefund(
      b({ serviceStartsAt: '2026-08-02T05:00:00.000Z' }),
      new Date('2026-08-02T22:00:00.000Z'),
    )
    expect(q.refundable).toBe(false)
    if (!q.refundable) expect(q.reason).toBe('service_started')
  })

  test('refused from the exact moment the service starts', () => {
    const start = '2026-08-02T05:00:00.000Z'
    const justBefore = quoteRefund(b({ serviceStartsAt: start }), new Date('2026-08-02T04:59:59.000Z'))
    expect(justBefore.refundable).toBe(true)
    const atStart = quoteRefund(b({ serviceStartsAt: start }), new Date(start))
    expect(atStart.refundable).toBe(false)
  })

  test('window_closed still wins when both apply', () => {
    const q = quoteRefund(
      b({ serviceStartsAt: '2026-08-20T05:00:00.000Z' }),
      new Date('2026-08-10T12:00:00.000Z'), // long past 48h, service still future
    )
    if (!q.refundable) expect(q.reason).toBe('window_closed')
  })

  test('unknown service time does not block a refund', () => {
    for (const v of [null, undefined, '']) {
      const q = quoteRefund(b({ serviceStartsAt: v }), new Date('2026-08-02T09:00:00.000Z'))
      expect(q.refundable).toBe(true)
    }
  })

  test('an unparseable service time does not block a refund either', () => {
    const q = quoteRefund(b({ serviceStartsAt: 'not-a-date' }), new Date('2026-08-02T09:00:00.000Z'))
    expect(q.refundable).toBe(true)
  })
})
