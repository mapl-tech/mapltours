import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))

import RefundQueue, { approveLine, askedLine, refundSplit } from '../../components/admin/RefundQueue'

/**
 * The admin refunds queue (Nov 13 2026 redesign). Approving moves real money,
 * so the screen must say exactly what the decision route will do:
 * app/api/admin/refunds/[id] refunds refund_quoted_cash through Stripe and puts
 * refund_quoted_gift back on the gift card, and a row quoted before gift
 * cards existed is all cash. Leg times are the guest's Jamaica wall-clock.
 * Dates sit in 2099 so the year always prints, whenever this runs.
 */

const base = {
  status: 'paid', refund_state: 'requested', booking_type: 'tour', first_name: 'Ana', last_name: 'Sample', email: 'ana@example.com',
  total_paid: 243, refund_requested_at: '2099-11-12T15:00:00Z', currency: 'usd',
  booking_items: [{ title: "Dunn's River Falls Climb", date: '2099-12-05', travelers: 2 }],
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/[ \t\n\r]+/g, ' ')

describe('refundSplit: the same split the decision route makes', () => {
  test('stored cash and gift parts are used as stored', () => {
    expect(refundSplit({ refund_quoted_amount: 159.2, refund_quoted_cash: 109.2, refund_quoted_gift: 50 })).toEqual({ total: 159.2, cash: 109.2, gift: 50 })
  })

  test('a row quoted before gift cards existed is all cash', () => {
    expect(refundSplit({ refund_quoted_amount: 194.4 })).toEqual({ total: 194.4, cash: 194.4, gift: 0 })
  })

  test('without a stored cash part, cash is the quote less the gift part, to the cent', () => {
    expect(refundSplit({ refund_quoted_amount: 100.1, refund_quoted_gift: 30.05 })).toEqual({ total: 100.1, cash: 70.05, gift: 30.05 })
  })

  test('a booking paid wholly by gift card refunds no cash', () => {
    expect(refundSplit({ refund_quoted_amount: 80, refund_quoted_cash: 0, refund_quoted_gift: 80 })).toEqual({ total: 80, cash: 0, gift: 80 })
  })
})

describe('approveLine: the sentence the owner confirms', () => {
  test('names every destination, and only those', () => {
    expect(approveLine({ cash: 194.4, gift: 0 })).toBe('This sends $194.40 back to the traveler’s card, and cancels the trip. It cannot be undone.')
    expect(approveLine({ cash: 109.2, gift: 50 })).toBe('This sends $109.20 back to the traveler’s card and puts $50.00 back on their gift card, and cancels the trip. It cannot be undone.')
    expect(approveLine({ cash: 0, gift: 80 })).toBe('This puts $80.00 back on their gift card, and cancels the trip. It cannot be undone.')
  })
})

describe('askedLine: when they asked, as the policy measures it', () => {
  const at = (h: number) => new Date(Date.UTC(2099, 10, 10, 12) + h * 3_600_000).toISOString()
  const row = (h: number, extra: Record<string, unknown> = {}) => ({ paid_at: at(0), refund_requested_at: at(h), ...extra })

  test('from the booking, against the 48-hour window', () => {
    expect(askedLine(row(0.5))).toBe('Asked within an hour of booking, inside the 48-hour window.')
    expect(askedLine(row(5))).toBe('Asked 5 hours after booking, inside the 48-hour window.')
    expect(askedLine(row(47.9))).toBe('Asked 47 hours after booking, inside the 48-hour window.')
    expect(askedLine(row(48))).toBe('Asked 2 days after booking, after the 48-hour window.')
    expect(askedLine(row(80))).toBe('Asked 3 days after booking, after the 48-hour window.')
  })

  test('an unpaid row counts from when it was made; missing or reversed times say nothing', () => {
    expect(askedLine({ created_at: at(0), refund_requested_at: at(1) })).toBe('Asked 1 hour after booking, inside the 48-hour window.')
    expect(askedLine({ refund_requested_at: at(1) })).toBeNull()
    expect(askedLine(row(-2))).toBeNull()
  })
})

describe('the queue as it renders', () => {
  const rows = [
    { ...base, id: 'dddddddd-1111-2222-3333-444444444444', refund_quoted_amount: 194.4 },
    {
      ...base, id: 'eeeeeeee-1111-2222-3333-444444444444', booking_type: 'transfer', first_name: 'Ben', refund_quoted_amount: 159.2, refund_quoted_cash: 109.2, refund_quoted_gift: 50,
      booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu Ocho Rios', trip_type: 'round_trip', arrival_at: '2099-12-03T16:06:00+00:00' }],
    },
    { ...base, id: 'ffffffff-1111-2222-3333-444444444444', first_name: 'Cara', refund_state: 'approved', status: 'refunded', refund_quoted_amount: 72, refund_amount: 72, refund_decided_at: '2099-11-12T16:00:00Z' },
    { ...base, id: 'aaaabbbb-1111-2222-3333-444444444444', first_name: 'Dev', refund_state: 'declined', refund_quoted_amount: 120, refund_decline_reason: 'Inside the 48 hours.', refund_decided_at: '2099-11-12T16:00:00Z' },
    { ...base, id: 'bbbbcccc-1111-2222-3333-444444444444', first_name: 'Eve', refund_quoted_amount: null },
  ]
  const html = renderToStaticMarkup(<RefundQueue rows={rows} />)
  const t = text(html)

  test('a split refund says where each part goes before anyone approves it', () => {
    expect(t).toContain('$109.20 back to the card · $50.00 back to the gift card')
  })

  test('ride times read as the Jamaica wall-clock, tour days as days, our times with their zone', () => {
    expect(t).toContain('Lands Thu, Dec 3, 2099, 4:06 PM')
    expect(t).toContain("Dunn's River Falls Climb · Sat, Dec 5, 2099 · 2 travelers")
    expect(t).toContain('Requested Nov 12, 2099, 10:00 AM EST')
  })

  test('decided requests read as what happened', () => {
    expect(t).toMatch(/Refunded \$72\.00 USD/)
    expect(t).toMatch(/Declined Asked for \$120\.00 USD/)
    expect(t).toContain('Reason given Inside the 48 hours.')
  })

  test('a request with no stored amount cannot be approved here, only declined', () => {
    const eve = html.slice(html.indexOf('>Eve Sample<'))
    const next = eve.indexOf('<li class="adm-card')
    const card = next === -1 ? eve : eve.slice(0, next)
    expect(card).toContain('No refund amount was stored. Refund by hand in Stripe.')
    expect(card).not.toContain('Approve refund')
    expect(card).toContain('>Decline<')
  })

  test('the totals count what is waiting and what went back', () => {
    expect(t).toContain('Awaiting decision 3 $353.60 USD to refund')
    expect(t).toContain('Refunded 1 $72.00 USD sent back')
  })
})
