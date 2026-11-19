import { describe, test, expect } from 'vitest'
import { experiences, tourOperatorCost, tourPrice, zonesSold, isZonePriced, TOUR_MARGIN, TOUR_PAYOUT_RATE, type Experience } from '@/lib/experiences'
import type { TourZone } from '@/lib/tour-zones'

/**
 * The tour price rule of Nov 19 2026 (owner: take the fees of the old payment
 * route out of every tour price and keep MAPL's profit). Every tour, paused
 * ones included, from every pickup area it is sold in, for every party of 1
 * to 12 (the most checkout takes):
 *
 *  - the price is lower than it was;
 *  - MAPL keeps at least what it really kept before, at the costs each price
 *    actually pays (before: card 5.7% + US$0.22 with Stripe's 2% conversion,
 *    Remitly US$2.80 a payment plus 1.78%; now: card 3.7% + US$0.30, Wise
 *    0.30%), so no tour got cheaper out of MAPL's pocket;
 *  - the operator's rate is untouched (the price rule never reads it back);
 *  - a per-person tour never charges n guests more than n times the price
 *    for one, so "per person" on the page is never contradicted at checkout.
 */

// The rule as it stood until Nov 18 2026, and what that route really cost.
const legacyPrice = (cost: number) => Math.ceil((cost * (1 + 0.15 + 0.05) + 0.22) / (1 - 0.057))
const REMITLY_SEND_USD = 3.99 * 0.700697 // CAD 3.99 at the Nov 14 2026 mid-market rate
const REMITLY_SPREAD = 1 - 109.02 / 110.993 // Remitly's CAD to JMD rate under mid-market, Nov 14 2026
const keptBefore = (price: number, cost: number) => price * (1 - 0.057) - 0.22 - cost - (cost * REMITLY_SPREAD + REMITLY_SEND_USD)
const keptNow = (price: number, cost: number) => price * (1 - 0.037) - 0.3 - cost - cost * 0.003

type Priced = Experience & { pricing: NonNullable<Experience['pricing']> }
const tours = experiences.filter((e): e is Priced => !!e.pricing)
const cases = tours.flatMap((e) => {
  const zones: (TourZone | null)[] = isZonePriced(e.pricing) ? zonesSold(e.pricing) : [null]
  return zones.flatMap((zone) => Array.from({ length: 12 }, (_, i) => ({ e, zone, n: i + 1 })))
})

describe('tour prices since Nov 19 2026', () => {
  test('the constants are the ones the owner agreed', () => {
    expect(TOUR_MARGIN).toBe(0.1822)
    expect(TOUR_PAYOUT_RATE).toBe(0.003)
  })

  test('every tour, area and party: cheaper than before, and MAPL keeps at least what it kept', () => {
    expect(tours.length).toBeGreaterThanOrEqual(19)
    expect(cases.length).toBeGreaterThan(500)
    for (const { e, zone, n } of cases) {
      const cost = tourOperatorCost(e.pricing, n, zone)
      const now = tourPrice(e.pricing, n, zone)
      const before = legacyPrice(cost)
      const where = `${e.id} ${e.title} ${zone ?? 'any area'} x${n}`
      expect(now, where).toBeLessThan(before)
      expect(keptNow(now, cost), where).toBeGreaterThanOrEqual(keptBefore(before, cost))
      // Never by more than the fees taken out (3.7% of the old price is the most the switch saves).
      expect((before - now) / before, where).toBeLessThan(0.037)
    }
  })

  test('MAPL keeps 18.22% of the operator rate after card fees and the Wise payment, rounded up, never less', () => {
    for (const { e, zone, n } of cases) {
      const cost = tourOperatorCost(e.pricing, n, zone)
      const kept = keptNow(tourPrice(e.pricing, n, zone), cost)
      expect(kept).toBeGreaterThanOrEqual(cost * 0.1822 - 1e-9)
      expect(kept).toBeLessThan(cost * 0.1822 + 1) // the rounding up to a whole dollar is the only extra
    }
  })

  test('a per-person tour never charges a party more than the price for one, times the party', () => {
    for (const { e, zone, n } of cases) {
      if (e.pricing.mode !== 'per_person') continue
      expect(tourPrice(e.pricing, n, zone), `${e.id} x${n}`).toBeLessThanOrEqual(n * tourPrice(e.pricing, 1, zone))
    }
  })

  test('the examples given to the owner', () => {
    const byId = (id: number) => tours.find((t) => t.id === id)!.pricing
    expect(tourPrice(byId(1), 2, 'montego_bay')).toBe(345) // Dunn's River Falls for 2 from Montego Bay, was $357
    expect(tourPrice(byId(3), 2, 'montego_bay')).toBe(222) // Bamboo rafting for 2, was $230
    expect(tourPrice(byId(14), 4, 'montego_bay')).toBe(247) // Rick's Cafe for 4, was $255
  })
})
