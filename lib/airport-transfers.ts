/**
 * Airport transfers — flat-rate zone pricing from Sangster International
 * Airport (MBJ, Montego Bay) to Jamaican hotels and resorts. Prices are per
 * vehicle, covering 1–4 passengers. Sourced from mid-market operator rates
 * (Collins, ExecuTours, Juta Express).
 *
 * Kingston (KIN) transfers and Port Antonio destinations are handled via
 * custom quote at MVP — the contact form handles those.
 */

export type TransferAirport = 'MBJ'
export type TransferZone = 'A' | 'B' | 'C' | 'D' | 'E'
export type TransferTripType = 'one_way' | 'round_trip'

export interface ZoneInfo {
  code: TransferZone
  label: string
  /** Travel time window from MBJ */
  duration: string
  /** Flat rate for 1–4 passengers, in USD */
  oneWay: number
  roundTrip: number
}

export const ZONES: Record<TransferZone, ZoneInfo> = {
  A: {
    code: 'A',
    label: 'Montego Bay & Rose Hall',
    duration: 'Under 20 min from MBJ',
    oneWay: 35,
    roundTrip: 60,
  },
  B: {
    code: 'B',
    label: 'Falmouth',
    duration: '35–45 min from MBJ',
    oneWay: 60,
    roundTrip: 110,
  },
  C: {
    code: 'C',
    label: 'Trelawny, Hanover & Lucea',
    duration: '40–60 min from MBJ',
    oneWay: 65,
    roundTrip: 120,
  },
  D: {
    code: 'D',
    label: 'Negril & Runaway Bay',
    duration: '75–90 min from MBJ',
    oneWay: 80,
    roundTrip: 140,
  },
  E: {
    code: 'E',
    label: 'Ocho Rios & South Coast',
    duration: '90–120 min from MBJ',
    oneWay: 100,
    roundTrip: 180,
  },
}

export interface TransferDestination {
  id: string
  name: string
  parish: string
  zone: TransferZone
}

/**
 * Hotel and landmark destinations served by flat-rate MBJ transfers.
 * The list is deliberately conservative — anything requiring a custom
 * quote (Port Antonio, Kingston parish, Mandeville) is absent here and
 * must route through /contact.
 */
