import { describe, test, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  experiences, tourPrice, tourOperatorCost, perTravelerPrice, priceUnitLabel, isZonePriced, zonesSold, zoneSells, zonePrices,
  defaultRateCard, RATES_PUBLISHED, type TourPricing,
} from '@/lib/experiences'
import { applyRateCards, cardOf, describeRateCard, parseRateCard, rateCardChanges, sameCard, RATE_MAX, type RateCard } from '@/lib/tour-rates'
import { priceTourCart, PricingError } from '@/lib/checkout-pricing'
import { zonePickupErrors } from '@/lib/checkout-form'
import ZonePriceList from '@/components/ZonePriceList'

/**
 * Tour rate cards (lib/tour-rates.ts): validated once, applied to the catalog
 * when it loads, edited in /admin/tour-rates and published with each deploy.
 * And the pricing they drive, by pickup zone for Dunn's River and Blue Hole
 * (Collin, Nov 12 2026).
 */

const tour = (id: number) => experiences.find((e) => e.id === id)!
const DUNNS = 1
const BOTH = 18
const RICKS = 14

describe('parseRateCard: one canonical shape, or a sentence an admin can act on', () => {
  test('a group card comes back in fixed order, empty extras left out', () => {
    const r = parseRateCard({ pricing: { extraPerPerson: '40', tierMax: 4, mode: 'group', baseRate: '200', perPersonAddon: '' }, minGuests: '' })
    expect(r).toEqual({ ok: true, card: { pricing: { mode: 'group', baseRate: 200, tierMax: 4, extraPerPerson: 40 }, minGuests: 1 } })
    expect(JSON.stringify(r.ok && r.card.pricing)).toBe('{"mode":"group","baseRate":200,"tierMax":4,"extraPerPerson":40}')
  })

  test('a card priced by area: zones west to east, empty ones not sold, the base is the cheapest', () => {
    const r = parseRateCard({ pricing: { mode: 'group', tierMax: '4', extraPerPerson: 50, zoneRates: { ocho_rios: '190', negril: 400, lucea: '' } }, minGuests: 1 })
    expect(r.ok && r.card.pricing).toEqual({ mode: 'group', baseRate: 190, tierMax: 4, extraPerPerson: 50, zoneRates: { negril: 400, ocho_rios: 190 } })
    expect(r.ok && Object.keys(r.card.pricing.zoneRates!)).toEqual(['negril', 'ocho_rios'])
  })

  test.each([
    [{}, /no pricing/],
    [{ pricing: { mode: 'group', baseRate: 1, tierMax: 1, extraPerPerson: 1 }, extra: 1 }, /Unknown field "extra"/],
    [{ pricing: { mode: 'group', baseRate: 1, tierMax: 1, extraPerPerson: 1, colour: 'red' } }, /Unknown pricing field "colour"/],
    [{ pricing: { mode: 'flat', baseRate: 1, tierMax: 1, extraPerPerson: 1 } }, /how the tour is priced/],
    [{ pricing: { mode: 'group', baseRate: 0, tierMax: 3, extraPerPerson: 1 } }, /Rate for the group: must be more than \$0/],
    [{ pricing: { mode: 'per_person', baseRate: -5, tierMax: 3, extraPerPerson: 1 } }, /Rate per person: must be more than \$0/],
    [{ pricing: { mode: 'group', baseRate: 'abc', tierMax: 3, extraPerPerson: 1 } }, /enter an amount in dollars/],
    [{ pricing: { mode: 'group', baseRate: RATE_MAX + 1, tierMax: 3, extraPerPerson: 1 } }, /above the \$3000 limit/],
    [{ pricing: { mode: 'group', baseRate: 10.005, tierMax: 3, extraPerPerson: 1 } }, /whole cents/],
    [{ pricing: { mode: 'group', baseRate: 10, tierMax: 0, extraPerPerson: 1 } }, /whole number from 1 to 12/],
    [{ pricing: { mode: 'group', baseRate: 10, tierMax: 2.5, extraPerPerson: 1 } }, /whole number from 1 to 12/],
    [{ pricing: { mode: 'group', baseRate: 10, tierMax: 3, extraPerPerson: -1 } }, /Bigger groups, per person: cannot be below \$0/],
    [{ pricing: { mode: 'group', tierMax: 4, extraPerPerson: -1, zoneRates: { negril: 400 } } }, /Each extra person: cannot be below \$0/],
    [{ pricing: { mode: 'group', tierMax: 4, extraPerPerson: 50, zoneRates: { kingston: 100 } } }, /Unknown pickup area "kingston"/],
    [{ pricing: { mode: 'group', tierMax: 4, extraPerPerson: 50, zoneRates: { negril: '' } } }, /at least one pickup area/],
    [{ pricing: { mode: 'group', tierMax: 4, extraPerPerson: 50, zoneRates: { negril: 0 } } }, /Negril: must be more than \$0/],
    [{ pricing: { mode: 'per_person', tierMax: 4, extraPerPerson: 50, zoneRates: { negril: 400 } } }, /one price for the group/],
    [{ pricing: { mode: 'group', baseRate: 10, tierMax: 3, extraPerPerson: 1 }, minGuests: 13 }, /Smallest party/],
  ])('refuses %j', (input, why) => {
    const r = parseRateCard(input)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(why)
      expect(r.error).not.toMatch(/[–—]/)
    }
  })

  test('each refusal names the field the desk marks, in the label the desk shows', () => {
    const at = (input: unknown) => { const r = parseRateCard(input); return r.ok ? null : { field: r.field, error: r.error } }
    const group = { mode: 'group', baseRate: 10, tierMax: 3, extraPerPerson: 1 }
    expect(at({ pricing: { ...group, baseRate: '' } })).toEqual({ field: 'baseRate', error: 'Rate for the group: enter an amount in dollars' })
    expect(at({ pricing: { ...group, tierMax: 13 } })).toEqual({ field: 'tierMax', error: 'Covers up to: a whole number from 1 to 12' })
    expect(at({ pricing: { ...group, mode: 'per_person', tierMax: 0 } })).toEqual({ field: 'tierMax', error: 'That rate is for up to: a whole number from 1 to 12' })
    expect(at({ pricing: { ...group, extraPerPerson: 'x' } })).toMatchObject({ field: 'extraPerPerson' })
    expect(at({ pricing: { ...group, perPersonAddon: -1 } })).toMatchObject({ field: 'perPersonAddon' })
    expect(at({ pricing: group, minGuests: 0 })).toMatchObject({ field: 'minGuests' })
    expect(at({ pricing: { mode: 'group', tierMax: 4, extraPerPerson: 50, zoneRates: { negril: 400, lucea: 0 } } })).toEqual({ field: 'lucea', error: 'Lucea & Hanover: must be more than $0' })
    expect(at({ pricing: { mode: 'group', tierMax: 4, extraPerPerson: 50, zoneRates: {} } })).toMatchObject({ field: 'zoneRates' })
    expect(at({ pricing: { ...group, mode: 'flat' } })).toMatchObject({ field: 'mode' })
    // A problem with the card's shape is about no field.
    expect(at({ pricing: group, colour: 'red' })).toEqual({ field: undefined, error: 'Unknown field "colour".' })
  })

  test('sameCard compares canonical forms', () => {
    expect(sameCard({ pricing: { mode: 'group', baseRate: '275', tierMax: '3', extraPerPerson: 75 } }, { pricing: { mode: 'group', baseRate: 275, tierMax: 3, extraPerPerson: 75 }, minGuests: 1 })).toBe(true)
    expect(sameCard(cardOf(tour(DUNNS)), cardOf(tour(RICKS)))).toBe(false)
    expect(sameCard({ pricing: {} }, { pricing: {} })).toBe(false)
  })
})

