import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import BookingCancelled from '../../emails/BookingCancelled'
import { sendCancellationEmails, cancellationSubject } from '../../lib/email/cancellation'

/**
 * Where a refund went, told truthfully in the traveler's cancellation email
 * (batch review, Sept 2026).
 *
 * A gift-covered booking with no PaymentIntent refunds entirely as gift-card
 * credit (lib/refund-pricing). Its cancellation used to arrive as "Cancelled,
 * your $X refund is on its way" and open with "$0.00 back to the card you
 * paid with", because the template called any gift share a split. Now:
 *   • the subject is chosen from the cash and gift parts;
 *   • a split needs both parts above zero;
 *   • gift-only credit is its own case and never mentions the card.
 */

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  emails: [] as Array<{ to: unknown; subject: string; react: unknown }>,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        update: self,
        eq: self,
        is: self,
        maybeSingle: async () => ({ data: state.row, error: null }),
        // Every claim wins in this store; the tests are about the copy.
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: state.row?.id }], error: null }).then(resolve),
      })
      return chain
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: { to: unknown; subject: string; react: unknown }) => {
    state.emails.push(args)
    return { ok: true, id: 'em_1' }
  },
}))


const text = async (el: ReactElement) =>
  (await render(el)).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')

const base = {
  bookingRef: 'MAPL-ABC12345', firstName: 'Andre', currency: 'USD', items: [],
  totalPaid: 150, refundAmount: 120, adminCharge: 30,
}

describe('the subject says where the money went', () => {
  const ref = 'MAPL-ABC12345'

  test('card only: the refund is on its way', () => {
    expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 120, giftRefund: 0 }))
      .toBe('Cancelled, your $120.00 refund is on its way (MAPL-ABC12345)')
  })

  test('gift credit only: back on the gift card, and nothing about a refund on its way', () => {
    const subject = cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 0, giftRefund: 120 })
    expect(subject).toBe('Cancelled, $120.00 is back on your gift card (MAPL-ABC12345)')
    expect(subject).not.toContain('on its way')
  })

  test('both: each half by name', () => {
    expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 40, giftRefund: 80 }))
      .toBe('Cancelled, $40.00 back to your card and $80.00 to your gift card (MAPL-ABC12345)')
  })

  test('nothing refunded promises nothing', () => {
    const subject = cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 0, giftRefund: 0, isTransfer: true })
    expect(subject).toBe('Your transfer is cancelled (MAPL-ABC12345)')
  })

  test('gift credit that has not landed yet is "being added", never "back on your gift card"', () => {
    expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 0, giftRefund: 120, giftCreditPending: true }))
      .toBe('Cancelled, $120.00 is being added to your gift card (MAPL-ABC12345)')
    expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 40, giftRefund: 80, giftCreditPending: true }))
      .toBe('Cancelled, $40.00 back to your card and $80.00 being added to your gift card (MAPL-ABC12345)')
    // A card-only refund has no credit to be pending.
    expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund: 120, giftRefund: 0, giftCreditPending: true }))
      .toBe('Cancelled, your $120.00 refund is on its way (MAPL-ABC12345)')
  })

  test('no em dash in any of them', () => {
    for (const [cashRefund, giftRefund] of [[1, 0], [0, 1], [1, 1], [0, 0]]) {
      for (const giftCreditPending of [false, true]) {
        expect(cancellationSubject({ bookingRef: ref, currency: 'USD', cashRefund, giftRefund, giftCreditPending })).not.toContain('—')
      }
    }
  })
})

