import { describe, test, expect } from 'vitest'
import {
  areaFromPrice,
  getTransferPrice,
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
