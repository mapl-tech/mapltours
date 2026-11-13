import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultRateCard } from '@/lib/experiences'

/**
 * /api/admin/tour-rates: the only way a tour's rate changes. Signed-in admins
 * only; a card is validated before anything is written; a save and its
 * change-log row go through one database function; a deploy is started only
 * after a real change is stored.
 */

const st = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  admin: true,
  saved: [] as Array<Record<string, unknown>>,
  changes: [] as Array<Record<string, unknown>>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcError: null as null | { message: string },
  resetChanged: true,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: table === 'admins' && st.admin ? { user_id: st.user?.id } : null, error: null })
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'tour_rate_cards' ? st.saved : st.changes, error: null }).then(ok)
      return q
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      st.rpc.push({ fn, args })
      if (st.rpcError) return { data: null, error: st.rpcError }
      return { data: fn === 'reset_tour_rate_card' ? { ok: true, changed: st.resetChanged } : { ok: true }, error: null }
    },
  }),
}))

import { GET, POST, DELETE } from '@/app/api/admin/tour-rates/route'

const HOOK = 'https://api.netlify.com/build_hooks/test-hook'
const hookCalls: string[] = []
const send = (method: 'POST' | 'DELETE', body: unknown) =>
  (method === 'POST' ? POST : DELETE)(new Request('http://localhost/api/admin/tour-rates', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

// Collin's Negril rate for Dunn's River goes from $400 to $420.
const DUNNS = 1
const newCard = () => {
  const d = defaultRateCard(DUNNS)!
  return { pricing: { ...d.pricing, zoneRates: { ...d.pricing.zoneRates, negril: 420 } }, minGuests: 1 }
}

beforeEach(() => {
  st.user = { id: 'admin-1', email: 'owner@example.com' }
  st.admin = true
  st.saved = []
  st.changes = []
  st.rpc = []
  st.rpcError = null
  st.resetChanged = true
  hookCalls.length = 0
  process.env.NETLIFY_RATES_BUILD_HOOK = HOOK
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { hookCalls.push(String(url)); return new Response('', { status: 200 }) }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.NETLIFY_RATES_BUILD_HOOK
})

describe('who may use it', () => {
  test('signed out: 401 for every method, nothing read or written', async () => {
    st.user = null
    expect((await GET()).status).toBe(401)
    expect((await send('POST', { experienceId: DUNNS, card: newCard() })).status).toBe(401)
    expect((await send('DELETE', { experienceId: DUNNS })).status).toBe(401)
    expect(st.rpc).toHaveLength(0)
    expect(hookCalls).toHaveLength(0)
  })

  test('signed in but not an admin: 403', async () => {
    st.admin = false
    expect((await GET()).status).toBe(403)
    expect((await send('POST', { experienceId: DUNNS, card: newCard() })).status).toBe(403)
    expect(st.rpc).toHaveLength(0)
  })
})

describe('saving a card', () => {
  test('a real change is stored with its log row in one call, then a deploy is started', async () => {
    const res = await send('POST', { experienceId: DUNNS, card: newCard() })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, published: true })
    expect(st.rpc).toEqual([{
      fn: 'save_tour_rate_card',
      args: {
        p_experience_id: DUNNS,
        p_pricing: { mode: 'group', baseRate: 190, tierMax: 4, extraPerPerson: 50, zoneRates: { negril: 420, lucea: 300, montego_bay: 280, trelawny: 230, runaway_bay: 220, ocho_rios: 190 } },
        p_min_guests: 1,
        p_default: defaultRateCard(DUNNS),
        p_by: 'admin-1',
        p_by_email: 'owner@example.com',
      },
    }])
    expect(hookCalls).toHaveLength(1)
    expect(hookCalls[0]).toMatch(/^https:\/\/api\.netlify\.com\/build_hooks\/test-hook\?trigger_title=Tour\+rates%3A\+Dunn%27s\+River\+Falls\+Climb$/)
  })

  test('a card that does not validate is refused in a sentence; nothing stored, no deploy', async () => {
    const card = newCard()
    ;(card.pricing.zoneRates as Record<string, unknown>).negril = -5
    const res = await send('POST', { experienceId: DUNNS, card })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Negril: must be more than $0')
    expect(st.rpc).toHaveLength(0)
    expect(hookCalls).toHaveLength(0)
  })

  test('a tour that is not in the catalog is refused', async () => {
    const res = await send('POST', { experienceId: 99999, card: newCard() })
    expect(res.status).toBe(400)
    expect(st.rpc).toHaveLength(0)
  })

  test('saving what is already in force changes nothing and starts no deploy', async () => {
    const res = await send('POST', { experienceId: DUNNS, card: defaultRateCard(DUNNS) })
    expect(await res.json()).toMatchObject({ ok: true, unchanged: true })
    expect(st.rpc).toHaveLength(0)
    expect(hookCalls).toHaveLength(0)
    // ...and the same once a card is saved.
    st.saved = [{ experience_id: DUNNS, pricing: newCard().pricing, min_guests: 1, updated_at: '2026-11-12T15:00:00Z', updated_by_email: 'owner@example.com' }]
    expect(await (await send('POST', { experienceId: DUNNS, card: newCard() })).json()).toMatchObject({ unchanged: true })
    expect(st.rpc).toHaveLength(0)
  })

  test('a database failure is a 500 that says nothing changed, and starts no deploy', async () => {
    st.rpcError = { message: 'boom' }
    const res = await send('POST', { experienceId: DUNNS, card: newCard() })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Nothing was changed/)
    expect(hookCalls).toHaveLength(0)
  })

  test('with no build hook set the card is still stored, and the answer says it is not published yet', async () => {
    delete process.env.NETLIFY_RATES_BUILD_HOOK
    const data = await (await send('POST', { experienceId: DUNNS, card: newCard() })).json()
    expect(data).toMatchObject({ ok: true, published: false, reason: 'no_build_hook' })
    expect(st.rpc).toHaveLength(1)
  })

  test('a build hook that fails does not undo the save', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const data = await (await send('POST', { experienceId: DUNNS, card: newCard() })).json()
    expect(data).toMatchObject({ ok: true, published: false, reason: 'hook_500' })
  })
})

