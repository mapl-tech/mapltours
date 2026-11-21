import { describe, test, expect } from 'vitest'
import {
  DESTINATIONS, buildQuote, driverCost, getTransferPrice,
  CARD_RATE, CARD_FIXED, TRANSFER_MARGIN, REMITLY_FLAT, REMITLY_FX, MAX_TRANSFER_PASSENGERS,
  type TransferTripType,
} from '@/lib/airport-transfers'

/**
 * The ride price rule of Nov 21 2026 (owner: take Stripe's 2% conversion out
 * of the ride prices and keep the profit margin). Every hotel and villa on
 * the rate card, both trip types, every party the checkout takes (1 to 7):
 *
 *  - the price is never higher than it was, and the driver's rate is untouched;
 *  - MAPL keeps at least what it really kept before the Stripe account moved
 *    to US dollars (card 5.7% + US$0.22 with the 2% conversion, Remitly
 *    US$2.80 a payment plus 1.78%), at the costs each price actually pays
 *    (now: card 3.7% + US$0.30, Wise 0.30%);
 *  - MAPL keeps its 10% of the driver's rate even if a ride were paid by hand
 *    through Remitly again, because the payout allowance stayed in the price;
 *  - the fall is the conversion and rounding, never more.
 */

// The rule as it stood until Nov 21 2026, and what that route really cost.
const legacyPrice = (cost: number, sends: number) =>
  Math.ceil((cost * (1 + 0.10 + 0.0205) + sends * 2.91 + 0.22) / (1 - 0.057))
const REMITLY_SEND_USD = 3.99 * 0.700697 // CAD 3.99 at the Nov 14 2026 mid-market rate
const REMITLY_SPREAD = 1 - 109.02 / 110.993 // Remitly's CAD to JMD rate under mid-market, Nov 14 2026
const keptBefore = (price: number, cost: number, sends: number) =>
  price * (1 - 0.057) - 0.22 - cost - (cost * REMITLY_SPREAD + sends * REMITLY_SEND_USD)
const keptNow = (price: number, cost: number) => price * (1 - 0.037) - 0.3 - cost - cost * 0.003
const keptByRemitly = (price: number, cost: number, sends: number) =>
  price * (1 - 0.037) - 0.3 - cost - (cost * 0.0205 + sends * 2.91)

const TRIPS: TransferTripType[] = ['one_way', 'round_trip']
const cases = DESTINATIONS.flatMap((d) =>
  TRIPS.flatMap((trip) => Array.from({ length: MAX_TRANSFER_PASSENGERS }, (_, i) => ({ d, trip, pax: i + 1 }))),
)

describe('ride prices since Nov 21 2026', () => {
  test('the constants: card fees on a US-dollar charge, and nothing else moved', () => {
    expect(CARD_RATE).toBe(0.037)
    expect(CARD_FIXED).toBe(0.3)
    expect(TRANSFER_MARGIN).toBe(0.1)
    expect(REMITLY_FLAT).toBe(2.91)
    expect(REMITLY_FX).toBe(0.0205)
  })

  test('every hotel, trip and party: never dearer, and MAPL keeps at least what it kept', () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(190)
    expect(cases.length).toBeGreaterThan(2700)
    let cheaper = 0
    for (const { d, trip, pax } of cases) {
      const cost = driverCost(d.id, trip, pax)!
      const now = getTransferPrice(d.id, trip, pax)!
      const sends = trip === 'round_trip' ? 2 : 1
      const before = legacyPrice(cost, sends)
      const where = `${d.id} ${trip} x${pax}`
      expect(now, where).toBeLessThanOrEqual(before)
      if (now < before) cheaper++
      expect(keptNow(now, cost), where).toBeGreaterThanOrEqual(keptBefore(before, cost, sends))
      // The fall is the 2% conversion (about 2.08% once grossed up) plus at most a dollar of rounding.
      expect(before - now, where).toBeLessThanOrEqual(before * (1 - 0.943 / 0.963) + 1)
      // What the guest is quoted is what the server charges.
      expect(buildQuote(d.id, trip, pax)!.priceUsd, where).toBe(now)
    }
    // Rounding to the dollar leaves a few fares where they were; nearly all fall.
    expect(cheaper / cases.length).toBeGreaterThan(0.95)
  })

  test('MAPL keeps its 10% of the driver rate after card fees, even if a ride were paid through Remitly', () => {
    for (const { d, trip, pax } of cases) {
      const cost = driverCost(d.id, trip, pax)!
      const price = getTransferPrice(d.id, trip, pax)!
      const sends = trip === 'round_trip' ? 2 : 1
      const where = `${d.id} ${trip} x${pax}`
      expect(keptByRemitly(price, cost, sends), where).toBeGreaterThanOrEqual(cost * 0.1 - 1e-9)
      expect(keptNow(price, cost), where).toBeGreaterThanOrEqual(cost * 0.1 - 1e-9)
    }
  })

  test('the fares the owner knows, worked out by hand', () => {
    // Sandals Negril: Collin $90 a way, $162 for a round trip (his 10% off).
    // (162 x 1.1205 + 2 x 2.91 + 0.30) / 0.963 = 194.85, rounded up.
    expect(getTransferPrice('sandals-negril', 'round_trip', 4)).toBe(195)
    expect(getTransferPrice('sandals-negril', 'one_way', 4)).toBe(109)
    // Bahia Principe (Runaway Bay): Collin $80 a way, $144 round trip.
    expect(getTransferPrice('bahia-principe-escape', 'round_trip', 4)).toBe(174)
    expect(getTransferPrice('bahia-principe-escape', 'one_way', 4)).toBe(97)
    // The cheapest fare on the card: Deja Resort, Collin $15 a way.
    expect(getTransferPrice('deja-resort', 'one_way', 1)).toBe(21)
    expect(getTransferPrice('deja-resort', 'round_trip', 1)).toBe(38)
    expect(driverCost('sandals-negril', 'round_trip', 4)).toBe(162)
  })
})
