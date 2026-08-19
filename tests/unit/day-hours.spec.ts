import { describe, test, expect } from 'vitest'
import { computeDayScore } from '../../lib/day-score'
import { DAILY_HOUR_LIMIT, STOP_HOURS } from '../../lib/cart'

/**
 * Free food stops consume day hours.
 *
 * A stop costs MAPL nothing and the guest pays the venue directly, but it
 * fills the same day as a tour. Counting it as zero let someone book eight
 * hours of tours and then add three lunches, producing an itinerary no driver
 * could run. These also guard the thing that would be worst to get wrong: the
 * hours the BAR shows must equal the hours the checkout GATE enforces.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tour = (hours: number, date = '2026-09-01', extra: Record<string, unknown> = {}): any => ({
  id: Math.random(), title: 'Tour', destination: 'Ocho Rios', parish: 'St. Ann',
  duration: `${hours} hrs`, date, travelers: 1, category: 'Adventure',
  price: 100, pricing: { mode: 'group', baseRate: 100, tierMax: 4, extraPerPerson: 0 },
  ...extra,
})

describe('stop hours in the day score', () => {
  test('a stop adds an hour to the day', () => {
    const withoutStops = computeDayScore([tour(4)], 0)
    const withOneStop = computeDayScore([tour(4)], STOP_HOURS)
    expect(withOneStop.hours - withoutStops.hours).toBe(STOP_HOURS)
  })

  test('several stops accumulate', () => {
    expect(computeDayScore([tour(3)], 3 * STOP_HOURS).hours).toBe(3 + 3 * STOP_HOURS)
  })

  test('stops can push an otherwise-legal day over the cap', () => {
    // 7 hours of tours is fine; two lunches on top is not a day anyone can run.
    const legal = computeDayScore([tour(7)], 0)
    expect(legal.isOver).toBe(false)
    const over = computeDayScore([tour(7)], 2 * STOP_HOURS)
    expect(over.hours).toBeGreaterThan(DAILY_HOUR_LIMIT)
    expect(over.isOver).toBe(true)
  })

  test('stop hours default to zero so existing callers are unchanged', () => {
    expect(computeDayScore([tour(5)]).hours).toBe(5)
  })

  test('an empty cart with no tours still reports zero', () => {
    expect(computeDayScore([], 0).hours).toBe(0)
  })

  test('stops are charged to the busiest day, not spread across dates', () => {
    // The scorer picks one day to score; adding stop hours must not silently
    // credit them to a day the guest is not building.
    const s = computeDayScore([tour(6, '2026-09-01'), tour(2, '2026-09-05')], STOP_HOURS)
    expect(s.hours).toBe(6 + STOP_HOURS)
  })
})


