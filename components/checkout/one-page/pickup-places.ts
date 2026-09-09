/**
 * Where a tour day can start and end. Grouped so a guest scanning a long
 * list finds their resort quickly; the airport first because it is the most
 * common pickup, cruise ports apart because a sailing time is a hard deadline.
 *
 * Sangster (MBJ) is the ONLY airport offered. Norman Manley (KIN) is roughly
 * three hours from the north-coast resorts these tours run from.
 */
export type PlaceKind = 'airport' | 'cruise' | 'hotel'

export const PICKUP_PLACES: { name: string; address: string; kind?: PlaceKind }[] = [
  { name: 'Sandals Negril Beach Resort', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Sandals Royal Caribbean, Montego Bay', address: 'Mahoe Bay, Montego Bay, St. James' },
  { name: 'Sandals Ochi Beach Resort, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Riu Negril', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Riu Montego Bay', address: 'Mahoe Bay, Ironshore, Montego Bay, St. James' },
  { name: 'Hyatt Ziva Rose Hall, Montego Bay', address: 'Rose Hall Rd, Montego Bay, St. James' },
  { name: 'Hilton Rose Hall Resort, Montego Bay', address: 'Rose Hall, Montego Bay, St. James' },
  { name: 'Grand Palladium Jamaica, Lucea', address: 'Point, Lucea, Hanover' },
  { name: 'Royalton Blue Waters, Montego Bay', address: 'Seawind Dr, Montego Bay, St. James' },
  { name: 'Royalton Negril', address: 'Norman Manley Blvd, Negril, Westmoreland' },
  { name: 'Secrets Wild Orchid, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Secrets St. James, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Breathless Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James' },
  { name: 'Moon Palace Jamaica, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Jamaica Inn, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann' },
  { name: 'Strawberry Hill, Blue Mountains', address: 'Irish Town, St. Andrew' },
  { name: 'GoldenEye, Oracabessa', address: 'Oracabessa Bay, St. Mary' },
  { name: 'Round Hill Hotel, Montego Bay', address: 'John Pringle Dr, Hopewell, Hanover' },
  { name: 'Rockhouse Hotel, Negril', address: 'West End Rd, Negril, Westmoreland' },
  { name: 'The Cliff Hotel, Negril', address: 'West End Rd, Negril, Westmoreland' },
  { name: 'Geejam Hotel, Port Antonio', address: 'San San, Port Antonio, Portland' },
  { name: 'Trident Hotel, Port Antonio', address: 'Anchovy, Port Antonio, Portland' },
  { name: 'Jakes Hotel, Treasure Beach', address: 'Calabash Bay, Treasure Beach, St. Elizabeth' },
  { name: 'Spanish Court Hotel, Kingston', address: '1 St Lucia Ave, Kingston 5' },
  { name: 'Terra Nova All Suite Hotel, Kingston', address: '17 Waterloo Rd, Kingston 10' },
  { name: 'Courtleigh Hotel, Kingston', address: '85 Knutsford Blvd, Kingston 5' },
  { kind: 'airport', name: 'Sangster International Airport (MBJ)', address: 'Sunset Dr, Montego Bay, St. James' },
  { kind: 'cruise', name: 'Kingston Cruise Terminal', address: 'Port Royal St, Kingston' },
  { kind: 'cruise', name: 'Falmouth Cruise Port', address: 'Falmouth, Trelawny' },
  { kind: 'cruise', name: 'Ocho Rios Cruise Port', address: 'Turtle Beach Rd, Ocho Rios, St. Ann' },
]

/** A hotel that is not on the list still needs to be sayable. */
export const OTHER_PLACE = 'Other hotel or villa (tell us in the note)'
