import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escapeLikePattern } from '@/lib/pg-like'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { guestLabel } from '@/lib/social-handle'
import { sanitizeMentionQuery, shortName, type MentionCandidate } from '@/lib/mentions'

/**
 * People a signed-in guest can @tag (owner, Nov 15 2026: anyone with an
 * account). Answers at most 8, each as their comments already show them:
 * id, byline label, the avatar, and for a guest shown by first name the
 * initial of their last name ("Ana B.") so two Anas can be told apart.
 * Never an email, a full surname or a location.
 *
 * A guest is found only by what their comments already show: a guest with
 * a handle by the handle (never by the name behind it), any other guest by
 * the start of their name. Typing a surname finds nobody, so the search
 * cannot be used to learn whether someone has an account under their name.
 *
 *   GET /api/mentions/search?q=ana&experience=14
 *
 * With an empty q it offers the people already in that tour's thread. People
 * with neither a name nor a handle cannot be told apart and are left out.
 * The query is reduced to letters, digits, spaces and . _ ' - before it
 * reaches SQL, and each value goes through its own ilike, escaped.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMIT = 8

type Row = { id: string; name: string | null; avatar_url: string | null; social_handle: string | null }

function candidate(row: Row): MentionCandidate | null {
  const l = guestLabel(row.social_handle, row.name, '')
  if (!l.text) return null
  const short = shortName(row.name)
  return {
    id: row.id,
    label: l.text,
    isHandle: l.isHandle,
    // A handle stands alone (its name is not shown, so it is not told here);
    // a first name gets its last initial so two Anas differ.
    detail: l.isHandle ? null : short,
    avatarUrl: row.avatar_url || null,
  }
}

export async function GET(req: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (rateLimit(`${getIp(req)}:${user.id}`, { bucket: 'mention-search', max: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 })
  }

  const q = sanitizeMentionQuery(req.nextUrl.searchParams.get('q'))
  const expParam = Number(req.nextUrl.searchParams.get('experience'))
  const experienceId = Number.isInteger(expParam) && expParam > 0 && expParam < 100000 ? expParam : null
  const svc = createServiceClient()
  const cols = 'id, name, avatar_url, social_handle'

  // People already in this tour's thread rank first (and are all an empty q returns).
  let participants: string[] = []
  if (experienceId) {
    const { data } = await svc
      .from('comments')
      .select('user_id, created_at')
      .eq('experience_id', experienceId)
      .order('created_at', { ascending: false })
      .limit(200)
    participants = Array.from(new Set((data ?? []).map((r: { user_id: string }) => r.user_id))).filter((id) => id !== user.id)
  }

  let rows: Row[] = []
  if (!q) {
    if (participants.length) {
      const { data } = await svc.from('users').select(cols).in('id', participants.slice(0, 40))
      rows = (data ?? []) as Row[]
    }
  } else {
    const p = escapeLikePattern(q)
    const handleQ = escapeLikePattern(q.toLowerCase().replace(/\s+/g, ''))
    const [byName, byHandle] = await Promise.all([
      svc.from('users').select(cols).ilike('name', `${p}%`).limit(60),
      svc.from('users').select(cols).ilike('social_handle', `${handleQ}%`).limit(40),
    ])
    const err = byName.error || byHandle.error
    if (err) {
      console.error('[mentions/search] query failed', err.message)
      return NextResponse.json({ error: 'search failed' }, { status: 500 })
    }
    const seen = new Set<string>()
    const add = (r: Row) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r) } }
    // A name match counts only for a guest shown by name; a handle match only
    // for a guest shown by that handle.
    for (const r of (byName.data ?? []) as Row[]) if (!guestLabel(r.social_handle, r.name, '').isHandle) add(r)
    for (const r of (byHandle.data ?? []) as Row[]) if (guestLabel(r.social_handle, r.name, '').isHandle) add(r)
  }

  const rank = new Map(participants.map((id, i) => [id, i]))
  const ql = q.toLowerCase()
  const people = rows
    .filter((r) => r.id !== user.id)
    .map((r) => ({ r, c: candidate(r) }))
    .filter((x): x is { r: Row; c: MentionCandidate } => !!x.c)
    .sort((a, b) => {
      const pa = rank.has(a.r.id) ? 0 : 1
      const pb = rank.has(b.r.id) ? 0 : 1
      if (pa !== pb) return pa - pb
      if (pa === 0) return (rank.get(a.r.id) ?? 0) - (rank.get(b.r.id) ?? 0)
      // Then whoever's label starts with the query, then alphabetical.
      const sa = a.c.label.toLowerCase().startsWith(ql) ? 0 : 1
      const sb = b.c.label.toLowerCase().startsWith(ql) ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.c.label.localeCompare(b.c.label)
    })
    .slice(0, LIMIT)
    .map((x) => x.c)

  return NextResponse.json({ people }, { headers: { 'cache-control': 'no-store' } })
}
