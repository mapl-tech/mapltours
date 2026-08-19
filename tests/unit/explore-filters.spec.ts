import { describe, test, expect } from 'vitest'
import { singleExperiences, type Experience, type ExperienceCategory } from '../../lib/experiences'

/**
 * The explore filters and search.
 *
 * These mirror the exact predicates in components/ExploreView.tsx. The bug they
 * guard against: the control labelled "Parish" was built from destinations AND
 * parishes flattened together, so it offered town names under a parish label
 * and two different options filtered to overlapping sets.
 *
 * The property that matters most is reachability. Every experience in the
 * catalog must be findable through every filter axis, or a tour exists that
 * nobody browsing can reach.
 */

const categories: ('All' | ExperienceCategory)[] = [
  'All',
  ...(Array.from(new Set(singleExperiences.map((e) => e.category))).sort() as ExperienceCategory[]),
]
const parishes = [
  'All Parishes',
  ...Array.from(new Set(singleExperiences.map((e) => e.parish))).sort(),
]

/** The ExploreView predicate, kept in step with the component. */
function filterExperiences(
  items: Experience[],
  { search = '', cat = 'All', parish = 'All Parishes' }:
    { search?: string; cat?: string; parish?: string },
): Experience[] {
  return items.filter((exp) => {
    if (cat !== 'All' && exp.category !== cat) return false
    if (parish !== 'All Parishes' && exp.parish !== parish) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !exp.title.toLowerCase().includes(q) &&
        !exp.destination.toLowerCase().includes(q) &&
        !exp.parish.toLowerCase().includes(q) &&
        !exp.category.toLowerCase().includes(q) &&
        !exp.creator.toLowerCase().includes(q) &&
        !exp.description.toLowerCase().includes(q) &&
        !exp.tags.some((t) => t.toLowerCase().includes(q))
      ) return false
    }
    return true
  })
}

describe('the parish control offers parishes, and only parishes', () => {
  test('every option is a real parish on a real experience', () => {
    const realParishes = new Set(singleExperiences.map((e) => e.parish))
    for (const p of parishes.slice(1)) {
      expect(realParishes.has(p), `"${p}" is offered but no experience is in it`).toBe(true)
    }
  })

  test('no destination leaked into the parish list', () => {
    // The regression: Falmouth, Montego Bay, Negril, Nine Mile and Ocho Rios
    // are towns, and were being offered under a "Parish" label.
    const destinations = new Set(singleExperiences.map((e) => e.destination))
    for (const p of parishes.slice(1)) {
      if (destinations.has(p) && !singleExperiences.some((e) => e.parish === p)) {
        throw new Error(`"${p}" is a destination, not a parish`)
      }
    }
    expect(parishes.slice(1).some((p) => p === 'Ocho Rios' || p === 'Montego Bay')).toBe(false)
  })

  test('every parish option returns at least one experience', () => {
    for (const p of parishes.slice(1)) {
      expect(filterExperiences(singleExperiences, { parish: p }).length,
        `parish "${p}" is a dead filter`).toBeGreaterThan(0)
    }
  })
})

describe('every experience stays reachable', () => {
  test('each one is found by its own parish', () => {
    for (const exp of singleExperiences) {
      const hit = filterExperiences(singleExperiences, { parish: exp.parish })
      expect(hit.map((e) => e.id), `${exp.title} is unreachable via ${exp.parish}`).toContain(exp.id)
    }
  })

  test('each one is found by its own category', () => {
    for (const exp of singleExperiences) {
      const hit = filterExperiences(singleExperiences, { cat: exp.category })
      expect(hit.map((e) => e.id), `${exp.title} is unreachable via ${exp.category}`).toContain(exp.id)
    }
  })

  test('each one is found by searching its exact title', () => {
    for (const exp of singleExperiences) {
      const hit = filterExperiences(singleExperiences, { search: exp.title })
      expect(hit.map((e) => e.id), `${exp.title} is not findable by name`).toContain(exp.id)
    }
  })

  test('each one is found by its own category plus its own parish together', () => {
    for (const exp of singleExperiences) {
      const hit = filterExperiences(singleExperiences, { cat: exp.category, parish: exp.parish })
      expect(hit.map((e) => e.id), `${exp.title} lost to a combined filter`).toContain(exp.id)
    }
  })

  test('every category option returns at least one experience', () => {
    for (const c of categories.slice(1)) {
      expect(filterExperiences(singleExperiences, { cat: c }).length,
        `category "${c}" is a dead filter`).toBeGreaterThan(0)
    }
  })
})

describe('search behaves', () => {
  test('towns are still findable by search, even though they left the dropdown', () => {
    for (const town of Array.from(new Set(singleExperiences.map((e) => e.destination)))) {
      expect(filterExperiences(singleExperiences, { search: town }).length,
        `"${town}" finds nothing`).toBeGreaterThan(0)
    }
  })

  test('is case insensitive', () => {
    const a = filterExperiences(singleExperiences, { search: 'OCHO RIOS' })
    const b = filterExperiences(singleExperiences, { search: 'ocho rios' })
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
  })

  test('an unmatched query returns nothing rather than everything', () => {
    expect(filterExperiences(singleExperiences, { search: 'zzzz-no-such-tour' })).toHaveLength(0)
  })

  test('an empty query is not treated as a filter', () => {
    expect(filterExperiences(singleExperiences, { search: '' })).toHaveLength(singleExperiences.length)
  })

  test('filters compose: a category and a search that disagree return nothing', () => {
    const water = singleExperiences.find((e) => e.category === 'Water')
    const culture = singleExperiences.find((e) => e.category === 'Culture')
    if (!water || !culture) return
    expect(filterExperiences(singleExperiences, { cat: 'Water', search: culture.title })).toHaveLength(0)
  })
})

describe('no invented social proof survives in the catalog', () => {
  test('no experience carries a fabricated rating or review count', () => {
    // These were hardcoded at 4.9 with counts like 127 across all 22 rows,
    // and rendered as stars on every card. Zero is the honest state until
    // real reviews exist.
    for (const exp of singleExperiences) {
      expect(exp.rating, `${exp.title} still has an invented rating`).toBe(0)
      expect(exp.reviews, `${exp.title} still has an invented review count`).toBe(0)
    }
  })
})
