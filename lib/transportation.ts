/**
 * Jamaica Transportation Cost Calculator
 *
 * Calculates vehicle rental + fuel costs based on:
 * - Pickup location → tour destinations → drop-off location
 * - Real Jamaica distances (km) between major points
 * - Current Jamaica fuel prices (JMD converted to USD)
 * - Daily vehicle rental rates
 */

// ── Jamaica fuel & vehicle rates ──
export let GAS_PRICE_USD_PER_LITER = 1.45 // fallback, updated at runtime
export let GAS_PRICE_JMD_PER_LITER = 228  // fallback, updated at runtime
// Average rental vehicle: ~10 km/liter (compact SUV / sedan)
export const KM_PER_LITER = 10
// Daily vehicle rental: $65 USD (economy), typical Jamaica rate
export const VEHICLE_RENTAL_PER_DAY = 65

/**
 * Fetch live Jamaica gas price from our API route.
 * The API scrapes GlobalPetrolPrices.com for the current Jamaica price
 * and converts using live exchange rates. Cached server-side for 6 hours.
 */
let gasPriceFetched = false
export async function fetchGasPrice(): Promise<{ usd: number; jmd: number }> {
  if (gasPriceFetched) return { usd: GAS_PRICE_USD_PER_LITER, jmd: GAS_PRICE_JMD_PER_LITER }
  try {
    const res = await fetch('/api/gas-price', { signal: AbortSignal.timeout(6000) })
    if (res.ok) {
      const data = await res.json()
      if (data.usdPerLiter && data.jmdPerLiter) {
        GAS_PRICE_USD_PER_LITER = data.usdPerLiter
        GAS_PRICE_JMD_PER_LITER = data.jmdPerLiter
      }
    }
  } catch {
    // Use fallback
  }
  gasPriceFetched = true
  return { usd: GAS_PRICE_USD_PER_LITER, jmd: GAS_PRICE_JMD_PER_LITER }
}

