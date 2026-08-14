/**
 * Flight helpers - airline-agnostic. Works for any carrier by IATA flight
 * number (VS165, AA1349, BA2261, ...). Pure functions only; the authoritative
 * status lookup lives in the admin-gated /api/admin/flight route.
 */

export interface NormalizedFlight {
  /** Canonical IATA ident, e.g. "VS165" (airline code + number, no leading zeros), or null if unresolvable. */
  iata: string | null
  /** What to show the operator (falls back to the raw value). */
  display: string
}

/** Normalize a stored flight string to a canonical IATA ident for any airline. */
export function normalizeFlight(raw: string | null | undefined): NormalizedFlight {
  const s = (raw ?? '').toUpperCase().replace(/[\s-]+/g, '')
  if (!s) return { iata: null, display: '' }
  // Airline designator: 2 letters, or a letter+digit / digit+letter (e.g. B6, 9W),
  // followed by 1-4 digits. Covers essentially every commercial carrier.
  const m = s.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})$/)
  if (!m) return { iata: null, display: s } // e.g. a bare "521" with no airline code
  const num = String(parseInt(m[2], 10)) // strip leading zeros: VS0165 -> VS165
  return { iata: `${m[1]}${num}`, display: `${m[1]}${num}` }
}

/** ISO date -> YYYY-MM-DD (in the stored wall-clock, i.e. Jamaica date). */
export function flightDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  } catch { return null }
}

/**
 * Universal one-click status links. These work for ANY airline with no API key
 * and no setup: Google shows a flight-status card, FlightAware and
 * Flightradar24 open the live tracker.
 */
export function flightLinks(rawFlight: string | null | undefined, dateIso: string | null | undefined): {
  ident: string | null
  google: string
  flightaware: string
  flightradar24: string
} | null {
  const { iata, display } = normalizeFlight(rawFlight)
  const ident = iata ?? display
  if (!ident) return null
  const date = flightDate(dateIso)
  return {
    ident,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${ident} flight status${date ? ` ${date}` : ''}`)}`,
    flightaware: `https://www.flightaware.com/live/flight/${encodeURIComponent(ident)}`,
    flightradar24: `https://www.flightradar24.com/data/flights/${ident.toLowerCase()}`,
  }
}

/** Shape returned by /api/admin/flight (normalized across whatever provider is wired). */
export interface FlightStatus {
  configured: boolean // is an authoritative provider key set?
  resolvable: boolean // could we form a valid IATA ident to look up?
  found: boolean
  ident: string | null
  status: string | null // scheduled / enroute / landed / delayed / cancelled / ...
  departure?: { airport: string | null; scheduledLocal: string | null; revisedLocal: string | null } | null
  arrival?: { airport: string | null; scheduledLocal: string | null; revisedLocal: string | null } | null
  error?: string | null
}
