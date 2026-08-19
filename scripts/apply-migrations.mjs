// Apply the pending Supabase migrations to PROD via the Management API.
// Diagnosed cause of the checkout 503 ("Booking system not yet configured"):
// migration 007's `bookings_schema_health` view (and unique pending index)
// were never applied to prod, so the schema guard short-circuits every
// checkout. These migration files are all idempotent (IF NOT EXISTS /
// OR REPLACE / drop-if-exists), so re-running is safe.
//
// Auth: a Supabase personal access token (no DB password needed).
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-migrations.mjs

import fs from 'node:fs'
import path from 'node:path'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = 'eybeezhvuokziyczkkkl' // from NEXT_PUBLIC_SUPABASE_URL

if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN (create one at https://supabase.com/dashboard/account/tokens)')
  process.exit(1)
}

const API = `https://api.supabase.com/v1/projects/${REF}/database/query`

async function runSql(query) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// Which migrations to apply. Pass them as arguments, in the order they must
// run, and they are applied in that order:
//
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-migrations.mjs 015_booking_refunds.sql 016_cancellation_emails.sql
//
// With no arguments it falls back to the original checkout-repair set. Every
// migration in this repo is written to be idempotent (IF NOT EXISTS /
// OR REPLACE / DROP IF EXISTS), so re-applying one is safe; that is what makes
// naming them on the command line reasonable rather than reckless.
//
// Names are resolved inside supabase/migrations and must not escape it.
const DEFAULT_FILES = [
  '002_comment_replies.sql',
  '005_bookings_payment_flow.sql',
  '006_airport_transfers.sql',
  '007_bookings_atomic_idempotency.sql',
]

const args = process.argv.slice(2)
for (const a of args) {
  if (!/^[0-9A-Za-z._-]+\.sql$/.test(a)) {
    console.error(`Refusing "${a}": migration names are a bare filename ending in .sql`)
    process.exit(1)
  }
}
const FILES = args.length > 0 ? args : DEFAULT_FILES

const dir = path.resolve('supabase/migrations')

for (const f of FILES) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8')
  process.stdout.write(`Applying ${f} … `)
  try {
    await runSql(sql)
    console.log('ok')
  } catch (err) {
    console.error('FAILED:', err.message)
    process.exit(1)
  }
}

// Verify the checkout schema guard will now pass. Only meaningful for the
// default set; a targeted run reports its own columns below instead.
if (args.length > 0) {
  console.log('\nColumns now present on public.bookings:')
  const cols = await runSql(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name='bookings' order by column_name`,
  )
  console.log((Array.isArray(cols) ? cols.map((c) => c.column_name) : []).join(', '))
  process.exit(0)
}

console.log('\nVerifying bookings_schema_health …')
const health = await runSql('select * from public.bookings_schema_health')
console.log(JSON.stringify(health, null, 2))
const row = Array.isArray(health) ? health[0] : null
const allTrue = row && row.has_booking_type && row.has_cart_hash && row.has_item_type && row.has_unique_pending_index
console.log(allTrue ? '\n✓ Checkout schema is ready — checkout should work now.' : '\n✗ Some checks still false (see above).')

// Confirm comments.parent_id too.
const cmt = await runSql(`select column_name from information_schema.columns where table_schema='public' and table_name='comments' and column_name='parent_id'`)
console.log(Array.isArray(cmt) && cmt.length ? '✓ comments.parent_id present (replies enabled).' : '✗ comments.parent_id still missing.')
