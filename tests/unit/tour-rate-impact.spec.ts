import { describe, test, expect } from 'vitest'
import { experiences, tourPrice } from '@/lib/experiences'
import { cardOf, type RateCard } from '@/lib/tour-rates'
import { describeParties, guestPriceAt, partiesMoved, placesCompared } from '@/lib/tour-rate-impact'
import { TOUR_ZONES } from '@/lib/tour-zones'

/**
 * The review step on /admin/tour-rates: what a rate change does to guests.
 * It must never show "no change" for a change that moves big groups only,
 * and never quote a "from" price for a place the tour is not sold from.
 */

const card = (id: number): RateCard => structuredClone(cardOf(experiences.find((e) => e.id === id)!))
const DUNNS = 1
const RICKS = 14
const ALL = Array.from({ length: 12 }, (_, i) => i + 1)

describe('guestPriceAt', () => {
  test('a tour priced by area: the zone’s price where it is sold, nothing anywhere else', () => {
    const d = card(DUNNS)
    expect(guestPriceAt(d, 2, 'negril')).toBe(510) // ($400 x 1.20 + $0.22) / 0.943, rounded up
    expect(guestPriceAt(d, 2, 'ocho_rios')).toBe(243)
    expect(guestPriceAt(d, 2, null)).toBeNull() // checkout refuses it without a sold zone: never the "from"
    delete d.pricing.zoneRates!.lucea
    expect(guestPriceAt(d, 2, 'lucea')).toBeNull()
  })

  test('a tour with one price: the same anywhere, and the price checkout charges', () => {
    const r = card(RICKS)
    expect(guestPriceAt(r, 3, null)).toBe(tourPrice(r.pricing, 3))
    expect(guestPriceAt(r, 3, 'negril')).toBe(tourPrice(r.pricing, 3))
  })
})

describe('placesCompared', () => {
  test('every area either card sells from, west to east; "anywhere else" only when one card is priced by area', () => {
    expect(placesCompared(card(DUNNS), card(DUNNS))).toEqual([...TOUR_ZONES])
    expect(placesCompared(card(RICKS), card(RICKS))).toEqual([null])
    expect(placesCompared(card(RICKS), card(DUNNS))).toEqual([...TOUR_ZONES, null])
    const westOnly = card(DUNNS)
    westOnly.pricing.zoneRates = { negril: 400 }
    const eastOnly = card(DUNNS)
    eastOnly.pricing.zoneRates = { ocho_rios: 190 }
    expect(placesCompared(westOnly, eastOnly)).toEqual(['negril', 'ocho_rios'])
  })
})

describe('partiesMoved: every group size whose guest price moves', () => {
  test('an area’s flat rate moves every group size', () => {
    const after = card(DUNNS)
    after.pricing.zoneRates!.negril = 420
    expect(partiesMoved(card(DUNNS), after)).toEqual(ALL)
  })

  test('the extra-person rate moves only groups past the first rate', () => {
    const after = card(DUNNS)
    after.pricing.extraPerPerson = 60
    expect(partiesMoved(card(DUNNS), after)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
    const r = card(RICKS)
    r.pricing.extraPerPerson = 45
    expect(partiesMoved(card(RICKS), r)).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  test('the group rate moves only the groups it covers', () => {
    const r = card(RICKS)
    r.pricing.baseRate = 210
    expect(partiesMoved(card(RICKS), r)).toEqual([1, 2, 3, 4])
  })

  test('an add-on moves everyone; the smallest party moves no price', () => {
    const addon = card(DUNNS)
    addon.pricing.perPersonAddon = 30
    expect(partiesMoved(card(DUNNS), addon)).toEqual(ALL)
    const min = card(DUNNS)
    min.minGuests = 2
    expect(partiesMoved(card(DUNNS), min)).toEqual([])
  })

  test('stopping an area moves every group size there', () => {
    const after = card(DUNNS)
    delete after.pricing.zoneRates!.negril
    expect(partiesMoved(card(DUNNS), after)).toEqual(ALL)
  })
})

describe('describeParties', () => {
  test.each([
    [[], 'no group size'],
    [ALL, 'every group size'],
    [[1], '1 person'],
    [[3], '3 people'],
    [[5, 6, 7, 8, 9, 10, 11, 12], 'groups of 5 to 12'],
    [[2, 5], 'groups of 2 and 5'],
    [[1, 2, 3, 9, 10], 'groups of 1 to 3 and 9 to 10'],
    [[1, 3, 5, 6, 7], 'groups of 1, 3 and 5 to 7'],
  ])('%j reads "%s"', (ns, words) => {
    expect(describeParties(ns as number[])).toBe(words)
  })
})
