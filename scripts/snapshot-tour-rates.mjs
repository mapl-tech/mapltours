// Copy the tour rate cards saved in /admin/tour-rates into
// lib/tour-rates.snapshot.json, so this deploy prices every tour from them
// (lib/tour-rates.ts explains the whole flow). Runs before `next build`
// through the "prebuild" npm script.
//
// On Netlify (a deploy, a build hook or a preview) it MUST read the cards:
// any failure fails the build, so the deploy already live keeps serving
// instead of a new one going out on rates nobody set. A local build leaves
// the committed file (no cards, the catalog defaults) alone unless asked:
//   SNAPSHOT_TOUR_RATES=1 node --env-file=.env.local scripts/snapshot-tour-rates.mjs
//
// Only the service-role key can read the table (migration 037).

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../lib/tour-rates.snapshot.json', import.meta.url))
const onNetlify = process.env.NETLIFY === 'true' || !!process.env.CONTEXT
const forced = process.env.SNAPSHOT_TOUR_RATES === '1'

if (!onNetlify && !forced) {
  console.log('[tour-rates] local build: catalog default rates (set SNAPSHOT_TOUR_RATES=1 to read the saved cards)')
  process.exit(0)
}

function fail(message) {
  console.error(`[tour-rates] ${message}. The build stops here so no deploy goes out on rates nobody set.`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing')

let rows
try {
  const res = await fetch(`${url}/rest/v1/tour_rate_cards?select=experience_id,pricing,min_guests,updated_at&order=experience_id.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) fail(`reading tour_rate_cards answered HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  rows = await res.json()
} catch (e) {
  fail(`reading tour_rate_cards failed: ${e instanceof Error ? e.message : String(e)}`)
}
if (!Array.isArray(rows)) fail('tour_rate_cards did not answer with a list')

const cards = {}
let latestChange = null
for (const r of rows) {
  if (!Number.isInteger(r.experience_id) || !r.pricing || typeof r.pricing !== 'object') fail(`row for tour ${r.experience_id} is malformed`)
  cards[String(r.experience_id)] = { pricing: r.pricing, minGuests: r.min_guests }
  if (!latestChange || r.updated_at > latestChange) latestChange = r.updated_at
}

const snapshot = { snapshotAt: new Date().toISOString(), latestChange, cards }
writeFileSync(OUT, `${JSON.stringify(snapshot, null, 2)}\n`)
console.log(`[tour-rates] ${rows.length} saved rate card${rows.length === 1 ? '' : 's'} published into this deploy${rows.length ? ` (tours ${Object.keys(cards).join(', ')})` : ''}`)
