import type { Experience } from './experiences'
import { displayHandle } from './creator'

/**
 * Tour search, shared by the explore page and the header search.
 *
 * It used to look for the whole query as one unbroken piece of text, so a
 * guest (or a browsing agent) who typed the tour in their own words,
 * "bamboo rafting Martha Brae", found nothing, because the title reads
 * "Bamboo Rafting on the Martha Brae". Now every word of the query has to
 * appear somewhere in the tour (title, town, parish, category, creator,
 * description or tags), in any order. Case, accents and apostrophes are
 * ignored, and words that describe every listing ("tour", "the", "jamaica")
 * are dropped rather than allowed to rule a tour out.
 */

const FILLER = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'on', 'in', 'at', 'to', 'for', 'with', 'from', 'near', 'by',
  'tour', 'tours', 'trip', 'trips', 'experience', 'experiences', 'excursion', 'excursions',
  'activity', 'activities', 'jamaica', 'jamaican', 'private',
])

/** Lower case, accents off, apostrophes dropped, anything else not a letter or digit a space. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The words of a query that can narrow a search. Empty: the query does not filter. */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(' ').filter((w) => w && !FILLER.has(w))
}

/** Everything a tour can be found by, as one normalized string. */
function haystack(exp: Experience): string {
  return normalizeSearchText([
    exp.title, exp.destination, exp.parish, exp.category, displayHandle(exp.creator), exp.description, ...exp.tags,
  ].join(' '))
}

/** True when every word of the query appears in the tour. A query with no such words matches everything. */
export function experienceMatchesSearch(exp: Experience, query: string): boolean {
  const terms = searchTerms(query)
  if (!terms.length) return true
  const text = haystack(exp)
  return terms.every((t) => text.includes(t))
}

/** The explore page's filters: category, parish, then the search. */
export function filterExperiences<T extends Experience>(
  items: T[],
  { search = '', cat = 'All', parish = 'All Parishes' }: { search?: string; cat?: string; parish?: string },
): T[] {
  return items.filter((exp) => {
    if (cat !== 'All' && exp.category !== cat) return false
    // Parish only: the control offers parishes exclusively, and matching the
    // town too would let a town that shares a parish's name pull in the
    // wrong rows.
    if (parish !== 'All Parishes' && exp.parish !== parish) return false
    return experienceMatchesSearch(exp, search)
  })
}
