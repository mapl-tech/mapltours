/**
 * Tour prices as the blog posts quote them, worked out from the live rate
 * cards with the same function checkout charges with. A post that typed
 * "$351 for up to three people" went stale the day Dunn's River became priced
 * by pickup area; a rate published from /admin/tour-rates now reaches every
 * post with the deploy that publishes it.
 */
import { experiences, isZonePriced, tourPrice } from './experiences'
import type { TourZone } from './tour-zones'

const tour = (id: number) => {
  const e = experiences.find((x) => x.id === id)
  if (!e) throw new Error(`A blog post quotes tour ${id}, which is not in the catalog`)
  return e
}

/** "$357": the all-in price for this party, from this pickup zone for a tour priced by area. */
export function blogPrice(id: number, party: number, zone?: TourZone): string {
  return `$${tourPrice(tour(id).pricing, party, zone)}`
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

/**
 * What a tour's headline price buys, as the words after it: "for up to four
 * people" for a group price, "for one person" where every guest adds to it,
 * "per person" otherwise. Read from the card, so a tour that changes how it
 * is priced changes its sentence: the raft's post said "$128 for up to three"
 * and would have said "for up to twelve" the day it became per person.
 */
export function blogUnit(id: number): string {
  const p = tour(id).pricing
  if (p.mode !== 'group') return 'per person'
  if (p.perPersonAddon) return 'for one person'
  return `for up to ${WORDS[p.tierMax] ?? String(p.tierMax)} people`
}

/** "from $115 per person", "$255 for up to four people": the headline price and its unit, a "from" when it depends on the pickup area. */
export function blogFrom(id: number): string {
  const e = tour(id)
  return `${isZonePriced(e.pricing) ? 'from ' : ''}$${tourPrice(e.pricing, 1)} ${blogUnit(id)}`
}
