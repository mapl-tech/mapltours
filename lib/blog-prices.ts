/**
 * Tour prices as the blog posts quote them, worked out from the live rate
 * cards with the same function checkout charges with. A post that typed
 * "$351 for up to three people" went stale the day Dunn's River became priced
 * by pickup area; a rate published from /admin/tour-rates now reaches every
 * post with the deploy that publishes it.
 */
import { experiences, isZonePriced, tourPrice, zoneSells, type TourPricing } from './experiences'
import type { TourZone } from './tour-zones'

const tour = (id: number) => {
  const e = experiences.find((x) => x.id === id)
  if (!e) throw new Error(`A blog post quotes tour ${id}, which is not in the catalog`)
  return e
}

/**
 * "$357": the all-in price for this party. For a tour priced by pickup area
 * this is the cheapest area's price, a "from"; a price from one named area
 * goes through blogInArea below, never through here.
 */
export function blogPrice(id: number, party: number): string {
  return `$${tourPrice(tour(id).pricing, party)}`
}

/**
 * A clause that quotes a tour's price from ONE pickup area, with what to say
 * instead if the card stops selling the tour from there.
 *
 * `sold` is handed that area's price for the party ("$357") and one guest's
 * share of it, rounded up ("$90"), and returns the clause: "$357 for up to
 * four people picked up in Montego Bay". `otherwise` is printed in its place
 * once the area is not on the card: usually the tour's "from" price.
 *
 * Why two wordings and no error: the prices desk can leave an area out of a
 * card (lib/tour-rates accepts any card with one area or more). tourPrice
 * then answers with the cheapest area's price, which beside the words
 * "picked up in Montego Bay" is a false sentence. For a few hours on Nov 14
 * 2026 this module threw instead, and that was worse: the throw fails the
 * build, the build is what publishes the desk's save, and so a price change
 * saved together with the dropped area would never have gone live, with
 * nothing on the desk to say why. So the area's name and its price travel
 * together through this one function, and the post keeps a true sentence
 * either way. tests/unit/blog-tour-prices.spec.ts fails when any post is on
 * its `otherwise` wording, which is the cue to rewrite the passage.
 */
export function areaClause(pricing: TourPricing, party: number, zone: TourZone, sold: (price: string, share: string) => string, otherwise: string): string {
  if (!(isZonePriced(pricing) && zoneSells(pricing, zone))) return otherwise
  const total = tourPrice(pricing, party, zone)
  return sold(`$${total}`, `$${Math.ceil(total / party)}`)
}

/** Every clause a post printed on its `otherwise` wording, since this module loaded. Empty while every quoted area is sold. */
export const BLOG_AREA_FALLBACKS: Array<{ id: number; zone: TourZone }> = []

/** areaClause for a tour in the catalogue: see there. */
export function blogInArea(id: number, party: number, zone: TourZone, sold: (price: string, share: string) => string, otherwise: string): string {
  const pricing = tour(id).pricing
  if (!(isZonePriced(pricing) && zoneSells(pricing, zone))) BLOG_AREA_FALLBACKS.push({ id, zone })
  return areaClause(pricing, party, zone, sold, otherwise)
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
 * the price before the falls were priced by pickup area. For a tour priced
 * by area this is a share of the cheapest area's price; one named area's
 * share comes from blogInArea.
 */
export function blogShare(id: number, party: number): string {
  return `$${Math.ceil(tourPrice(tour(id).pricing, party) / party)}`
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
