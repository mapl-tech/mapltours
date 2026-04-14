import type { CartItem } from './cart'
import { DAILY_HOUR_LIMIT, parseDurationHours } from './cart'

export type DayStage = 'empty' | 'starting' | 'flowing' | 'perfect' | 'over'

export interface DayScoreBreakdown {
  /** 0–100 weighted total. */
  total: number
  stage: DayStage
  stageLabel: string
  /** Busiest day's hours — the one we evaluate. */
  hours: number
  /** ISO date of the day being evaluated, or null if cart is empty. */
  date: string | null
  variety:    { score: number; max: number; distinctCategories: number }
  balance:    { score: number; max: number }
  efficiency: { score: number; max: number; distinctDestinations: number }
  /** Encouraging, action-oriented hint shown under the bar. */
  nudge: string
  /** True when the user is capped out at exactly 8hrs on a day. */
  isPerfect: boolean
  /** True when the user is over 8hrs on any day. */
  isOver: boolean
}

const VARIETY_MAX = 35
const BALANCE_MAX = 40
const EFFICIENCY_MAX = 25

/**
 * Returns the "Day Builder" score for the busiest day in the cart plus a
 * human-readable stage label and upsell nudge. Pure function — no hooks —
 * so it can be called from selectors, components, and tests.
 */
export function computeDayScore(items: CartItem[]): DayScoreBreakdown {
  if (items.length === 0) {
    return {
      total: 0,
      stage: 'empty',
      stageLabel: 'Start building',
      hours: 0,
      date: null,
      variety: { score: 0, max: VARIETY_MAX, distinctCategories: 0 },
      balance: { score: 0, max: BALANCE_MAX },
      efficiency: { score: 0, max: EFFICIENCY_MAX, distinctDestinations: 0 },
      nudge: 'Pick a tour to start your perfect day',
      isPerfect: false,
      isOver: false,
    }
  }

  // Group hours by date, find the busiest day — that's the one we score.
  const byDate: Record<string, CartItem[]> = {}
  for (const it of items) {
    const key = it.date || 'unset'
    ;(byDate[key] ||= []).push(it)
  }
  const [topDate, topItems] = Object.entries(byDate).reduce<[string, CartItem[]]>(
    (best, curr) => {
      const [, bestItems] = best
      const bestHrs = bestItems.reduce((s, i) => s + parseDurationHours(i.duration), 0)
      const currHrs = curr[1].reduce((s, i) => s + parseDurationHours(i.duration), 0)
      return currHrs > bestHrs ? curr : best
    },
    [Object.keys(byDate)[0], byDate[Object.keys(byDate)[0]]]
  )

  const hours = topItems.reduce((s, i) => s + parseDurationHours(i.duration), 0)
  const categories = new Set(topItems.map((i) => i.category))
  const destinations = new Set(topItems.map((i) => i.destination))
  const isOver = hours > DAILY_HOUR_LIMIT

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
  else if (hours > 0) { stage = 'starting'; stageLabel = 'Getting Started' }

  // ── Nudge: most actionable next step (order matters) ─────────────────────
  const nudge = buildNudge({
    hours,
    isOver,
    over: Math.max(0, hours - DAILY_HOUR_LIMIT),
    total,
    distinctCategories: categories.size,
    distinctDestinations: destinations.size,
  })

  return {
    total,
    stage,
    stageLabel,
    hours,
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
}: {
  hours: number
  isOver: boolean
  over: number
  total: number
  distinctCategories: number
  distinctDestinations: number
}): string {
  if (hours === 0) return 'Pick a tour to start your perfect day'
  if (isOver) {
    const hrStr = over === 1 ? 'hour' : 'hours'
    return `Remove ${fmtHours(over)} ${hrStr} to get back on track`
  }
  if (total >= 95) return 'You’ve built a perfect day ✨'

  const remaining = DAILY_HOUR_LIMIT - hours
  if (hours < 3.5) {
    return `Add ${fmtHours(remaining)} more to hit a great flow`
  }
  if (hours < 6) {
    // Usually variety is the limiting factor at 4–5 hrs with 1–2 tours
    if (distinctCategories < 3) return 'Mix in a different category for more variety'
    return `One more tour and you’ve got a perfect day`
  }
  // 6–6.99 hrs — almost there
  if (distinctCategories < 3) return 'One more tour in a fresh category completes your day'
  if (distinctDestinations >= 4) return 'Consolidating nearby tours will boost your score'
  return 'Add a short tour to complete your perfect day'
}

function fmtHours(h: number): string {
  const rounded = Math.round(h * 2) / 2
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1)
}
