import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'
import BookingConfirmed from '../../emails/BookingConfirmed'
import TransferConfirmed from '../../emails/TransferConfirmed'
import { maybeSendTravelerConfirmation, cardChargedFor } from '../../lib/email/booking'

/**
 * How a gift-card booking's total was paid, in both confirmation emails
 * (batch review, Sept 2026).
 *
 *   • The split sits UNDER the total as "Paid with gift card $X" and "Paid by
 *     card $Y". It used to sit above it as "Gift card applied − $100 /
 *     Charged to your card $50", which read as a subtraction the bold total
 *     then ignored.
 *   • The card line only claims a charge that happened. A booking with no
 *     PaymentIntent was never charged: checkout absorbs a gift-card remainder
 *     under Stripe's 50-cent minimum and marks the booking paid without one,
 *     and the email used to tell that guest their card paid the remainder.
 */

const sent = vi.hoisted(() => ({ emails: [] as Array<{ subject: string; react: unknown }> }))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: { subject: string; react: unknown }) => {
    sent.emails.push({ subject: args.subject, react: args.react })
    return { ok: true, id: 'em_1' }
  },
  confirmationBcc: () => [],
  operatorAlertRecipients: (list: string[]) => list,
}))


const text = async (el: ReactElement) =>
  (await render(el)).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')

const tour = {
  bookingRef: 'MAPL-GIFT0001', firstName: 'Ada', phone: null, pickup: null, dropoff: null,
  currency: 'USD', paidAt: null,
  items: [{ title: 'Rio Grande Bamboo Rafting', destination: 'Port Antonio', date: '2026-10-08', travelers: 2, linePrice: 150 }],
}

const ride = {
  bookingRef: 'MAPL-GIFT0002', firstName: 'Ada', customerPhone: null, currency: 'USD', paidAt: null,
  transfers: [{
    destination: 'Riu Negril', zone: 'D', tripType: 'one_way' as const, passengers: 2, priceUsd: 150,
    arrivalFlight: 'AA123', arrivalAt: '2026-10-08T14:30:00+00:00', departureFlight: null, departureAt: null,
  }],
}

const templates = [
  ['tour', (p: object) => BookingConfirmed({ ...tour, ...p } as never)],
  ['transfer', (p: object) => TransferConfirmed({ ...ride, ...p } as never)],
] as const

describe.each(templates)('the %s confirmation', (_kind, email) => {
  test('shows the split under the total, as two parts of it with no minus sign', async () => {
    const t = await text(email({ totalPaid: 150, giftApplied: 100 }))

    expect(t).toContain('Paid with gift card $100.00')
    expect(t).toContain('Paid by card $50.00')
    // Under the total, not above it.
    expect(t.indexOf('Paid with gift card')).toBeGreaterThan(t.indexOf('Total paid'))
    expect(t.indexOf('Paid by card')).toBeGreaterThan(t.indexOf('$150.00'))
    // The old wording, and its subtraction, are gone.
    expect(t).not.toContain('Gift card applied')
    expect(t).not.toContain('Charged to your card')
    expect(t).not.toMatch(/[−-]\s?\$100\.00/)
  })

  test('says nothing about the card when the card was not charged', async () => {
    const t = await text(email({ totalPaid: 100.3, giftApplied: 100, cardCharged: 0 }))

    expect(t).toContain('Paid with gift card $100.00')
    expect(t).not.toContain('Paid by card')
    expect(t).not.toContain('Charged to your card')
  })

  test('an absorbed remainder under 50 cents has its own line, so the parts add up to the total', async () => {
    const t = await text(email({ totalPaid: 100.3, giftApplied: 100, cardCharged: 0 }))

    expect(t).toContain('Total paid')
    expect(t).toContain('$100.30')
    expect(t).toContain('Paid with gift card $100.00')
    expect(t).toContain('Covered by MAPL Tours Jamaica $0.30')
    expect(t.indexOf('Covered by MAPL Tours Jamaica')).toBeGreaterThan(t.indexOf('Paid with gift card'))
    expect(t).not.toMatch(/MAPL TOURS|—/)
  })

  test('no such line when the parts already add up, or when the gap is not one checkout absorbs', async () => {
    // Card took the rest (the webhook's sender, cardCharged omitted).
    expect(await text(email({ totalPaid: 150, giftApplied: 100 }))).not.toContain('Covered by')
    // Fully covered, nothing left over.
    expect(await text(email({ totalPaid: 100, giftApplied: 100, cardCharged: 0 }))).not.toContain('Covered by')
    // A 50-cent-or-more gap with no card charge is not an absorbed remainder.
    expect(await text(email({ totalPaid: 150, giftApplied: 100, cardCharged: 0 }))).not.toContain('Covered by')
    // No gift card, no split at all.
    expect(await text(email({ totalPaid: 0.3, giftApplied: null, cardCharged: 0 }))).not.toContain('Covered by')
  })

  test('a booking with no gift card shows the total alone', async () => {
    const t = await text(email({ totalPaid: 150, giftApplied: null }))

    expect(t).toContain('$150.00')
    expect(t).not.toContain('Paid with gift card')
    expect(t).not.toContain('Paid by card')
  })
})

