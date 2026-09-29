import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { DAY_MS } from '@/lib/trip-tips/plan'
import { fakeTipsFetch, fetchesTo, makeTipsWorld, subscribe, dbWrites, type TipsWorld } from './trip-tips-fakes'

/**
 * The trip tips cron route over fakes: the bearer gate, the configuration
 * gates, and the send gate (TRIP_TIPS_ENABLED must be exactly '1', and
 * ?dry=1 always wins). Synthetic addresses only.
 */

const state = vi.hoisted(() => ({ world: null as unknown as TipsWorld }))

vi.mock('@/lib/supabase/service', async () => {
  const fakes = await import('./trip-tips-fakes')
  return { createServiceClient: () => fakes.fakeTipsSupabase(state.world) }
})

import { GET, POST } from '@/app/api/trip-tips/route'

const SECRET = 'cron-secret-for-tests'
const NOW = Date.parse('2026-10-01T14:00:00Z')
const bearer = { authorization: `Bearer ${SECRET}` }
const req = (path = '/api/trip-tips', headers: Record<string, string> = {}) => new NextRequest(`https://mapltours.com${path}`, { headers })
const ENV = ['CRON_SECRET', 'RESEND_API_KEY', 'HUBSPOT_SERVICE_KEY', 'TIPS_SEGMENT_ID', 'TRIP_TIPS_SECRET', 'TRIP_TIPS_ENABLED']

describe('GET /api/trip-tips', () => {
  let logs: string[]
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    state.world = makeTipsWorld(NOW)
    subscribe(state.world, 'ana.guest@example.org', new Date(NOW - 30 * DAY_MS).toISOString())
    process.env.CRON_SECRET = SECRET
    process.env.RESEND_API_KEY = 're_test'
    process.env.HUBSPOT_SERVICE_KEY = 'pat-test'
    process.env.TIPS_SEGMENT_ID = 'seg_tips'
    process.env.TRIP_TIPS_SECRET = 'trip-tips-test-secret'
    delete process.env.TRIP_TIPS_ENABLED
    vi.stubGlobal('fetch', vi.fn(fakeTipsFetch(state.world)))
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    for (const k of ENV) delete process.env[k]
  })

  test('401 without the bearer or with the wrong one; nothing read', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('/api/trip-tips', { authorization: 'Bearer nope' }))).status).toBe(401)
    expect((await GET(req('/api/trip-tips?secret=' + SECRET))).status).toBe(401)
    expect(state.world.log).toHaveLength(0)
  })

  test('fails closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('/api/trip-tips', { authorization: 'Bearer ' }))).status).toBe(500)
    expect(state.world.log).toHaveLength(0)
  })

  test.each(['RESEND_API_KEY', 'HUBSPOT_SERVICE_KEY', 'TIPS_SEGMENT_ID'])('503 without %s; nothing read', async (k) => {
    delete process.env[k]
    const r = await GET(req('/api/trip-tips', bearer))
    expect(r.status).toBe(503)
    expect(state.world.log).toHaveLength(0)
  })

  test.each([undefined, '0', 'true', 'yes', ' 1'])('TRIP_TIPS_ENABLED=%s: a dry run, nothing sent or written, counts only', async (v) => {
    if (v !== undefined) process.env.TRIP_TIPS_ENABLED = v
    const r = await GET(req('/api/trip-tips', bearer))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ ok: true, dry: true, enabled: false, would_send: 1, sent: 0 })
    expect(fetchesTo(state.world, '/emails', 'POST')).toHaveLength(0)
    expect(dbWrites(state.world)).toHaveLength(0)
    // Dry only because the gate is off (every cron run until go-live): no
    // per-address plan, not even masked, so the cron's log cannot hold one.
    expect(body).not.toHaveProperty('plans')
    expect(JSON.stringify(body)).not.toContain('ana.guest')
    expect(JSON.stringify(body)).not.toContain('a***@')
  })

  test.each([undefined, '1'])('?dry=1 (TRIP_TIPS_ENABLED=%s) sends nothing and answers the masked plan', async (v) => {
    if (v !== undefined) process.env.TRIP_TIPS_ENABLED = v
    const body = await (await GET(req('/api/trip-tips?dry=1', bearer))).json()
    expect(body).toMatchObject({ dry: true, enabled: v === '1', would_send: 1 })
    expect(fetchesTo(state.world, '/emails', 'POST')).toHaveLength(0)
    expect(dbWrites(state.world)).toHaveLength(0)
    expect(JSON.stringify(body)).not.toContain('ana.guest')
    expect(body.plans).toEqual([{ email: 'a***@example.org', track: 'PROSPECT', key: 'p1_ride_costs', outcome: 'would_send' }])
  })

  test('enabled without TRIP_TIPS_SECRET: 503, nothing read', async () => {
    process.env.TRIP_TIPS_ENABLED = '1'
    delete process.env.TRIP_TIPS_SECRET
    const r = await GET(req('/api/trip-tips', bearer))
    expect(r.status).toBe(503)
    expect(state.world.log).toHaveLength(0)
  })

  test('enabled: sends, answers no-store, and logs counts without any address', async () => {
    process.env.TRIP_TIPS_ENABLED = '1'
    const r = await POST(req('/api/trip-tips', bearer))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json()
    expect(body).toMatchObject({ dry: false, enabled: true, sent: 1 })
    expect(body).not.toHaveProperty('plans')
    expect(state.world.ledger[0]).toMatchObject({ tip_key: 'p1_ride_costs', status: 'sent' })
    expect(logs.join('\n')).not.toContain('ana.guest')
    expect(logs.join('\n')).not.toContain('a***@')
  })

  test('a read that fails answers 500 with a code and sends nothing', async () => {
    process.env.TRIP_TIPS_ENABLED = '1'
    state.world.fail.ledgerRead = true
    const r = await GET(req('/api/trip-tips', bearer))
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'trip tips run failed', detail: 'ledger_read' })
    expect(fetchesTo(state.world, '/emails', 'POST')).toHaveLength(0)
  })
})

describe('the cron function', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.CRON_SECRET
    delete process.env.URL
  })

  test('runs daily at 14:00 UTC and calls the route with the bearer, never the query string', async () => {
    const mod = await import('@/netlify/functions/trip-tips-cron.mjs')
    expect(mod.config).toEqual({ schedule: '0 14 * * *' })
    process.env.CRON_SECRET = 'cron-secret-for-tests'
    process.env.URL = 'https://mapltours.com'
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return new Response('{"ok":true}', { status: 200 }) }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const r = await mod.default()
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://mapltours.com/api/trip-tips')
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer cron-secret-for-tests')
  })

  test('logs counts only: a plan with masked addresses in the answer never reaches the log', async () => {
    const mod = await import('@/netlify/functions/trip-tips-cron.mjs')
    process.env.CRON_SECRET = 'cron-secret-for-tests'
    const answer = JSON.stringify({ ok: true, dry: true, would_send: 2, plans: [{ email: 'a***@example.org', outcome: 'would_send' }, { email: 'b***@example.net', outcome: 'would_send' }] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(answer, { status: 200 })))
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')) })
    await mod.default()
    const log = lines.join('\n')
    expect(log).toContain('"would_send":2')
    expect(log).not.toContain('***@')
    expect(log).not.toContain('plans')
    expect(mod.countsOnly('<html>502</html>')).toBe('unreadable answer, 16 bytes')
  })
})