describe('back to the default', () => {
  test('deletes the saved card with its log row, then deploys', async () => {
    const data = await (await send('DELETE', { experienceId: DUNNS })).json()
    expect(data).toMatchObject({ ok: true, published: true })
    expect(st.rpc).toEqual([{ fn: 'reset_tour_rate_card', args: { p_experience_id: DUNNS, p_default: defaultRateCard(DUNNS), p_by: 'admin-1', p_by_email: 'owner@example.com' } }])
    expect(hookCalls).toHaveLength(1)
  })

  test('a tour already on its default changes nothing and starts no deploy', async () => {
    st.resetChanged = false
    expect(await (await send('DELETE', { experienceId: DUNNS })).json()).toMatchObject({ ok: true, unchanged: true })
    expect(hookCalls).toHaveLength(0)
  })
})

describe('reading', () => {
  test('saved cards and the change log, each card in canonical form', async () => {
    st.saved = [{ experience_id: DUNNS, pricing: newCard().pricing, min_guests: 1, updated_at: '2026-11-12T15:00:00Z', updated_by_email: 'owner@example.com' }]
    st.changes = [{ id: 1, experience_id: DUNNS, action: 'save', before: defaultRateCard(DUNNS), after: newCard(), changed_by_email: 'owner@example.com', changed_at: '2026-11-12T15:00:00Z' }]
    const data = await (await GET()).json()
    expect(data.saved).toEqual([{ experienceId: DUNNS, card: newCard(), updatedAt: '2026-11-12T15:00:00Z', updatedByEmail: 'owner@example.com' }])
    expect(data.changes[0]).toMatchObject({ experienceId: DUNNS, action: 'save', before: defaultRateCard(DUNNS), after: newCard() })
  })
})
