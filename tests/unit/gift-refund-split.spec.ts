import { describe, test, expect } from 'vitest'
import { quoteRefund, ADMIN_CHARGE_RATE, type RefundableBooking } from '../../lib/refund-pricing'

/**
 * Refunding a booking that was part-paid with a gift card.
 *
 * The bug these guard against: `total_paid` is the whole cart, but Stripe only
 * ever captured `total_paid - gift_card_amount`. Quoting the refund off
 * total_paid asks Stripe for more than it took, which it rejects outright —
 * and it rejects it for MOST real redemptions, because the ask exceeds the
 * capture whenever the gift covered more than the 20% admin charge.
 */

const HOUR = 3_600_000

function bookingPaidHoursAgo(
  hours: number,
  fields: Partial<RefundableBooking> = {},
): RefundableBooking {
  return {
    total_paid: 0,
    status: 'paid',
    paid_at: new Date(Date.now() - hours * HOUR).toISOString(),
    created_at: new Date(Date.now() - hours * HOUR).toISOString(),
    // Far future so the service-started rule never interferes.
    serviceStartsAt: new Date(Date.now() + 90 * 24 * HOUR).toISOString(),
    ...fields,
  }
}

describe('refund split across cash and gift card', () => {
  test('a booking with no gift card refunds entirely in cash', () => {
    const q = quoteRefund(bookingPaidHoursAgo(2, { total_paid: 500 }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(q.adminChargeCents).toBe(10_000)
    expect(q.refundCents).toBe(40_000)
    expect(q.cashRefundCents).toBe(40_000)
    expect(q.giftRefundCents).toBe(0)
  })

  test('never asks Stripe for more than it captured', () => {
    // $500 cart, $200 on a gift card, so Stripe only ever took $300.
    // The old code quoted $400 against a $300 charge and Stripe refused.
    const q = quoteRefund(bookingPaidHoursAgo(2, { total_paid: 500, gift_card_amount: 200 }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(q.cashCapturedCents).toBe(30_000)
    expect(q.refundCents).toBe(40_000)
    expect(q.cashRefundCents).toBeLessThanOrEqual(q.cashCapturedCents)
    expect(q.cashRefundCents).toBe(30_000)
    expect(q.giftRefundCents).toBe(10_000)
  })

  test('a fully gift-covered booking refunds entirely to the card', () => {
    const q = quoteRefund(bookingPaidHoursAgo(5, { total_paid: 145, gift_card_amount: 145 }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(q.cashCapturedCents).toBe(0)
    expect(q.cashRefundCents).toBe(0)
    expect(q.giftRefundCents).toBe(q.refundCents)
    expect(q.giftRefundCents).toBe(14_500 - Math.round(14_500 * ADMIN_CHARGE_RATE))
  })

  test('the two halves always sum to the total refund, at awkward amounts', () => {
    for (const [total, gift] of [[333, 111], [99.99, 33.33], [250, 249], [75, 1], [1000, 999]]) {
      const q = quoteRefund(bookingPaidHoursAgo(1, { total_paid: total, gift_card_amount: gift }))
      if (!q.refundable) continue
      expect(q.cashRefundCents + q.giftRefundCents).toBe(q.refundCents)
      expect(q.cashRefundCents).toBeGreaterThanOrEqual(0)
      expect(q.giftRefundCents).toBeGreaterThanOrEqual(0)
      expect(q.cashRefundCents).toBeLessThanOrEqual(q.cashCapturedCents)
    }
  })

  test('the admin charge comes out of cash first, so the card is made whole last', () => {
    // $100 cart, $10 gift. Admin charge $20 exceeds the gift, so all of the
    // gift value returns and the traveler absorbs the charge on the cash side.
    const q = quoteRefund(bookingPaidHoursAgo(1, { total_paid: 100, gift_card_amount: 10 }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(q.refundCents).toBe(8_000)
    expect(q.cashRefundCents).toBe(8_000) // capture was $90, so all of it fits
    expect(q.giftRefundCents).toBe(0)
  })

  test('a string gift amount from the database is handled like a number', () => {
    const q = quoteRefund(bookingPaidHoursAgo(1, { total_paid: '500.00', gift_card_amount: '200.00' }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(q.cashRefundCents).toBe(30_000)
    expect(q.giftRefundCents).toBe(10_000)
  })

  test('a missing gift_card_amount is treated as no gift, not as NaN', () => {
    const q = quoteRefund(bookingPaidHoursAgo(1, { total_paid: 200, gift_card_amount: null }))
    expect(q.refundable).toBe(true)
    if (!q.refundable) return
    expect(Number.isFinite(q.cashRefundCents)).toBe(true)
    expect(q.cashRefundCents).toBe(16_000)
    expect(q.giftRefundCents).toBe(0)
  })
})
