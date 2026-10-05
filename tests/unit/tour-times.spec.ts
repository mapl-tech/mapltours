import { describe, test, expect } from 'vitest'
import { experiences } from '../../lib/experiences'
import { parseDurationHours, DAILY_HOUR_LIMIT, STOP_HOURS, stopHoursFor, useCartStore } from '../../lib/cart'
import { computeDayScore } from '../../lib/day-score'
import { GET } from '../../app/llms.txt/route'
import { buildWebMcpTools, type WebMcpActions } from '../../lib/webmcp-tools'

/**
 * Tour times (owner, Oct 5 2026: "updates the times"), from the Oct 5
 * research against operators' published itineraries and Google Maps midday
 * drive times. `duration` is the time AT the activity and says where it is
 * spent; `fromHotel` is the guest's whole outing by resort area. The
 * duration still feeds the 8-hour daily cap in the cart and at checkout, so
 * what each one counts is pinned here: a change to a label must not move a
 * tour's weight in the day by accident.
 */
const COUNTS: Record<number, number> = {
  1: 2, 2: 2, 3: 1.5, 5: 3, 6: 2, 7: 1, 8: 2, 9: 2, 10: 1, 11: 1, 12: 1, 13: 1.5, 14: 3, 15: 8,
  // Ready-made days: the four that take 6 to 9 hours from Montego Bay fill
  // the day; Raft + Kayak + Drone is a fair half day there; the Triple Pack
  // was always a full day.
  16: 8, 17: 4, 18: 8, 19: 8, 21: 8, 22: 8,
}

describe('tour times', () => {
  test('every tour and package counts what it should toward the daily cap', () => {
    expect(experiences.map((e) => e.id).sort((a, b) => a - b)).toEqual(Object.keys(COUNTS).map(Number).sort((a, b) => a - b))
    for (const e of experiences) expect(parseDurationHours(e.duration), `${e.id} ${e.title}: "${e.duration}"`).toBe(COUNTS[e.id])
  })

  test('a single tour says where its hours are spent', () => {
    for (const e of experiences.filter((x) => x.kind === 'single' && !/full day/i.test(x.duration))) {
      expect(e.duration, e.title).toMatch(/^\d+(\.\d+)? hrs? (at|on) \S/)
    }
  })

  test('every tour and package says how long the outing is from the hotel', () => {
    for (const e of experiences) {
      const line = e.fromHotel ?? ''
      // Starts with the outing: a line that opened with the time AT the place
      // read, after its "From your hotel and back" label, as the whole trip.
      expect(line, e.title).toMatch(/^Allow /)
      expect(line, e.title).toMatch(/Montego Bay|Hip Strip/)
      expect(line, e.title).toMatch(/Negril/)
      expect(line, e.title).not.toMatch(/—/)
    }
  })

  test('a full-day package leaves no room for another tour that day; three short ones still fit', () => {
    const single = experiences.filter((e) => e.kind === 'single' && !/full day/i.test(e.duration))
    const shortest = Math.min(...single.map((e) => parseDurationHours(e.duration)))
    for (const pkg of experiences.filter((e) => e.kind === 'package' && /full day/i.test(e.duration))) {
      expect(parseDurationHours(pkg.duration) + shortest).toBeGreaterThan(DAILY_HOUR_LIMIT)
    }
    const byTitle = (t: string) => experiences.find((e) => e.title.startsWith(t))!
    const day = ["Dunn's River Falls", 'Blue Hole', 'River Tubing'].map(byTitle)
    expect(day.reduce((n, e) => n + parseDurationHours(e.duration), 0)).toBeLessThanOrEqual(DAILY_HOUR_LIMIT)
  })

  test('a full day keeps its first food stop free; any further stop counts', () => {
    const byId = (id: number) => experiences.find((e) => e.id === id)!
    expect(stopHoursFor([byId(18)], 1)).toBe(0)
    expect(stopHoursFor([byId(18)], 2)).toBe(STOP_HOURS)
    expect(stopHoursFor([byId(15)], 1)).toBe(0)
    expect(stopHoursFor([byId(1)], 1)).toBe(STOP_HOURS)
    // In the store: a package with its lunch stop is a payable 8-hour day.
    const stop = { name: 'Lunch spot', town: 'Ocho Rios', parish: 'St. Ann', knownFor: '', image: '', mapsQuery: '', afterId: 18 }
    useCartStore.setState({ items: [{ ...byId(18), travelers: 2, date: '2026-10-20' }], stops: [stop] })
    expect(useCartStore.getState().hoursByDate()).toEqual({ '2026-10-20': 8 })
    expect(useCartStore.getState().isDayOverLimit()).toBe(false)
    useCartStore.setState({ stops: [stop, { ...stop, name: 'Second stop' }] })
    expect(useCartStore.getState().isDayOverLimit()).toBe(true)
    useCartStore.getState().clearCart()
  })

  test('a package replaces any other package: no two fit in the one day a checkout books', () => {
    const byId = (id: number) => experiences.find((e) => e.id === id)!
    const cart = useCartStore.getState()
    cart.clearCart()
    cart.addItem(byId(16))
    expect(useCartStore.getState().conflictsInCart(byId(18)).map((i) => i.id)).toEqual([16])
    useCartStore.getState().addItem(byId(18))
    expect(useCartStore.getState().items.map((i) => i.id)).toEqual([18])
    useCartStore.getState().clearCart()
  })

  test('the day builder counts hours of tours, and a one-item full day says so', () => {
    const line = (id: number) => ({ ...experiences.find((e) => e.id === id)!, travelers: 2, date: '2026-10-20' })
    expect(computeDayScore([line(1)]).nudge).toBe('Room for 6 more hours of tours in your day, or book it as it is')
    expect(computeDayScore([line(18)]).nudge).toBe('This package fills your day')
    expect(computeDayScore([line(15)]).nudge).toBe('This tour fills your day')
  })

  test('llms.txt and get_tour carry the door-to-door line', async () => {
    const body = await GET().text()
    const dunns = experiences.find((e) => e.id === 1)!
    expect(body).toContain('2 hrs at the falls.')
    expect(body).toContain(`From your hotel and back: allow about 3 hours from Ocho Rios`)
    const actions: WebMcpActions = {
      origin: 'https://mapltours.com', now: () => new Date('2026-10-05T15:00:00Z'),
      addTransferQuote: () => 'x', updateTransferItem: () => {}, addTour: () => ({ added: true, replaced: [], sharedWith: [] }),
      navigate: () => {}, onBookingStarted: () => {},
    }
    const get = buildWebMcpTools(actions).find((t) => t.name === 'get_tour')!
    const r = (await get.execute({ tour: dunns.title })) as Record<string, unknown>
    expect(r.duration).toBe('2 hrs at the falls')
    expect(r.fromHotelAndBack).toBe(dunns.fromHotel)
  })
})
