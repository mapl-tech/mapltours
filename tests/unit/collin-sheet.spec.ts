import { describe, it, expect } from 'vitest'
import { experiences, tourPrice, tourOperatorCost } from '@/lib/experiences'
import { driverCost, getDestination } from '@/lib/airport-transfers'
import { getCoords } from '@/lib/transportation'

/**
 * The catalogue agrees with Collin's sheet (Tour Catalog tab,
 * https://docs.google.com/spreadsheets/d/14RQyhhDCikQ6ZAIcdJO_paKR4HG-GaRL,
 * read Oct 5 2026; the owner: "make the site agree with the sheet"). When
 * Collin changes a rate, change it here and in the catalogue together.
 *
 * Tours: "$X 1-3" (or "1-4") is a group rate for the party, "$X per person"
 * a per-head rate, and "4-more will pay $Y per person" the per-head rate for
 * larger parties (lib/experiences tourOperatorCost). The raft (id 3) is left
 * out until the owner confirms the river: the sheet's active raft is the
 * Great River at $80, the site sells the Martha Brae at the $100 of the row
 * the sheet marks DISABLE.
 */
const TOURS: Record<number, { mode: 'group' | 'per_person'; baseRate: number; tierMax: number; extraPerPerson: number; place?: string }> = {
  1: { mode: 'group', baseRate: 275, tierMax: 3, extraPerPerson: 75, place: 'Ocho Rios' },
  2: { mode: 'group', baseRate: 275, tierMax: 3, extraPerPerson: 75, place: 'Ocho Rios' },
  5: { mode: 'group', baseRate: 150, tierMax: 3, extraPerPerson: 140, place: 'Negril' },
  6: { mode: 'per_person', baseRate: 130, tierMax: 3, extraPerPerson: 125, place: 'Hanover' },
  7: { mode: 'per_person', baseRate: 120, tierMax: 3, extraPerPerson: 110, place: 'Hanover' },
  8: { mode: 'per_person', baseRate: 100, tierMax: 3, extraPerPerson: 95, place: 'Ocho Rios' },
  9: { mode: 'per_person', baseRate: 100, tierMax: 3, extraPerPerson: 95, place: 'Ocho Rios' },
  10: { mode: 'group', baseRate: 130, tierMax: 3, extraPerPerson: 100, place: 'Montego Bay' },
  11: { mode: 'group', baseRate: 120, tierMax: 3, extraPerPerson: 90, place: 'Montego Bay' },
  12: { mode: 'group', baseRate: 180, tierMax: 3, extraPerPerson: 160, place: 'Montego Bay' },
  13: { mode: 'per_person', baseRate: 100, tierMax: 3, extraPerPerson: 80, place: 'Ocho Rios' },
  14: { mode: 'group', baseRate: 200, tierMax: 4, extraPerPerson: 40, place: 'Negril' },
  15: { mode: 'group', baseRate: 360, tierMax: 3, extraPerPerson: 100 },
  // Ready-made days ("Adventure Packs"): per person unless the sheet gives a 1-3 rate.
  16: { mode: 'per_person', baseRate: 280, tierMax: 3, extraPerPerson: 280 },
  17: { mode: 'per_person', baseRate: 260, tierMax: 3, extraPerPerson: 260, place: 'Montego Bay' },
  18: { mode: 'group', baseRate: 150, tierMax: 3, extraPerPerson: 100 },
  19: { mode: 'per_person', baseRate: 235, tierMax: 3, extraPerPerson: 235 },
  21: { mode: 'per_person', baseRate: 210, tierMax: 3, extraPerPerson: 210 },
  22: { mode: 'per_person', baseRate: 250, tierMax: 3, extraPerPerson: 250 },
}

