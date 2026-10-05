import { describe, test, expect, beforeEach } from 'vitest'
import { useCartStore, type FoodStop } from '../../lib/cart'
import { useTripNotice } from '../../lib/trip-notice'
import { addPackageToTrip } from '../../lib/add-to-trip'
import { experiences, packageExperiences } from '../../lib/experiences'

/**
 * "Add this day" on the home rail's ready-made days. The cart holds one kind
 * of day, so a package replaces the single tours in it (and any package it
 * shares an activity with). That used to happen silently, with no way back:
 * the add now says what it replaced and Undo restores the day exactly.
 */
const s = () => useCartStore.getState()
const notice = () => useTripNotice.getState().notice

// A package and the single tours it bundles, from the live catalogue.
const pkg = packageExperiences.find((p) => (p.includes ?? []).length >= 2)!
const [first, second] = (pkg.includes ?? []).map((id) => experiences.find((e) => e.id === id)!)
// A package sharing an activity with pkg, if the catalogue has one.
const overlapping = packageExperiences.find((p) => p.id !== pkg.id && (p.includes ?? []).some((id) => (pkg.includes ?? []).includes(id)))

const lunch: FoodStop = {
  name: 'Test jerk stop', town: 'Ocho Rios', parish: 'St. Ann', knownFor: 'jerk chicken',
  image: '/x.webp', mapsQuery: 'Ocho Rios', afterId: first.id,
}

beforeEach(() => {
  s().clearCart()
  useTripNotice.getState().clear()
})

describe('adding a ready-made day', () => {
  test('to an empty itinerary: added, the day named, Undo takes it out', () => {
    expect(addPackageToTrip(pkg, { placement: 'page', checkout: true })).toBe('added')
    expect(s().items.map((i) => i.id)).toEqual([pkg.id])
    expect(notice()?.text).toMatch(/^Added for .+\. You can change the day at checkout\.$/)
    expect(notice()?.checkout).toBe(true)
    notice()!.undo!()
    expect(s().items).toEqual([])
  })

  test('in place of two single tours: says so, and Undo puts back the day with its stop', () => {
    s().addItem(first)
    s().addItem(second)
    s().updateTravelers(first.id, 3)
    useCartStore.setState({ stops: [lunch] })
    const before = { items: s().items, stops: s().stops }
    expect(before.items).toHaveLength(2)

    expect(addPackageToTrip(pkg, { placement: 'page', checkout: true })).toBe('swapped')
    expect(s().items.map((i) => i.id)).toEqual([pkg.id])
    expect(notice()?.text).toBe('Booked in place of your 2 tours.')

    notice()!.undo!()
    expect(s().items).toEqual(before.items)
    expect(s().stops).toEqual(before.stops)
    expect(s().droppedStops).toEqual([])
  })

  test('in place of one single tour: names it', () => {
    s().addItem(first)
    addPackageToTrip(pkg, { placement: 'page', checkout: true })
    expect(notice()?.text).toBe(`Booked in place of ${first.title}.`)
  })

  test.runIf(!!overlapping)('in place of a package it shares an activity with: names it', () => {
    s().addItem(overlapping!)
    expect(addPackageToTrip(pkg, { placement: 'page', checkout: true })).toBe('swapped')
    expect(s().items.map((i) => i.id)).toEqual([pkg.id])
    expect(notice()?.text).toBe(`Booked in place of ${overlapping!.title}.`)
    notice()!.undo!()
    expect(s().items.map((i) => i.id)).toEqual([overlapping!.id])
  })

  test('Undo calls back after the day is restored, so the page can put focus on the card', () => {
    s().addItem(first)
    let itemsAtCallback: number[] | null = null
    addPackageToTrip(pkg, { placement: 'page', checkout: true, onUndo: () => { itemsAtCallback = s().items.map((i) => i.id) } })
    notice()!.undo!()
    expect(itemsAtCallback).toEqual([first.id])
  })

  test('a day already in the itinerary changes nothing and says nothing', () => {
    s().addItem(pkg)
    expect(addPackageToTrip(pkg, { placement: 'page', checkout: true })).toBe('already')
    expect(notice()).toBeNull()
    expect(s().items.map((i) => i.id)).toEqual([pkg.id])
  })
})
