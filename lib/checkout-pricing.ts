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
 * payload can't inflate it absurdly, and, critically, the ceiling now
 * scales with the number of distinct travel days so legitimate multi-day
 * itineraries are never falsely rejected.
 *
 * The reward discount is NO LONGER trusted from the client. The caller
 * passes a server-verified `rewardPercent` (looked up from the
 * authenticated user's `user_rewards` row); an anonymous or reward-less
 * request gets 0. This closes the "25%-off-for-anyone" hole where the
 * client could name its own discount.
 */

import { experiences, type Experience , tourPrice, tourOperatorCost, isZonePriced, zoneSells } from './experiences'
import type { TourZone } from './tour-zones'


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
  /** @deprecated client value is ignored, see PriceOptions.rewardPercent */
  rewardDiscount?: number
}

export interface PriceOptions {
  /** Server-verified reward percentage (0–100) for the authenticated user.
   *  Anything outside [0, REWARD_DISCOUNT_MAX_PCT] is clamped. */
  rewardPercent?: number
  /**
   * The pickup zone, for tours priced by where the guest is staying. The
   * route works it out itself from the pickup (lib/tour-zone-of
   * zoneOfPickup), never from a zone the client names. A tour priced by area
   * is refused without a zone it is sold in.
   */
  zone?: TourZone | null
  /**
   * The pickup is a place we know (a listed place or a transfer hotel), so a
   * missing zone means it is outside every zone rather than an area not yet
   * chosen. Only changes the words of the refusal.
   */
  pickupKnown?: boolean
}

export interface PricedLine {
  experience: Experience
  travelers: number
  date: string
  pricePerPerson: number
  lineTotal: number
  /** The pickup zone this line was priced from, for a tour priced by area; otherwise null. */
  zone: TourZone | null
}

export interface ServerPricing {
  lines: PricedLine[]
  subtotal: number
  fee: number
  transport: number
  rewardDiscount: number
  /** Dollars taken off by a coupon, applied after the reward. 0 when none. */
  couponDiscount: number
  /** The total before the coupon: what the client claims as `amount`. */
  totalBeforeCoupon: number
  total: number
}

export class PricingError extends Error {
  readonly code: 'unknown_experience' | 'invalid_travelers' | 'amount_mismatch' | 'pickup_area'
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
  let customerTotal = 0

  for (const raw of items) {
    const experience = experiences.find((e) => e.id === raw.id)
    if (!experience) {
      throw new PricingError('unknown_experience', `experience id ${raw.id} not in catalog`)
    }
    const travelers = Math.round(raw.travelers)
    // Same ceiling the cart UI enforces (lib/cart.ts clamps to 12). The
    // server bound used to sit at 20, so a direct POST could book a group
    // size no vehicle in the fleet actually seats.
    if (!Number.isFinite(travelers) || travelers < 1 || travelers > 12) {
      throw new PricingError(
        'invalid_travelers',
        `experience ${raw.id} traveler count out of bounds (got ${raw.travelers})`,
      )
    }
    // A tour priced by where the guest is staying is only sold from a zone it
    // has a rate for: never quietly priced from the cheapest zone.
    const zoned = isZonePriced(experience.pricing)
    const zone = zoned ? options.zone ?? null : null
    if (zoned && !zoneSells(experience.pricing, zone)) {
      throw new PricingError(
        'pickup_area',
        zone || options.pickupKnown
          ? `${experience.title} is not sold online from that pickup. Write to contact@mapltours.com and we will send you a price.`
          : `${experience.title} is priced by where you are staying. Choose your hotel or its area, or write to contact@mapltours.com for a price.`,
      )
    }
    // `lineTotal` is what the CUSTOMER pays for this line (all-in, group-tier
    // aware); `subtotal` accumulates what MAPL owes the OPERATOR, so the
    // booking stores supplier-cost vs margin exactly like transfers do.
    const lineTotal = tourPrice(experience.pricing, travelers, zone)
    const operatorCost = tourOperatorCost(experience.pricing, travelers, zone)
    lines.push({
      experience,
      travelers,
      date: raw.date,
      // A genuine per-head figure so every downstream consumer that renders
      // "N travelers x price" (confirmation email, operator alert, receipt
      // page, admin card) still multiplies back to exactly `lineTotal`. For a
      // group tour this is the party price divided across the party.
      pricePerPerson: Math.round((lineTotal / travelers) * 100) / 100,
      lineTotal,
      zone,
    })
    subtotal += operatorCost
    customerTotal += lineTotal
  }

  // MAPL's margin is whatever is left of the all-in price after the operator
  // is paid; it covers the 15% markup and card processing.
  const fee = Math.round((customerTotal - subtotal) * 100) / 100

  // Transport is NO LONGER CHARGED: Collin confirmed his tour prices include
  // transportation and entrance fees, so a separate transport line was a
  // double charge. Structurally zero on the server regardless of what any
  // client sends; the field survives (as 0) so booking rows, receipts and
  // emails keep their shape and old bookings still render their history.
  const transport = 0

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
    couponDiscount: 0,
    totalBeforeCoupon: total,
    total,
  }
}

/**
 * Take a coupon off a priced cart. The discount is server-checked cents from
 * lib/coupons (applyCoupon on `totalBeforeCoupon`), never a client figure.
 * total_paid becomes net of it; every reader of total_paid keeps working.
 */
export function withCouponDiscount(pricing: ServerPricing, discountCents: number): ServerPricing {
  const cents = Math.max(0, Math.round(discountCents))
  const base = Math.round(pricing.totalBeforeCoupon * 100)
  const applied = Math.min(cents, base)
  return {
    ...pricing,
    couponDiscount: applied / 100,
    total: (base - applied) / 100,
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
  const expected = server.totalBeforeCoupon ?? server.total
  if (Math.abs(claimedNum - expected) > PRICE_MATCH_TOLERANCE_USD) {
    throw new PricingError(
      'amount_mismatch',
      `client claimed $${claimedNum.toFixed(2)}, server computed $${expected.toFixed(2)}`,
    )
  }
}
