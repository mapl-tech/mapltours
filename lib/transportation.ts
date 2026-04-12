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
// Daily vehicle rental: $65 USD (economy) — typical Jamaica rate
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

// ── Location coordinates (approximate lat/lng for distance calc) ──
const LOCATIONS: Record<string, { lat: number; lng: number }> = {
  // Tour destinations
  'Negril':         { lat: 18.2683, lng: -78.3494 },
  'Blue Mountains': { lat: 18.1750, lng: -76.6000 },
  'Kingston':       { lat: 18.0179, lng: -76.8099 },
  'Boston Bay':     { lat: 18.1858, lng: -76.2850 },
  'Ocho Rios':      { lat: 18.4075, lng: -77.1050 },
  'Nine Mile':      { lat: 18.3500, lng: -77.2333 },
  'Treasure Beach': { lat: 17.8833, lng: -77.7833 },
  'Port Antonio':   { lat: 18.1785, lng: -76.4497 },
  'Falmouth':       { lat: 18.4939, lng: -77.6556 },
  'Montego Bay':    { lat: 18.4762, lng: -77.9186 },
  'Manchioneal':    { lat: 18.1300, lng: -76.2700 },
  'Port Royal':     { lat: 17.9361, lng: -76.8417 },

  // Hotels & resorts — mapped to nearest major location
  'Sandals Negril Beach Resort':        { lat: 18.2850, lng: -78.3550 },
  'Sandals Royal Caribbean, Montego Bay': { lat: 18.4900, lng: -77.9250 },
  'Sandals Ochi Beach Resort, Ocho Rios': { lat: 18.4100, lng: -77.1100 },
  'Riu Negril':                           { lat: 18.2800, lng: -78.3500 },
  'Riu Montego Bay':                      { lat: 18.4850, lng: -77.9100 },
  'Hyatt Ziva Rose Hall, Montego Bay':    { lat: 18.5100, lng: -77.8500 },
  'Hilton Rose Hall Resort, Montego Bay': { lat: 18.5090, lng: -77.8480 },
  'Grand Palladium Jamaica, Lucea':       { lat: 18.4600, lng: -78.1700 },
  'Royalton Blue Waters, Montego Bay':    { lat: 18.4700, lng: -77.9300 },
  'Royalton Negril':                      { lat: 18.2780, lng: -78.3480 },
  'Secrets Wild Orchid, Montego Bay':     { lat: 18.4490, lng: -77.9360 },
  'Secrets St. James, Montego Bay':       { lat: 18.4480, lng: -77.9370 },
  'Breathless Montego Bay':               { lat: 18.4495, lng: -77.9355 },
  'Moon Palace Jamaica, Ocho Rios':       { lat: 18.4130, lng: -77.1000 },
  'Jamaica Inn, Ocho Rios':               { lat: 18.4150, lng: -77.0800 },
  'Strawberry Hill, Blue Mountains':      { lat: 18.1100, lng: -76.6500 },
  'GoldenEye, Oracabessa':               { lat: 18.3980, lng: -76.9500 },
  'Round Hill Hotel, Montego Bay':        { lat: 18.4600, lng: -78.0200 },
  'Rockhouse Hotel, Negril':              { lat: 18.2550, lng: -78.3580 },
  'The Cliff Hotel, Negril':              { lat: 18.2500, lng: -78.3600 },
  'Geejam Hotel, Port Antonio':           { lat: 18.1900, lng: -76.4300 },
  'Trident Hotel, Port Antonio':          { lat: 18.2000, lng: -76.4200 },
  'Jakes Hotel, Treasure Beach':          { lat: 17.8860, lng: -77.7850 },
  'Spanish Court Hotel, Kingston':        { lat: 18.0120, lng: -76.7950 },
  'Terra Nova All Suite Hotel, Kingston': { lat: 18.0130, lng: -76.7980 },
  'Courtleigh Hotel, Kingston':           { lat: 18.0100, lng: -76.7900 },

  // Airports & ports
  'Norman Manley International Airport (KIN)': { lat: 17.9356, lng: -76.7875 },
  'Sangster International Airport (MBJ)':      { lat: 18.5037, lng: -77.9133 },
  'Kingston Cruise Terminal':                   { lat: 17.9700, lng: -76.7950 },
  'Falmouth Cruise Port':                       { lat: 18.4950, lng: -77.6560 },
  'Ocho Rios Cruise Port':                      { lat: 18.4080, lng: -77.1080 },
}

/**
 * Calculate road distance between two points using Haversine + Jamaica road factor.
 * Jamaica roads are winding (especially mountains), so we apply a 1.45x correction.
 */
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  const straightLine = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  // Jamaica road correction factor (winding mountain & coastal roads)
  return straightLine * 1.45
}

function getCoords(location: string): { lat: number; lng: number } | null {
  // Exact match
  if (LOCATIONS[location]) return LOCATIONS[location]
  // Fuzzy: check if any key is contained in the location string
  const key = Object.keys(LOCATIONS).find(k =>
    location.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(location.toLowerCase())
  )
  return key ? LOCATIONS[key] : null
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
