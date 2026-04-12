import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Experience } from './experiences'

export interface CartItem extends Experience {
  travelers: number
  date: string
}

// Tour guide rate: ~JMD $555/hr ≈ $4 USD/hr (one guide per experience)
const GUIDE_RATE_USD_PER_HOUR = 4

// Average driving speed in Jamaica (km/h) — winding mountain & coastal roads
const AVG_DRIVING_SPEED_KMH = 40

function parseDurationHours(duration: string): number {
  if (/full\s*day/i.test(duration)) return 8
  if (/half\s*day/i.test(duration)) return 4
  const match = duration.match(/([\d.]+)\s*hr/i)
  return match ? parseFloat(match[1]) : 3
}

// ── Geolocation: Haversine + Jamaica road factor ──
const LOCATIONS: Record<string, { lat: number; lng: number }> = {
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
  // Hotels & resorts
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
  'Moon Palace Jamaica, Ocho Rios':       { lat: 18.4130, lng: -77.1000 },
  'Jamaica Inn, Ocho Rios':               { lat: 18.4150, lng: -77.0800 },
  'Strawberry Hill, Blue Mountains':      { lat: 18.1100, lng: -76.6500 },
  'GoldenEye, Oracabessa':               { lat: 18.3980, lng: -76.9500 },
  'Round Hill Hotel, Montego Bay':        { lat: 18.4600, lng: -78.0200 },
  'Rockhouse Hotel, Negril':              { lat: 18.2550, lng: -78.3580 },
  'Jakes Hotel, Treasure Beach':          { lat: 17.8860, lng: -77.7850 },
  'Spanish Court Hotel, Kingston':        { lat: 18.0120, lng: -76.7950 },
  // Airports & ports
  'Norman Manley International Airport (KIN)': { lat: 17.9356, lng: -76.7875 },
  'Sangster International Airport (MBJ)':      { lat: 18.5037, lng: -77.9133 },
  'Kingston Cruise Terminal':                   { lat: 17.9700, lng: -76.7950 },
  'Falmouth Cruise Port':                       { lat: 18.4950, lng: -77.6560 },
  'Ocho Rios Cruise Port':                      { lat: 18.4080, lng: -77.1080 },
}

function getCoords(location: string): { lat: number; lng: number } | null {
  if (LOCATIONS[location]) return LOCATIONS[location]
  const key = Object.keys(LOCATIONS).find(k =>
    location.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(location.toLowerCase())
  )
  return key ? LOCATIONS[key] : null
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  const straightLine = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return straightLine * 1.45 // Jamaica winding road factor
}

/**
 * Calculate total travel hours for a route: pickup → destinations → dropoff
 * Uses nearest-neighbor ordering for multiple destinations on the same day.
 */
function calculateTravelHours(
  pickup: string,
  destinations: string[],
  dropoff: string
): number {
  const pickupCoords = getCoords(pickup)
  if (!pickupCoords || destinations.length === 0) return 0

  const dropoffCoords = getCoords(dropoff || pickup) || pickupCoords

  // Build route using nearest-neighbor
  const route: { lat: number; lng: number }[] = [pickupCoords]
  const remaining = destinations
    .map((d) => ({ name: d, coords: getCoords(d) }))
    .filter((d) => d.coords !== null) as { name: string; coords: { lat: number; lng: number } }[]

  let current = pickupCoords
  while (remaining.length > 0) {
    let nearestIdx = 0
    let nearestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i].coords)
      if (d < nearestDist) {
        nearestDist = d
        nearestIdx = i
      }
    }
    current = remaining[nearestIdx].coords
    route.push(current)
    remaining.splice(nearestIdx, 1)
  }
  route.push(dropoffCoords)

  // Sum total distance
  let totalKm = 0
  for (let i = 0; i < route.length - 1; i++) {
    totalKm += haversineKm(route[i], route[i + 1])
  }

  return totalKm / AVG_DRIVING_SPEED_KMH
}

interface CartStore {
  items: CartItem[]
  pickup: string
  dropoff: string
  addItem: (exp: Experience) => void
  removeItem: (id: number) => void
  updateTravelers: (id: number, travelers: number) => void
  updateDate: (id: number, date: string) => void
  setPickup: (location: string) => void
  setDropoff: (location: string) => void
  clearCart: () => void
  isInCart: (id: number) => boolean
  subtotal: () => number
  travelHours: () => number
  guideCost: () => number
  fee: () => number
  grandTotal: () => number
}

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      pickup: '',
      dropoff: '',

      addItem: (exp: Experience) => {
        const { items } = get()
        if (items.some((i) => i.id === exp.id)) return
        set({ items: [...items, { ...exp, travelers: 2, date: defaultDate() }] })
      },

      removeItem: (id: number) => {
        set({ items: get().items.filter((i) => i.id !== id) })
      },

      updateTravelers: (id: number, travelers: number) => {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, travelers: Math.max(1, Math.min(12, travelers)) } : i
          ),
        })
      },

      updateDate: (id: number, date: string) => {
        set({
          items: get().items.map((i) => (i.id === id ? { ...i, date } : i)),
        })
      },

      setPickup: (location: string) => set({ pickup: location }),
      setDropoff: (location: string) => set({ dropoff: location }),

      clearCart: () => set({ items: [], pickup: '', dropoff: '' }),

      isInCart: (id: number) => get().items.some((i) => i.id === id),

      subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.travelers, 0),

      // Travel time from pickup → all destinations → dropoff
      travelHours: () => {
        const { items, pickup, dropoff } = get()
        if (!pickup || items.length === 0) return 0

        // Group by date for multi-day trips
        const byDate: Record<string, string[]> = {}
        for (const item of items) {
          const d = item.date || 'unset'
          if (!byDate[d]) byDate[d] = []
          if (!byDate[d].includes(item.destination)) {
            byDate[d].push(item.destination)
          }
        }

        // Sum travel hours across all days
        let total = 0
        for (const destinations of Object.values(byDate)) {
          total += calculateTravelHours(pickup, destinations, dropoff || pickup)
        }

        return Math.round(total * 10) / 10 // round to 1 decimal
      },

      // Guide cost = (tour duration + travel time) × $4/hr
      guideCost: () => {
        const tourHours = get().items.reduce((sum, i) => sum + parseDurationHours(i.duration), 0)
        const travel = get().travelHours()
        return Math.round((tourHours + travel) * GUIDE_RATE_USD_PER_HOUR)
      },

      // Service fee = guide cost + 20% platform fee on subtotal
      fee: () => {
        const guide = get().guideCost()
        const sub = get().subtotal()
        return guide + Math.round(sub * 0.20)
      },

      grandTotal: () => get().subtotal() + get().fee(),
    }),
    { name: 'mapl-cart' }
  )
)
