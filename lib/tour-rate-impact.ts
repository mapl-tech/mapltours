/**
 * What a rate change does to guests, for the review step on
 * /admin/tour-rates: the guest price for one group size from every pickup
 * area, and every group size whose price moves anywhere. The review shows
 * both, so a change that only touches big groups never reads as "no change"
 * at the group size the owner happened to pick.
 *
 * Prices come from tourPrice, the function checkout charges with. Kept apart
 * from lib/tour-rates because lib/experiences loads that module, and a price
 * import back into it would be a load-order cycle. Pure.
 */
import { isZonePriced, tourPrice, zoneSells, zonesSold } from './experiences'
import { PARTY_MAX, type RateCard } from './tour-rates'
import { TOUR_ZONES, type TourZone } from './tour-zones'

/**
 * What a guest pays for this party, or null where the card does not sell the
 * tour online. A card priced by area sells only from its areas: anywhere else
 * (zone null) checkout refuses it, so that is null too, never the "from".
 */
export function guestPriceAt(card: RateCard, party: number, zone: TourZone | null): number | null {
  if (isZonePriced(card.pricing)) return zone && zoneSells(card.pricing, zone) ? tourPrice(card.pricing, party, zone) : null
  return tourPrice(card.pricing, party)
}

/**
 * The places to compare two cards at, west to east: every area either card
 * sells from, plus null ("anywhere else") when only one of them is priced by
 * area, since the other sells everywhere. Just [null] when neither is.
 */
export function placesCompared(before: RateCard, after: RateCard): (TourZone | null)[] {
  const a = zonesSold(before.pricing)
  const b = zonesSold(after.pricing)
  const areas: (TourZone | null)[] = TOUR_ZONES.filter((z) => a.includes(z) || b.includes(z))
  if (!areas.length) return [null]
  if (isZonePriced(before.pricing) !== isZonePriced(after.pricing)) areas.push(null)
  return areas
}

/** Group sizes, 1 to PARTY_MAX, whose guest price moves from any place the tour is sold. */
export function partiesMoved(before: RateCard, after: RateCard): number[] {
  const places = placesCompared(before, after)
  const out: number[] = []
  for (let n = 1; n <= PARTY_MAX; n++) {
    if (places.some((z) => guestPriceAt(before, n, z) !== guestPriceAt(after, n, z))) out.push(n)
  }
  return out
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/** Group sizes in words: "every group size", "groups of 5 to 12", "1 person", "groups of 1 to 3 and 9 to 12". */
export function describeParties(ns: number[]): string {
  if (!ns.length) return 'no group size'
  if (ns.length === PARTY_MAX) return 'every group size'
  const runs: [number, number][] = []
  for (const n of ns) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  if (runs.length === 1 && runs[0][0] === runs[0][1]) return people(runs[0][0])
  const parts = runs.map(([a, b]) => (a === b ? String(a) : `${a} to ${b}`))
  return `groups of ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}`
}