// ── Location coordinates ──
// Towns, hotels and ports by name. lib/day-route resolves a place name here
// (getCoords, exact then by substring) and reads the drive between two points
// from lib/drive-times.json, which is built from these coordinates
// (scripts/build-drive-times.mts): moving one means building the table again.
// Since Nov 23 2026 every hotel and port, and every town that was off its
// road, sits on the OpenStreetMap feature of that name (the way or node id is
// given where a point moved); the build refuses a point more than 600 m from
// any road.
export const LOCATIONS: Record<string, { lat: number; lng: number }> = {
  // Tour destinations
  'Negril':         { lat: 18.2683, lng: -78.3494 },
  'Blue Mountains': { lat: 18.1750, lng: -76.6000 },
  'Kingston':       { lat: 18.0179, lng: -76.8099 },
  // Boston village, home of the jerk centres (node 7050484756); the old point
  // was 7 km out to sea.
  'Boston Bay':     { lat: 18.1546, lng: -76.3547 },
  'Ocho Rios':      { lat: 18.4075, lng: -77.1050 },
  // The village and the Bob Marley Mausoleum (node 3201267866). The point
  // here until Nov 2026 sat about 7 km north-east of it, off any road.
  'Nine Mile':      { lat: 18.2977, lng: -77.2783 },
  'Treasure Beach': { lat: 17.8804, lng: -77.7565 }, // node 7057107933
  'Port Antonio':   { lat: 18.1785, lng: -76.4497 },
  'Falmouth':       { lat: 18.4939, lng: -77.6556 },
  'Montego Bay':    { lat: 18.4762, lng: -77.9186 },
  // Collin's sheet places his ATV and zipline in Hanover without naming the
  // park (Sandy Bay and Green Island both have one): Lucea, the parish town,
  // sits between them.
  'Hanover':        { lat: 18.4510, lng: -78.1736 },
  'Manchioneal':    { lat: 18.0368, lng: -76.2800 }, // node 7050027753; was 10 km off
  'Port Royal':     { lat: 17.9361, lng: -76.8417 },

  // North-coast towns that carry no tour of their own but do carry food
  // stops. lib/day-route.ts measures a stop against the day's tours, and an
  // unresolvable town there means "no opinion" — it would wave every stop
  // through. Named towns only; the parenthetical variants in lib/eats.ts
  // ('Falmouth (Rock)', 'Negril (West End)') resolve through getCoords's
  // substring pass.
  'Discovery Bay':  { lat: 18.4667, lng: -77.4000 },
  'Runaway Bay':    { lat: 18.4600, lng: -77.3300 },
  "St. Ann's Bay":  { lat: 18.4353, lng: -77.2011 },
  // On the coast road (way 371371872); the old point was a kilometre inland.
  'Greenwood':      { lat: 18.5083, lng: -77.7479 },

  // Hotels & resorts, each at its own OpenStreetMap feature
  'Sandals Negril Beach Resort':          { lat: 18.3359, lng: -78.3392 }, // way 310149342
  'Sandals Royal Caribbean, Montego Bay': { lat: 18.5196, lng: -77.8801 }, // node 2078508129
  'Sandals Ochi Beach Resort, Ocho Rios': { lat: 18.4118, lng: -77.0861 }, // way 369546812
  'Riu Negril':                           { lat: 18.3548, lng: -78.3359 }, // way 373924879
  'Riu Montego Bay':                      { lat: 18.5175, lng: -77.8814 }, // way 1425767080
  'Hyatt Ziva Rose Hall, Montego Bay':    { lat: 18.5229, lng: -77.8333 }, // node 5181706622
  'Hilton Rose Hall Resort, Montego Bay': { lat: 18.5217, lng: -77.8108 }, // way 373434062
  'Grand Palladium Jamaica, Lucea':       { lat: 18.4578, lng: -78.1521 }, // way 1082303425
  // Sells as Montego Bay, stands at Coopers Pen, Falmouth (Trelawny), beside
  // Royalton White Sands. Not in OpenStreetMap: the Coopers Pen hamlet
  // (node 7044483416). The old point was west of Falmouth, 8 km off.
  'Royalton Blue Waters, Montego Bay':    { lat: 18.4830, lng: -77.6116 },
  'Royalton Negril':                      { lat: 18.3415, lng: -78.3417 }, // way 626958816
  // The Secrets pair and Breathless share the Montego Freeport peninsula.
  'Secrets Wild Orchid, Montego Bay':     { lat: 18.4596, lng: -77.9499 }, // way 154325437
  'Secrets St. James, Montego Bay':       { lat: 18.4603, lng: -77.9488 }, // way 154325315
  'Breathless Montego Bay':               { lat: 18.4599, lng: -77.9467 }, // way 1008817993
  'Moon Palace Jamaica, Ocho Rios':       { lat: 18.4122, lng: -77.1050 }, // way 180639471
  'Jamaica Inn, Ocho Rios':               { lat: 18.4133, lng: -77.0785 }, // way 369026776
  'Strawberry Hill, Blue Mountains':      { lat: 18.0523, lng: -76.7274 }, // node 3627924045, Irish Town
  'GoldenEye, Oracabessa':                { lat: 18.4107, lng: -76.9445 }, // node 7058924571
  // Not in OpenStreetMap: Round Hill Bluff, the peninsula it stands on (node 6983613817).
  'Round Hill Hotel, Montego Bay':        { lat: 18.4614, lng: -78.0075 },
  'Rockhouse Hotel, Negril':              { lat: 18.2655, lng: -78.3670 }, // way 374119306
  'The Cliff Hotel, Negril':              { lat: 18.2500, lng: -78.3600 },
  'Geejam Hotel, Port Antonio':           { lat: 18.1742, lng: -76.4072 }, // way 829768898
  'Trident Hotel, Port Antonio':          { lat: 18.1840, lng: -76.4236 }, // way 369560770
  'Jakes Hotel, Treasure Beach':          { lat: 17.8796, lng: -77.7632 }, // way 837822143
  'Spanish Court Hotel, Kingston':        { lat: 18.0120, lng: -76.7950 },
  'Terra Nova All Suite Hotel, Kingston': { lat: 18.0191, lng: -76.7926 }, // way 75603526
  'Courtleigh Hotel, Kingston':           { lat: 18.0041, lng: -76.7874 }, // way 62029435

  // Airports & ports
  'Norman Manley International Airport (KIN)': { lat: 17.9364, lng: -76.7798 }, // way 22888427
  'Sangster International Airport (MBJ)':      { lat: 18.4987, lng: -77.9159 }, // way 161961565, the terminal
  'Kingston Cruise Terminal':                   { lat: 17.9700, lng: -76.7950 },
  'Falmouth Cruise Port':                       { lat: 18.4947, lng: -77.6478 }, // node 10274572709
  'Ocho Rios Cruise Port':                      { lat: 18.4090, lng: -77.1106 }, // way 374180178
}

/** Jamaica road correction factor (winding mountain & coastal roads). */
export const JAMAICA_ROAD_FACTOR = 1.45

/** Great-circle km, no road correction. */
export function straightLineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/**
 * Calculate road distance between two points using Haversine + Jamaica road factor.
 * Jamaica roads are winding (especially mountains), so we apply a 1.45x correction.
 */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return straightLineKm(a, b) * JAMAICA_ROAD_FACTOR
}

/**
 * The LOCATIONS name a place resolves to: itself when it is one, otherwise
 * the first name it contains or is contained in ('Falmouth (Rock)' is
 * Falmouth). Null when nothing matches.
 */
