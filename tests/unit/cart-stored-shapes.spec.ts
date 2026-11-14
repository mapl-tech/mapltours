import { describe, test, expect, beforeAll, vi } from 'vitest'

/**
 * What the cart makes of whatever is in localStorage. A stored value is an
 * older build's shape, or a write cut short; throwing while reading it makes
 * zustand abandon the load without reporting it finished, and the checkout
 * then waited on "Loading your trip…" for good.
 */
describe('the cart reads any stored shape without throwing', () => {
  let merge: (persisted: unknown, current: unknown) => { items: { id: number; travelers: number; date: string; price: number }[]; stops: unknown[] }
  let current: unknown

  beforeAll(async () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) }, removeItem: (k: string) => { mem.delete(k) } })
    const { useCartStore } = await import('@/lib/cart')
    merge = useCartStore.persist.getOptions().merge as typeof merge
    current = useCartStore.getState()
  })

  test.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'cart'],
    ['items that are not a list', { items: { 0: { id: 1 } } }],
    ['items: null', { items: null }],
    ['a null line, a string line and a number', { items: [null, 'x', 7] }],
    ['a line with no id', { items: [{ travelers: 2 }] }],
    ['a tour that is no longer sold', { items: [{ id: 999999, travelers: 2, date: '2026-12-01' }] }],
    ['stops that are not a list', { items: [], stops: 'none' }],
  ])('%s: an empty cart, no throw', (_name, stored) => {
    const out = merge(stored, current)
    expect(out.items).toEqual([])
    expect(Array.isArray(out.stops)).toBe(true)
  })

  test('a good line beside a bad one keeps the good one, re-priced from the catalogue', () => {
    const out = merge({ items: [null, { id: 14, travelers: 3, date: '2026-12-01', price: 1 }] }, current)
    expect(out.items.map((i) => [i.id, i.travelers, i.date])).toEqual([[14, 3, '2026-12-01']])
    expect(out.items[0].price).toBeGreaterThan(100)
  })
})
