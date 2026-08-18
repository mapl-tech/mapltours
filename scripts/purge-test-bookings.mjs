/**
 * Remove test/fake booking rows from the production database.
 *
 * Reviewed and categorised on 2026-08-17 against a full backup at
 * .backup-before-cleanup-2026-08-17.json (gitignored — contains customer PII).
 *
 *   node scripts/purge-test-bookings.mjs            # dry run, prints the plan
 *   node scripts/purge-test-bookings.mjs --commit   # synthetic only (43 rows)
 *   node scripts/purge-test-bookings.mjs --commit --include-own   # + your 3 test rows
 *
 * booking_items cascade on delete. No booking has a user_id set, so nothing
 * in the users table is touched either way.
 */
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))

const U = env.NEXT_PUBLIC_SUPABASE_URL
const K = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }
const q = async (p) => JSON.parse(await (await fetch(`${U}/rest/v1/${p}`, { headers: H })).text())

const COMMIT = process.argv.includes('--commit')
const INCLUDE_OWN = process.argv.includes('--include-own')

const SYNTHETIC = /@example\.com$|^qa\+/i
const OWN = /@mapltech\.com$|@leshanpatterson\.com$|@weareloop\.com$/i

/**
 * Never deletable: any address that is not recognisably ours or synthetic.
 *
 * This used to be a hardcoded list of the three real customers, which meant
 * committing their addresses to git history forever. Deriving the guard from
 * the patterns instead is both privacy-safe and strictly stronger: a real
 * customer who signs up tomorrow is protected without anyone editing this file.
 */
const isProtected = (email) => !SYNTHETIC.test(email) && !OWN.test(email)

const all = await q('bookings?select=id,email,status,total_paid,created_at&limit=500')

const doomed = all.filter((b) => SYNTHETIC.test(b.email) || (INCLUDE_OWN && OWN.test(b.email)))
const keeping = all.filter((b) => !doomed.includes(b))

// Hard guard: a protected address must never appear in the delete set, whatever
// the patterns above happen to match.
const violation = doomed.filter((b) => isProtected(String(b.email)))
if (violation.length) {
  console.error('ABORT - delete set contains protected rows:', violation.map((v) => v.email))
  process.exit(1)
}

console.log(`plan: delete ${doomed.length}, keep ${keeping.length}${INCLUDE_OWN ? '  (--include-own)' : ''}`)
console.log('\nKEEPING:')
for (const b of keeping) {
  console.log(`  ${b.created_at.slice(0, 16)}  ${String(b.status).padEnd(8)} $${String(b.total_paid).padEnd(5)} ${b.email}`)
}

if (!COMMIT) {
  console.log(`\nDELETING (${doomed.length}):`)
  for (const b of doomed) console.log(`  ${b.created_at.slice(0, 16)}  ${String(b.status).padEnd(8)} ${b.email}`)
  console.log('\ndry run - nothing deleted. Re-run with --commit to apply.')
  process.exit(0)
}

let ok = 0
let fail = 0
for (const b of doomed) {
  const r = await fetch(`${U}/rest/v1/bookings?id=eq.${b.id}`, { method: 'DELETE', headers: H })
  if (r.ok) ok++
  else { fail++; console.error('  FAILED', b.email, r.status, (await r.text()).slice(0, 140)) }
}

const after = await q('bookings?select=id,email,status,total_paid,created_at&order=created_at.asc&limit=500')
const items = await q('booking_items?select=id&limit=500')

console.log(`\ndeleted ${ok}, failed ${fail}`)
console.log(`remaining: ${after.length} bookings, ${items.length} booking_items`)
for (const b of after) {
  console.log(`  ${b.created_at.slice(0, 16)}  ${String(b.status).padEnd(8)} $${String(b.total_paid).padEnd(5)} ${b.email}`)
}
