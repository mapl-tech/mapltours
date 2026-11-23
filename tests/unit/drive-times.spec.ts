import { describe, test, expect } from 'vitest'
import table from '../../lib/drive-times.json'
import meta from '../../lib/drive-times.meta.json'
import { LOCATIONS } from '../../lib/transportation'
import { TOUR_SITES, STOP_VENUES, placeKey, siteKey, venueKey } from '../../lib/drive-points'
import { minutesBetween, placePoint, stopPoint, tourPlaceName, tourPoint } from '../../lib/drive-times'
import { experiences } from '../../lib/experiences'
import { EATS } from '../../lib/eats'

/**
 * lib/drive-times.json is built from the points in lib/transportation and
 * lib/drive-points by scripts/build-drive-times.mts (OSRM over OpenStreetMap).
 * It ships with the site, so nothing here may go stale quietly: a point moved
 * or added without building the table again fails here, before the planner
 * times a day from a place the table never saw.
 */

const registry: [string, number, number][] = [
  ...Object.entries(LOCATIONS).map(([name, p]) => [placeKey(name), p.lat, p.lng] as [string, number, number]),
  ...Object.entries(TOUR_SITES).map(([id, p]) => [siteKey(Number(id)), p.lat, p.lng] as [string, number, number]),
  ...Object.entries(STOP_VENUES).map(([name, p]) => [venueKey(name), p.lat, p.lng] as [string, number, number]),
]

describe('the drive-time table', () => {
  test('holds every point, where the registry puts it, and nothing else', () => {
    expect(table.keys).toEqual(registry.map(([key]) => key))
    expect(meta.keys).toEqual(table.keys)
    expect(meta.points).toEqual(registry.map(([, lat, lng]) => [lat, lng]))
  })

  test('ships only what the site reads', () => {
    expect(Object.keys(table).sort()).toEqual(['keys', 'minutes'])
  })

  test('has one whole, plausible time for every pair', () => {
    const n = table.keys.length
    expect(table.minutes).toHaveLength((n * (n - 1)) / 2)
    for (const m of table.minutes) {
      expect(Number.isInteger(m)).toBe(true)
      expect(m).toBeGreaterThanOrEqual(0)
      // Negril to Manchioneal, end to end, is about seven hours.
      expect(m).toBeLessThan(8 * 60)
    }
  })

  test('says where it comes from and credits OpenStreetMap', () => {
    expect(meta.about).toContain('© OpenStreetMap contributors')
    expect(meta.about).toContain('Open Database License')
    expect(meta.source.md5).toMatch(/^[0-9a-f]{32}$/)
    expect(meta.source.downloaded).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('reads the same either way, and nothing between a point and itself', () => {
    for (const a of table.keys.slice(0, 12)) {
      expect(minutesBetween(a, a)).toBe(0)
      for (const b of table.keys) expect(minutesBetween(a, b)).toBe(minutesBetween(b, a))
    }
  })

  test('keeps the road roughly honest: no leg beats driving a straight line at 130 km/h', () => {
    // A guard against a point snapped to the wrong road: the table may be
    // slow, but it can never be faster than the crow at highway speed.
    const R = 6371
    const crowKm = (a: [number, number], b: [number, number]) => {
      const dLat = ((b[0] - a[0]) * Math.PI) / 180
      const dLng = ((b[1] - a[1]) * Math.PI) / 180
      const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
    }
    const pts = meta.points as [number, number][]
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const minutes = minutesBetween(table.keys[i], table.keys[j])!
        expect(minutes + 2, `${table.keys[i]} to ${table.keys[j]}`).toBeGreaterThanOrEqual((crowKm(pts[i], pts[j]) / 130) * 60)
      }
    }
  })
})

describe('every tour and every food stop is on the map', () => {
  test('each tour resolves to a point in the table', () => {
    for (const e of experiences) {
      const point = tourPoint(e)
      expect(point, e.title).not.toBeNull()
      expect(table.keys, e.title).toContain(point)
    }
  })

  test('a named site belongs to the tour it is filed under', () => {
    for (const [id, site] of Object.entries(TOUR_SITES)) {
      const e = experiences.find((x) => x.id === Number(id))
      expect(e, `site ${id}`).toBeTruthy()
      expect(site.destination, e!.title).toBe(e!.destination)
      expect(tourPoint(e!)).toBe(siteKey(Number(id)))
      expect(tourPlaceName(e!)).toBe(site.name)
    }
  })

  test('each food stop is timed from its own door', () => {
    for (const eat of EATS) {
      const venue = STOP_VENUES[eat.name]
      expect(venue, eat.name).toBeTruthy()
      expect(venue.town, eat.name).toBe(eat.town)
      expect(stopPoint(eat)).toBe(venueKey(eat.name))
    }
    expect(Object.keys(STOP_VENUES).sort()).toEqual(EATS.map((e) => e.name).sort())
  })

  test('a tour id that no longer matches its site falls back to its town, never to the wrong site', () => {
    expect(tourPoint({ id: 1, destination: 'Negril' })).toBe(placePoint('Negril'))
    expect(tourPlaceName({ id: 1, destination: 'Negril' })).toBe('Negril')
  })

  test('the sites sit where they are: the falls and the Blue Hole half an hour apart, the raft by Falmouth', () => {
    expect(minutesBetween(siteKey(1), siteKey(2))).toBeGreaterThanOrEqual(20)
    expect(minutesBetween(siteKey(1), siteKey(2))).toBeLessThanOrEqual(40)
    expect(minutesBetween(siteKey(3), placePoint('Falmouth'))).toBeLessThanOrEqual(15)
    expect(minutesBetween(siteKey(14), placePoint('Negril'))).toBeLessThanOrEqual(15)
    expect(minutesBetween(siteKey(15), placePoint('Ocho Rios'))).toBeGreaterThanOrEqual(40)
  })
})