describe('applyRateCards: published cards reach the catalog, or the deploy fails', () => {
  const fresh = () => [{ id: 7, title: 'Zipline', pricing: { mode: 'per_person', baseRate: 120, tierMax: 3, extraPerPerson: 110 } as TourPricing, minGuests: 2 as number | undefined }]

  test('a valid card replaces the tour’s pricing and smallest party', () => {
    const cat = fresh()
    applyRateCards(cat, { '7': { pricing: { mode: 'per_person', baseRate: 125, tierMax: 3, extraPerPerson: 115 }, minGuests: 1 } })
    expect(cat[0].pricing).toEqual({ mode: 'per_person', baseRate: 125, tierMax: 3, extraPerPerson: 115 })
    expect(cat[0].minGuests).toBeUndefined()
  })

  test('a card for a tour no longer in the catalog prices nothing and is skipped', () => {
    const cat = fresh()
    applyRateCards(cat, { '999': { pricing: { mode: 'group', baseRate: 1, tierMax: 1, extraPerPerson: 1 } } })
    expect(cat).toEqual(fresh())
  })

  test('a card that does not validate throws, naming the tour', () => {
    expect(() => applyRateCards(fresh(), { '7': { pricing: { mode: 'group', baseRate: -1, tierMax: 3, extraPerPerson: 1 } } })).toThrow(/Zipline \(tour 7\) is not valid/)
  })

  test('this build published no cards, so the catalog is on its defaults', () => {
    expect(RATES_PUBLISHED).toEqual({ snapshotAt: null, latestChange: null })
    for (const e of experiences) expect(cardOf(e)).toEqual(defaultRateCard(e.id))
    expect(defaultRateCard(99999)).toBeNull()
  })

  test('the committed snapshot holds no cards: only a deploy writes them', () => {
    const snap = JSON.parse(readFileSync(fileURLToPath(new URL('../../lib/tour-rates.snapshot.json', import.meta.url)), 'utf8'))
    expect(snap).toEqual({ snapshotAt: null, latestChange: null, cards: {} })
  })

  test('every headline price is worked out from the card, never typed', () => {
    for (const e of experiences) expect({ id: e.id, price: e.price }).toEqual({ id: e.id, price: tourPrice(e.pricing, 1) })
  })
})

