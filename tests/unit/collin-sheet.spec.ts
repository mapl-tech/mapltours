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
 * larger parties (lib/experiences tourOperatorCost).
 *
 * Collin, Nov 13 2026, by WhatsApp: "Yes all the prices i give you is from
 * 1-4 persons not 1-3". So the first rate covers 1 to 4 and the bigger-party
 * rate starts at 5, on every card.
 *
 * The Rasta ATV Safari (5), the jet ski (10) and parasailing (11) are priced
 * PER PERSON. Collin, Nov 14 2026, by WhatsApp, asked "3 people on the ATV
 * Safari, do they pay $150 together, or $150 each ($450)?": "Yes each
 * individual pays $150 per person". Asked whether those three change with the
 * pickup area: "No all areas or the same that I give". Asked what five or
 * more pay, with his sheet's figures put to him ($140, $100, $90): "Yes all
 * individual activities goes per person". Until that day they were held as
 * "$X for 1 to 3" for the party, which sold a couple the safari for $192
 * against the $300 he is owed.
 *
 * His sheet (read again Nov 14 2026) words them "$150, 1-3 per person, 4-more
 * will pay $140 per person", "$130 ... $100" and "$120 ... $90". Read for the
 * group, a fourth person took the price from $150 to $560, $130 to $400 and
 * $120 to $360, where the sheet's real group rates step gently (Dunn's River
 * $275 to $300, Nine Mile $360 to $400).
 *
 * The same day he confirmed that "Horseback Riding" is both rides ("ride and
 * swim together just means riding in the water"), that Rose Hall is in
 * Montego Bay, and that the clear kayak shoot is in the sea. He also said
 * "for all excursions it has to be 2 or more person to book any excursions";
 * checkout does not enforce a smallest party yet (lib/experiences minGuests).
 */
const TOURS: Record<number, { mode: 'group' | 'per_person'; baseRate: number; tierMax: number; extraPerPerson: number; place?: string }> = {
  // Dunn's River (1), Blue Hole (2) and the day with both (18) are priced by
  // pickup area since Nov 12 2026: see BY_AREA below.
  5: { mode: 'per_person', baseRate: 150, tierMax: 4, extraPerPerson: 140, place: 'Negril' },
  6: { mode: 'per_person', baseRate: 130, tierMax: 4, extraPerPerson: 125, place: 'Hanover' },
  7: { mode: 'per_person', baseRate: 120, tierMax: 4, extraPerPerson: 110, place: 'Hanover' },
  // The raft (3) and both horseback rides (8, 9) are per person by pickup
  // area since Nov 13 2026: see PER_PERSON_BY_AREA below.
  10: { mode: 'per_person', baseRate: 130, tierMax: 4, extraPerPerson: 100, place: 'Montego Bay' },
  11: { mode: 'per_person', baseRate: 120, tierMax: 4, extraPerPerson: 90, place: 'Montego Bay' },
  // Collin, Nov 12 2026: the kayak is $180 per person, not per party of 3.
  12: { mode: 'per_person', baseRate: 180, tierMax: 4, extraPerPerson: 160, place: 'Montego Bay' },
  13: { mode: 'per_person', baseRate: 100, tierMax: 4, extraPerPerson: 80, place: 'Ocho Rios' },
  14: { mode: 'group', baseRate: 200, tierMax: 4, extraPerPerson: 40, place: 'Negril' },
  15: { mode: 'group', baseRate: 360, tierMax: 4, extraPerPerson: 100 },
  // Ready-made days ("Adventure Packs"): per person unless the sheet gives a 1-3 rate.
  16: { mode: 'per_person', baseRate: 280, tierMax: 4, extraPerPerson: 280 },
  17: { mode: 'per_person', baseRate: 260, tierMax: 4, extraPerPerson: 260, place: 'Montego Bay' },
  19: { mode: 'per_person', baseRate: 235, tierMax: 4, extraPerPerson: 235 },
  21: { mode: 'per_person', baseRate: 210, tierMax: 4, extraPerPerson: 210 },
  22: { mode: 'per_person', baseRate: 250, tierMax: 4, extraPerPerson: 250 },
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

/**
 * Collin, Nov 12 2026, by WhatsApp: Dunn's River and Blue Hole each cost him
 * a flat rate for 1 to 4 people by the zone he drives from ("Ocho zone $190
 * ... Negril zone $400", Runaway Bay / Discovery Bay corrected to $220),
 * entrance fees included, and "any additional person is $50". The day with
 * both: the same zone rate, plus $30 for every guest (the second entry),
 * extra guests included.
 */
const AREA_RATES = { negril: 400, lucea: 300, montego_bay: 280, trelawny: 230, runaway_bay: 220, ocho_rios: 190 } as const
const BY_AREA: Record<number, { addon: number; place: string }> = {
  1: { addon: 0, place: 'Ocho Rios' },
  2: { addon: 0, place: 'Ocho Rios' },
  18: { addon: 30, place: 'Ocho Rios' },
}

/**
 * Collin, Nov 13 2026, by WhatsApp, two tours priced per person by the area
 * he picks the guests up from:
 *   "Bamboo Rafting: Ocho $100 per person, Runaway/Discovrybay $100 per
 *    person, Falmouth $100 per person, Montego bay $90 per person, Lucea
 *    $100, Negril $150 per person"
 *   "Horseback Riding": the same list, with Montego Bay at $100.
 * He gave no rate for bigger parties, so every guest pays the area's rate.
 * The raft had been read as $100 for a party of up to 3 (from the row his
 * sheet marks DISABLE); the river stays the Martha Brae (owner, Nov 13 2026).
 * "Horseback Riding" is both rides (8 and 9): his sheet gave them one rate,
 * and on Nov 14 2026 he confirmed it ("Yes ride and swim together just means
 * riding in the water").
 */
const RAFT_RATES = { negril: 150, lucea: 100, montego_bay: 90, trelawny: 100, runaway_bay: 100, ocho_rios: 100 } as const
const HORSE_RATES = { negril: 150, lucea: 100, montego_bay: 100, trelawny: 100, runaway_bay: 100, ocho_rios: 100 } as const
const PER_PERSON_BY_AREA: Record<number, { rates: Record<keyof typeof RAFT_RATES, number>; place: string }> = {
  3: { rates: RAFT_RATES, place: 'Falmouth' },
  8: { rates: HORSE_RATES, place: 'Ocho Rios' },
  9: { rates: HORSE_RATES, place: 'Ocho Rios' },
}

describe("the catalogue agrees with Collin's sheet", () => {
  it.each(Object.entries(PER_PERSON_BY_AREA))('tour %s: per person by pickup area, party by party, area by area', (id, sheet) => {
    const e = exp(Number(id))
    const cheapest = Math.min(...Object.values(sheet.rates))
    expect(e.pricing).toEqual({ mode: 'per_person', baseRate: cheapest, tierMax: 12, extraPerPerson: cheapest, zoneRates: sheet.rates })
    for (const [zone, rate] of Object.entries(sheet.rates) as [keyof typeof RAFT_RATES, number][]) {
      for (let n = 1; n <= 12; n++) expect(tourOperatorCost(e.pricing, n, zone), `${zone}, ${n} guests`).toBe(rate * n)
    }
    expect(e.destination).toBe(sheet.place)
  })

  it('no tour priced for the group undercharges a couple against a per-person reading it is known to have', () => {
    // The raft was the case: $128 for two against $180 owed. A card that is
    // per person must say so in the catalogue.
    for (const id of Object.keys(PER_PERSON_BY_AREA)) expect(exp(Number(id)).pricing.mode).toBe('per_person')
  })

  describe('the Rasta ATV Safari, the jet ski and parasailing, per person (Collin, Nov 14 2026)', () => {
    // [the sheet's first rate, its "4-more" rate, what a party of 1 to 6 pays on the site]
    const THREE: Record<number, { first: number; bigger: number; pays: number[] }> = {
      5: { first: 150, bigger: 140, pays: [192, 382, 573, 764, 892, 1070] },
      10: { first: 130, bigger: 100, pays: [166, 332, 497, 662, 637, 764] },
      11: { first: 120, bigger: 90, pays: [153, 306, 459, 612, 573, 688] },
    }

    it.each(Object.entries(THREE))('tour %s: every guest pays, and the price for each party size is pinned', (id, sheet) => {
      const e = exp(Number(id))
      expect(e.pricing).toEqual({ mode: 'per_person', baseRate: sheet.first, tierMax: 4, extraPerPerson: sheet.bigger })
      expect(sheet.pays.map((_, i) => tourPrice(e.pricing, i + 1))).toEqual(sheet.pays)
      // The headline is one guest's price, and two guests pay for two (to the dollar the rounding allows).
      expect(e.price).toBe(sheet.pays[0])
      expect(tourOperatorCost(e.pricing, 2)).toBe(2 * sheet.first)
    })

    it.each(Object.entries(THREE))('tour %s: whichever way his words are read, the site never collects for less than he is owed', (id, sheet) => {
      const e = exp(Number(id))
      // The four readings his sheet and his "1-4 persons not 1-3" allow.
      const readings: Array<(n: number) => number> = [
        (n) => (n <= 3 ? sheet.first * n : sheet.bigger * n), // per person, as the sheet's "1-3"
        (n) => (n <= 4 ? sheet.first * n : sheet.bigger * n), // per person, his first rate covering 1 to 4
        (n) => (n <= 3 ? sheet.first : sheet.bigger * n), // for the group of 1 to 3 (how the site read it until now)
        (n) => (n <= 4 ? sheet.first : sheet.bigger * n), // for the group of 1 to 4
      ]
      for (let n = 1; n <= 12; n++) {
        const owedAtMost = Math.max(...readings.map((r) => r(n)))
        expect(tourOperatorCost(e.pricing, n), `${n} guests`).toBe(owedAtMost)
      }
    })

    it('a couple is no longer sold a tour for less than Collin is owed', () => {
      // Read for the group, a couple paid $192, $166 and $153 against $300, $260 and $240 owed.
      for (const [id, sheet] of Object.entries(THREE)) {
        const e = exp(Number(id))
        expect(tourPrice(e.pricing, 2), `tour ${id}`).toBeGreaterThan(2 * sheet.first)
      }
    })

    it('five guests pay the bigger-party rate, which on two of the three comes to less than four at the first rate', () => {
      // Not a slip: it is what "$130 each for 1 to 4, $100 each from 5" gives
      // (4 x $130 = $520, 5 x $100 = $500). Collin was asked what five or more
      // pay with these figures put to him and answered "Yes" (Nov 14 2026);
      // change the rate here and in the catalogue if he ever gives another.
      expect(tourPrice(exp(10).pricing, 5)).toBeLessThan(tourPrice(exp(10).pricing, 4))
      expect(tourPrice(exp(11).pricing, 5)).toBeLessThan(tourPrice(exp(11).pricing, 4))
      expect(tourPrice(exp(5).pricing, 5)).toBeGreaterThan(tourPrice(exp(5).pricing, 4))
      // These two are the only cards in the catalogue where a bigger party pays less in total.
      const dips = experiences.filter((e) => Array.from({ length: 11 }, (_, i) => i + 2).some((n) => tourPrice(e.pricing, n) < tourPrice(e.pricing, n - 1))).map((e) => e.id)
      expect(dips).toEqual([10, 11])
      // From six up the total climbs again and never comes back under the party of four.
      for (const id of [10, 11]) for (let n = 6; n <= 12; n++) expect(tourPrice(exp(id).pricing, n), `tour ${id}, ${n} guests`).toBeGreaterThan(tourPrice(exp(id).pricing, 4))
    })
  })

  it.each(Object.entries(BY_AREA))('tour %s: priced by pickup area, party by party, area by area', (id, sheet) => {
    const e = exp(Number(id))
    expect(e.pricing).toEqual({ mode: 'group', baseRate: 190, tierMax: 4, extraPerPerson: 50, zoneRates: AREA_RATES, ...(sheet.addon ? { perPersonAddon: sheet.addon } : {}) })
    for (const [zone, rate] of Object.entries(AREA_RATES) as [keyof typeof AREA_RATES, number][]) {
      for (let n = 1; n <= 7; n++) {
        // The zone rate covers 1 to 4; each guest past 4 adds $50; the add-on is for every guest.
        expect(tourOperatorCost(e.pricing, n, zone), `${zone}, ${n} guests`).toBe(rate + 50 * Math.max(0, n - 4) + sheet.addon * n)
      }
    }
    expect(e.destination).toBe(sheet.place)
  })

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