export const DESTINATIONS: TransferDestination[] = [
  // Zone A — Montego Bay & Rose Hall
  { id: 'iberostar-rose-hall', name: 'Iberostar Rose Hall', parish: 'St. James', zone: 'A' },
  { id: 'secrets-st-james', name: 'Secrets St. James, Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'secrets-wild-orchid', name: 'Secrets Wild Orchid, Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'jewel-grande-montego-bay', name: 'Jewel Grande Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'hyatt-ziva-rose-hall', name: 'Hyatt Ziva Rose Hall', parish: 'St. James', zone: 'A' },
  { id: 'hyatt-zilara-rose-hall', name: 'Hyatt Zilara Rose Hall', parish: 'St. James', zone: 'A' },
  { id: 'hilton-rose-hall', name: 'Hilton Rose Hall Resort', parish: 'St. James', zone: 'A' },
  { id: 'royalton-blue-waters-mb', name: 'Royalton Blue Waters, Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'sandals-montego-bay', name: 'Sandals Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'sandals-royal-caribbean', name: 'Sandals Royal Caribbean, Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'riu-montego-bay', name: 'Riu Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'riu-palace-jamaica', name: 'Riu Palace Jamaica', parish: 'St. James', zone: 'A' },
  { id: 'breathless-montego-bay', name: 'Breathless Montego Bay', parish: 'St. James', zone: 'A' },
  { id: 'iberostar-grand-rose-hall', name: 'Iberostar Grand Rose Hall', parish: 'St. James', zone: 'A' },
  { id: 'half-moon-resort', name: 'Half Moon, A RockResort', parish: 'St. James', zone: 'A' },

  // Zone B — Falmouth
  { id: 'royalton-blue-water-trelawny', name: 'Royalton Blue Water (Falmouth)', parish: 'Trelawny', zone: 'B' },
  { id: 'excellence-oyster-bay', name: 'Excellence Oyster Bay', parish: 'Trelawny', zone: 'B' },
  { id: 'falmouth-cruise-port', name: 'Falmouth Cruise Port', parish: 'Trelawny', zone: 'B' },

  // Zone C — Trelawny / Hanover / Lucea
  { id: 'grand-palladium-lucea', name: 'Grand Palladium Jamaica, Lucea', parish: 'Hanover', zone: 'C' },
  { id: 'ocean-coral-spring', name: 'Ocean Coral Spring', parish: 'Trelawny', zone: 'C' },
  { id: 'round-hill-hotel', name: 'Round Hill Hotel & Villas, Hanover', parish: 'Hanover', zone: 'C' },
  { id: 'tryall-club', name: 'The Tryall Club, Hanover', parish: 'Hanover', zone: 'C' },

  // Zone D — Negril & Runaway Bay
  { id: 'sandals-negril', name: 'Sandals Negril Beach Resort', parish: 'Westmoreland', zone: 'D' },
  { id: 'riu-negril', name: 'Riu Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'riu-palace-tropical-bay', name: 'Riu Palace Tropical Bay, Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'royalton-negril', name: 'Royalton Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'azul-beach-negril', name: 'Azul Beach Resort Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'rockhouse-negril', name: 'Rockhouse Hotel, Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'the-cliff-negril', name: 'The Cliff Hotel, Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'couples-swept-away', name: 'Couples Swept Away, Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'couples-negril', name: 'Couples Negril', parish: 'Westmoreland', zone: 'D' },
  { id: 'bahia-principe-runaway-bay', name: 'Bahia Principe Grand, Runaway Bay', parish: 'St. Ann', zone: 'D' },
  { id: 'jewel-paradise-cove', name: 'Jewel Paradise Cove, Runaway Bay', parish: 'St. Ann', zone: 'D' },

  // Zone E — Ocho Rios & South Coast
  { id: 'sandals-ochi', name: 'Sandals Ochi Beach Resort', parish: 'St. Ann', zone: 'E' },
  { id: 'sandals-dunns-river', name: "Sandals Dunn's River", parish: 'St. Ann', zone: 'E' },
  { id: 'moon-palace-ocho-rios', name: 'Moon Palace Jamaica, Ocho Rios', parish: 'St. Ann', zone: 'E' },
  { id: 'beaches-ocho-rios', name: 'Beaches Ocho Rios', parish: 'St. Ann', zone: 'E' },
  { id: 'couples-sans-souci', name: 'Couples Sans Souci, Ocho Rios', parish: 'St. Ann', zone: 'E' },
  { id: 'couples-tower-isle', name: 'Couples Tower Isle, Ocho Rios', parish: 'St. Mary', zone: 'E' },
  { id: 'jamaica-inn-ocho-rios', name: 'Jamaica Inn, Ocho Rios', parish: 'St. Ann', zone: 'E' },
  { id: 'goldeneye-oracabessa', name: 'GoldenEye, Oracabessa', parish: 'St. Mary', zone: 'E' },
  { id: 'ocho-rios-cruise-port', name: 'Ocho Rios Cruise Port', parish: 'St. Ann', zone: 'E' },
  { id: 'sandals-south-coast', name: 'Sandals South Coast (Whitehouse)', parish: 'Westmoreland', zone: 'E' },
  { id: 'jakes-treasure-beach', name: 'Jakes Hotel, Treasure Beach', parish: 'St. Elizabeth', zone: 'E' },
]

export function getDestination(id: string): TransferDestination | undefined {
  return DESTINATIONS.find((d) => d.id === id)
}

export function getZoneForDestination(id: string): ZoneInfo | undefined {
  const d = getDestination(id)
  return d ? ZONES[d.zone] : undefined
}

export function getTransferPrice(
  destinationId: string,
  tripType: TransferTripType,
): number | null {
  const zone = getZoneForDestination(destinationId)
  if (!zone) return null
  return tripType === 'round_trip' ? zone.roundTrip : zone.oneWay
}

export function groupDestinationsByZone(): Array<{ zone: ZoneInfo; items: TransferDestination[] }> {
  return (Object.keys(ZONES) as TransferZone[]).map((z) => ({
    zone: ZONES[z],
    items: DESTINATIONS.filter((d) => d.zone === z),
  }))
}

export interface TransferQuote {
  destinationId: string
  destinationName: string
  parish: string
  zone: TransferZone
  zoneLabel: string
  zoneDuration: string
  tripType: TransferTripType
  passengers: number // 1-4
  priceUsd: number
}

export function buildQuote(
  destinationId: string,
  tripType: TransferTripType,
  passengers: number,
): TransferQuote | null {
  const dest = getDestination(destinationId)
  const zone = dest ? ZONES[dest.zone] : null
  if (!dest || !zone) return null
  const price = tripType === 'round_trip' ? zone.roundTrip : zone.oneWay
  const clampedPax = Math.max(1, Math.min(4, Math.round(passengers)))
  return {
    destinationId: dest.id,
    destinationName: dest.name,
    parish: dest.parish,
    zone: dest.zone,
    zoneLabel: zone.label,
    zoneDuration: zone.duration,
    tripType,
    passengers: clampedPax,
    priceUsd: price,
  }
}