describe('describeRateCard: the card in Collin’s words', () => {
  test('each shape', () => {
    expect(describeRateCard(cardOf(tour(RICKS)))).toBe('$200 for 1 to 4 people; from 5, $40 a person for the whole group.')
    expect(describeRateCard(cardOf(tour(7)))).toBe('$120 a person for 1 to 3; from 4, $110 a person; 2 people or more.')
    expect(describeRateCard(cardOf(tour(DUNNS)))).toBe('By pickup area, for 1 to 4 people: Negril $400, Lucea & Hanover $300, Montego Bay & Rose Hall $280, Falmouth & Trelawny $230, Runaway Bay & Discovery Bay $220, Ocho Rios $190; each extra person $50.')
    expect(describeRateCard(cardOf(tour(BOTH)))).toMatch(/; plus \$30 for every person\.$/)
    expect(describeRateCard({ pricing: { mode: 'group', baseRate: 90, tierMax: 1, extraPerPerson: 90, zoneRates: { negril: 90 } }, minGuests: 1 })).toBe('By pickup area, for 1 person: Negril $90; each extra person $90.')
  })
})

describe('rateCardChanges: only what moved, in the desk’s words', () => {
  const dunns = (): RateCard => structuredClone(cardOf(tour(DUNNS)))
  const ricks = (): RateCard => structuredClone(cardOf(tour(RICKS)))

  test('one area’s rate', () => {
    const after = dunns()
    after.pricing.zoneRates!.negril = 420
    expect(rateCardChanges(dunns(), after)).toEqual([{ label: 'Negril', was: '$400', now: '$420' }])
  })

  test('an area stops or starts selling', () => {
    const after = dunns()
    delete after.pricing.zoneRates!.lucea
    expect(rateCardChanges(dunns(), after)).toEqual([{ label: 'Lucea & Hanover', was: '$300', now: 'Not sold online' }])
    expect(rateCardChanges(after, dunns())).toEqual([{ label: 'Lucea & Hanover', was: 'Not sold online', now: '$300' }])
  })

  test('the party the rate covers, the extra person, the add-on and the smallest party, west to east first', () => {
    const after = dunns()
    after.pricing.zoneRates!.ocho_rios = 200
    after.pricing.tierMax = 5
    after.pricing.extraPerPerson = 55
    after.pricing.perPersonAddon = 30
    after.minGuests = 2
    expect(rateCardChanges(dunns(), after)).toEqual([
      { label: 'Ocho Rios', was: '$190', now: '$200' },
      { label: 'Covers up to', was: '4 people', now: '5 people' },
      { label: 'Each extra person', was: '$50', now: '$55' },
      { label: 'Added for every person', was: 'None', now: '$30' },
      { label: 'Smallest party', was: 'Anyone', now: '2 people' },
    ])
  })

  test('a group card and a per-person card use their own labels', () => {
    const after = ricks()
    after.pricing.baseRate = 210
    after.pricing.extraPerPerson = 42
    expect(rateCardChanges(ricks(), after)).toEqual([
      { label: 'Rate for the group', was: '$200', now: '$210' },
      { label: 'Bigger groups, per person', was: '$40', now: '$42' },
    ])
    const pp: RateCard = { pricing: { mode: 'per_person', baseRate: 120, tierMax: 3, extraPerPerson: 110 }, minGuests: 2 }
    expect(rateCardChanges(pp, { ...pp, pricing: { ...pp.pricing, baseRate: 125, tierMax: 4 } })).toEqual([
      { label: 'Rate per person', was: '$120', now: '$125' },
      { label: 'That rate is for up to', was: '3 people', now: '4 people' },
    ])
  })

  test('priced another way is null, so the desk shows the whole new card; the same card is no lines', () => {
    expect(rateCardChanges(ricks(), dunns())).toBeNull()
    expect(rateCardChanges(ricks(), { ...ricks(), pricing: { ...ricks().pricing, mode: 'per_person' } })).toBeNull()
    expect(rateCardChanges(dunns(), dunns())).toEqual([])
  })
})