describe('the receipt body', () => {
  test('gift credit only never mentions the card, and never prints a $0.00 card refund', async () => {
    const t = await text(BookingCancelled({ ...base, cashRefund: 0, giftRefund: 120 }))

    expect(t).toContain('$120.00 back onto your gift card')
    expect(t).toContain('Refunded to your gift card')
    expect(t).not.toContain('card you paid with')
    expect(t).not.toContain('Back to your card')
    expect(t).not.toContain('$0.00')
    expect(t).not.toContain('business days, depending')
    // The footnote too: gift credit does not travel through a bank.
    expect(t).not.toContain('business days')
    expect(t).toContain('the credit is not on your gift card')
    expect(t).toContain('available straight away')
  })

  test('gift credit still being added by hand says so, and never that it is available now', async () => {
    const t = await text(BookingCancelled({ ...base, cashRefund: 0, giftRefund: 120, giftCreditPending: true }))

    expect(t).toContain('are adding $120.00 back onto your gift card')
    expect(t).toContain('not there yet')
    expect(t).toContain('Being added to your gift card $120.00')
    expect(t).not.toContain('available straight away')
    expect(t).not.toContain('Refunded to your gift card')
    expect(t).not.toContain('business days')
    expect(t).not.toContain('—')
  })

  test('a split whose gift half is still being added says so, and keeps the card timing', async () => {
    const t = await text(BookingCancelled({ ...base, cashRefund: 40, giftRefund: 80, giftCreditPending: true }))

    expect(t).toContain('$40.00 back to the card you paid with')
    expect(t).toContain('adding $80.00 back onto your gift card')
    expect(t).toContain('Being added to your gift card $80.00')
    expect(t).toContain('business days, depending on your bank')
    expect(t).not.toContain('available straight away')
  })

  test('a real split names both halves', async () => {
    const t = await text(BookingCancelled({ ...base, cashRefund: 40, giftRefund: 80 }))

    expect(t).toContain('$40.00 back to the card you paid with and $80.00 back onto your gift card')
    expect(t).toContain('Back to your card $40.00')
    expect(t).toContain('Back to your gift card $80.00')
    expect(t).toContain('Total refunded')
  })

  test('card only, and every older row with no stored split, reads as a card refund', async () => {
    for (const split of [{ cashRefund: 120, giftRefund: 0 }, {}]) {
      const t = await text(BookingCancelled({ ...base, ...split }))
      expect(t).toContain('$120.00 back to the card you paid with')
      expect(t).toContain('Refunded to your card')
      expect(t).not.toContain('gift card')
    }
  })
})

describe('sent for a gift-covered booking refunded as credit', () => {
  beforeEach(() => { state.emails = [] })

  test('subject and body agree the money is on the gift card', async () => {
    // What the admin refund route stores for a gift-covered booking with no
    // PaymentIntent: all credit, no cash.
    state.row = {
      id: 'c0ffee00-1111-4222-8333-444444444444', email: 'andre@example.com', first_name: 'Andre',
      last_name: 'Brown', phone: null, currency: 'usd', booking_type: 'tour',
      total_paid: 150, refund_amount: 120, admin_charge: 30,
      refund_quoted_cash: 0, refund_quoted_gift: 120, gift_card_amount: 150,
      cancellation_email_sent_at: null, ops_cancellation_email_sent_at: null, booking_items: [],
    }
    const res = await sendCancellationEmails(state.row.id as string, { source: 'self-serve' })

    expect(res.customer).toBe('sent')
    const guest = state.emails.find((e) => e.to === 'andre@example.com')!
    expect(guest.subject).toBe('Cancelled, $120.00 is back on your gift card (MAPL-C0FFEE00)')
    const t = await text(guest.react as ReactElement)
    expect(t).toContain('back onto your gift card')
    expect(t).not.toContain('card you paid with')
  })

  test('when the credit failed to land, subject and body say it is being added', async () => {
    state.row = {
      id: 'c0ffee00-1111-4222-8333-444444444444', email: 'andre@example.com', first_name: 'Andre',
      last_name: 'Brown', phone: null, currency: 'usd', booking_type: 'tour',
      total_paid: 150, refund_amount: 120, admin_charge: 30,
      refund_quoted_cash: 0, refund_quoted_gift: 120, gift_card_amount: 150,
      cancellation_email_sent_at: null, ops_cancellation_email_sent_at: null, booking_items: [],
    }
    await sendCancellationEmails(state.row.id as string, { source: 'self-serve', giftCreditPending: true })

    const guest = state.emails.find((e) => e.to === 'andre@example.com')!
    expect(guest.subject).toBe('Cancelled, $120.00 is being added to your gift card (MAPL-C0FFEE00)')
    const t = await text(guest.react as ReactElement)
    expect(t).toContain('not there yet')
    expect(t).not.toContain('available straight away')
  })
})
