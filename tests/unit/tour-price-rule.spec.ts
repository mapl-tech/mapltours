import { describe, test, expect } from 'vitest'
import { experiences, tourOperatorCost, tourPrice, zonesSold, isZonePriced, TOUR_MARGIN, type Experience } from '@/lib/experiences'
import type { TourZone } from '@/lib/tour-zones'

/**
 * The tour price rule of Nov 24 2026 (owner, asking whether MAPL made 15% on
 * rides and tours: "reduce tours by 3.22%", then "reduce both to 15%"). Every
 * tour, paused ones included, from every pickup area it is sold in, for every
 * party of 1 to 12 (the most checkout takes):
 *
 *  - MAPL keeps 15% of the operator's rate after card fees (3.7% + US$0.30 on
 *    a US-dollar charge) and after paying the operator, which costs nothing
 *    since Nov 23 (Wise to Collin's own Wise account): never less, and never a
 *    whole dollar more (the price is rounded up to the dollar, nothing else);
 *  - every price is lower than under the Nov 19 rule (18.22% plus 0.3% for
 *    paying the operator by Wise to a US receiving account);
 *  - the operator's rate is untouched (the price rule never reads it back);
 *  - a per-person tour never charges n guests more than n times the price
 *    for one, so "per person" on the page is never contradicted at checkout.
 */

// The rule from Nov 19 to Nov 24 2026.
const nov19Price = (cost: number) => Math.ceil((cost * (1 + 0.1822 + 0.003) + 0.3) / (1 - 0.037))
// What MAPL keeps of a price: the card fee comes off, the operator is paid in full, and paying him is free.
const kept = (price: number, cost: number) => price * (1 - 0.037) - 0.3 - cost

type Priced = Experience & { pricing: NonNullable<Experience['pricing']> }
const tours = experiences.filter((e): e is Priced => !!e.pricing)
const cases = tours.flatMap((e) => {
  const zones: (TourZone | null)[] = isZonePriced(e.pricing) ? zonesSold(e.pricing) : [null]
  return zones.flatMap((zone) => Array.from({ length: 12 }, (_, i) => ({ e, zone, n: i + 1 })))
})

describe('tour prices since Nov 24 2026', () => {
  test('the margin is the one the owner chose', () => {
    expect(TOUR_MARGIN).toBe(0.15)
  })

  test('every tour, area and party: MAPL keeps 15% of the operator rate, and at most a dollar of rounding over it', () => {
    expect(tours.length).toBeGreaterThanOrEqual(19)
    expect(cases.length).toBeGreaterThan(500)
    for (const { e, zone, n } of cases) {
      const cost = tourOperatorCost(e.pricing, n, zone)
      const price = tourPrice(e.pricing, n, zone)
      const where = `${e.id} ${e.title} ${zone ?? 'any area'} x${n}`
      expect(kept(price, cost), where).toBeGreaterThanOrEqual(cost * 0.15 - 1e-9)
      // A dollar less would keep under 15%: the price is the lowest whole dollar that keeps it.
      expect(kept(price - 1, cost), where).toBeLessThan(cost * 0.15)
    }
  })

  test('every tour, area and party: cheaper than under the Nov 19 rule', () => {
    for (const { e, zone, n } of cases) {
      const cost = tourOperatorCost(e.pricing, n, zone)
      expect(tourPrice(e.pricing, n, zone), `${e.id} ${zone ?? 'any area'} x${n}`).toBeLessThan(nov19Price(cost))
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
    expect(tourPrice(byId(1), 2, 'montego_bay')).toBe(335) // Dunn's River Falls for 2 from Montego Bay, was $345
    expect(tourPrice(byId(1), 2, 'ocho_rios')).toBe(228) // from Ocho Rios, was $235
    expect(tourPrice(byId(3), 2, 'montego_bay')).toBe(216) // Bamboo rafting for 2, was $222
    expect(tourPrice(byId(14), 4, 'montego_bay')).toBe(240) // Rick's Cafe for 4, was $247
  })
})
