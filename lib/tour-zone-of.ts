/**
 * Which pickup zone a guest is in (lib/tour-zones), worked out the same way
 * everywhere: the checkout page, the checkout server, the agent tools and the
 * tour email all call zoneOfPickup, so the zone a guest is quoted is the zone
 * checkout charges.
 *
 * Kept apart from lib/tour-zones because it reads the 199 transfer hotels;
 * the catalog, which every page loads, only needs the zone names.
 */
import { DESTINATIONS, type TransferDestination } from './airport-transfers'
import { PICKUP_PLACES } from '@/components/checkout/one-page/pickup-places'
import { isTourZone, type TourZone } from './tour-zones'

/**
 * Hotels the zone and parish rule below would place wrong, each by where it
 * actually stands:
 *  - Round Hill (Hopewell, Hanover) is 11 km from Montego Bay and 16 km from
 *    Lucea, so Montego Bay.
 *  - The Green Island resorts sit between Lucea and Negril; the transfer rate
 *    card already prices them as Negril, and the dearer zone never sells
 *    below Collin's cost.
 *  - Couples Tower Isle sells as Ocho Rios, at the east end of the Ocho Rios
 *    strip.
 */
const ZONE_BY_ID: Record<string, TourZone | null> = {
  'round-hill-hotel': 'montego_bay',
  'princess-grand-jamaica': 'negril',
  'princess-senses-mangrove': 'negril',
  'couples-tower-isle': 'ocho_rios',
}

/**
 * The zone of a transfer hotel. By transfer zone and parish:
 *  A, St. James               Montego Bay & Rose Hall
 *  B or C, Trelawny           Falmouth & Trelawny (Meliá Braco at Rio Bueno
 *                             too: the dearer of the two zones it borders)
 *  C, Hanover                 Lucea & Hanover
 *  D, Westmoreland            Negril
 *  D, St. Ann                 Runaway Bay & Discovery Bay
 *  E, St. Ann                 Ocho Rios
 * Everything else (Oracabessa, Port Maria, Treasure Beach, Whitehouse) is in
 * no zone.
 */
export function zoneOfDestination(d: Pick<TransferDestination, 'id' | 'zone' | 'parish'>): TourZone | null {
  if (d.id in ZONE_BY_ID) return ZONE_BY_ID[d.id]
  if (d.zone === 'A' && d.parish === 'St. James') return 'montego_bay'
  if ((d.zone === 'B' || d.zone === 'C') && d.parish === 'Trelawny') return 'trelawny'
  if (d.zone === 'C' && d.parish === 'Hanover') return 'lucea'
  if (d.zone === 'D' && d.parish === 'Westmoreland') return 'negril'
  if (d.zone === 'D' && d.parish === 'St. Ann') return 'runaway_bay'
  if (d.zone === 'E' && d.parish === 'St. Ann') return 'ocho_rios'
  return null
}

const norm = (s: string) => s.normalize('NFC').trim().toLowerCase()

/**
 * The zone a tour is picked up from.
 *  1. A place on the checkout's pickup list: that place's zone, or none.
 *  2. A transfer hotel, by its exact name (a tour email's or an agent's link
 *     carries one): that hotel's zone.
 *  3. Anything else, a typed hotel or villa: the area the guest chose for it.
 * The guest's area never overrides a place we already know, so nobody is
 * quoted the Ocho Rios rate for a Negril pickup by picking the wrong area.
 */
export function zoneOfPickup(pickup: string | null | undefined, area?: string | null): TourZone | null {
  const name = norm(pickup ?? '')
  if (!name) return null
  const listed = PICKUP_PLACES.find((p) => norm(p.name) === name)
  if (listed) return listed.zone ?? null
  const hotel = DESTINATIONS.find((d) => norm(d.name) === name)
  if (hotel) return zoneOfDestination(hotel)
  return isTourZone(area) ? area : null
}

/**
 * Area words an assistant or a booking link may use for where a traveller is
 * staying, for text that names no hotel we know ("Negril", "a villa in Runaway
 * Bay"). Green Island goes with Negril and Rose Hall with Montego Bay, as the
 * hotels there do above.
 */
const AREA_WORDS: Array<[TourZone, RegExp]> = [
  ['negril', /\bnegril\b|\bgreen island\b/],
  ['lucea', /\blucea\b|\bhanover\b|\btryall\b/],
  ['montego_bay', /\bmontego\b|\bmobay\b|\brose hall\b|\bironshore\b|\bhip strip\b|\bmbj\b|\bsangster\b/],
  ['trelawny', /\bfalmouth\b|\btrelawny\b|\bduncans\b|\bcoral spring\b|\brio bueno\b/],
  ['runaway_bay', /\brunaway bay\b|\bdiscovery bay\b/],
  ['ocho_rios', /\bocho rios\b|\bochi\b/],
]

/**
 * The zone a free-text place names, for a traveller an assistant describes:
 * a known place or hotel first (zoneOfPickup), then area words. Text that
 * names two areas is ambiguous and gets none, so nobody is quoted the cheaper
 * one by accident.
 */
export function zoneFromPlaceText(text: string | null | undefined): TourZone | null {
  const known = zoneOfPickup(text)
  if (known) return known
  const t = norm(text ?? '')
  if (!t) return null
  const hits = AREA_WORDS.filter(([, re]) => re.test(t)).map(([z]) => z)
  return hits.length === 1 ? hits[0] : null
}

/**
 * Whether the guest still has to say which area an unlisted pickup is in:
 * true for a typed place (or "Other hotel or villa" with no name yet) that no
 * list knows. A listed place or a known transfer hotel never asks.
 */
export function pickupNeedsArea(pickup: string | null | undefined): boolean {
  const name = norm(pickup ?? '')
  if (!name) return false
  return !PICKUP_PLACES.some((p) => norm(p.name) === name) && !DESTINATIONS.some((d) => norm(d.name) === name)
}
