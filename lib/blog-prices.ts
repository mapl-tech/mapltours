/**
 * Tour prices as the blog posts quote them, worked out from the live rate
 * cards with the same function checkout charges with. A post that typed
 * "$351 for up to three people" went stale the day Dunn's River became priced
 * by pickup area; a rate published from /admin/tour-rates now reaches every
 * post with the deploy that publishes it.
 */
import { experiences, isZonePriced, tourPrice, zoneSells } from './experiences'
import type { TourZone } from './tour-zones'

const tour = (id: number) => {
  const e = experiences.find((x) => x.id === id)
  if (!e) throw new Error(`A blog post quotes tour ${id}, which is not in the catalog`)
  return e
}

/**
 * A post that names a pickup area has to get that area's price. tourPrice
 * answers with the cheapest area's when the card does not sell the one asked
 * for, which is right for a "from" and wrong beside the words "picked up in
 * Montego Bay". So a zone the card no longer sells is an error here, and the
 * build that would have published the sentence fails instead.
 */
function priced(id: number, party: number, zone?: TourZone): number {
  const e = tour(id)
  if (zone && !(isZonePriced(e.pricing) && zoneSells(e.pricing, zone))) {
    throw new Error(`A blog post quotes "${e.title}" picked up in ${zone}, and its rate card has no price from there`)
  }
  return tourPrice(e.pricing, party, zone)
}

/** "$357": the all-in price for this party, from this pickup zone for a tour priced by area. */
export function blogPrice(id: number, party: number, zone?: TourZone): string {
  return `$${priced(id, party, zone)}`
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

/**
 * "$119": what each guest pays when a party of this size splits the tour's
 * price, rounded up to the dollar so a post never says less than the share.
 * A post typed "$117 a head" for the falls split three ways; that was $351,
 * the price before the falls were priced by pickup area.
 */
export function blogShare(id: number, party: number, zone?: TourZone): string {
  return `$${Math.ceil(priced(id, party, zone) / party)}`
}

/** True for a tour sold at one price for the party (a flat group rate, with no per-guest add-on). */
export function blogIsGroupPrice(id: number): boolean {
  const p = tour(id).pricing
  return p.mode === 'group' && !p.perPersonAddon
}

/**
 * " rather than per head" after a group price, and nothing after any other:
 * the contrast is only true of a tour priced for the party, and typed beside
 * a unit read from the card it would one day read "$255 per person rather
 * than per head".
 */
export function blogNotPerHead(id: number): string {
  return blogIsGroupPrice(id) ? ' rather than per head' : ''
}

/** "from $115 per person", "$255 for up to four people": the headline price and its unit, a "from" when it depends on the pickup area. */
export function blogFrom(id: number): string {
  const e = tour(id)
  return `${isZonePriced(e.pricing) ? 'from ' : ''}$${tourPrice(e.pricing, 1)} ${blogUnit(id)}`
}
