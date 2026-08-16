import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import BookingCancelled from '../../emails/BookingCancelled'
import OperatorCancellationAlert from '../../emails/OperatorCancellationAlert'
import RefundRequested from '../../emails/RefundRequested'
import OperatorRefundApproval from '../../emails/OperatorRefundApproval'
import RefundDeclined from '../../emails/RefundDeclined'

/**
 * Render smoke tests. Typechecking cannot catch a template that throws at
 * render time or silently drops the refund figure, and these two emails are
 * a customer's only written proof of what they are owed.
 */

const ITEMS = [
  { title: 'Blue Mountain coffee trek', destination: 'Blue Mountains', date: '2026-09-14', travelers: 2 },
  { title: 'Reggae studio session', destination: 'Kingston', date: '2026-09-16', travelers: 2 },
]

describe('traveler cancellation receipt', () => {
  test('states amount paid, charge retained, and amount refunded', async () => {
    const html = await render(
      BookingCancelled({
        bookingRef: 'MAPL-ABC12345',
        firstName: 'Andre',
        totalPaid: 600, refundAmount: 480, adminCharge: 120,
        currency: 'USD', items: ITEMS,
      }),
    )
    expect(html).toContain('MAPL-ABC12345')
    expect(html).toContain('Andre')
    expect(html).toContain('$600.00')
    expect(html).toContain('$120.00')
    expect(html).toContain('$480.00')
    expect(html).toContain('Blue Mountain coffee trek')
  })

  test('renders without a first name', async () => {
    const html = await render(
      BookingCancelled({
        bookingRef: 'MAPL-NONAME1', firstName: null,
        totalPaid: 100, refundAmount: 80, adminCharge: 20,
        currency: 'USD', items: [],
      }),
    )
    expect(html).toContain('MAPL-NONAME1')
    expect(html).toContain('$80.00')
  })

  test('produces a plain-text alternative', async () => {
    const text = await render(
      BookingCancelled({
        bookingRef: 'MAPL-TEXT0001', firstName: 'Andre',
        totalPaid: 600, refundAmount: 480, adminCharge: 120,
        currency: 'USD', items: ITEMS,
      }),
      { plainText: true },
    )
    expect(text).toContain('$480.00')
    expect(text).not.toContain('<div')
  })

  test('calls a transfer a transfer, not a booking', async () => {
    const html = await render(
      BookingCancelled({
        bookingRef: 'MAPL-XFER0001', firstName: 'Andre',
        totalPaid: 90, refundAmount: 72, adminCharge: 18,
        currency: 'USD', isTransfer: true, items: [],
      }),
    )
    expect(html).toContain('transfer')
  })
})

describe('operations cancellation alert', () => {
  test('leads with the dates to stand down and the traveler contact', async () => {
    const html = await render(
      OperatorCancellationAlert({
        bookingRef: 'MAPL-OPS12345',
        customerName: 'Andre Brown',
        customerEmail: 'andre@example.com',
        customerPhone: '+1 876 555 0100',
        totalPaid: 600, refundAmount: 480, adminCharge: 120,
        currency: 'USD', items: ITEMS,
      }),
    )
    expect(html).toContain('MAPL-OPS12345')
    expect(html).toContain('Andre Brown')
    expect(html).toContain('andre@example.com')
    expect(html).toContain('Stand down')
    expect(html).toContain('Blue Mountain coffee trek')
  })

  test('distinguishes a Dashboard refund from a self-serve one', async () => {
    const dashboard = await render(
      OperatorCancellationAlert({
        bookingRef: 'MAPL-DASH0001', customerName: 'Andre Brown',
        customerEmail: null, customerPhone: null,
        totalPaid: 600, refundAmount: 600, adminCharge: 0,
        currency: 'USD', source: 'dashboard', items: ITEMS,
      }),
    )
    expect(dashboard).toContain('Stripe Dashboard')

    const selfServe = await render(
      OperatorCancellationAlert({
        bookingRef: 'MAPL-SELF0001', customerName: 'Andre Brown',
        customerEmail: null, customerPhone: null,
        totalPaid: 600, refundAmount: 480, adminCharge: 120,
        currency: 'USD', source: 'self-serve', items: ITEMS,
      }),
    )
    expect(selfServe).toContain('by the traveler')
  })

  test('survives a booking with no line items', async () => {
    const html = await render(
      OperatorCancellationAlert({
        bookingRef: 'MAPL-EMPTY001', customerName: 'Andre Brown',
        customerEmail: null, customerPhone: null,
        totalPaid: 90, refundAmount: 72, adminCharge: 18,
        currency: 'USD', isTransfer: true, items: [],
      }),
    )
    expect(html).toContain('No line items')
  })
})

describe('approval-flow templates', () => {
  test('request acknowledgement says nothing is refunded yet', async () => {
    const html = await render(
      RefundRequested({
        bookingRef: 'MAPL-REQ00001', firstName: 'Andre',
        totalPaid: 600, refundAmount: 480, adminCharge: 120, currency: 'USD',
      }),
    )
    expect(html).toContain('MAPL-REQ00001')
    expect(html).toContain('$480.00')
    // The critical assertion: the trip must not read as already cancelled.
    expect(html).toContain('still booked')
    expect(html).toContain('Nothing has been refunded yet')
  })

  test('ops approval alert links to the queue and states the amount', async () => {
    const html = await render(
      OperatorRefundApproval({
        bookingRef: 'MAPL-OPS00001', bookingId: 'abc-123',
        customerName: 'Andre Brown', customerEmail: 'andre@example.com', customerPhone: null,
        totalPaid: 600, refundAmount: 480, adminCharge: 120, currency: 'USD',
        serviceStartsAt: '2026-09-14T05:00:00.000Z',
        items: [{ title: 'Blue Mountain coffee trek', destination: 'Blue Mountains', date: '2026-09-14', travelers: 2 }],
      }),
    )
    expect(html).toContain('Approval needed')
    expect(html).toContain('$480.00')
    expect(html).toContain('/admin/refunds')
    expect(html).toContain('still live')
  })

  test('decline email keeps the booking alive and shows the reason', async () => {
    const html = await render(
      RefundDeclined({
        bookingRef: 'MAPL-DEC00001', firstName: 'Andre',
        reason: 'Outside the 48-hour window when reviewed.',
      }),
    )
    expect(html).toContain('still booked')
    expect(html).toContain('Outside the 48-hour window when reviewed.')
  })

  test('decline email omits the reason block entirely when none was given', async () => {
    const html = await render(
      RefundDeclined({ bookingRef: 'MAPL-DEC00002', firstName: null, reason: null }),
    )
    expect(html).toContain('MAPL-DEC00002')
    expect(html).not.toContain('Why')
  })
})
