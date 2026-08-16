#!/usr/bin/env node
/**
 * Check that GOOGLE_PLACES_API_KEY actually works, before trusting the
 * homepage to it.
 *
 *   node scripts/verify-google-places.mjs
 *
 * Reads .env.local, runs one real lookup, and prints what came back. Google's
 * failure modes are specific and each needs a different fix, so this reports
 * the actual reason rather than "it didn't work".
 */

import { readFileSync } from 'node:fs'

function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env.local; fall back to the ambient environment */
  }
}

loadEnvLocal()
const key = process.env.GOOGLE_PLACES_API_KEY

if (!key) {
  console.error('\n✗ GOOGLE_PLACES_API_KEY is not set.')
  console.error('  Add it to .env.local:  GOOGLE_PLACES_API_KEY=AIza...\n')
  process.exit(1)
}

const QUERY = 'Scotchies, Montego Bay, Jamaica'

const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.photos',
  },
  body: JSON.stringify({ textQuery: QUERY, maxResultCount: 1 }),
})

const body = await res.json().catch(() => ({}))

if (!res.ok) {
  const msg = body?.error?.message ?? `HTTP ${res.status}`
  console.error(`\n✗ Google rejected the request: ${msg}\n`)
  if (/API key not valid/i.test(msg)) console.error('  → The key is wrong or was regenerated.')
  else if (/not been used|disabled/i.test(msg)) console.error('  → Enable "Places API (New)" for this project in Google Cloud.')
  else if (/billing/i.test(msg)) console.error('  → Enable billing on the Cloud project; Places requires it.')
  else if (/referer|blocked|restrict/i.test(msg)) console.error('  → The key has HTTP-referrer restrictions. This call is server-side, so use an IP or no restriction.')
  console.error()
  process.exit(1)
}

const place = body?.places?.[0]
if (!place) {
  console.error(`\n✗ Key works, but "${QUERY}" returned no match.\n`)
  process.exit(1)
}

console.log('\n✓ Google Places is working.\n')
console.log(`  query        ${QUERY}`)
console.log(`  matched      ${place.displayName?.text ?? '(no name)'}`)
console.log(`  address      ${place.formattedAddress ?? '(none)'}`)
console.log(`  rating       ${place.rating ?? '(none)'} from ${place.userRatingCount ?? 0} reviews`)
console.log(`  photos       ${place.photos?.length ?? 0} available`)
console.log('\n  The homepage will now show real ratings and photos.')
console.log('  Remember to set the same key on Netlify for production.\n')
