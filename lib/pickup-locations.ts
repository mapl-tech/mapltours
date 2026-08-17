/**
 * Pickup and drop-off options, grouped so a guest scans a short list instead of
 * one flat run of 30+ names. Airports first (an arriving guest is the one most
 * likely to be starting there), then hotels and resorts by area.
 *
 * `kind` drives the grouping in the UI; `address` is shown under the field once
 * a known location is chosen, so the guest can confirm they picked the right
 * property when several share a name.
 */

export interface PickupLocation {
  name: string
  address: string
  kind: 'airport' | 'hotel'
  area: string
}

export const PICKUP_LOCATIONS: PickupLocation[] = [
  { name: 'Sangster International Airport (MBJ), Montego Bay', address: 'Montego Bay, St. James', kind: 'airport', area: 'Airports' },
  { name: 'Norman Manley International Airport (KIN), Kingston', address: 'Palisadoes, Kingston', kind: 'airport', area: 'Airports' },
  { name: 'Ian Fleming International Airport (OCJ), Ocho Rios', address: 'Boscobel, St. Mary', kind: 'airport', area: 'Airports' },
  { name: 'Sandals Royal Caribbean, Montego Bay', address: 'Mahoe Bay, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Riu Montego Bay', address: 'Mahoe Bay, Ironshore, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Hyatt Ziva Rose Hall, Montego Bay', address: 'Rose Hall Rd, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Hilton Rose Hall Resort, Montego Bay', address: 'Rose Hall, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Royalton Blue Waters, Montego Bay', address: 'Seawind Dr, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Secrets Wild Orchid, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Secrets St. James, Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Breathless Montego Bay', address: 'Freeport Peninsula, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Sangster International Airport (MBJ)', address: 'Sunset Dr, Montego Bay, St. James', kind: 'hotel', area: 'Montego Bay' },
  { name: 'Falmouth Cruise Port', address: 'Falmouth, Trelawny', kind: 'hotel', area: 'Falmouth' },
  { name: 'Sandals Ochi Beach Resort, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', kind: 'hotel', area: 'Ocho Rios' },
  { name: 'Moon Palace Jamaica, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', kind: 'hotel', area: 'Ocho Rios' },
  { name: 'Jamaica Inn, Ocho Rios', address: 'Main St, Ocho Rios, St. Ann', kind: 'hotel', area: 'Ocho Rios' },
  { name: 'GoldenEye, Oracabessa', address: 'Oracabessa Bay, St. Mary', kind: 'hotel', area: 'Ocho Rios' },
  { name: 'Ocho Rios Cruise Port', address: 'Turtle Beach Rd, Ocho Rios, St. Ann', kind: 'hotel', area: 'Ocho Rios' },
  { name: 'Sandals Negril Beach Resort', address: 'Norman Manley Blvd, Negril, Westmoreland', kind: 'hotel', area: 'Negril' },
  { name: 'Riu Negril', address: 'Norman Manley Blvd, Negril, Westmoreland', kind: 'hotel', area: 'Negril' },
  { name: 'Royalton Negril', address: 'Norman Manley Blvd, Negril, Westmoreland', kind: 'hotel', area: 'Negril' },
  { name: 'Rockhouse Hotel, Negril', address: 'West End Rd, Negril, Westmoreland', kind: 'hotel', area: 'Negril' },
  { name: 'The Cliff Hotel, Negril', address: 'West End Rd, Negril, Westmoreland', kind: 'hotel', area: 'Negril' },
  { name: 'Grand Palladium Jamaica, Lucea', address: 'Point, Lucea, Hanover', kind: 'hotel', area: 'Lucea & Hanover' },
  { name: 'Round Hill Hotel, Montego Bay', address: 'John Pringle Dr, Hopewell, Hanover', kind: 'hotel', area: 'Lucea & Hanover' },
  { name: 'Geejam Hotel, Port Antonio', address: 'San San, Port Antonio, Portland', kind: 'hotel', area: 'Port Antonio' },
  { name: 'Trident Hotel, Port Antonio', address: 'Anchovy, Port Antonio, Portland', kind: 'hotel', area: 'Port Antonio' },
  { name: 'Jakes Hotel, Treasure Beach', address: 'Calabash Bay, Treasure Beach, St. Elizabeth', kind: 'hotel', area: 'Treasure Beach' },
  { name: 'Strawberry Hill, Blue Mountains', address: 'Irish Town, St. Andrew', kind: 'hotel', area: 'Kingston' },
  { name: 'Spanish Court Hotel, Kingston', address: '1 St Lucia Ave, Kingston 5', kind: 'hotel', area: 'Kingston' },
  { name: 'Terra Nova All Suite Hotel, Kingston', address: '17 Waterloo Rd, Kingston 10', kind: 'hotel', area: 'Kingston' },
  { name: 'Courtleigh Hotel, Kingston', address: '85 Knutsford Blvd, Kingston 5', kind: 'hotel', area: 'Kingston' },
  { name: 'Norman Manley International Airport (KIN)', address: 'Palisadoes, Kingston', kind: 'hotel', area: 'Kingston' },
  { name: 'Kingston Cruise Terminal', address: 'Port Royal St, Kingston', kind: 'hotel', area: 'Kingston' },
]

/** Group order for the dropdown: airports first, then areas as listed. */
export const PICKUP_GROUP_ORDER: string[] = [
  'Airports',
  'Montego Bay',
  'Falmouth',
  'Ocho Rios',
  'Negril',
  'Lucea & Hanover',
  'Port Antonio',
  'Treasure Beach',
  'Kingston',
]

/** Options bucketed by group, ready to render as <optgroup>s. */
export function groupedPickupLocations(): { label: string; options: PickupLocation[] }[] {
  return PICKUP_GROUP_ORDER
    .map((label) => ({ label, options: PICKUP_LOCATIONS.filter((l) => l.area === label) }))
    .filter((g) => g.options.length > 0)
}

export function findPickupLocation(name: string): PickupLocation | undefined {
  return PICKUP_LOCATIONS.find((l) => l.name === name)
}
