import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookingCard } from '../../components/admin/BookingsDashboard'

/**
 * The admin card's "Found via" field with first-touch attribution. The
 * helper (firstTouchLabel) is tested on its own in
 * attribution-first-touch.spec.ts; this renders the REAL card, opened, so the
 * wiring is covered too: a booking without a different first touch renders
 * byte for byte as it did before the change, and one with a different first
 * touch reads "bio / email (first: chatgpt.com)".
 */

const LAST = { source: 'bio', medium: 'email', landing: '/transfers', ts: '2026-09-21T14:00:00.000Z' }

const booking = (attribution: Record<string, string> | null) => ({
  id: 'b0000000-0000-4000-8000-000000000001',
  booking_type: 'tour',
  status: 'paid',
  currency: 'usd',
  total_paid: 190,
  paid_at: '2026-09-21T15:00:00.000Z',
  created_at: '2026-09-21T14:55:00.000Z',
  first_name: 'Guest',
  last_name: 'Example',
  booking_items: [{ title: 'Martha Brae Rafting', destination: 'Falmouth', date: '2026-10-02', travelers: 2, price_per_person: 95 }],
  attribution,
})

const card = (attribution: Record<string, string> | null) =>
  renderToStaticMarkup(<BookingCard b={booking(attribution)} variant="paid" open onToggle={() => {}} />)

/** The Found via field's markup: its <div>, label and value. */
const foundVia = (html: string) => html.match(/<div[^>]*><span[^>]*>Found via<\/span>[\s\S]*?<\/div>/)?.[0] ?? ''
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')

describe('admin card: Found via with a first touch', () => {
  test('a booking with no first touch renders the field exactly as before the change', () => {
    // Pinned from the card as it rendered at 45f2894, before first touch existed.
    expect(foundVia(card(LAST))).toBe(
      '<div style="display:flex;gap:8px;font-size:13px;line-height:1.5">' +
        '<span style="color:#6E6A62;min-width:78px;flex-shrink:0">Found via</span>' +
        '<span style="color:var(--text-primary, #171614);font-variant-numeric:tabular-nums">' +
          '<span style="font-weight:600">bio / email' +
            '<span style="color:#6E6A62;font-weight:400"> · landed on /transfers</span>' +
          '</span>' +
        '</span>' +
      '</div>',
    )
  })

  test('a first touch that reads the same as the last one changes nothing on the card', () => {
    const same = { source: 'chatgpt.com', landing: '/', ts: '2026-09-21T14:00:00.000Z' }
    expect(card({ ...same, first_source: 'chatgpt.com', first_landing: '/tours', first_ts: '2026-09-20T15:00:00.000Z' })).toBe(card(same))
    // Same ad on both touches, and a first touch with nothing to name.
    expect(card({ ...LAST, gclid: 'g2', first_source: 'bio', first_medium: 'email', first_gclid: 'g1' })).toBe(card({ ...LAST, gclid: 'g2' }))
    expect(card({ ...LAST, first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z' })).toBe(card(LAST))
  })

  test('a different first touch shows beside the source, before the landing page', () => {
    const html = foundVia(card({ ...LAST, first_source: 'chatgpt.com', first_referrer: 'https://chatgpt.com/', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z' }))
    expect(text(html)).toBe('Found viabio / email (first: chatgpt.com) · landed on /transfers')
    expect(html).toContain('<span style="font-weight:400"> (first: chatgpt.com)</span>')
  })

  test('an ad click alone as the first touch is named as the ad', () => {
    expect(text(foundVia(card({ ...LAST, first_fbclid: 'IwAR1', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z' }))))
      .toBe('Found viabio / email (first: facebook / ads) · landed on /transfers')
  })

  test('a booking with no attribution still reads "not captured"', () => {
    expect(text(foundVia(card(null)))).toBe('Found vianot captured')
  })
})
