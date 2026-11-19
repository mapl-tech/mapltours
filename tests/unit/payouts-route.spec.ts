import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { sign } from 'node:crypto'
import type { FakeWise, MemStore } from './payouts-fakes'

/**
 * The two payout routes and the cron over fakes: the bearer gate, the send
 * gate (WISE_PAYOUTS_ENABLED exactly '1', ?dry=1 always wins, an incomplete
 * configuration sends nothing), the webhook's signature gate, and the cron
 * that does nothing at all until payouts are switched on.
 */

const state = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto')
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    store: null as unknown as MemStore,
    wise: null as unknown as FakeWise,
    notified: 0,
    sent: [] as string[],
    paidEmails: [] as string[],
    row: { booking_type: 'transfer', status: 'paid' } as Record<string, string>,
    pem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKey: keys.privateKey,
  }
})

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: { id, ...state.row }, error: null }) }) }) }),
  }),
}))
vi.mock('@/lib/email/driver-paid', () => ({
  notifyDriverPaid: async (_svc: unknown, b: { id: string }, step: string, half: string, opts?: { timeoutMs?: number; idempotencyKey?: string }) => {
    state.paidEmails.push(`${b.id}:${step}:${half}:${opts?.timeoutMs}:${opts?.idempotencyKey}`)
    return true
  },
  notifyTourPaid: async (_svc: unknown, b: { id: string }, payee: string, opts?: { timeoutMs?: number; idempotencyKey?: string }) => {
    state.paidEmails.push(`${b.id}:tour:${payee}:${opts?.timeoutMs}:${opts?.idempotencyKey}`)
    return true
  },
}))
vi.mock('@/lib/payouts/store', async (orig) => ({ ...(await orig<typeof import('@/lib/payouts/store')>()), supabasePayoutStore: () => state.store }))
vi.mock('@/lib/wise/client', async (orig) => ({ ...(await orig<typeof import('@/lib/wise/client')>()), wiseClient: () => state.wise }))
vi.mock('@/lib/payouts/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/payouts/notify')>()),
  notifyPayoutRun: async () => { state.notified++ },
  sendOpsMessage: async (m: { body: string }) => { state.sent.push(m.body); return true },
}))
vi.mock('@/lib/payouts/webhook', async (orig) => {
  const real = await orig<typeof import('@/lib/payouts/webhook')>()
  return { ...real, WISE_WEBHOOK_KEYS: { production: state.pem, sandbox: state.pem } }
})

import { GET, POST } from '@/app/api/payouts/route'
import { POST as WEBHOOK } from '@/app/api/webhooks/wise/route'
import { fakeWise, memStore, ride, tour } from './payouts-fakes'

const SECRET = 'cron-secret-for-tests'
const NOW = Date.parse('2026-11-01T14:30:00Z')
const bearer = { authorization: `Bearer ${SECRET}` }
const req = (path = '/api/payouts', headers: Record<string, string> = {}) => new NextRequest(`https://mapltours.com${path}`, { headers })
const ENV = ['CRON_SECRET', 'WISE_API_TOKEN', 'WISE_PROFILE_ID', 'WISE_ENV', 'WISE_PAYOUT_RECIPIENTS', 'WISE_PAYOUTS_ENABLED', 'WISE_BALANCE_ID', 'WISE_TOUR_PAYEE', 'PAYOUT_FROM', 'PAYOUT_LEAD_BUSINESS_DAYS']

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  state.store = memStore([ride({ subtotal: 147 })], NOW)
  state.wise = fakeWise()
  state.notified = 0
  state.sent = []
  state.paidEmails = []
  state.row = { booking_type: 'transfer', status: 'paid' }
  process.env.CRON_SECRET = SECRET
  process.env.WISE_API_TOKEN = 'test-token'
  process.env.WISE_PROFILE_ID = '154050700'
  process.env.WISE_PAYOUT_RECIPIENTS = '{"Collin": 900001}'
  process.env.WISE_TOUR_PAYEE = 'Collin'
  // The test ride is in October, past its send day on Nov 1.
  process.env.PAYOUT_FROM = '2026-10-01'
  delete process.env.WISE_PAYOUTS_ENABLED
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  for (const k of ENV) delete process.env[k]
})

