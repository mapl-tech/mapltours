/**
 * Tour prices as the blog posts quote them, worked out from the live rate
 * cards with the same function checkout charges with. A post that typed
 * "$351 for up to three people" went stale the day Dunn's River became priced
 * by pickup area; a rate published from /admin/tour-rates now reaches every
 * post with the deploy that publishes it.
 */
import { experiences, tourPrice } from './experiences'
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

/** "three": how many people a group tour's one price covers, as a word. */
export function blogPartyWord(id: number): string {
  const n = tour(id).pricing.tierMax
  return WORDS[n] ?? String(n)
}
