import { describe, test, expect, beforeEach } from 'vitest'
import { useCartStore } from '../../lib/cart'
import { singleExperiences } from '../../lib/experiences'

/**
 * A checkout is one day, one party size. ReviewStep enforces that by
 * collapsing every line onto items[0], which makes the FIRST line's values
 * authoritative for the whole cart.
 *
 * That is why a new line cannot be seeded from constants. bestInsertIndex
 * orders the day by geography, so a tour added second frequently lands first,
 * and constants at index 0 became the whole cart's party size and date. A
 * guest who chose four travelers was re-quoted and dispatched for one.
 */
describe('adding a tour to a day that already exists', () => {
  const [a, b] = singleExperiences
  beforeEach(() => useCartStore.getState().clearCart())

  test('inherits the party size already chosen', () => {
    const s = () => useCartStore.getState()
    s().addItem(a)
    s().updateTravelers(a.id, 4)
    s().addItem(b)
    expect(s().items).toHaveLength(2)
    for (const item of s().items) expect(item.travelers).toBe(4)
  })

  test('inherits the date already chosen, wherever the new tour is slotted', () => {
    const s = () => useCartStore.getState()
    s().addItem(a)
    s().updateDate(a.id, '2026-10-01')
    s().addItem(b)
    for (const item of s().items) expect(item.date).toBe('2026-10-01')
  })

  test('the first tour in an empty cart still gets the defaults', () => {
    const s = () => useCartStore.getState()
    s().addItem(a)
    expect(s().items[0].travelers).toBe(1)
    expect(s().items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('collapsing onto items[0] is now a no-op, whichever line leads', () => {
    const s = () => useCartStore.getState()
    s().addItem(a)
    s().updateTravelers(a.id, 3)
    s().updateDate(a.id, '2026-11-05')
    s().addItem(b)
    const first = s().items[0]
    expect(first.travelers).toBe(3)
    expect(first.date).toBe('2026-11-05')
  })
})
