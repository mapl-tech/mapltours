#!/usr/bin/env node
/**
 * Resolve every venue in lib/places.ts against Google once, and write the
 * result to lib/places-google.json.
 *
 *   npm run sync:places
 *
 * WHY A SYNC STEP RATHER THAN FETCHING AT RENDER TIME
 *
 * Fetching in the page meant 44 Google calls every time the homepage was
 * rendered fresh — which includes every `npm run build`. A new Cloud project
 * caps Text Search at 100/day, so two or three builds exhausted the day's
 * quota and the cards silently fell back to placeholders.
 *
 * Resolving ahead of time makes render-time cost exactly zero. The site
 * reads a committed JSON file, builds are free and deterministic, and the
 * only calls are the ones this script makes when you choose to run it.
 *
 * Google's terms allow caching place ids indefinitely and other fields for
 * up to 30 days, so run this monthly to stay both current and compliant.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')

function loadEnvLocal() {
  try {
    for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* fall back to ambient env */ }
}
loadEnvLocal()

const key = process.env.GOOGLE_PLACES_API_KEY
if (!key) {
  console.error('\n✗ GOOGLE_PLACES_API_KEY is not set (.env.local).\n')
  process.exit(1)
}

/* Pull { id, googleQuery } straight out of the catalogue so the two can
   never drift apart. */
const src = readFileSync(join(ROOT, 'lib/places.ts'), 'utf8')
const entries = []
for (const block of src.split(/\n  \{\n/).slice(1)) {
  const id = block.match(/id: '([^']+)'/)
  const q = block.match(/googleQuery: '((?:[^'\\]|\\.)*)'/)
  if (id && q) entries.push({ id: id[1], query: q[1].replace(/\\'/g, "'") })
}
if (!entries.length) {
  console.error('✗ Found no places in lib/places.ts — did the file format change?')
  process.exit(1)
}

const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.rating', 'places.userRatingCount', 'places.googleMapsUri',
  'places.photos',
].join(',')

async function resolveOne({ id, query }) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
      locationBias: { circle: { center: { latitude: 18.1096, longitude: -77.2975 }, radius: 120000 } },
    }),
  })

  if (res.status === 429) return { id, error: 'quota' }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { id, error: body?.error?.message ?? `HTTP ${res.status}` }
  }

  const place = (await res.json())?.places?.[0]
  if (!place) return { id, error: 'no match' }

  const photo = place.photos?.[0] ?? null
  return {
    id,
    data: {
      placeId: place.id ?? null,
      matchedName: place.displayName?.text ?? null,
      formattedAddress: place.formattedAddress ?? null,
      rating: typeof place.rating === 'number' ? place.rating : null,
      userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
      googleMapsUri: place.googleMapsUri ?? null,
      photoName: photo?.name ?? null,
      photoAttributions: (photo?.authorAttributions ?? []).map((a) => a?.displayName).filter(Boolean),
    },
  }
}

console.log(`\nResolving ${entries.length} places against Google…\n`)

const out = {}
let ok = 0, quota = 0, failed = 0, withPhoto = 0, withRating = 0

// Sequential with a small gap: bursting 44 concurrent requests is what trips
// per-minute limits on a fresh project.
for (const entry of entries) {
  const r = await resolveOne(entry)
  if (r.error === 'quota') {
    quota++
    console.log(`  ⏳ ${entry.id} — daily quota exhausted`)
  } else if (r.error) {
    failed++
    console.log(`  ✗ ${entry.id} — ${r.error}`)
  } else {
    ok++
    if (r.data.rating != null) withRating++
    if (r.data.photoName) withPhoto++
    out[r.id] = r.data
    console.log(
      `  ✓ ${entry.id.padEnd(34)} ${String(r.data.rating ?? '–').padEnd(4)}` +
      ` ${r.data.photoName ? 'photo' : 'no photo'}   ${r.data.matchedName ?? ''}`,
    )
  }
  await new Promise((res) => setTimeout(res, 120))
}

// Merge over any previous run so a quota-limited run never loses good data.
const target = join(ROOT, 'lib/places-google.json')
let previous = {}
try { previous = JSON.parse(readFileSync(target, 'utf8')).places ?? {} } catch { /* first run */ }

const merged = { ...previous, ...out }
writeFileSync(target, JSON.stringify({ syncedAt: new Date().toISOString(), places: merged }, null, 2) + '\n')

console.log(`\n  resolved ${ok}   with rating ${withRating}   with photo ${withPhoto}`)
if (quota) console.log(`  ⏳ ${quota} hit the daily quota — re-run after it resets, existing data was kept`)
if (failed) console.log(`  ✗ ${failed} failed to match — fix their googleQuery in lib/places.ts`)
console.log(`\n  wrote lib/places-google.json (${Object.keys(merged).length} places total)\n`)