export function locationKey(location: string): string | null {
  // Exact match
  if (LOCATIONS[location]) return location
  // Fuzzy: check if any key is contained in the location string
  const key = Object.keys(LOCATIONS).find(k =>
    location.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(location.toLowerCase())
  )
  return key ?? null
}

export function getCoords(location: string): { lat: number; lng: number } | null {
  const key = locationKey(location)
  return key ? LOCATIONS[key] : null
}

/**
 * Road-corrected kilometres between two named places, or null when either
 * name is not in the table. Same numbers the fuel estimate runs on.
 */
export function roadDistanceKm(from: string, to: string): number | null {
  const a = getCoords(from)
  const b = getCoords(to)
  if (!a || !b) return null
  return haversineKm(a, b)
}

/**
 * Great-circle km between two named places, before any road correction.
 * Drive TIMES do not come from here: lib/drive-times reads them from the
 * routed table (OpenStreetMap roads), and falls back to the straight line
 * only for a point the table was not built with.
 */
export function directDistanceKm(from: string, to: string): number | null {
  const a = getCoords(from)
  const b = getCoords(to)
  if (!a || !b) return null
  return straightLineKm(a, b)
}

export interface DayBreakdown {
  date: string
  destinations: string[]
  distanceKm: number
  litersNeeded: number
  fuelCost: number
  route: string[]
}

export interface TransportationCost {
  totalDistanceKm: number
  fuelCostUsd: number
  rentalCostUsd: number
  totalTransportUsd: number
  litersNeeded: number
  rentalDays: number
  dayBreakdowns: DayBreakdown[]
  route: string[]
  isMultiDay: boolean
}

export interface TourStop {
  destination: string
  date: string
}

/**
 * Calculate total transportation cost for a trip.
 * Groups tours by date, calculates per-day driving routes.
 * Each day: pickup → day's destinations (nearest-neighbor) → drop-off
 */
export function calculateTransportation(
  pickupLocation: string,
  tourStops: TourStop[],
  dropoffLocation: string
): TransportationCost | null {
  const pickup = getCoords(pickupLocation)
  if (!pickup) return null
  const resolvedDropoff = dropoffLocation || pickupLocation

  // Group tours by date
  const byDate: Record<string, string[]> = {}
  for (const stop of tourStops) {
    const d = stop.date || 'unset'
    if (!byDate[d]) byDate[d] = []
    if (!byDate[d].includes(stop.destination)) {
      byDate[d].push(stop.destination)
    }
  }

  const dates = Object.keys(byDate).sort()
  const rentalDays = Math.max(1, dates.length)
  const isMultiDay = dates.length > 1

  let totalKm = 0
  const fullRoute: string[] = []
  const dayBreakdowns: DayBreakdown[] = []

  for (const date of dates) {
    const destinations = byDate[date]

    // Build day route: pickup → destinations (nearest-neighbor) → dropoff
    const dayRoute = [pickupLocation]
    const remaining = [...destinations]
    let current = pickup

    while (remaining.length > 0) {
      let nearest = 0
      let nearestDist = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const coords = getCoords(remaining[i])
        if (!coords) continue
        const d = haversineKm(current, coords)
        if (d < nearestDist) {
          nearestDist = d
          nearest = i
          current = coords
        }
      }
      dayRoute.push(remaining[nearest])
      remaining.splice(nearest, 1)
    }
    dayRoute.push(resolvedDropoff)

    // Sum distance for this day
    let dayKm = 0
    for (let i = 0; i < dayRoute.length - 1; i++) {
      const a = getCoords(dayRoute[i])
      const b = getCoords(dayRoute[i + 1])
      if (a && b) {
        dayKm += haversineKm(a, b)
      }
    }
    dayKm = Math.round(dayKm)
    const dayLiters = Math.round(dayKm / KM_PER_LITER * 10) / 10
    const dayFuel = Math.round(dayLiters * GAS_PRICE_USD_PER_LITER)

    dayBreakdowns.push({
      date,
      destinations,
      distanceKm: dayKm,
      litersNeeded: dayLiters,
      fuelCost: dayFuel,
      route: dayRoute,
    })

    totalKm += dayKm
    fullRoute.push(...dayRoute)
  }

  totalKm = Math.round(totalKm)
  const litersNeeded = Math.round(totalKm / KM_PER_LITER * 10) / 10
  const fuelCostUsd = Math.round(litersNeeded * GAS_PRICE_USD_PER_LITER)
  const rentalCostUsd = rentalDays * VEHICLE_RENTAL_PER_DAY
  const totalTransportUsd = fuelCostUsd + rentalCostUsd

  return {
    totalDistanceKm: totalKm,
    fuelCostUsd,
    rentalCostUsd,
    totalTransportUsd,
    litersNeeded,
    rentalDays,
    dayBreakdowns,
    route: fullRoute,
    isMultiDay,
  }
}
