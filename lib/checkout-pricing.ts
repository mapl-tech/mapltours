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
 * Transport and reward discount are still client-supplied because they
 * depend on live gas prices and per-user reward state that's expensive to
 * recompute here. Both are clamped to defensive maxima so a tampered
 * payload can't inflate transport or zero out the bill via reward fraud.
 */

import { experiences, type Experience } from './experiences'

/** Max plausible private-transport cost per trip — guards against a
 *  malicious client telling us transport is "-$9999" or some such. */
const TRANSPORT_MAX_USD = 600

/** Reward discount can never exceed this % of (subtotal + fee + transport). */
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
  rewardDiscount?: number
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

  // Transport: client-supplied (depends on live gas price) but clamped.
  const rawTransport = Number(breakdown.transport ?? 0)
  const transport = Math.max(0, Math.min(TRANSPORT_MAX_USD, isFinite(rawTransport) ? rawTransport : 0))

  // Reward: client-supplied, but capped relative to base total.
  const baseTotal = subtotal + fee + transport
  const rawReward = Number(breakdown.rewardDiscount ?? 0)
  const cappedReward = Math.max(0, Math.min(rawReward, Math.round((baseTotal * REWARD_DISCOUNT_MAX_PCT) / 100)))

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