describe('/api/payouts', () => {
  test('401 without the bearer, with the wrong one, or with ?secret=; nothing read', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('/api/payouts', { authorization: 'Bearer nope' }))).status).toBe(401)
    expect((await GET(req(`/api/payouts?secret=${SECRET}`))).status).toBe(401)
    expect(state.store.writes).toEqual([])
    expect(state.wise.calls).toEqual([])
  })

  test('fails closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('/api/payouts', { authorization: 'Bearer ' }))).status).toBe(500)
  })

  test('switched off: a dry run that plans, answers counts, and sends nothing', async () => {
    const res = await POST(req('/api/payouts', bearer))
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j).toMatchObject({ mode: 'dry', enabled: false, payees: 1, planned: 1, owed_usd: 147, paid_usd: 0, pay_day: '2026-11-01' })
    expect(j.plan).toBeUndefined()
    expect(state.wise.calls).toEqual([])
    expect(state.store.writes).toEqual([])
    expect(state.notified).toBe(0)
  })

  test('?dry=1 answers the plan: payee, amount, booking references, no guest details', async () => {
    const j = await (await GET(req('/api/payouts?dry=1', bearer))).json()
    expect(j.plan.payees[0]).toMatchObject({ payee: 'Collin', amountUsd: 147, outcome: 'planned' })
    expect(JSON.stringify(j.plan)).not.toMatch(/first_name|last_name|email|phone/)
  })

  test('switched on: pays, and tells the inbox', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    const j = await (await POST(req('/api/payouts', bearer))).json()
    expect(j).toMatchObject({ mode: 'live', funded: 1, paid_usd: 147 })
    expect(state.wise.calls).toEqual(['recipient', 'quote', 'requirements', 'transfer', 'fund'])
    expect(state.notified).toBe(1)
  })

  test("switched on: each ride half it paid gets the driver's payment email, once, with a time limit and a key", async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    await POST(req('/api/payouts', bearer))
    const id = Array.from(state.store.dispatch.keys())[0]
    expect(state.paidEmails.sort()).toEqual([
      `${id}:paid_first:first:2500:driver-paid/${id}/paid_first`,
      `${id}:paid_second:second:2500:driver-paid/${id}/paid_second`,
    ])
  })

  test('no payment email for a booking that is no longer a paid transfer, and the payout still stands', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    state.row = { booking_type: 'transfer', status: 'refunded' }
    const j = await (await POST(req('/api/payouts', bearer))).json()
    expect(j).toMatchObject({ mode: 'live', funded: 1 })
    expect(state.paidEmails).toEqual([])
  })

  test('a paid tour gets the operator notice, named for WISE_TOUR_PAYEE, with a time limit and a key', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    state.store = memStore([tour()], NOW)
    state.row = { booking_type: 'tour', status: 'paid' }
    const j = await (await POST(req('/api/payouts', bearer))).json()
    expect(j).toMatchObject({ mode: 'live', funded: 1 })
    const id = Array.from(state.store.dispatch.keys())[0]
    expect(state.paidEmails).toEqual([`${id}:tour:Collin:2500:tour-paid/${id}`])
  })

  test('a tour part never sends the ride email, and a ride half never the tour notice', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    state.store = memStore([tour()], NOW)
    state.row = { booking_type: 'transfer', status: 'paid' } // the row read back is not a tour
    await POST(req('/api/payouts', bearer))
    expect(state.paidEmails).toEqual([])
  })

  test('a dry run, switched off or asked for, sends no payment email', async () => {
    await POST(req('/api/payouts', bearer))
    process.env.WISE_PAYOUTS_ENABLED = '1'
    await POST(req('/api/payouts?dry=1', bearer))
    expect(state.paidEmails).toEqual([])
  })

  test('switched on with ?dry=1: still dry', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    const j = await (await POST(req('/api/payouts?dry=1', bearer))).json()
    expect(j.mode).toBe('dry')
    expect(state.wise.calls).toEqual([])
  })

  test('switched on but the configuration is incomplete: 503, nothing read or sent, names only', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    delete process.env.WISE_PROFILE_ID
    const res = await POST(req('/api/payouts', bearer))
    const j = await res.json()
    expect(res.status).toBe(503)
    expect(j.detail).toEqual(['WISE_PROFILE_ID not set or not a number'])
    expect(JSON.stringify(j)).not.toContain('test-token')
    expect(state.wise.calls).toEqual([])
  })

  test('switched on without a start date: 503, nothing sent; a dry run then plans nothing', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    delete process.env.PAYOUT_FROM
    const res = await POST(req('/api/payouts', bearer))
    expect(res.status).toBe(503)
    expect((await res.json()).detail).toEqual(['PAYOUT_FROM not set'])
    expect(state.wise.calls).toEqual([])
    const dry = await (await GET(req('/api/payouts?dry=1', bearer))).json()
    expect(dry).toMatchObject({ mode: 'dry', payees: 0 })
    expect(dry.plan.skipped.before_start).toBe(2)
    expect(dry.config_problems).toEqual(['PAYOUT_FROM not set'])
  })

  test('only exactly "1" switches it on', async () => {
    for (const v of ['true', 'yes', ' 1']) {
      process.env.WISE_PAYOUTS_ENABLED = v
      expect((await (await POST(req('/api/payouts', bearer))).json()).mode).toBe('dry')
    }
    expect(state.wise.calls).toEqual([])
  })
})

