// One-off: apply migration 002 (comments.parent_id) to the prod Supabase DB
// via the Supabase Management API, authenticated with a personal access
// token (sbp_...). No DB password needed. Idempotent — safe to re-run.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx node scripts/apply-migration-002.mjs

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

// Idempotent equivalent of supabase/migrations/002_comment_replies.sql
const MIGRATION = `
alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade;
create index if not exists idx_comments_parent_id on public.comments(parent_id);
`

try {
  console.log('Applying migration 002 (comments.parent_id)…')
  await runSql(MIGRATION)

  const check = await runSql(`
    select column_name, data_type
    from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='parent_id'
  `)
  if (Array.isArray(check) && check.length) {
    console.log('✓ comments.parent_id present:', JSON.stringify(check[0]))
  } else {
    console.error('✗ parent_id still missing after migration:', JSON.stringify(check))
    process.exit(2)
  }
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
}
