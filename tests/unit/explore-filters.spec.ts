import { describe, test, expect } from 'vitest'
import { singleExperiences, type ExperienceCategory } from '../../lib/experiences'
// The real predicate the explore page runs (it used to be mirrored here by
// hand and kept in step with the component).
import { filterExperiences, searchTerms, experienceMatchesSearch, normalizeSearchText } from '../../lib/explore-search'

/**
 * The explore filters and search.
 *
 * These run the exact predicate components/ExploreView.tsx uses. The bug they
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

describe('search takes the words a guest or an agent actually types', () => {
  const raft = singleExperiences.find((e) => /martha brae/i.test(e.title))

  test('the user\u2019s own phrase finds the Martha Brae raft', () => {
    // A phone agent on Sept 27 searched "bamboo rafting Martha Brae", got
    // "0 of 14 experiences" and nearly concluded the tour did not exist.
    expect(raft).toBeTruthy()
    for (const q of ['bamboo rafting Martha Brae', 'Martha Brae bamboo rafting', 'martha brae rafting tour', 'Bamboo raft, Martha Brae, Jamaica']) {
      expect(filterExperiences(singleExperiences, { search: q }).map((e) => e.id), q).toContain(raft!.id)
    }
  })

  test('every word must match: a word no tour has still rules everything out', () => {
    expect(filterExperiences(singleExperiences, { search: 'bamboo rafting Kingston submarine' })).toHaveLength(0)
  })

  test('each tour is found by its title words in reverse order', () => {
    for (const exp of singleExperiences) {
      const reversed = exp.title.split(/\s+/).reverse().join(' ')
      expect(filterExperiences(singleExperiences, { search: reversed }).map((e) => e.id), reversed).toContain(exp.id)
    }
  })

  test('case, accents and apostrophes do not matter; filler words do not filter', () => {
    expect(normalizeSearchText("Rick\u2019s Caf\u00e9")).toBe('ricks cafe')
    expect(searchTerms('The tour of Jamaica')).toEqual([])
    expect(searchTerms('Negril sunset tour')).toEqual(['negril', 'sunset'])
    const any = singleExperiences[0]
    expect(experienceMatchesSearch(any, 'tours')).toBe(true)
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