describe('pricing by pickup area', () => {
  const dunns = tour(DUNNS).pricing
  const both = tour(BOTH).pricing

  test('which tours, and the zones they are sold from', () => {
    expect(experiences.filter((e) => isZonePriced(e.pricing)).map((e) => e.id).sort((a, b) => a - b)).toEqual([1, 2, 18])
    expect(zonesSold(dunns)).toEqual(['negril', 'lucea', 'montego_bay', 'trelawny', 'runaway_bay', 'ocho_rios'])
    expect(zoneSells(dunns, 'negril')).toBe(true)
    expect(zoneSells(dunns, null)).toBe(false)
    expect(zoneSells(tour(RICKS).pricing, null)).toBe(true)
  })

  test('the guest price from each zone, worked by hand: (rate x 1.20 + $0.22) / 0.943, rounded up', () => {
    expect(zonePrices(dunns, 4)).toEqual([
      { zone: 'negril', price: 510 }, { zone: 'lucea', price: 382 }, { zone: 'montego_bay', price: 357 },
      { zone: 'trelawny', price: 293 }, { zone: 'runaway_bay', price: 281 }, { zone: 'ocho_rios', price: 243 },
    ])
    // Each guest past four adds $50 to Collin's rate.
    expect(tourOperatorCost(dunns, 6, 'ocho_rios')).toBe(290)
    expect(tourPrice(dunns, 6, 'ocho_rios')).toBe(370)
    // The day with both falls: $30 more for every guest.
    expect(tourOperatorCost(both, 2, 'ocho_rios')).toBe(250)
    expect(tourPrice(both, 2, 'ocho_rios')).toBe(319)
    expect(tourOperatorCost(both, 5, 'negril')).toBe(400 + 150 + 50)
  })

  test('without a zone, the price is the cheapest zone’s: a "from", never sold as such', () => {
    expect(tourPrice(dunns, 2)).toBe(243)
    expect(tour(DUNNS).price).toBe(243)
    expect(tour(BOTH).price).toBe(281)
  })

  test('labels: a flat rate covers the group; a price every guest adds to is for one', () => {
    expect(priceUnitLabel(dunns)).toBe('up to 4 people')
    expect(priceUnitLabel(both)).toBe('for 1 person')
    expect(perTravelerPrice(dunns, 6, 'negril')).toBeNull()
    expect(perTravelerPrice(both, 2, 'negril')).toBeNull()
  })
})

