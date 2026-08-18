import { describe, test, expect } from 'vitest'
import {
  areaFromPrice,
  getTransferPrice,
  getDestination,
  buildQuote,
  DESTINATIONS,
} from '../../lib/airport-transfers'

/**
 * The hero advertises "from $X to <area>". If that figure is ever higher than
 * the cheapest rate we actually sell, the site is advertising a price it will
 * not honour. These tests hold that line for the three areas on the strip.
 */

const AREAS = ['Rose Hall', 'Negril', 'Ocho Rios'] as const

describe('advertised "from" prices', () => {
  for (const area of AREAS) {
    test(`${area}: no destination is cheaper than the advertised figure`, () => {
      const advertised = areaFromPrice(area, 'one_way')
      const matching = DESTINATIONS.filter((d) =>
        d.name.toLowerCase().includes(area.toLowerCase()),
      )
      expect(matching.length).toBeGreaterThan(0)
      for (const d of matching) {
        const price = getTransferPrice(d.id, 'one_way')
        expect(price).not.toBeNull()
        expect(advertised).toBeLessThanOrEqual(price as number)
      }
    })

    test(`${area}: the advertised figure is one we actually sell`, () => {
      const advertised = areaFromPrice(area, 'one_way')
      const sold = DESTINATIONS.filter((d) =>
        d.name.toLowerCase().includes(area.toLowerCase()),
      ).map((d) => getTransferPrice(d.id, 'one_way'))
      expect(sold).toContain(advertised)
    })
  }

  test('the strip shows the current rate card', () => {
    // Documents today's numbers. If the rate table moves, this fails loudly
    // rather than the hero quietly advertising something stale.
    expect(areaFromPrice('Rose Hall', 'one_way')).toBe(37)
    expect(areaFromPrice('Negril', 'one_way')).toBe(110)
    expect(areaFromPrice('Ocho Rios', 'one_way')).toBe(110)
  })

  test('round-trip is dearer than one-way for every area', () => {
    for (const area of AREAS) {
      expect(areaFromPrice(area, 'round_trip')).toBeGreaterThan(
        areaFromPrice(area, 'one_way'),
      )
    }
  })

  test('an unknown area returns 0 rather than a misleading price', () => {
    expect(areaFromPrice('Atlantis', 'one_way')).toBe(0)
  })

  test('matching is case-insensitive', () => {
    expect(areaFromPrice('negril', 'one_way')).toBe(areaFromPrice('Negril', 'one_way'))
  })
})

/**
 * The Negril West End (cliffs) properties were added after a customer enquiry
 * for Samsara showed an unlisted hotel is a dead end in the booking flow. They
 * are the same drive as the Norman Manley Blvd resorts, so they must price
 * identically — a cheaper entry would silently undercut the advertised "from"
 * figure, and a dearer one would undercharge the driver on the round trip.
 */
describe('Negril West End additions', () => {
  const WEST_END = [
    'samsara-cliff-negril',
    'tensing-pen-negril',
    'the-caves-negril',
    'catcha-falling-star-negril',
    'xtabi-negril',
    'negril-escape-negril',
    'banana-shout-negril',
    'blue-cave-castle-negril',
    'westender-inn-negril',
    'home-sweet-home-negril',
  ]

  test('every West End property exists and is Zone D, Westmoreland', () => {
    for (const id of WEST_END) {
      const dest = getDestination(id)
      expect(dest, `${id} is missing from DESTINATIONS`).toBeTruthy()
      expect(dest!.zone).toBe('D')
      expect(dest!.parish).toBe('Westmoreland')
    }
  })

  test('they price exactly like the cliff hotels already on the strip', () => {
    const reference = getTransferPrice('rockhouse-negril', 'one_way')
    const referenceRt = getTransferPrice('rockhouse-negril', 'round_trip')
    expect(reference).not.toBeNull()
    for (const id of WEST_END) {
      expect(getTransferPrice(id, 'one_way'), id).toBe(reference)
      expect(getTransferPrice(id, 'round_trip'), id).toBe(referenceRt)
    }
  })

  test('Samsara quotes the figure the enquiry was answered with', () => {
    // $198 round-trip, flat for 1-4 passengers. If this moves, the reply we
    // sent the customer is no longer the price the site would charge them.
    expect(getTransferPrice('samsara-cliff-negril', 'round_trip')).toBe(198)
    expect(getTransferPrice('samsara-cliff-negril', 'one_way')).toBe(110)
  })

  test('a round trip still beats two one-ways', () => {
    for (const id of WEST_END) {
      const ow = getTransferPrice(id, 'one_way') as number
      const rt = getTransferPrice(id, 'round_trip') as number
      expect(rt, id).toBeLessThan(ow * 2)
    }
  })

  test('every destination id in the catalog is unique', () => {
    // A duplicated id would make getDestination return the first match and
    // silently price the wrong property.
    const ids = DESTINATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

/**
 * The transfers picker offers "I don't see my hotel". That option carries a
 * sentinel value which must never reach a pricing path — the UI holds it in a
 * separate boolean, and these tests pin the layer beneath, so the guarantee
 * survives even if someone later wires the sentinel into destinationId.
 */
describe('unlisted-hotel sentinel cannot produce a price', () => {
  const SENTINEL = '__not-listed__'

  test('it is not a real destination', () => {
    expect(getDestination(SENTINEL)).toBeUndefined()
    expect(DESTINATIONS.some((d) => d.id === SENTINEL)).toBe(false)
  })

  test('it yields no price, one-way or round-trip', () => {
    expect(getTransferPrice(SENTINEL, 'one_way')).toBeNull()
    expect(getTransferPrice(SENTINEL, 'round_trip')).toBeNull()
  })

  test('it yields no quote, so nothing can be added to the cart', () => {
    expect(buildQuote(SENTINEL, 'round_trip', 2)).toBeNull()
    expect(buildQuote(SENTINEL, 'one_way', 1)).toBeNull()
  })

  test('the empty string behaves the same way', () => {
    expect(getTransferPrice('', 'one_way')).toBeNull()
    expect(buildQuote('', 'one_way', 1)).toBeNull()
  })
})
