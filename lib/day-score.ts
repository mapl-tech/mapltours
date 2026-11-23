import type { CartItem, FoodStop } from './cart'
import { DAILY_HOUR_LIMIT, DAY_LIMIT_MIN, formatDayTime } from './day-hours'
import { dayTime, daysOf, type DayTime } from './day-route'

export type DayStage = 'empty' | 'starting' | 'flowing' | 'perfect' | 'over'

export interface DayScoreBreakdown {
  /** 0–100 weighted total. */
  total: number
  stage: DayStage
  stageLabel: string
  /** Busiest day's hours (tours, food stops and the drives between), the one we evaluate. */
  hours: number
  /** The same day in whole minutes, part by part (lib/day-route dayTime). */
  time: DayTime
  /** ISO date of the day being evaluated, or null if cart is empty. */
  date: string | null
  variety:    { score: number; max: number; distinctCategories: number }
  balance:    { score: number; max: number }
  efficiency: { score: number; max: number; distinctDestinations: number }
  /** Encouraging, action-oriented hint shown under the bar. */
  nudge: string
  /** True when the day is full and well mixed: past 6 hours, within 8, scoring 95+. */
  isPerfect: boolean
  /** True when the busiest day runs past 8 hours, driving included. */
  isOver: boolean
}

/**
 * The shortest tour in the catalog. Below this much room left, no tour can
 * be added to the day at all, which is what separates "nearly full" from
 * "full" in buildNudge.
 */
const SHORTEST_TOUR_HOURS = 1

const VARIETY_MAX = 35
const BALANCE_MAX = 40
const EFFICIENCY_MAX = 25

const NO_TIME: DayTime = { tours: 0, stops: 0, driving: 0, total: 0 }

/**
 * Returns the "Day Builder" score for the busiest day in the cart plus a
 * human-readable stage label and upsell nudge. Pure function, no hooks,
 * so it can be called from selectors, components, and tests.
 *
 * The day is measured exactly as the cart's isDayOverLimit() gate measures it
 * (lib/day-route dayTime: tours, free food stops and the driving between
 * them), so the bar can never read 7 of 8 while checkout blocks the day.
 */
export function computeDayScore(items: CartItem[], stops: FoodStop[] = []): DayScoreBreakdown {
  if (items.length === 0) {
    return {
      total: 0,
      stage: 'empty',
      stageLabel: 'Start building',
      hours: 0,
      time: NO_TIME,
      date: null,
      variety: { score: 0, max: VARIETY_MAX, distinctCategories: 0 },
      balance: { score: 0, max: BALANCE_MAX },
      efficiency: { score: 0, max: EFFICIENCY_MAX, distinctDestinations: 0 },
      nudge: 'Pick a tour to start your perfect day',
      isPerfect: false,
      isOver: false,
    }
  }

  // Each date with its tours and stops; the busiest day is the one we score.
  let topDate = ''
  let topItems: CartItem[] = []
  let time = NO_TIME
  daysOf(items, stops).forEach((day, date) => {
    if (day.items.length === 0) return
    const t = dayTime(day.items, day.stops)
    if (!topItems.length || t.total > time.total) {
      topDate = date
      topItems = day.items
      time = t
    }
  })

  const hours = time.total / 60
  const categories = new Set(topItems.map((i) => i.category))
  const destinations = new Set(topItems.map((i) => i.destination))
  const isOver = time.total > DAY_LIMIT_MIN

  // ── Balance: peaks at 7–8 hrs, decays past 8 ─────────────────────────────
  let balance = 0
  if (hours >= 7 && hours <= DAILY_HOUR_LIMIT) {
    balance = BALANCE_MAX
  } else if (hours > DAILY_HOUR_LIMIT) {
    balance = Math.max(0, BALANCE_MAX - (hours - DAILY_HOUR_LIMIT) * 6)
  } else {
    balance = Math.round((hours / 7) * BALANCE_MAX)
  }

  // ── Variety: reward diverse categories ───────────────────────────────────
  const varietyTable: Record<number, number> = { 0: 0, 1: 10, 2: 22, 3: 30 }
  const variety = categories.size >= 4 ? VARIETY_MAX : (varietyTable[categories.size] ?? VARIETY_MAX)

  // ── Efficiency: fewer distinct destinations = tighter logistics ──────────
  const efficiencyTable: Record<number, number> = { 1: 25, 2: 20, 3: 12 }
  const efficiency = destinations.size >= 4
    ? 5
    : (efficiencyTable[destinations.size] ?? 0)

  const total = Math.min(100, Math.max(0, Math.round(balance + variety + efficiency)))

  // ── Stage ────────────────────────────────────────────────────────────────
  let stage: DayStage = 'empty'
  let stageLabel = 'Start building'
  if (isOver) { stage = 'over'; stageLabel = 'Over capacity' }
  else if (hours > 6) { stage = 'perfect'; stageLabel = 'Perfect Day' }
  else if (hours > 3) { stage = 'flowing'; stageLabel = 'Great Flow' }
  else if (hours > 0) { stage = 'starting'; stageLabel = 'Relaxed day' }

  // ── Nudge: most actionable next step (order matters) ─────────────────────
  const nudge = buildNudge({
    hours,
    isOver,
    over: Math.max(0, time.total - DAY_LIMIT_MIN) / 60,
    total,
    distinctCategories: categories.size,
    distinctDestinations: destinations.size,
    soleKind: topItems.length === 1 ? (topItems[0].kind === 'package' ? 'package' : 'tour') : null,
  })

  return {
    total,
    stage,
    stageLabel,
    hours,
    time,
    date: topDate === 'unset' ? null : topDate,
    variety:    { score: variety, max: VARIETY_MAX, distinctCategories: categories.size },
    balance:    { score: balance, max: BALANCE_MAX },
    efficiency: { score: efficiency, max: EFFICIENCY_MAX, distinctDestinations: destinations.size },
    nudge,
    isPerfect: hours > 6 && hours <= DAILY_HOUR_LIMIT && total >= 95,
    isOver,
  }
}