describe('priceTourCart: a tour priced by area is never quietly priced', () => {
  const line = (id: number) => [{ id, travelers: 2, date: '2027-06-15' }]

  test('priced from the zone it is given, and the line says which', () => {
    const p = priceTourCart(line(DUNNS), {}, { zone: 'negril' })
    expect(p.total).toBe(510)
    expect(p.lines[0].zone).toBe('negril')
    expect(p.subtotal).toBe(400)
    expect(priceTourCart(line(RICKS), {}, {}).lines[0].zone).toBeNull()
  })

  test('refused without a zone, in words that say what to do', () => {
    expect(() => priceTourCart(line(DUNNS), {}, {})).toThrow(PricingError)
    try { priceTourCart(line(DUNNS), {}, {}) } catch (e) {
      expect((e as PricingError).code).toBe('pickup_area')
      expect((e as PricingError).detail).toMatch(/priced by where you are staying\. Choose your hotel or its area/)
    }
    try { priceTourCart(line(DUNNS), {}, { pickupKnown: true }) } catch (e) {
      expect((e as PricingError).detail).toMatch(/not sold online from that pickup/)
    }
  })
})

describe('the checkout’s pickup rules for a tour priced by area (lib/checkout-form zonePickupErrors)', () => {
  test('asks for the area of a place no list knows', () => {
    expect(zonePickupErrors('Seaview Villa', { needsArea: true, area: '', unsoldTitle: "Dunn's River Falls Climb" })).toEqual({ pickupArea: 'Choose the area your hotel or villa is in' })
  })
  test('says where to get a price when the pickup is outside the tour’s areas', () => {
    expect(zonePickupErrors('Spanish Court Hotel, Kingston', { needsArea: false, area: '', unsoldTitle: "Dunn's River Falls Climb" }).pickup).toMatch(/not sold online from there\. Choose a pickup in one of our areas, or write to contact@mapltours\.com/)
    expect(zonePickupErrors('Seaview Villa', { needsArea: true, area: 'elsewhere', unsoldTitle: "Dunn's River Falls Climb" }).pickupArea).toMatch(/not sold online from there/)
  })
  test('nothing for a sold pickup, an empty pickup or a cart with no such tour', () => {
    expect(zonePickupErrors('Sandals Negril Beach Resort', { needsArea: false, area: '', unsoldTitle: null })).toEqual({})
    expect(zonePickupErrors('', { needsArea: true, area: '', unsoldTitle: 'x' })).toEqual({})
    expect(zonePickupErrors('Seaview Villa', undefined)).toEqual({})
  })
})

describe('ZonePriceList: every area’s exact price on the tour page', () => {
  const usd = (n: number) => `$${n}`
  test('six areas west to east, with the party the price covers', () => {
    const html = renderToStaticMarkup(ZonePriceList({ exp: tour(DUNNS), formatPrice: usd }))
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&amp;/g, '&')
    expect(text).toContain('For up to 4 people, by where we pick you up')
    expect(text).toContain('Negril $510 Lucea & Hanover $382 Montego Bay & Rose Hall $357 Falmouth & Trelawny $293 Runaway Bay & Discovery Bay $281 Ocho Rios $243')
    expect(text).toContain('Each guest over 4 adds to the price.')
    expect(html.match(/<dt/g)).toHaveLength(6)
  })
  test('the day with both falls is shown for two', () => {
    const text = renderToStaticMarkup(ZonePriceList({ exp: tour(BOTH), formatPrice: usd })).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('For 2 people, by where we pick you up')
    expect(text).toContain('Ocho Rios $319')
  })
  test('nothing at all for a tour with one price everywhere', () => {
    expect(ZonePriceList({ exp: tour(RICKS), formatPrice: usd })).toBeNull()
  })
})

describe('scripts/snapshot-tour-rates.mjs', () => {
  const script = fileURLToPath(new URL('../../scripts/snapshot-tour-rates.mjs', import.meta.url))
  const snapFile = fileURLToPath(new URL('../../lib/tour-rates.snapshot.json', import.meta.url))
  // A bare environment: none of this machine's Netlify or Supabase variables.
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], { env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' })

  test('a local build leaves the committed snapshot alone', () => {
    const before = readFileSync(snapFile, 'utf8')
    const r = run({})
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/local build: catalog default rates/)
    expect(readFileSync(snapFile, 'utf8')).toBe(before)
  })

  test('a Netlify build that cannot read the cards fails, and writes nothing', () => {
    const before = readFileSync(snapFile, 'utf8')
    const r = run({ NETLIFY: 'true' })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/The build stops here/)
    expect(readFileSync(snapFile, 'utf8')).toBe(before)
  })
})
