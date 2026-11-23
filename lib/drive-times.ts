/**
 * Drive times between the places the day planner knows, read from
 * lib/drive-times.json: routed over OpenStreetMap's roads by OSRM
 * (scripts/build-drive-times.mts), in whole minutes, the same either way.
 * Nothing here calls a map service; the table ships with the site.
 *
 * A place is a point: a tour's own site where it is known by name
 * (lib/drive-points TOUR_SITES), a food stop's own door (STOP_VENUES), or
 * otherwise the town or hotel its name resolves to (lib/transportation
 * LOCATIONS). Points are the table's keys.
 *
 * Map data © OpenStreetMap contributors (ODbL), which is why the day list
 * credits OpenStreetMap wherever it prints one of these times. Where the
 * table came from, and the points it was routed between, are in
 * lib/drive-times.meta.json, which the site never loads.
 */

import table from './drive-times.json'
import { LOCATIONS, locationKey, straightLineKm } from './transportation'
import { TOUR_SITES, STOP_VENUES, placeKey, siteKey, venueKey } from './drive-points'

const INDEX = new Map<string, number>(table.keys.map((k, i) => [k, i]))
const N = table.keys.length

/** The point a town, hotel or port name resolves to, or null. */
export function placePoint(name: string | null | undefined): string | null {
  if (!name || !name.trim()) return null
  const key = locationKey(name)
  return key ? placeKey(key) : null
}

/** Where a tour happens: its site when known by name, else its destination town. */
export function tourPoint(t: { id: number; destination: string }): string | null {
  const site = TOUR_SITES[t.id]
  if (site && site.destination === t.destination) return siteKey(t.id)
  return placePoint(t.destination)
}

/** Where a food stop is: its own door when known, else its town. */
export function stopPoint(s: { name: string; town: string }): string | null {
  const venue = STOP_VENUES[s.name]
  if (venue && venue.town === s.town) return venueKey(s.name)
  return placePoint(s.town)
}

/**
 * The short name of the place a tour happens, for a sentence that has room
 * for a few words: "Dunn's River Falls", "the Martha Brae", or the town.
 */
export function tourPlaceName(t: { id: number; destination: string }): string {
  const site = TOUR_SITES[t.id]
  return site && site.destination === t.destination ? site.name : t.destination
}

function coordsOf(point: string): { lat: number; lng: number } | null {
  if (point.startsWith('place:')) return LOCATIONS[point.slice(6)] ?? null
  if (point.startsWith('site:')) return TOUR_SITES[Number(point.slice(5))] ?? null
  if (point.startsWith('stop:')) return STOP_VENUES[point.slice(5)] ?? null
  return null
}

/**
 * Whole minutes of driving between two points; 0 for the same point, null
 * when either is unknown. A point missing from the table (added to the
 * registry without building the table again, which
 * tests/unit/drive-times.spec.ts refuses) falls back to the old estimate,
 * straight-line distance at 60 km/h, so the planner never goes blind.
 */
export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  if (a === b) return 0
  const i = INDEX.get(a)
  const j = INDEX.get(b)
  if (i !== undefined && j !== undefined) {
    const lo = Math.min(i, j)
    const hi = Math.max(i, j)
    return table.minutes[lo * N - (lo * (lo + 1)) / 2 + (hi - lo - 1)]
  }
  const ca = coordsOf(a)
  const cb = coordsOf(b)
  if (!ca || !cb) return null
  return Math.round(straightLineKm(ca, cb))
}