function buildNudge({
  hours,
  isOver,
  over,
  total,
  distinctCategories,
  distinctDestinations,
  soleKind = null,
}: {
  hours: number
  isOver: boolean
  over: number
  total: number
  distinctCategories: number
  distinctDestinations: number
  /** Set when the day is one tour or one ready-made package: there is nothing to swap or mix. */
  soleKind?: 'package' | 'tour' | null
}): string {
  if (hours === 0) return 'Pick a tour to start your perfect day'
  // `over` and `remaining` are hours of a day counted in whole minutes, so
  // they print as minutes: a day 35 minutes over says so, not "0.5 hours".
  if (isOver) return `${formatDayTime(over * 60)} past ${DAILY_HOUR_LIMIT} hours: remove a tour or a food stop`

  const remaining = DAILY_HOUR_LIMIT - hours

  // Nothing else fits. Every nudge below this line asks for another tour, and
  // asking for one against a bar that reads 8/8 is advice the checkout gate
  // would refuse to honour — so when the day is full the only honest moves
  // are a swap or a second day.
  if (remaining < SHORTEST_TOUR_HOURS) {
    if (soleKind) return `This ${soleKind} fills your day`
    if (total >= 95) return 'You’ve built a perfect day ✨'
    if (distinctCategories < 3) return 'Your day is full, swap a tour for a different category to mix it up'
    if (distinctDestinations >= 4) return 'Your day is full, tours closer together would cut the driving'
    return 'Your day is full: tours and the drives between them'
  }

  if (total >= 95) return 'You’ve built a perfect day ✨'

  // From here on there is room for another tour, and how much room is what
  // decides which tour can still go in (the 8-hour gate counts the drive to
  // it), so every nudge starts with it.
  const left = formatDayTime(remaining * 60)

  if (hours < 3.5) {
    // An invitation, not a verdict: a one-tour day is a fine thing to book,
    // and the old "Add 7 more to hit a great flow" (no unit) read as if it
    // were not good enough yet.
    return `Room for ${formatDayTime(remaining * 60)} more in your day, drives included, or book it as it is`
  }
  if (hours < 6) {
    // Usually variety is the limiting factor at 4–5 hrs with 1–2 tours
    if (distinctCategories < 3) return `${left} left: mix in a different category for more variety`
    return `${left} left: one more tour and you’ve got a perfect day`
  }
  // 6–6.99 hrs, almost there
  if (distinctCategories < 3) return `${left} left: one more tour in a fresh category completes your day`
  if (distinctDestinations >= 4) return `${left} left: tours closer together would cut the driving`
  return `${left} left: add a short tour to complete your perfect day`
}
