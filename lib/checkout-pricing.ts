/**
 * Server-side pricing recomputation for the tours checkout.
 *
 * Adversarial-review fix: previously the API trusted body.amount and
 * body.items[*].price from the browser. A modified client could underpay
 * or pin a fraudulent total to a cheap PaymentIntent. This module
 * rebuilds the cart from trusted catalog data and is the single source
 * of truth for what gets charged.
 *
 * Inputs (client-supplied):  experience id, traveler count, date.
 * Outputs (server-derived):  per-line price, subtotal, fee, total cents.
 *
 * Transport is client-supplied (it depends on a live gas price the client
 * already fetched) but is clamped to a per-travel-day ceiling so a tampered
 * payload can't inflate it absurdly — and, critically, the ceiling now
 * scales with the number of distinct travel days so legitimate multi-day
 * itineraries are never falsely rejected.
 *
 * The reward discount is NO LONGER trusted from the client. The caller
 * passes a server-verified `rewardPercent` (looked up from the
 * authenticated user's `user_rewards` row); an anonymous or reward-less
 * request gets 0. This closes the "25%-off-for-anyone" hole where the
 * client could name its own discount.
 */

import { experiences, type Experience } from './experiences'

/** Per travel-day ceiling on private-transport cost. A realistic Jamaica
 *  day (economy rental ~$65 + a long round-trip's fuel ~$60) tops out near
 *  $130/day, so $250/day is generous head-room while still bounding a
 *  tampered or buggy payload. The cap scales with distinct travel days so
 *  multi-day itineraries (each its own rental day) are not rejected. */
const TRANSPORT_MAX_PER_DAY_USD = 250
/** Floor so a single-day trip keeps a sane minimum ceiling. */
const TRANSPORT_FLOOR_USD = 300

/** Reward discount can never exceed this % of (subtotal + fee + transport),
 *  a defensive backstop on top of the server-verified percent. */
const REWARD_DISCOUNT_MAX_PCT = 25

/** Tolerance between client-claimed total and server-computed total. */
const PRICE_MATCH_TOLERANCE_USD = 1

export interface ClientCartLine {
  id: number
  travelers: number
  date: string
}

export interface ClientBreakdown {
  transport?: number
  /** @deprecated client value is ignored — see PriceOptions.rewardPercent */
  rewardDiscount?: number
}

export interface PriceOptions {
  /** Server-verified reward percentage (0–100) for the authenticated user.
   *  Anything outside [0, REWARD_DISCOUNT_MAX_PCT] is clamped. */
  rewardPercent?: number
}

export interface PricedLine {
  experience: Experience
  travelers: number
  date: string
  pricePerPerson: number
  lineTotal: number
}

export interface ServerPricing {
  lines: PricedLine[]
  subtotal: number
  fee: number
  transport: number
  rewardDiscount: number
  total: number
}

export class PricingError extends Error {
  readonly code: 'unknown_experience' | 'invalid_travelers' | 'amount_mismatch'
  readonly detail: string
  constructor(code: PricingError['code'], detail: string) {
    super(`${code}: ${detail}`)
    this.name = 'PricingError'
    this.code = code
    this.detail = detail
  }
}

export function priceTourCart(
  items: ClientCartLine[],
  breakdown: ClientBreakdown,
  options: PriceOptions = {},
): ServerPricing {
  if (!items.length) {
    throw new PricingError('unknown_experience', 'cart is empty')
  }

  const lines: PricedLine[] = []
  let subtotal = 0

  for (const raw of items) {
    const experience = experiences.find((e) => e.id === raw.id)
    if (!experience) {
      throw new PricingError('unknown_experience', `experience id ${raw.id} not in catalog`)
    }
    const travelers = Math.round(raw.travelers)
    if (!Number.isFinite(travelers) || travelers < 1 || travelers > 20) {
      throw new PricingError(
        'invalid_travelers',
        `experience ${raw.id} traveler count out of bounds (got ${raw.travelers})`,
      )
    }
    const lineTotal = experience.price * travelers
    lines.push({
      experience,
      travelers,
      date: raw.date,
      pricePerPerson: experience.price,
      lineTotal,
    })
    subtotal += lineTotal
  }

  // 20% platform/service fee — matches lib/cart.ts.
  const fee = Math.round(subtotal * 0.20)

  // Transport: client-supplied (depends on the live gas price the client
  // already fetched) but clamped to a ceiling that SCALES with distinct
  // travel days. Each date in the cart is its own rental day, so an 8-day
  // itinerary legitimately costs far more than a flat cap would allow.
  const distinctDays = new Set(
    items.map((i) => (i.date || '').trim()).filter(Boolean),
  ).size || 1
  const transportCap = Math.max(TRANSPORT_FLOOR_USD, distinctDays * TRANSPORT_MAX_PER_DAY_USD)
  const rawTransport = Number(breakdown.transport ?? 0)
  const transport = Math.max(0, Math.min(transportCap, isFinite(rawTransport) ? rawTransport : 0))

  // Reward: NEVER trusted from the client. The caller passes a
  // server-verified percent (from the authenticated user's reward row);
  // we compute the dollar discount ourselves and defensively cap it.
  const rewardPercent = Math.max(0, Math.min(REWARD_DISCOUNT_MAX_PCT, Number(options.rewardPercent ?? 0) || 0))
  const baseTotal = subtotal + fee + transport
  const cappedReward = Math.round((baseTotal * rewardPercent) / 100)

  const total = Math.max(0, baseTotal - cappedReward)

  return {
    lines,
    subtotal,
    fee,
    transport,
    rewardDiscount: cappedReward,
    total,
  }
}

/**
 * Confirm the client's claimed amount matches what we just computed.
 * Throws PricingError('amount_mismatch') on a difference greater than
 * the small rounding tolerance.
 */
export function assertAmountMatches(claimed: number, server: ServerPricing): void {
  const claimedNum = Number(claimed)
  if (!Number.isFinite(claimedNum)) {
    throw new PricingError('amount_mismatch', `client amount ${claimed} is not a number`)
  }
  if (Math.abs(claimedNum - server.total) > PRICE_MATCH_TOLERANCE_USD) {
    throw new PricingError(
      'amount_mismatch',
      `client claimed $${claimedNum.toFixed(2)}, server computed $${server.total.toFixed(2)}`,
    )
  }
}
