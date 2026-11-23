import { describe, test, expect, beforeEach } from 'vitest'
import { computeDayScore } from '../../lib/day-score'
import { DAILY_HOUR_LIMIT, STOP_HOURS, useCartStore } from '../../lib/cart'
import { DAY_LIMIT_MIN, formatDayTime } from '../../lib/day-hours'
import { EATS } from '../../lib/eats'
import { experiences } from '../../lib/experiences'

/**
 * A day is the tours, the free food stops and the drives between them.
 *
 * A stop costs MAPL nothing and the guest pays the venue directly, but it
 * fills the same day as a tour, and so does the road between them. Counting
 * either as zero let someone book eight hours of tours and then the lunches
 * and the driving on top, producing an itinerary no driver could run. These
 * also guard the thing that would be worst to get wrong: the hours the BAR
 * shows must equal the hours the checkout GATE enforces.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tour = (hours: number, date = '2026-09-01', extra: Record<string, unknown> = {}): any => ({
  id: 900 + Math.floor(Math.random() * 1000), title: 'Tour', destination: 'Ocho Rios', parish: 'St. Ann',
  duration: `${hours} hrs`, date, travelers: 1, category: 'Adventure',
  price: 100, pricing: { mode: 'group', baseRate: 100, tierMax: 4, extraPerPerson: 0 },
  ...extra,
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const real = (id: number): any => ({ ...experiences.find((e) => e.id === id)!, travelers: 2, date: '2026-09-01' })

const stop = (name: string, afterId: number | null) => ({ ...EATS.find((e) => e.name === name)!, afterId })

describe('the day score counts the whole day', () => {
  test('a stop adds an hour and a half, and the drive to it', () => {
    const t = tour(4)
    const withoutStops = computeDayScore([t])
    const withOneStop = computeDayScore([t], [stop("Miss T's Kitchen", t.id)])
    expect(withOneStop.time.stops).toBe(STOP_HOURS * 60)
    expect(withOneStop.time.total - withoutStops.time.total).toBe(STOP_HOURS * 60 + withOneStop.time.driving)
  })

  test('the drive between two tours is part of the day', () => {
    const s = computeDayScore([real(1), real(2)])
    expect(s.time.tours).toBe(240)
    expect(s.time.driving).toBeGreaterThan(0)
    expect(s.hours).toBe(s.time.total / 60)
  })

  test('the drives can push a day of tours that fits over the cap', () => {
    // 7.5 hrs at Dunn's River, the Blue Hole, the stable and the tubing: in
    // that order the road between them adds 50 minutes.
    const day = [real(1), real(2), real(8), real(13)]
    const s = computeDayScore(day)
    expect(s.time.tours).toBeLessThanOrEqual(DAY_LIMIT_MIN)
    expect(s.time.total).toBeGreaterThan(DAY_LIMIT_MIN)
    expect(s.isOver).toBe(true)
    expect(s.nudge).toBe(`${formatDayTime(s.time.total - DAY_LIMIT_MIN)} past 8 hours: remove a tour or a food stop`)
  })

  test('stops can push an otherwise-legal day over the cap', () => {
    const t = tour(7)
    expect(computeDayScore([t]).isOver).toBe(false)
    const over = computeDayScore([t], [stop("Miss T's Kitchen", t.id), stop("PG's Toscanini", t.id)])
    expect(over.hours).toBeGreaterThan(DAILY_HOUR_LIMIT)
    expect(over.isOver).toBe(true)
  })

  test('an empty cart with no tours still reports zero', () => {
    expect(computeDayScore([]).hours).toBe(0)
    expect(computeDayScore([]).time.total).toBe(0)
  })

  test('the busiest day is the one scored, with its own stops', () => {
    const a = tour(6, '2026-09-01')
    const b = tour(2, '2026-09-05')
    const s = computeDayScore([a, b], [stop("Miss T's Kitchen", a.id)])
    expect(s.date).toBe('2026-09-01')
    expect(s.time.tours).toBe(360)
    expect(s.time.stops).toBe(90)
  })

  test('room left is said in hours and minutes, drives included', () => {
    expect(computeDayScore([tour(2)]).nudge).toBe('Room for 6 hrs more in your day, drives included, or book it as it is')
    // Two tours at one place, no driving between them: 4 hrs 30 min used.
    expect(computeDayScore([tour(2), tour(2.5)]).nudge).toBe('3 hrs 30 min left: mix in a different category for more variety')
  })
})

describe('the bar and the checkout gate count the same day', () => {
  const s = () => useCartStore.getState()
  beforeEach(() => s().clearCart())

  test('the store, the score and the gate agree, minute for minute', () => {
    for (const id of [1, 8, 13]) s().addItem(real(id))
    s().addStop({ ...stop("Miss T's Kitchen", null), afterId: undefined })
    const { items, stops } = s()
    const score = computeDayScore(items, stops)
    const days = s().dayTimesByDate()
    expect(Object.keys(days)).toHaveLength(1)
    expect(Object.values(days)[0]).toEqual(score.time)
    expect(s().maxDailyHours()).toBe(score.hours)
    expect(s().isDayOverLimit()).toBe(score.isOver)
  })

  test('the store refuses a tour or a stop that would take the day past eight hours', () => {
    for (const id of [1, 8, 13, 2]) s().addItem(real(id))
    expect(s().items).toHaveLength(4)
    expect(Object.values(s().dayTimesByDate())[0].total).toBe(DAY_LIMIT_MIN)
    // Full: another tour does not go in, nor does a lunch.
    s().addItem(real(9))
    expect(s().items.map((i) => i.id)).not.toContain(9)
    s().addStop({ ...stop("Miss T's Kitchen", null), afterId: undefined })
    expect(s().stops).toHaveLength(0)
    expect(s().isDayOverLimit()).toBe(false)
    expect(s().remainingHoursToday()).toBe(0)
  })
})