describe('what the card was charged, from the booking row', () => {
  test('no PaymentIntent means no card charge', () => {
    expect(cardChargedFor({ stripe_payment_id: null, total_paid: 100.3, gift_card_amount: 100 })).toBe(0)
    expect(cardChargedFor({ stripe_payment_id: null, total_paid: 150, gift_card_amount: 100 })).toBe(0)
  })

  test('a PaymentIntent took what the gift card left', () => {
    expect(cardChargedFor({ stripe_payment_id: 'pi_1', total_paid: 150, gift_card_amount: 100 })).toBe(50)
    expect(cardChargedFor({ stripe_payment_id: 'pi_1', total_paid: 150, gift_card_amount: null })).toBe(150)
  })

  test('a remainder under the 50-cent minimum was absorbed, even beside a stale intent id', () => {
    expect(cardChargedFor({ stripe_payment_id: 'pi_stale', total_paid: 100.3, gift_card_amount: 100 })).toBe(0)
  })
})

/** Enough of the service client for the paid-status email claim. */
function claimClient() {
  const chain = {
    update: () => chain,
    eq: () => chain,
    is: () => chain,
    select: async () => ({ data: [{ id: 'b1' }], error: null }),
  }
  return { from: () => chain }
}

const ITEM = {
  experience_id: 8, title: 'Rio Grande Bamboo Rafting', destination: 'Port Antonio', travelers: 2,
  date: '2026-10-08', price_per_person: 50.15, line_total: 100.3, item_type: 'experience',
  airport: null, hotel: null, zone: null, trip_type: null, arrival_flight: null, arrival_at: null,
  departure_flight: null, departure_at: null, passengers: null,
}

const TRANSFER_ITEM = {
  ...ITEM, experience_id: null, title: 'Airport transfer', item_type: 'transfer', hotel: 'Riu Negril', zone: 'D',
  trip_type: 'one_way', arrival_flight: 'AA123', arrival_at: '2026-10-08T14:30:00+00:00', passengers: 2,
}

function paidRow(over: Record<string, unknown>) {
  return {
    id: 'b1aa2bb3-0000-4000-8000-000000000001', status: 'paid', booking_type: 'tour',
    first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com', phone: null, country: null,
    pickup: null, dropoff: null, special_requests: null,
    subtotal: null, booking_fee: null, transport_cost: null, reward_discount: null,
    currency: 'usd', pickup_time: null, confirmation_email_sent_at: null, operator_email_sent_at: null,
    ...over,
  }
}

beforeEach(() => { sent.emails = [] })

describe('the gift-covered confirmation, sent from the stored row', () => {
  test.each([
    ['tour', ITEM],
    ['transfer', TRANSFER_ITEM],
  ] as const)('a %s whose 30-cent remainder was absorbed never claims a card charge', async (type, item) => {
    // What checkout writes for a sub-minimum remainder: gift claim of 100.00
    // on a 100.30 total, paid, and no PaymentIntent.
    const row = paidRow({ booking_type: type, total_paid: 100.3, gift_card_amount: 100, stripe_payment_id: null })
    const res = await maybeSendTravelerConfirmation(claimClient() as never, row as never, [item] as never)

    expect(res.ok).toBe(true)
    expect(sent.emails).toHaveLength(1)
    const t = await text(sent.emails[0].react as ReactElement)
    expect(t).toContain('Paid with gift card $100.00')
    expect(t).not.toContain('Paid by card')
    expect(t).not.toContain('Charged to your card')
    expect(t).toContain('Covered by MAPL Tours Jamaica $0.30')
  })
})
