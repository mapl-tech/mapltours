/**
 * Where a tour day can start and end. Grouped so a guest scanning a long
 * list finds their resort quickly; the airport first because it is the most
 * common pickup, cruise ports apart because a sailing time is a hard deadline.
 *
 * Sangster (MBJ) is the ONLY airport offered. Norman Manley (KIN) is roughly
 * three hours from the north-coast resorts these tours run from.
 */
import type { TourZone } from '@/lib/tour-zones'

export type PlaceKind = 'airport' | 'cruise' | 'hotel'

/**
 * `zone` is the pickup zone a tour priced by area is quoted from
 * (lib/tour-zones). No zone means outside every zone Collin prices: such a
 * tour is not sold online from there, and the guest writes for a price.
 * Royalton Blue Waters sells as "Montego Bay" but stands at Coopers Pen,
 * Falmouth, where the transfer rate card already prices it.
 */
export const PICKUP_PLACES: { name: string; address: string; kind?: PlaceKind; zone?: TourZone }[] = [
  { name: 'Sandals Negril Beach Resort', address: 'Norman Manley Blvd, Negril, Westmoreland', zone: 'negril' },
  { name: 'Sandals Royal Caribbean, Montego Bay', address: 'Mahoe Bay, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Sandals Ochi Beach Resort, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', zone: 'ocho_rios' },
  { name: 'Riu Negril', address: 'Norman Manley Blvd, Negril, Westmoreland', zone: 'negril' },
  { name: 'Riu Montego Bay', address: 'Mahoe Bay, Ironshore, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Hyatt Ziva Rose Hall, Montego Bay', address: 'Rose Hall Rd, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Hilton Rose Hall Resort, Montego Bay', address: 'Rose Hall, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Grand Palladium Jamaica, Lucea', address: 'Point, Lucea, Hanover', zone: 'lucea' },
  { name: 'Royalton Blue Waters, Montego Bay', address: 'Coopers Pen, Falmouth, Trelawny', zone: 'trelawny' },
  { name: 'Royalton Negril', address: 'Norman Manley Blvd, Negril, Westmoreland', zone: 'negril' },
  { name: 'Secrets Wild Orchid, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Secrets St. James, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Breathless Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', zone: 'montego_bay' },
  { name: 'Moon Palace Jamaica, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', zone: 'ocho_rios' },
  { name: 'Jamaica Inn, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', zone: 'ocho_rios' },
  { name: 'Strawberry Hill, Blue Mountains', address: 'Irish Town, St. Andrew' },
  { name: 'GoldenEye, Oracabessa', address: 'Oracabessa Bay, St. Mary' },
  { name: 'Round Hill Hotel, Montego Bay', address: 'John Pringle Dr, Hopewell, Hanover', zone: 'montego_bay' },
  { name: 'Rockhouse Hotel, Negril', address: 'West End Rd, Negril, Westmoreland', zone: 'negril' },
  { name: 'The Cliff Hotel, Negril', address: 'West End Rd, Negril, Westmoreland', zone: 'negril' },
  { name: 'Geejam Hotel, Port Antonio', address: 'San San, Port Antonio, Portland' },
  { name: 'Trident Hotel, Port Antonio', address: 'Anchovy, Port Antonio, Portland' },
  { name: 'Jakes Hotel, Treasure Beach', address: 'Calabash Bay, Treasure Beach, St. Elizabeth' },
  { name: 'Spanish Court Hotel, Kingston', address: '1 St Lucia Ave, Kingston 5' },
  { name: 'Terra Nova All Suite Hotel, Kingston', address: '17 Waterloo Rd, Kingston 10' },
  { name: 'Courtleigh Hotel, Kingston', address: '85 Knutsford Blvd, Kingston 5' },
  { kind: 'airport', name: 'Sangster International Airport (MBJ)', address: 'Sunset Dr, Montego Bay, St. James', zone: 'montego_bay' },
  { kind: 'cruise', name: 'Kingston Cruise Terminal', address: 'Port Royal St, Kingston' },
  { kind: 'cruise', name: 'Falmouth Cruise Port', address: 'Falmouth, Trelawny', zone: 'trelawny' },
  { kind: 'cruise', name: 'Ocho Rios Cruise Port', address: 'Turtle Beach Rd, Ocho Rios, St. Ann', zone: 'ocho_rios' },
]

/**
 * A hotel that is not on the list still needs to be sayable. The stored value
 * keeps its old wording on purpose: carts saved before the checkout asked for
 * the name right under the list hold exactly this string, and a new spelling
 * would make it read as a typed hotel name. Guests see OTHER_PLACE_LABEL.
 */
export const OTHER_PLACE = 'Other hotel or villa (tell us in the note)'
export const OTHER_PLACE_LABEL = 'Other hotel or villa'

export function isListedPlace(name: string): boolean {
  return PICKUP_PLACES.some((p) => p.name === name)
}

/** The pickup as a guest should read it: never the stored instruction. */
export function placeShown(pickup: string): string {
  return pickup === OTHER_PLACE ? OTHER_PLACE_LABEL : pickup
}
