/**
 * Airport transfers, flat-rate zone pricing from Sangster International
 * Airport (MBJ, Montego Bay) to Jamaican hotels and resorts. Prices are per
 * vehicle, covering 1–4 passengers, in USD.
 *
 * Rates match the published private-transfer sheet for the Jamaica market.
 * Kingston (KIN) transfers and Port Antonio destinations are handled via
 * custom quote at MVP, the contact form routes those.
 */

export type TransferAirport = 'MBJ'
export type TransferZone = 'A' | 'B' | 'C' | 'D' | 'E'
export type TransferTripType = 'one_way' | 'round_trip'

export interface ZoneInfo {
  code: TransferZone
  label: string
  /** Travel time window from MBJ */
  duration: string
}

// Private airport transfer prices, USD, 1–4 passengers (per vehicle).
//   Zone A, Iberostar Rose Hall, Secrets, Jewel Grande, Hyatt, Hilton, Sandals MB, RIU MB
//   Zone B, Royalton Blue Water (Falmouth), Excellence Oyster Bay
//   Zone C, Grand Palladium (Lucea), Ocean Coral Spring, Round Hill, Tryall
//   Zone D, Negril hotels, Bahia Principe, Jewel Paradise Cove
//   Zone E, Ocho Rios hotels, Sandals South Coast, Treasure Beach, GoldenEye
export const ZONES: Record<TransferZone, ZoneInfo> = {
  A: {
    code: 'A',
    label: 'Montego Bay & Rose Hall',
    duration: 'Under 20 min from MBJ',
  },
  B: {
    code: 'B',
    label: 'Falmouth',
    duration: '35–45 min from MBJ',
  },
  C: {
    code: 'C',
    label: 'Trelawny, Hanover & Lucea',
    duration: '40–60 min from MBJ',
  },
  D: {
    code: 'D',
    label: 'Negril & Runaway Bay',
    duration: '75–90 min from MBJ',
  },
  E: {
    code: 'E',
    label: 'Ocho Rios & South Coast',
    duration: '90–120 min from MBJ',
  },
}

export interface TransferDestination {
  id: string
  name: string
  parish: string
  zone: TransferZone
  /**
   * What the Jamaica driver charges MAPL for ONE direction, flat for 1 to 4
   * passengers (the only party sizes this site sells). Source of truth for
   * the driver payout; the customer price is derived from it.
   */
  baseRate: number
  /**
   * True when the rate is a conservative estimate rather than a figure the
   * driver quoted. Estimates are set at or above the nearest quoted resort so
   * a booking can never sell below cost, and are listed for confirmation in
   * the admin transfer-rates view.
   */
  estimated?: boolean
}

/**
 * Hotel and landmark destinations served by flat-rate MBJ transfers.
 * The list is deliberately conservative, anything requiring a custom
 * quote (Port Antonio, Kingston parish, Mandeville) is absent here and
 * must route through /contact.
 */
