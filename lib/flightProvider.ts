import { normalizeFlight, type FlightStatus } from '@/lib/flight'

/**
 * Server-side AeroDataBox lookup, shared by the admin and driver flight routes.
 * Airline-agnostic: resolves any IATA flight number + date to the authoritative
 * scheduled/revised times and status. Reads AERODATABOX_API_KEY (server only,
 * never NEXT_PUBLIC) so it is never bundled into client code. Degrades to
 * { configured: false } with no key, so callers can fall back to deep links.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leg(node: any): FlightStatus['departure'] {
  if (!node) return null
  const fmt = (t: { local?: string } | undefined) => {
    // AeroDataBox local format: "2026-08-15 21:05-05:00" -> "Sat, Aug 15, 9:05 PM"
    if (!t?.local) return null
    const m = t.local.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})/)
    if (!m) return t.local
    const [, y, mo, d, hh, mm] = m
    const date = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm))
    return date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  }
  return {
    airport: node.airport?.iata ?? node.airport?.name ?? null,
    scheduledLocal: fmt(node.scheduledTime),
    revisedLocal: fmt(node.revisedTime),
  }
}

export async function lookupFlight(rawFlight: string | null, date: string | null, prefer: 'arrival' | 'departure' = 'arrival'): Promise<FlightStatus> {
  const { iata } = normalizeFlight(rawFlight)
  const key = process.env.AERODATABOX_API_KEY
  const base: FlightStatus = {
    configured: !!key,
    resolvable: !!iata,
    found: false,
    ident: iata,
    status: null,
    departure: null,
    arrival: null,
  }
  if (!key) return base
  if (!iata) return { ...base, error: 'flight_number_incomplete' }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ...base, error: 'bad_date' }

  const provider = () => fetch(
    `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(iata)}/${date}?withAircraftImage=false&withLocation=false`,
    // no-store: the RapidAPI key rides in X-RapidAPI-Key, not Authorization,
    // so Next's auto-no-cache heuristic can never protect this fetch. A cached
    // response here would freeze a live flight's status.
    { cache: 'no-store', headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } },
  )

  try {
    let res = await provider()
    // The BASIC plan caps at 1 request/second; wait out the window and retry once.
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1300))
      res = await provider()
    }
    if (res.status === 404) return { ...base, found: false }
    if (res.status === 429) return { ...base, error: 'rate_limited' }
    if (!res.ok) return { ...base, error: `provider_${res.status}` }
    const data = await res.json()
    const flights = Array.isArray(data) ? data : data?.flights ?? []
    // A date query can return two rotations (e.g. an overnight flight departing
    // the 24th arriving the 25th, plus one departing the 25th). Pick the one
    // whose RELEVANT leg is on the queried date: the departure leg for a
    // hotel-to-airport ride, the arrival leg for an airport pickup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legDate = (f: any, side: 'arrival' | 'departure') => String(f?.[side]?.scheduledTime?.local ?? '').slice(0, 10)
    const f =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flights.find((x: any) => legDate(x, prefer) === date) ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      flights.find((x: any) => legDate(x, 'departure') === date || legDate(x, 'arrival') === date) ??
      flights[0]
    if (!f) return { ...base, found: false }
    return {
      ...base,
      found: true,
      status: f.status ?? null,
      departure: leg(f.departure),
      arrival: leg(f.arrival),
    }
  } catch {
    return { ...base, error: 'provider_unreachable' }
  }
}
