import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/mentions/search/route'

/**
 * GET /api/mentions/search: who a signed-in guest can tag. A guest is found
 * only by what their comments already show (a handle by the handle, anyone
 * else by the start of their name), the answer never carries an email or a
 * surname, the caller is never offered themselves, and the query cannot
 * change the shape of the SQL. A fake database applies ilike the way
 * Postgres does.
 */

const ME = '00000000-0000-4000-8000-00000000000a'
type U = { id: string; name: string | null; avatar_url: string | null; social_handle: string | null; email?: string }
const users: U[] = [
  { id: ME, name: 'Leshan Patterson', avatar_url: null, social_handle: null, email: 'me@example.com' },
  { id: '00000000-0000-4000-8000-000000000001', name: 'Ana Brown', avatar_url: 'https://x/a.jpg', social_handle: null, email: 'ana@example.com' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Ana Smith', avatar_url: null, social_handle: null },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Anabel Green', avatar_url: null, social_handle: 'island.belle' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Cara Lee', avatar_url: null, social_handle: 'cara.lee' },
  { id: '00000000-0000-4000-8000-000000000005', name: null, avatar_url: null, social_handle: null },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Brown Devon', avatar_url: null, social_handle: null },
]
let threadUserIds: string[] = []
const ilikeSeen: string[] = []

/** Postgres ilike: % any run, _ one char, backslash escapes. */
function ilike(value: string | null, pattern: string): boolean {
  if (value == null) return false
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    if (c === '%') re += '.*'
    else if (c === '_') re += '.'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${re}$`, 'is').test(value)
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: ME } : null } }) } }),
}))
let signedIn = true
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let rows: Array<Record<string, unknown>> = table === 'users' ? users.map(({ email: _e, ...u }) => u) : threadUserIds.map((user_id, i) => ({ user_id, created_at: `2026-11-${10 + i}` }))
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        in: (_c: string, ids: string[]) => { rows = rows.filter((r) => ids.includes(r.id as string)); return b },
        ilike: (col: string, pattern: string) => { ilikeSeen.push(pattern); rows = rows.filter((r) => ilike(r[col] as string | null, pattern)); return b },
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      }
      return b
    },
  }),
}))

let ip = 1
const ask = async (q: string, experience?: number) => {
  const qs = new URLSearchParams({ q })
  if (experience) qs.set('experience', String(experience))
  // A new address each call, so the rate limit never decides a test.
  const req = new NextRequest(`https://mapltours.com/api/mentions/search?${qs}`, { headers: { 'x-nf-client-connection-ip': `10.0.0.${ip++}` } })
  const res = await GET(req)
  return { status: res.status, body: (await res.json()) as { people?: Array<Record<string, unknown>> } }
}

describe('/api/mentions/search', () => {
  beforeEach(() => { signedIn = true; threadUserIds = []; ilikeSeen.length = 0 })

  test('signed out: 401, nothing searched', async () => {
    signedIn = false
    const r = await ask('ana')
    expect(r.status).toBe(401)
    expect(ilikeSeen).toEqual([])
  })

  test('a first name finds guests shown by that name, with the initial that tells them apart', async () => {
    const { body } = await ask('ana')
    expect(body.people?.map((p) => [p.label, p.detail])).toEqual([['Ana', 'Ana B.'], ['Ana', 'Ana S.']])
  })

  test('a guest with a handle is found by the handle, never by the name behind it', async () => {
    expect((await ask('anabel')).body.people).toEqual([])
    const { body } = await ask('island')
    expect(body.people).toEqual([{ id: users[3].id, label: 'island.belle', isHandle: true, detail: null, avatarUrl: null }])
  })

  test('a surname finds nobody', async () => {
    expect((await ask('brown')).body.people?.map((p) => p.label)).toEqual(['Brown'])
    expect((await ask('lee')).body.people).toEqual([])
  })

  test('the answer carries no email, full name or location, and never the caller', async () => {
    const { body } = await ask('a')
    expect(body.people?.length).toBeGreaterThan(1)
    const json = JSON.stringify(body)
    expect(json).not.toMatch(/@example\.com|Patterson|Brown|Smith|location/)
    expect(body.people?.some((p) => p.id === ME)).toBe(false)
    for (const p of body.people ?? []) expect(Object.keys(p).sort()).toEqual(['avatarUrl', 'detail', 'id', 'isHandle', 'label'])
  })

  test('an empty query offers the people already in the thread, most recent first, never the caller', async () => {
    threadUserIds = [users[4].id, ME, users[1].id]
    const { body } = await ask('', 7)
    expect(body.people?.map((p) => p.label).sort()).toEqual(['Ana', 'cara.lee'])
    expect((await ask('')).body.people).toEqual([])
  })

  test('people in the thread rank first', async () => {
    threadUserIds = [users[2].id]
    const { body } = await ask('ana', 7)
    expect(body.people?.[0].id).toBe(users[2].id)
  })

  test('a guest with neither a name nor a handle is never offered', async () => {
    threadUserIds = [users[5].id]
    expect((await ask('', 7)).body.people).toEqual([])
  })

  test('query syntax is dropped before SQL and LIKE wildcards are escaped', async () => {
    await ask('ana,(id.eq.1)%_')
    for (const p of ilikeSeen) {
      expect(p).not.toMatch(/[,()]/)
      expect(p.replace(/\\[%_\\]/g, '').slice(0, -1)).not.toMatch(/[%]/)
    }
    expect(ilikeSeen[0]).toBe('anaid.eq.1\\_%')
  })

  test('at most 8 people', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: `Zed ${i}`, avatar_url: null, social_handle: null }))
    users.push(...many)
    const { body } = await ask('zed')
    expect(body.people).toHaveLength(8)
    users.splice(users.length - many.length, many.length)
  })
})
