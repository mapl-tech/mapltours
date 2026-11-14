import { describe, test, expect } from 'vitest'
import { experiences } from '@/lib/experiences'
import { cardOf, kindOf, parseRateCard, type RateCard } from '@/lib/tour-rates'
import { draftOf, rawCard } from '@/components/admin/TourRatesDesk'

/**
 * The prices desk (/admin/tour-rates) and the four ways a card can price.
 *
 * A fourth way arrived on Nov 13 2026: per person by pickup area (Collin on
 * bamboo rafting: "$100 per person", "$150 per person" from Negril). The
 * danger with a new shape is the editor: a desk that only knew "by pickup
 * area, for the group" would open the raft's card and save it back as $100
 * for a party of four. So: opening any card and saving it untouched gives
 * back the same card.
 */
const parsed = (raw: unknown): RateCard => {
  const r = parseRateCard(raw)
  if (!r.ok) throw new Error(r.error)
  return r.card
}

describe('the prices desk keeps a card as it is priced', () => {
  test('every tour in the catalogue: open, save untouched, the same card', () => {
    for (const e of experiences) {
      const card = cardOf(e)
      expect(parsed(rawCard(draftOf(card))), e.title).toEqual(card)
    }
  })

  test('the catalogue uses all four ways, and the desk names each', () => {
    const kinds = new Set(experiences.map((e) => kindOf(cardOf(e))))
    expect(Array.from(kinds).sort()).toEqual(['area', 'area_person', 'group', 'per_person'])
    for (const e of experiences) expect(draftOf(cardOf(e)).kind, e.title).toBe(kindOf(cardOf(e)))
  })

  test('per person by area sends no tier and no bigger-group rate, whatever the hidden fields hold', () => {
    const raft = experiences.find((e) => e.id === 3)!
    const draft = { ...draftOf(cardOf(raft)), tierMax: 'not a number', extraPerPerson: '' }
    const raw = rawCard(draft) as { pricing: Record<string, unknown> }
    expect(Object.keys(raw.pricing).sort()).toEqual(['mode', 'zoneRates'])
    expect(parsed(raw)).toEqual(cardOf(raft))
  })

  test('switching the same area rates between "for the group" and "per person" is a different card', () => {
    const raft = cardOf(experiences.find((e) => e.id === 3)!)
    const asGroup = parsed(rawCard({ ...draftOf(raft), kind: 'area', tierMax: '4', extraPerPerson: '50' }))
    expect(kindOf(asGroup)).toBe('area')
    expect(asGroup.pricing.mode).toBe('group')
    expect(asGroup).not.toEqual(raft)
    const back = parsed(rawCard({ ...draftOf(asGroup), kind: 'area_person' }))
    expect(back).toEqual(raft)
  })
})
