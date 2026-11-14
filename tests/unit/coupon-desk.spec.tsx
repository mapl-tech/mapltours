import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CouponDesk, { couponState, givenOf } from '../../components/admin/CouponDesk'
import BookingsDashboard from '../../components/admin/BookingsDashboard'

/**
 * The coupon desk's state of a code as a guest would meet it, and the
 * bookings screen opening the booking a coupon use links to
 * (/admin/bookings?booking=<id>), which no screen honoured before Nov 13 2026.
 */

const NOW = Date.parse('2099-06-15T12:00:00Z')
const c = (extra: Record<string, unknown> = {}) => ({ status: 'active', expires_at: null, max_uses: null, uses: 0, ...extra }) as Parameters<typeof couponState>[0]

describe('couponState', () => {
  test('void and paused win over everything else', () => {
    expect(couponState(c({ status: 'void', expires_at: '2099-01-01T00:00:00Z', max_uses: 1, uses: 1 }), NOW)).toBe('void')
    expect(couponState(c({ status: 'paused', expires_at: '2099-01-01T00:00:00Z' }), NOW)).toBe('paused')
  })

  test('expired once the moment has passed, used up at the limit, live otherwise', () => {
    expect(couponState(c({ expires_at: '2099-06-15T11:59:59Z' }), NOW)).toBe('expired')
    expect(couponState(c({ expires_at: '2099-06-15T12:00:01Z' }), NOW)).toBe('active')
    expect(couponState(c({ max_uses: 3, uses: '3' }), NOW)).toBe('used')
    expect(couponState(c({ max_uses: 3, uses: 2 }), NOW)).toBe('active')
    expect(couponState(c(), NOW)).toBe('active')
  })
})

describe('what a code has cost', () => {
  test('uses are summed in cents, so the total is exact', () => {
    expect(givenOf([{ amount: 9.95 }, { amount: '4.60' }])).toBe(14.55)
    expect(givenOf([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3)
    expect(givenOf([])).toBe(0)
  })
})

describe('the desk before its list arrives', () => {
  test('says it is loading instead of showing an empty desk', () => {
    const html = renderToStaticMarkup(<CouponDesk />)
    expect(html).toContain('Loading coupons…')
    expect(html).toMatch(/<h1 [^>]*class="adm-h1"[^>]*>Coupons<\/h1>/)
    expect(html).not.toContain('No coupons yet')
    expect(html).not.toContain('adm-cp-head')
  })
})

describe('bookings: a link to one booking opens it', () => {
  const rows = [
    { id: 'aaaaaaaa-1111-2222-3333-444444444444', status: 'paid', booking_type: 'tour', first_name: 'Ana', last_name: 'Example', paid_at: '2001-02-01T10:00:00Z', created_at: '2001-02-01T10:00:00Z', total_paid: 100, booking_items: [{ title: 'Tour', date: '2001-02-03' }] },
    { id: 'bbbbbbbb-1111-2222-3333-444444444444', status: 'pending', booking_type: 'transfer', first_name: 'Ben', last_name: 'Example', created_at: '2099-01-01T10:00:00Z', total_paid: 90, booking_items: [{ item_type: 'transfer', airport: 'MBJ', hotel: 'Riu', arrival_at: '2099-02-01T15:00:00+00:00' }] },
  ]

  test('a past paid booking is found by its reference and opened, whatever its date', () => {
    const html = renderToStaticMarkup(<BookingsDashboard bookings={rows} focusId="aaaaaaaa-1111-2222-3333-444444444444" />)
    expect(html).toContain('value="MAPL-AAAAAAAA"')
    expect(html).toMatch(/<li class="adm-bk is-open">[\s\S]*?Ana Example/)
    expect(html).toContain('Every paid booking, newest payment first.')
  })

  test('an abandoned cart opens in the abandoned view; an unknown id changes nothing', () => {
    expect(renderToStaticMarkup(<BookingsDashboard bookings={rows} focusId="bbbbbbbb-1111-2222-3333-444444444444" />)).toContain('Checkouts that were never paid.')
    const plain = renderToStaticMarkup(<BookingsDashboard bookings={rows} />)
    expect(renderToStaticMarkup(<BookingsDashboard bookings={rows} focusId="cccccccc-1111-2222-3333-444444444444" />)).toBe(plain)
  })
})

/**
 * Nov 13 2026: the edit form filled its date box from the stored expiry's UTC
 * date. A code is saved as the end of a day in Jamaica, which is the next day
 * in UTC, so opening and saving a card (to change its note, say) moved its
 * expiry one day later every time.
 */
describe('editing a code never moves its expiry', () => {
  test('the form shows the Jamaica day the code was saved for, and saving it again stores the same instant', async () => {
    const { expiryDay } = await import('@/components/admin/CouponDesk')
    const saved = (day: string) => new Date(`${day}T23:59:59-05:00`).toISOString()
    for (const day of ['2027-05-12', '2026-12-31', '2028-02-29', '2027-01-01']) {
      const stored = saved(day)
      // What the database returns is that instant in UTC: the next calendar day.
      expect(stored.slice(0, 10)).not.toBe(day)
      expect(expiryDay(stored)).toBe(day)
      expect(saved(expiryDay(stored))).toBe(stored)
    }
  })

  test('no expiry, or one that cannot be read, is an empty date box', async () => {
    const { expiryDay } = await import('@/components/admin/CouponDesk')
    expect(expiryDay(null)).toBe('')
    expect(expiryDay(undefined)).toBe('')
    expect(expiryDay('soon')).toBe('')
  })
})
