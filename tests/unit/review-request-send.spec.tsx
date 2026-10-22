import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@react-email/render'

const sent = vi.hoisted(() => ({ emails: [] as Array<{ to: string; subject: string; react: unknown }> }))

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({}) }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: { to: string; subject: string; react: unknown }) => {
    sent.emails.push(args)
    return { ok: true, id: 'em_1' }
  },
}))

import { sendReviewRequest } from '../../lib/email/review-request'
import type { ReviewableItem } from '../../lib/review-request'

/**
 * The review request a guest actually receives follows the ride they booked.
 *
 * Drives the real sender, so this covers the wiring the template spec cannot:
 * that the direction read from the booking's legs reaches the email. A guest
 * who booked one direction was told "We drove you to and from {hotel}".
 *
 * The clock is pinned so the rendered text, and its length, never depends on
 * the day the suite runs: the first guest this went wrong for landed on the
 * 18th of October and was asked on the 20th.
 */

// The claim always wins here; the tests are about the copy.
const svc = { rpc: async () => ({ data: [{ id: 'b1' }] }) }

const NOW = new Date('2026-10-20T15:00:00Z')

const booking = (items: Array<Partial<ReviewableItem>>) => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  status: 'paid',
  email: 'kalen@example.com',
  first_name: 'Kalen',
  booking_type: 'transfer' as const,
  dispatch: {},
  booking_items: items.map((i) => ({ item_type: 'transfer' as const, hotel: 'Excellence Oyster Bay', ...i })),
})

const body = async () =>
  (await render(sent.emails[0].react as never)).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')

beforeEach(() => {
  sent.emails.length = 0
  // Only Date is faked: React's renderer schedules with real timers.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the review request follows the ride', () => {
  test('a hotel-to-airport one-way is told as a ride to the airport', async () => {
    const res = await sendReviewRequest(svc, booking([{ trip_type: 'one_way', departure_at: '2026-10-18T14:30:00+00:00' }]))
    expect(res.ok).toBe(true)
    expect(sent.emails[0].subject).toBe('How was the ride, Kalen?')
    const text = await body()
    expect(text).toContain('We drove you from Excellence Oyster Bay to the airport, 18 October.')
    expect(text).not.toMatch(/to and from/i)
    expect(text).not.toMatch(/arrivals/i)
    expect(text).not.toMatch(/got to the resort/i)
  })

  test('an airport-to-hotel one-way is told as a ride in: the guest who got "to and from"', async () => {
    const res = await sendReviewRequest(svc, booking([{ trip_type: 'one_way', arrival_at: '2026-10-18T11:45:00+00:00' }]))
    expect(res.ok).toBe(true)
    const text = await body()
    expect(text).toContain('We drove you from the airport to Excellence Oyster Bay, 18 October.')
    expect(text).toContain('settled in')
    expect(text).not.toMatch(/to and from/i)
    expect(text).not.toMatch(/got home/i)
    expect(text).not.toMatch(/sand in it/i)
  })

  test('a round trip is told as before', async () => {
    const res = await sendReviewRequest(
      svc,
      booking([{ trip_type: 'round_trip', arrival_at: '2026-10-11T21:05:00+00:00', departure_at: '2026-10-18T14:30:00+00:00' }]),
    )
    expect(res.ok).toBe(true)
    const text = await body()
    expect(text).toContain('We drove you to and from Excellence Oyster Bay, 11 October to 18 October.')
    expect(text).toContain('got home easily')
  })
})
