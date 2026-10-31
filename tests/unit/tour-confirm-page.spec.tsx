import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const db = vi.hoisted(() => ({ owner: true }))

// A gift-covered tour (`booking_id`, no PaymentIntent) renders from the
// booking row alone, so a fake client that answers both queries is enough.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const result =
        table === 'bookings'
          ? {
              data: {
                id: '5e5e5e5e-0000-0000-0000-000000000000', email: 'ada@example.com', user_id: null, first_name: 'Ada',
                subtotal: 200, booking_fee: 40, transport_cost: null, reward_discount: null, coupon_code: null,
                coupon_discount: null, total_paid: 240, currency: 'usd', paid_at: '2026-09-01T12:00:00Z', status: 'paid',
                booking_type: 'tour', gift_card_amount: 240,
              },
            }
          : { data: [{ title: 'Bamboo Rafting on the Martha Brae', destination: 'Falmouth', date: '2026-12-02', travelers: 3, price_per_person: 80, line_total: 240 }] }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => result
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
  }),
}))
vi.mock('../../app/checkout/confirm/ConfirmClient', () => ({ default: () => <span>REPORTS-THE-SALE</span> }))
vi.mock('@/components/ClaimAccountCard', () => ({ default: () => null }))
vi.mock('@/lib/confirm-proof-server', () => ({ canSeeConfirmation: async () => db.owner }))

import ConfirmPage from '../../app/checkout/confirm/page'

const render = async (owner: boolean) => {
  db.owner = owner
  const html = renderToStaticMarkup(await ConfirmPage({ searchParams: { booking_id: '5e5e5e5e-0000-0000-0000-000000000000' } }))
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ') }
}

/**
 * Oct 31 2026: the tour confirmation, like the ride's, showed the guest's name,
 * tours, dates and party to anyone holding the link. Only the browser that
 * booked it, or the signed-in owner, now sees the trip.
 */
describe('the tour confirmation page', () => {
  test('a browser that did not book it learns nothing about the guest or the trip', async () => {
    const { text, html } = await render(false)
    for (const secret of ['Ada', 'Martha Brae', 'Falmouth', 'Dec', '240', 'REPORTS-THE-SALE']) expect(text, secret).not.toContain(secret)
    expect(text).toContain('Your trip is booked.')
    expect(text).toContain('MAPL-5E5E5E5E')
    expect(html).toContain('href="/login?redirect=%2Fprofile"')
    expect(text).toContain('Your account keeps every booking in one place.')
    expect(text).not.toContain('Browse more experiences')
  })

  test('the browser that booked it sees the trip and reports the sale', async () => {
    const { text } = await render(true)
    expect(text).toContain('Martha Brae')
    expect(text).toContain('REPORTS-THE-SALE')
    expect(text).toContain('Browse more experiences')
    expect(text).not.toContain('Sign in to see my trip')
  })
})