describe('/api/webhooks/wise', () => {
  const body = (state_: string, transferId = 50000001, profileId = 154050700) =>
    JSON.stringify({ event_type: 'transfers#state-change', schema_version: '4.0.0', data: { resource: { type: 'transfer', id: transferId, profile_id: profileId }, current_state: state_, occurred_at: '2026-11-02T10:00:00.000Z' } })
  const hook = (raw: string, headers: Record<string, string> = {}) =>
    new NextRequest('https://mapltours.com/api/webhooks/wise', { method: 'POST', body: raw, headers: { 'content-type': 'application/json', ...headers } })
  const sig = (raw: string) => sign('RSA-SHA256', Buffer.from(raw), state.privateKey).toString('base64')

  test('refuses anything not signed by the key, before reading it', async () => {
    const raw = body('outgoing_payment_sent')
    expect((await WEBHOOK(hook(raw))).status).toBe(401)
    expect((await WEBHOOK(hook(raw, { 'x-signature-sha256': sig(raw + ' ') }))).status).toBe(401)
    expect(state.store.writes).toEqual([])
  })

  test('a test notification is acknowledged and changes nothing', async () => {
    const raw = '{"test":true}'
    const res = await WEBHOOK(hook(raw, { 'x-signature-sha256': sig(raw), 'x-test-notification': 'true' }))
    expect(res.status).toBe(200)
    expect(state.store.writes).toEqual([])
  })

  test('another profile, or a transfer that is not ours, is ignored', async () => {
    const other = body('outgoing_payment_sent', 50000001, 999)
    expect((await (await WEBHOOK(hook(other, { 'x-signature-sha256': sig(other) }))).json()).ignored).toBe('another profile')
    const notOurs = body('outgoing_payment_sent', 123)
    expect((await (await WEBHOOK(hook(notOurs, { 'x-signature-sha256': sig(notOurs) }))).json()).outcome).toBe('ignored')
    expect(state.store.writes).toEqual([])
  })

  test('a signed state change for our payout is applied, and money coming back reaches the inbox', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    await POST(req('/api/payouts', bearer)) // pays Collin: transfer 50000001
    const sent = body('outgoing_payment_sent')
    expect((await (await WEBHOOK(hook(sent, { 'x-signature-sha256': sig(sent) }))).json()).outcome).toBe('sent')
    const back = JSON.stringify({ ...JSON.parse(body('funds_refunded')), data: { ...JSON.parse(body('funds_refunded')).data, occurred_at: '2026-11-03T10:00:00.000Z' } })
    expect((await (await WEBHOOK(hook(back, { 'x-signature-sha256': sig(back) }))).json()).outcome).toBe('returned')
    expect(state.sent.join(' ')).toMatch(/came back/)
  })
})

describe('the cron', () => {
  test('does nothing at all until payouts are switched on', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const mod = await import('@/netlify/functions/driver-payouts-cron.mjs')
    const res = await mod.default()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ skipped: 'not enabled' })
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  test('switched on, it calls the route with the bearer and logs counts only', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    const f = vi.fn(async () => new Response(JSON.stringify({ mode: 'live', funded: 1, plan: { payees: [{ payee: 'Collin' }] } }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    const mod = await import('@/netlify/functions/driver-payouts-cron.mjs')
    await mod.default()
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mapltours.com/api/payouts')
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${SECRET}`)
    expect(mod.countsOnly(JSON.stringify({ funded: 1, plan: { payees: [{ payee: 'Collin' }] } }))).toBe('{"funded":1}')
    vi.unstubAllGlobals()
  })
})
