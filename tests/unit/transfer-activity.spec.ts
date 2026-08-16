import { describe, test, expect } from 'vitest'
import { getTransferActivity } from '../../lib/transfer-activity'

/**
 * The activity line is illustrative copy, but it still has to behave: stable
 * within an hour (or it would flicker between the server render and the
 * browser, failing hydration), and varied across hours (or it is obviously a
 * fixed string).
 */

const at = (iso: string) => new Date(iso)

describe('stability within the hour', () => {
  test('identical at any two moments in the same hour', () => {
    const a = getTransferActivity(at('2026-08-15T14:00:00Z'))
    const b = getTransferActivity(at('2026-08-15T14:31:27Z'))
    const c = getTransferActivity(at('2026-08-15T14:59:59Z'))
    expect(a).toEqual(b)
    expect(b).toEqual(c)
  })

  test('is pure, repeated calls agree', () => {
    const now = at('2026-08-15T09:10:00Z')
    expect(getTransferActivity(now)).toEqual(getTransferActivity(now))
  })
})

describe('variation across hours', () => {
  const hours = Array.from({ length: 96 }, (_, i) =>
    getTransferActivity(new Date(Date.parse('2026-08-15T00:00:00Z') + i * 3_600_000)),
  )

  test('the count is not a constant', () => {
    expect(new Set(hours.map((h) => h.count)).size).toBeGreaterThan(3)
  })

  test('the "last booked" label is not a constant', () => {
    expect(new Set(hours.map((h) => h.lastBookedLabel)).size).toBeGreaterThan(5)
  })

  test('consecutive hours usually differ', () => {
    let changes = 0
    for (let i = 1; i < hours.length; i++) {
      if (hours[i].count !== hours[i - 1].count) changes++
    }
    expect(changes).toBeGreaterThan(hours.length * 0.5)
  })
})

describe('plausibility', () => {
  const hours = Array.from({ length: 500 }, (_, i) =>
    getTransferActivity(new Date(Date.parse('2026-01-01T00:00:00Z') + i * 3_600_000)),
  )

  test('counts stay in a believable daily band', () => {
    for (const h of hours) {
      expect(h.count).toBeGreaterThanOrEqual(8)
      expect(h.count).toBeLessThanOrEqual(16)
    }
  })

  test('the band is consistent with the published 342-per-30-days stat', () => {
    // 342 / 30 ≈ 11.4 a day. The mean must sit near that or the two numbers
    // on the same page contradict each other.
    const mean = hours.reduce((s, h) => s + h.count, 0) / hours.length
    expect(mean).toBeGreaterThan(10)
    expect(mean).toBeLessThan(14)
  })

  test('the label always reads as a sane elapsed time', () => {
    for (const h of hours) {
      expect(h.lastBookedLabel).toMatch(/^(just now|1 minute ago|\d+ minutes ago|1 hour ago|\d+ hours ago)$/)
    }
  })

  test('never claims longer ago than the 24-hour window it describes', () => {
    for (const h of hours) {
      const m = h.lastBookedLabel.match(/^(\d+) hours? ago$/)
      if (m) expect(Number(m[1])).toBeLessThan(24)
    }
  })
})
