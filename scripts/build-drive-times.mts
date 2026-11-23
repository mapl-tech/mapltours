/**
 * Builds lib/drive-times.json: the drive, in whole minutes, between every
 * place the day planner measures (lib/transportation LOCATIONS, and the tour
 * sites and food-stop doors in lib/drive-points), routed over OpenStreetMap's
 * roads by OSRM with its standard car profile. Its provenance and the points
 * it was routed between go to lib/drive-times.meta.json beside it.
 *
 * Nothing at build or run time calls a map service: the site reads the table
 * this writes. Run it again after changing a point, and commit both files with
 * the change (tests/unit/drive-times.spec.ts fails while they disagree).
 *
 * The tools live outside the repo (OSRM is a native module, and the extract
 * is 40 MB):
 *
 *   mkdir -p ~/osrm-jamaica && cd ~/osrm-jamaica
 *   npm init -y >/dev/null && npm install @project-osrm/osrm@26.10.0
 *   curl -fLO https://download.geofabrik.de/central-america/jamaica-latest.osm.pbf
 *   curl -fLO https://download.geofabrik.de/central-america/jamaica-latest.osm.pbf.md5
 *   md5 -q jamaica-latest.osm.pbf; cat jamaica-latest.osm.pbf.md5   # must match
 *   B=node_modules/@project-osrm/osrm/lib/binding_napi_v8
 *   $B/osrm-extract -p node_modules/@project-osrm/osrm/profiles/car.lua jamaica-latest.osm.pbf
 *   $B/osrm-contract jamaica-latest.osrm
 *
 * then, from the repo:
 *
 *   OSRM_MODULE=~/osrm-jamaica/node_modules/@project-osrm/osrm/lib/index.js \
 *   OSRM_DATA=~/osrm-jamaica/jamaica-latest.osrm \
 *   OSM_EXTRACT_MD5=<the md5 above> OSM_EXTRACT_DATE=<the day it was downloaded, YYYY-MM-DD> \
 *   npx tsx scripts/build-drive-times.mts
 *
 * Every time is the mean of the two directions, so a pair of places is the
 * same drive whichever way the day runs them. No traffic: OSRM's car profile
 * times the road as built. Checked on Nov 23 2026 against Google's typical
 * midday times from MBJ, which the routed times sit inside (Negril 90 to 130
 * minutes, routed 99; Ocho Rios 90 to 150, routed 113).
 *
 * The data is © OpenStreetMap contributors under the Open Database License,
 * and so is the table (a derivative database): https://www.openstreetmap.org/copyright
 */

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { LOCATIONS } from '../lib/transportation'
import { TOUR_SITES, STOP_VENUES, placeKey, siteKey, venueKey } from '../lib/drive-points'

/** A point further than this from any road is a bad coordinate, not a place. */
const MAX_SNAP_M = 600

function need(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`${name} is not set. See the header of scripts/build-drive-times.mts.`)
    process.exit(1)
  }
  return v
}

const moduleUrl = pathToFileURL(need('OSRM_MODULE')).href
const dataPath = need('OSRM_DATA')
const md5 = need('OSM_EXTRACT_MD5')
const downloaded = need('OSM_EXTRACT_DATE')
if (!/^[0-9a-f]{32}$/.test(md5)) throw new Error('OSM_EXTRACT_MD5 is not an md5')
if (!/^\d{4}-\d{2}-\d{2}$/.test(downloaded)) throw new Error('OSM_EXTRACT_DATE is not YYYY-MM-DD')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OSRM = (await import(moduleUrl)).default as any
const osrm = new OSRM({ path: dataPath, algorithm: 'CH' })
const osrmVersion: string = OSRM.version

const points: { key: string; lat: number; lng: number }[] = [
  ...Object.entries(LOCATIONS).map(([name, p]) => ({ key: placeKey(name), lat: p.lat, lng: p.lng })),
  ...Object.entries(TOUR_SITES).map(([id, p]) => ({ key: siteKey(Number(id)), lat: p.lat, lng: p.lng })),
  ...Object.entries(STOP_VENUES).map(([name, p]) => ({ key: venueKey(name), lat: p.lat, lng: p.lng })),
]
if (new Set(points.map((p) => p.key)).size !== points.length) throw new Error('two points share a key')

const call = <T,>(method: string, options: object) =>
  new Promise<T>((resolve, reject) => osrm[method](options, (err: Error | null, res: T) => (err ? reject(err) : resolve(res))))

// Every point has to land on the road network, near where it says it is.
let badSnap = false
for (const p of points) {
  const res = await call<{ waypoints: { distance: number; name: string }[] }>('nearest', { coordinates: [[p.lng, p.lat]], number: 1 })
  const w = res.waypoints[0]
  const flag = w.distance > MAX_SNAP_M ? '  <-- too far from any road' : ''
  if (flag) badSnap = true
  console.log(`${p.key.padEnd(52)} snaps ${String(Math.round(w.distance)).padStart(4)} m to ${w.name || '(unnamed road)'}${flag}`)
}
if (badSnap) throw new Error(`a point is more than ${MAX_SNAP_M} m from any road: fix its coordinates`)

const routed = await call<{ durations: (number | null)[][] }>('table', {
  coordinates: points.map((p) => [p.lng, p.lat]),
  annotations: ['duration'],
})

// Upper triangle, row by row: minutes[k] for i < j, k = i*n - i*(i+1)/2 + (j-i-1).
const n = points.length
const minutes: number[] = []
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const there = routed.durations[i][j]
    const back = routed.durations[j][i]
    if (there === null || back === null) throw new Error(`no road between ${points[i].key} and ${points[j].key}`)
    minutes.push(Math.round((there + back) / 120))
  }
}

// The site loads only the keys and the minutes (lib/drive-times.json, in the
// browser bundle); where they came from and the points they were routed
// between go beside it (lib/drive-times.meta.json, read by the tests).
const table = { keys: points.map((p) => p.key), minutes }
const meta = {
  about:
    'Drive times in whole minutes between the places the day planner measures (lib/drive-times.json), the mean of both ' +
    `directions, routed by OSRM ${osrmVersion} (car profile, no traffic) over OpenStreetMap data. Data © OpenStreetMap ` +
    'contributors, under the Open Database License 1.0 (https://www.openstreetmap.org/copyright); the table is a derivative ' +
    'database under the same licence. Built by scripts/build-drive-times.mts; do not edit either file by hand.',
  source: {
    extract: 'https://download.geofabrik.de/central-america/jamaica-latest.osm.pbf',
    md5,
    downloaded,
    engine: `OSRM ${osrmVersion}`,
    profile: 'car.lua as shipped',
  },
  keys: table.keys,
  points: points.map((p) => [p.lat, p.lng]),
}

writeFileSync(new URL('../lib/drive-times.json', import.meta.url), `{\n "keys": ${JSON.stringify(table.keys)},\n "minutes": [${minutes.join(',')}]\n}\n`)
writeFileSync(
  new URL('../lib/drive-times.meta.json', import.meta.url),
  JSON.stringify(meta, null, 1).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2]') + '\n',
)
console.log(`\nwrote ${n} places, ${minutes.length} drives to lib/drive-times.json (and its provenance to lib/drive-times.meta.json)`)
