import { describe, test, expect, beforeEach } from 'vitest'
import { useCartStore, type FoodStop } from '../../lib/cart'
import { getExperienceBySlug } from '../../lib/experiences'
import { fitTourToDay } from '../../lib/day-route'

/**
 * The cart is one day. A tour more than an hour's drive from every tour in it
 * cannot join that day, and the reel used to answer with a dead grey
 * "Another day" button. swapDayFor is the honest alternative: this tour in
 * place of that day, keeping the date and party already chosen, with an undo.
 */
const ricks = getExperienceBySlug('ricks-cafe-cliff-diving-and-sunset')!
const marthaBrae = getExperienceBySlug('bamboo-rafting-on-the-martha-brae')!
const s = () => useCartStore.getState()

const lunch: FoodStop = {
  name: 'Test jerk stop',
  town: 'Negril',
  parish: 'Westmoreland',
  knownFor: 'jerk chicken',
  image: '/x.webp',
  mapsQuery: 'Negril',
  afterId: ricks.id,
}

describe('swapping the day for a tour that cannot join it', () => {
  beforeEach(() => s().clearCart())

  test('the pair is one the add refuses, so the swap is the only way to book it', () => {
    s().addItem(ricks)
    expect(fitTourToDay(marthaBrae, { items: s().items, stops: s().stops }).allowed).toBe(false)
    s().addItem(marthaBrae)
    expect(s().items.map((i) => i.id)).toEqual([ricks.id])
  })

  test('replaces the day, keeps its date and party, and names the stops that left', () => {
    s().addItem(ricks)
    s().updateDate(ricks.id, '2027-03-09')
    s().updateTravelers(ricks.id, 3)
    useCartStore.setState({ stops: [lunch] })
    const snapshot = s().swapDayFor(marthaBrae)
    expect(snapshot).not.toBeNull()
    expect(s().items).toHaveLength(1)
    expect(s().items[0].id).toBe(marthaBrae.id)
    expect(s().items[0].date).toBe('2027-03-09')
    expect(s().items[0].travelers).toBe(3)
    expect(s().stops).toEqual([])
    expect(s().droppedStops).toEqual(['Test jerk stop'])
  })

  test('undo puts back exactly the day it replaced', () => {
    s().addItem(ricks)
    s().updateTravelers(ricks.id, 2)
    useCartStore.setState({ stops: [lunch] })
    const before = { items: s().items, stops: s().stops }
    const snapshot = s().swapDayFor(marthaBrae)!
    s().restoreDay(snapshot)
    expect(s().items).toEqual(before.items)
    expect(s().stops).toEqual(before.stops)
    expect(s().droppedStops).toEqual([])
  })

  test('a tour already in the cart is not swapped and nothing changes', () => {
    s().addItem(ricks)
    const before = s().items
    expect(s().swapDayFor(ricks)).toBeNull()
    expect(s().items).toBe(before)
  })

  test('into an empty cart it books the tour with the first-tour defaults', () => {
    const snapshot = s().swapDayFor(marthaBrae)
    expect(snapshot).toEqual({ items: [], stops: [] })
    expect(s().items).toHaveLength(1)
    expect(s().items[0].travelers).toBe(1)
    expect(s().items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
