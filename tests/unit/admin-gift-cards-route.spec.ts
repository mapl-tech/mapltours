import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * /api/admin/gift-cards: the gift card support desk's server side.
 *
 * Two rules added Nov 13 2026: with no query and attention=1 it lists the
 * paid cards whose email never went out; and a card that was never paid for
 * cannot be reactivated, because a card is created at checkout holding its
 * full balance (voided before payment, then revived, it would be spendable
 * for nothing).
 */

type Row = Record<string, unknown>
const st = vi.hoisted(() => ({
  user: null as null | { id: string },
  admin: true,
  cards: [] as Row[],
  emails: { recipient: 'sent', purchaser: 'skipped' } as { recipient: string; purchaser: string },
}))

/** A small stand-in for supabase-js covering exactly the chains the route uses. */
function table(name: string) {
  const preds: Array<(r: Row) => boolean> = []
  let patch: Row | null = null
  let order: { col: string; asc: boolean } | null = null
  let limit = Infinity
  const rows = () => (name === 'gift_cards' ? st.cards : [])
  const matching = () => {
    let out = rows().filter((r) => preds.every((p) => p(r)))
    if (order) {
      const { col, asc } = order
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
    }
    return out.slice(0, limit)
  }
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return q },
    neq: (c: string, v: unknown) => { preds.push((r) => r[c] !== v); return q },
    is: (c: string, v: unknown) => { preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
    not: (c: string, op: string, v: unknown) => { preds.push((r) => (op === 'is' && v === null ? r[c] != null : r[c] !== v)); return q },
    lt: (c: string, v: string) => { preds.push((r) => r[c] != null && String(r[c]) < v); return q },
    or: (expr: string) => {
      const parts = expr.split(',').map((p) => { const [c, op, ...rest] = p.split('.'); return { c, op, v: rest.join('.') } })
      preds.push((r) => parts.some(({ c, op, v }) => (op === 'is' && v === 'null' ? r[c] == null : op === 'gt' ? r[c] != null && String(r[c]) > v : false)))
      return q
    },
    order: (col: string, o?: { ascending?: boolean }) => { order = { col, asc: o?.ascending !== false }; return q },
    limit: (n: number) => { limit = n; return q },
    update: (p: Row) => { patch = p; return q },
    maybeSingle: async () => {
      if (name === 'admins') return { data: st.admin && st.user ? { user_id: st.user.id } : null, error: null }
      const hit = matching()[0]
      if (!hit) return { data: null, error: null }
      if (patch) { Object.assign(hit, patch); return { data: { id: hit.id }, error: null } }
      return { data: hit, error: null }
    },
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: matching(), error: null }).then(ok),
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => table(t) }) }))
vi.mock('@/lib/email/gift-card', () => ({ sendGiftCardEmails: async () => st.emails }))

import { GET, POST } from '@/app/api/admin/gift-cards/route'

const MIN = 60_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString()
const card = (id: string, extra: Row = {}): Row => ({
  id, code: `MAPL-${id.toUpperCase().padEnd(4, 'A')}-AAAA`, initial_amount: 100, balance: 100, currency: 'USD', status: 'active',
  purchaser_name: null, purchaser_email: 'buyer@example.com', recipient_name: null, recipient_email: 'friend@example.com', message: null,
  created_at: ago(60 * MIN), paid_at: ago(60 * MIN), delivered_at: ago(59 * MIN), expires_at: ahead(700 * 24 * 60 * MIN), stripe_payment_id: 'pi_test', ...extra,
})
const get = (qs: string) => GET(new Request(`http://localhost/api/admin/gift-cards${qs}`))
const post = (body: Row) => POST(new Request('http://localhost/api/admin/gift-cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

beforeEach(() => {
  st.user = { id: 'admin-1' }
  st.admin = true
  st.cards = []
  st.emails = { recipient: 'sent', purchaser: 'skipped' }
})

describe('who may use it', () => {
  test('signed out is 401, signed in but not an admin is 403, for reads and actions alike', async () => {
    st.user = null
    expect((await get('?attention=1')).status).toBe(401)
    st.user = { id: 'someone' }; st.admin = false
    expect((await get('?q=x')).status).toBe(403)
    expect((await post({ id: 'a', action: 'void' })).status).toBe(403)
  })
})

describe('the cards that were never delivered', () => {
  test('lists live, unexpired cards with no delivery that were paid over five minutes ago, newest payment first', async () => {
    st.cards = [
      card('ok', {}),                                                          // delivered
      card('old', { delivered_at: null, paid_at: ago(3 * 60 * MIN) }),          // listed
      card('new', { delivered_at: null, paid_at: ago(20 * MIN) }),              // listed, newer
      card('busy', { delivered_at: null, paid_at: ago(2 * MIN) }),              // delivery may still be under way
      card('unpaid', { delivered_at: null, paid_at: null, status: 'pending' }), // not paid
      card('void', { delivered_at: null, status: 'void' }),                     // stopped
      card('exp', { delivered_at: null, expires_at: ago(MIN) }),                // expired
      card('noexp', { delivered_at: null, expires_at: null, paid_at: ago(10 * MIN) }), // never expires: listed
    ]
    const res = await get('?attention=1')
    expect(res.status).toBe(200)
    expect((await res.json()).cards.map((c: Row) => c.id)).toEqual(['noexp', 'new', 'old'])
  })

  test('an empty query without attention asks for nothing', async () => {
    st.cards = [card('a', { delivered_at: null })]
    expect(await (await get('')).json()).toEqual({ cards: [] })
  })
})

describe('reactivating a void card', () => {
  test('a card never paid for stays void, and the desk is told why', async () => {
    st.cards = [card('a', { status: 'void', paid_at: null })]
    const res = await post({ id: 'a', action: 'reactivate' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/never paid for/)
    expect(st.cards[0].status).toBe('void')
  })

  test('a paid card comes back live with its balance, or used up when nothing is left', async () => {
    st.cards = [card('a', { status: 'void', balance: 40 }), card('b', { status: 'void', balance: 0 })]
    expect(await (await post({ id: 'a', action: 'reactivate' })).json()).toEqual({ ok: true, changed: true })
    expect(st.cards[0].status).toBe('active')
    await post({ id: 'b', action: 'reactivate' })
    expect(st.cards[1].status).toBe('depleted')
  })

  test('a card that is not void is left as it is', async () => {
    st.cards = [card('a')]
    expect(await (await post({ id: 'a', action: 'reactivate' })).json()).toEqual({ ok: true, changed: false })
    expect(st.cards[0].status).toBe('active')
  })
})

describe('the other actions keep their rules', () => {
  test('only a live card can be sent again, and the send result is handed back to the desk', async () => {
    st.cards = [card('a', { status: 'depleted' }), card('b', { delivered_at: null })]
    expect((await post({ id: 'a', action: 'resend' })).status).toBe(409)
    st.emails = { recipient: 'failed', purchaser: 'skipped' }
    expect(await (await post({ id: 'b', action: 'resend' })).json()).toEqual({ ok: true, emails: { recipient: 'failed', purchaser: 'skipped' } })
  })

  test('a new address must look like one', async () => {
    st.cards = [card('a')]
    expect((await post({ id: 'a', action: 'correct_email', email: 'not-an-email' })).status).toBe(400)
    expect(st.cards[0].recipient_email).toBe('friend@example.com')
  })
})