/** Airport transfers on the sheet: the 1-4 rate and the per-head rate from 5. */
const TRANSFERS: Record<string, { base: number; extra: number }> = {
  'hedonism-ii': { base: 90, extra: 25 },
  'deja-resort': { base: 15, extra: 5 },
  's-hotel-montego-bay': { base: 15, extra: 5 },
  'sandals-montego-bay': { base: 25, extra: 7 },
  'riu-reggae': { base: 20, extra: 7 },
  'riu-palace-jamaica': { base: 20, extra: 7 },
  'riu-montego-bay': { base: 20, extra: 7 },
  'riu-aquarelle': { base: 60, extra: 15 },
  'hilton-rose-hall': { base: 30, extra: 7 },
  'bahia-principe-escape': { base: 80, extra: 19 },
  'bahia-principe-runaway-bay': { base: 80, extra: 19 },
  'royalton-white-sands': { base: 60, extra: 15 },
  'excellence-oyster-bay': { base: 60, extra: 15 },
  'moon-palace-ocho-rios': { base: 90, extra: 20 },
  'riu-ocho-rios': { base: 90, extra: 20 },
  'sandals-dunns-river': { base: 90, extra: 20 },
  'couples-tower-isle': { base: 110, extra: 20 },
  'sandals-royal-plantation': { base: 90, extra: 20 },
  'couples-negril': { base: 90, extra: 20 },
  'couples-swept-away': { base: 90, extra: 20 },
  'riu-palace-tropical-bay': { base: 90, extra: 20 },
  'riu-negril': { base: 90, extra: 20 },
  'secrets-st-james': { base: 40, extra: 5 },
  'secrets-wild-orchid': { base: 40, extra: 5 },
  'hyatt-ziva-rose-hall': { base: 30, extra: 7 },
  'hyatt-zilara-rose-hall': { base: 30, extra: 7 },
  'breathless-montego-bay': { base: 40, extra: 5 },
  'iberostar-selection-rose-hall': { base: 40, extra: 5 },
}

const exp = (id: number) => {
  const e = experiences.find((x) => x.id === id)
  if (!e) throw new Error(`no experience ${id}`)
  return e
}

describe("the catalogue agrees with Collin's sheet", () => {
  it.each(Object.entries(TOURS))('tour %s: rate card and place', (id, sheet) => {
    const e = exp(Number(id))
    expect(e.pricing).toEqual({ mode: sheet.mode, baseRate: sheet.baseRate, tierMax: sheet.tierMax, extraPerPerson: sheet.extraPerPerson })
    // What Collin is owed, party by party, is what his sheet says.
    for (let n = 1; n <= 7; n++) {
      const want = n <= sheet.tierMax ? (sheet.mode === 'group' ? sheet.baseRate : sheet.baseRate * n) : sheet.extraPerPerson * n
      expect(tourOperatorCost(e.pricing, n)).toBe(want)
    }
    if (sheet.place) expect(e.destination).toBe(sheet.place)
  })

  it.each(Object.entries(TRANSFERS))('transfer %s: the 1-4 rate and the rate from 5', (id, sheet) => {
    expect(getDestination(id)?.baseRate).toBe(sheet.base)
    for (const n of [1, 4, 5, 6, 7]) {
      // From 5 the driver is paid per head, never less than the vehicle rate.
      expect(driverCost(id, 'one_way', n)).toBe(n <= 4 ? sheet.base : Math.max(sheet.base, sheet.extra * n))
    }
  })
})

describe('catalogue invariants', () => {
  it("every card's headline price is the price checkout charges for one guest", () => {
    for (const e of experiences) expect({ id: e.id, price: e.price }).toEqual({ id: e.id, price: tourPrice(e.pricing, 1) })
  })

  it('a ready-made day is placed where one of its own tours is', () => {
    for (const p of experiences.filter((e) => e.kind === 'package')) {
      const places = (p.includes ?? []).map((id) => exp(id).destination)
      expect({ id: p.id, place: p.destination, inOneOf: places.includes(p.destination) }).toEqual({ id: p.id, place: p.destination, inOneOf: true })
    }
  })

  it('every tour place is on the day planner\'s map, so its drives can be measured', () => {
    for (const e of experiences) expect({ id: e.id, place: e.destination, known: !!getCoords(e.destination) }).toEqual({ id: e.id, place: e.destination, known: true })
  })
})
