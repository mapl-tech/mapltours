import { describe, test, expect } from 'vitest'
import {
  DESTINATIONS, buildQuote, driverCost, getTransferPrice,
  CARD_RATE, CARD_FIXED, TRANSFER_MARGIN, MAX_TRANSFER_PASSENGERS,
  type TransferTripType,
} from '@/lib/airport-transfers'

/**
 * The ride price rule of Nov 24 2026 (owner, asking whether MAPL made 15% on
 * rides and tours: "reduce both to 15%", and in the question dialog "Exactly
 * 15% on every ride"). Every hotel and villa on the rate card, both trip
 * types, every party the checkout takes (1 to 7):
 *
 *  - MAPL keeps 15% of the driver's rate after card fees (3.7% + US$0.30 on a
 *    US-dollar charge) and after paying the driver, which costs nothing since
 *    Nov 23 (Wise to Collin's own Wise account): never less, and never a whole
 *    dollar more (the price is rounded up to the dollar, nothing else);
 *  - the driver's rate is untouched;
 *  - against the Nov 21 rule (a 10% margin plus a payout allowance the size of
 *    Remitly's cost) a fare moves by at most US$5 down or US$4 up: the owner
 *    chose an even 15% over keeping every fare at or below its old price;
 *  - what the guest is quoted is what the server charges.
 */

// The rule from Nov 21 to Nov 24 2026.
const nov21Price = (cost: number, sends: number) =>
  Math.ceil((cost * (1 + 0.1 + 0.0205) + sends * 2.91 + 0.3) / (1 - 0.037))
// What MAPL keeps of a price: the card fee comes off, the driver is paid in full, and paying him is free.
const kept = (price: number, cost: number) => price * (1 - 0.037) - 0.3 - cost

const TRIPS: TransferTripType[] = ['one_way', 'round_trip']
const cases = DESTINATIONS.flatMap((d) =>
  TRIPS.flatMap((trip) => Array.from({ length: MAX_TRANSFER_PASSENGERS }, (_, i) => ({ d, trip, pax: i + 1 }))),
)

describe('ride prices since Nov 24 2026', () => {
  test('the constants: card fees on a US-dollar charge and a 15% margin', () => {
    expect(CARD_RATE).toBe(0.037)
    expect(CARD_FIXED).toBe(0.3)
    expect(TRANSFER_MARGIN).toBe(0.15)
  })

  test('every hotel, trip and party: MAPL keeps 15% of the driver rate, and at most a dollar of rounding over it', () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(190)
    expect(cases.length).toBeGreaterThan(2700)
    for (const { d, trip, pax } of cases) {
      const cost = driverCost(d.id, trip, pax)!
      const price = getTransferPrice(d.id, trip, pax)!
      const where = `${d.id} ${trip} x${pax}`
      expect(kept(price, cost), where).toBeGreaterThanOrEqual(cost * 0.15 - 1e-9)
      // A dollar less would keep under 15%: the price is the lowest whole dollar that keeps it.
      expect(kept(price - 1, cost), where).toBeLessThan(cost * 0.15)
      // What the guest is quoted is what the server charges.
      expect(buildQuote(d.id, trip, pax)!.priceUsd, where).toBe(price)
    }
  })

  test('against the Nov 21 fares: at most US$5 down or US$4 up, and lower on average', () => {
    let before = 0
    let now = 0
    let down = 0
    let up = 0
    for (const { d, trip, pax } of cases) {
      const cost = driverCost(d.id, trip, pax)!
      const old = nov21Price(cost, trip === 'round_trip' ? 2 : 1)
      const price = getTransferPrice(d.id, trip, pax)!
      const where = `${d.id} ${trip} x${pax}`
      expect(price - old, where).toBeGreaterThanOrEqual(-5)
      expect(price - old, where).toBeLessThanOrEqual(4)
      before += old
      now += price
      if (price < old) down++
      if (price > old) up++
    }
    expect(now).toBeLessThan(before)
    // Measured when the rule changed: 1,726 fares down, 470 the same, 590 up.
    expect(down).toBeGreaterThan(up)
  })

  test('the fares the owner knows, worked out by hand', () => {
    // Sandals Negril: Collin $90 a way, $162 for a round trip (his 10% off).
    // (162 x 1.15 + 0.30) / 0.963 = 193.77, rounded up. It was $195.
    expect(driverCost('sandals-negril', 'round_trip', 4)).toBe(162)
    expect(getTransferPrice('sandals-negril', 'round_trip', 4)).toBe(194)
    expect(getTransferPrice('sandals-negril', 'one_way', 4)).toBe(108) // was $109
    // Bahia Principe (Runaway Bay): Collin $80 a way, $144 round trip.
    expect(getTransferPrice('bahia-principe-escape', 'round_trip', 4)).toBe(173) // was $174
    expect(getTransferPrice('bahia-principe-escape', 'one_way', 4)).toBe(96) // was $97
    // The cheapest fare on the card: Deja Resort, Collin $15 a way.
    expect(getTransferPrice('deja-resort', 'one_way', 1)).toBe(19) // was $21
    expect(getTransferPrice('deja-resort', 'round_trip', 1)).toBe(33) // was $38
  })
})
