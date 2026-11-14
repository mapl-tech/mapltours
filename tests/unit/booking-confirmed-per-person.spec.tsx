import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import BookingConfirmed from '@/emails/BookingConfirmed'
import { experiences, tourPrice } from '@/lib/experiences'

/**
 * The tour confirmation's line caption. A tour sold at one price for the party
 * must never print a per-person price: the stored per-head figure is only the
 * total divided by the heads, and "3 travelers · $42.67 each" beside a $128.00
 * total is a price nobody was charged (found Nov 13 2026).
 */
const text = async (el: React.ReactElement) => (await render(el, { plainText: true })).replace(/\s+/g, ' ')
const base = { bookingRef: 'MAPL-TEST0001', firstName: 'Alex', lastName: 'Morgan', email: 'alex.morgan@example.com', phone: null, pickup: 'Riu Negril', dropoff: 'Riu Negril', currency: 'USD' }
const line = (id: number, travelers: number, total: number) => {
  const e = experiences.find((x) => x.id === id)!
  return { experienceId: id, title: e.title, destination: e.destination, date: '2026-12-05', travelers, pricePerPerson: Math.round((total / travelers) * 100) / 100, linePrice: total }
}

describe('the tour confirmation never invents a per-person price', () => {
  test('a flat group tour (rafting, 3 guests): the party and the total, no "each"', async () => {
    const rafting = experiences.find((e) => e.id === 3)!
    const total = tourPrice(rafting.pricing, 3)
    const t = await text(BookingConfirmed({ ...base, totalPaid: total, items: [line(3, 3, total)] }))
    expect(t).toContain('3 travelers')
    expect(t).not.toMatch(/ each/)
    expect(t).toContain(`$${total.toFixed(2)}`)
  })

  test('a tour priced by pickup area (Dunn River, 2 guests): no "each" even though it divides evenly', async () => {
    const t = await text(BookingConfirmed({ ...base, totalPaid: 510, items: [line(1, 2, 510)] }))
    expect(t).toContain('2 travelers')
    expect(t).not.toMatch(/ each/)
  })

  test('a per-person tour says its per-person price when it multiplies back exactly', async () => {
    const horse = experiences.find((e) => e.id === 8)!
    expect(horse.pricing.mode).toBe('per_person')
    const t = await text(BookingConfirmed({ ...base, totalPaid: 254, items: [line(8, 2, 254)] }))
    expect(t).toContain('2 travelers · $127.00 each')
  })

  test('a per-person tour whose total does not divide evenly prints no per-person price', async () => {
    const t = await text(BookingConfirmed({ ...base, totalPaid: 383, items: [line(8, 3, 383)] }))
    expect(t).toContain('3 travelers')
    expect(t).not.toMatch(/ each/)
  })

  test('a line with no tour id (an older caller) prints no per-person price', async () => {
    const t = await text(BookingConfirmed({ ...base, totalPaid: 254, items: [{ title: 'Horseback Riding Trail', destination: 'Ocho Rios', date: '2026-12-05', travelers: 2, pricePerPerson: 127, linePrice: 254 }] }))
    expect(t).not.toMatch(/ each/)
  })
})