export const DESTINATIONS: TransferDestination[] = [
  // Zone A, Montego Bay & Rose Hall
  { id: 'iberostar-rose-hall', name: 'Iberostar Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'secrets-st-james', name: 'Secrets St. James, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'secrets-wild-orchid', name: 'Secrets Wild Orchid, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'jewel-grande-montego-bay', name: 'Jewel Grande Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },
  { id: 'hyatt-ziva-rose-hall', name: 'Hyatt Ziva Rose Hall', parish: 'St. James', zone: 'A', baseRate: 30 },
  { id: 'hyatt-zilara-rose-hall', name: 'Hyatt Zilara Rose Hall', parish: 'St. James', zone: 'A', baseRate: 30 },
  { id: 'hilton-rose-hall', name: 'Hilton Rose Hall Resort', parish: 'St. James', zone: 'A', baseRate: 30 },
  { id: 'sandals-montego-bay', name: 'Sandals Montego Bay', parish: 'St. James', zone: 'A', baseRate: 25 },
  { id: 'sandals-royal-caribbean', name: 'Sandals Royal Caribbean, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 25, estimated: true },
  { id: 'riu-montego-bay', name: 'Riu Montego Bay', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'riu-palace-jamaica', name: 'Riu Palace Jamaica', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'riu-reggae', name: 'Riu Reggae', parish: 'St. James', zone: 'A', baseRate: 20 },
  { id: 'deja-resort', name: 'Deja Resort, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 15 },
  { id: 's-hotel-montego-bay', name: 'S Hotel, Montego Bay', parish: 'St. James', zone: 'A', baseRate: 15 },
  { id: 'breathless-montego-bay', name: 'Breathless Montego Bay', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'iberostar-grand-rose-hall', name: 'Iberostar Grand Rose Hall', parish: 'St. James', zone: 'A', baseRate: 40 },
  { id: 'half-moon-resort', name: 'Half Moon, A RockResort', parish: 'St. James', zone: 'A', baseRate: 40, estimated: true },

  // Zone B, Falmouth
  { id: 'royalton-blue-water-trelawny', name: 'Royalton Blue Water (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'excellence-oyster-bay', name: 'Excellence Oyster Bay', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'royalton-white-sands', name: 'Royalton White Sands (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'riu-aquarelle', name: 'Riu Aquarelle (Falmouth)', parish: 'Trelawny', zone: 'B', baseRate: 60 },
  { id: 'falmouth-cruise-port', name: 'Falmouth Cruise Port', parish: 'Trelawny', zone: 'B', baseRate: 60, estimated: true },

  // Zone C, Trelawny / Hanover / Lucea
  { id: 'grand-palladium-lucea', name: 'Grand Palladium Jamaica, Lucea', parish: 'Hanover', zone: 'C', baseRate: 75, estimated: true },
  { id: 'ocean-coral-spring', name: 'Ocean Coral Spring', parish: 'Trelawny', zone: 'C', baseRate: 70, estimated: true },
  { id: 'round-hill-hotel', name: 'Round Hill Hotel & Villas, Hanover', parish: 'Hanover', zone: 'C', baseRate: 50, estimated: true },
  { id: 'tryall-club', name: 'The Tryall Club, Hanover', parish: 'Hanover', zone: 'C', baseRate: 60, estimated: true },

  // Zone D, Negril & Runaway Bay
  { id: 'sandals-negril', name: 'Sandals Negril Beach Resort', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'riu-negril', name: 'Riu Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'riu-palace-tropical-bay', name: 'Riu Palace Tropical Bay, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'royalton-negril', name: 'Royalton Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'azul-beach-negril', name: 'Azul Beach Resort Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'rockhouse-negril', name: 'Rockhouse Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'the-cliff-negril', name: 'The Cliff Hotel, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90, estimated: true },
  { id: 'couples-swept-away', name: 'Couples Swept Away, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'couples-negril', name: 'Couples Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'hedonism-ii', name: 'Hedonism II, Negril', parish: 'Westmoreland', zone: 'D', baseRate: 90 },
  { id: 'bahia-principe-runaway-bay', name: 'Bahia Principe Grand, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80 },
  { id: 'bahia-principe-escape', name: 'Bahia Principe Escape, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80 },
  { id: 'jewel-paradise-cove', name: 'Jewel Paradise Cove, Runaway Bay', parish: 'St. Ann', zone: 'D', baseRate: 80, estimated: true },

  // Zone E, Ocho Rios & South Coast
  { id: 'sandals-ochi', name: 'Sandals Ochi Beach Resort', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'sandals-dunns-river', name: "Sandals Dunn's River", parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'moon-palace-ocho-rios', name: 'Moon Palace Jamaica, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'riu-ocho-rios', name: 'Riu Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'jewel-dunns-river', name: "Jewel Dunn's River Beach Resort & Spa, Ocho Rios", parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'sandals-royal-plantation', name: 'Sandals Royal Plantation, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90 },
  { id: 'couples-sans-souci', name: 'Couples Sans Souci, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 100, estimated: true },
  { id: 'couples-tower-isle', name: 'Couples Tower Isle, Ocho Rios', parish: 'St. Mary', zone: 'E', baseRate: 110 },
  { id: 'jamaica-inn-ocho-rios', name: 'Jamaica Inn, Ocho Rios', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'goldeneye-oracabessa', name: 'GoldenEye, Oracabessa', parish: 'St. Mary', zone: 'E', baseRate: 120, estimated: true },
  { id: 'ocho-rios-cruise-port', name: 'Ocho Rios Cruise Port', parish: 'St. Ann', zone: 'E', baseRate: 90, estimated: true },
  { id: 'sandals-south-coast', name: 'Sandals South Coast (Whitehouse)', parish: 'Westmoreland', zone: 'E', baseRate: 110, estimated: true },
  { id: 'jakes-treasure-beach', name: 'Jakes Hotel, Treasure Beach', parish: 'St. Elizabeth', zone: 'E', baseRate: 130, estimated: true },
]

export function getDestination(id: string): TransferDestination | undefined {
  return DESTINATIONS.find((d) => d.id === id)
}

export function getZoneForDestination(id: string): ZoneInfo | undefined {
  const d = getDestination(id)
  return d ? ZONES[d.zone] : undefined
}

/** MAPL's margin on top of the driver's cost. */
export const TRANSFER_MARGIN = 0.10
/**
 * Cover for paying the driver via Remitly from Canada, measured live
 * 2026-08-15: CAD 3.99 flat per send (and a round trip is TWO sends, one per
 * half) plus a ~2.1% FX spread on CAD to JMD. At MAPL's ticket sizes the
 * blended cost runs 3 to 6.7% of the payout; 5% covers every send of $140+
 * and the average across the range. Remeasure if the payout rail changes.
 */
export const REMITLY_COVER = 0.05
/**
 * Card processing, built INTO the displayed price so the customer sees a
 * single all-in number and the margin survives intact. Stripe on this account:
 * 2.9% + 0.8% (international card) + 2% (USD settled to CAD) + C$0.30 fixed.
 * Verified to the cent against live charges. If the account ever settles in
 * USD, drop CARD_RATE to 0.037 and prices fall accordingly.
 */
export const CARD_RATE = 0.057
export const CARD_FIXED = 0.22

/**
 * What the driver is paid for the whole trip: one direction, or both for a
 * round trip. This is the booking's subtotal and the driver's payout.
 */
/** Collin's round-trip discount, confirmed by him on WhatsApp 2026-08-15
 *  ("10% off"): a round trip costs 1.8x his one-way rate, not 2x. Applied at
 *  the COST layer so the customer price, MAPL's 10% margin structure, the
 *  stored subtotal, and the supplier payout all move together: the discount
 *  is his, so his payout carries it too. */
export const ROUND_TRIP_DISCOUNT = 0.10

export function driverCost(
  destinationId: string,
  tripType: TransferTripType,
): number | null {
  const dest = getDestination(destinationId)
  if (!dest) return null
  if (tripType === 'round_trip') {
    return Math.round(dest.baseRate * 2 * (1 - ROUND_TRIP_DISCOUNT) * 100) / 100
  }
  return dest.baseRate
}

/**
 * The all-in price the customer pays: driver cost plus MAPL's margin, grossed
 * up so card processing does not eat that margin. Rounded UP to the dollar so
 * a booking can never come in under cost.
 */
export function getTransferPrice(
  destinationId: string,
  tripType: TransferTripType,
): number | null {
  const cost = driverCost(destinationId, tripType)
  if (cost === null) return null
  return Math.ceil((cost * (1 + TRANSFER_MARGIN + REMITLY_COVER) + CARD_FIXED) / (1 - CARD_RATE))
}

/** Cheapest and dearest all-in price in a zone. Prices are set per resort, so
 *  a single "from" figure hides real spread (Negril costs more than Runaway
 *  Bay in the same zone); the UI shows the full range instead. */
export function zonePriceRange(
  zone: TransferZone,
  tripType: TransferTripType,
): { min: number; max: number } {
  const prices = DESTINATIONS.filter((d) => d.zone === zone)
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : { min: 0, max: 0 }
}

/** Cheapest all-in price in a zone, for "from $X" display. */
export function zoneFromPrice(
  zone: TransferZone,
  tripType: TransferTripType,
): number {
  const prices = DESTINATIONS.filter((d) => d.zone === zone)
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length ? Math.min(...prices) : 0
}

/**
 * Cheapest all-in price to a named AREA, for "from $X" display.
 *
 * Zones are the pricing unit, but the hero quotes places travelers actually
 * search for, and the two don't line up: Rose Hall and Montego Bay share
 * zone A, so zoneFromPrice('A') returns a Montego Bay rate that would be
 * wrong under a "to Rose Hall" label. Matching on the destination name keeps
 * the figure honest, and derives it from the rate table rather than pinning
 * the display to one hotel id that may not stay the cheapest.
 */
export function areaFromPrice(area: string, tripType: TransferTripType): number {
  const needle = area.toLowerCase()
  const prices = DESTINATIONS.filter((d) => d.name.toLowerCase().includes(needle))
    .map((d) => getTransferPrice(d.id, tripType))
    .filter((p): p is number => p !== null)
  return prices.length ? Math.min(...prices) : 0
}

/** Destinations whose rate is still an estimate, for operator confirmation. */
export function estimatedRateDestinations(): TransferDestination[] {
  return DESTINATIONS.filter((d) => d.estimated)
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
  // All-in price for this specific resort. MUST come from getTransferPrice so
  // the quote the customer sees matches what the server recomputes and charges.
  const price = getTransferPrice(destinationId, tripType)
  if (price === null) return null
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
