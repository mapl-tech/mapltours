import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { CRM_ERROR_KEY, CRM_FAILURES_KEY, CRM_PAID_KEY, CRM_RETRY_AT_KEY, STUCK_AFTER } from '@/lib/booking-sync'
import { booking, fakeFetch, fetches, makeWorld, stamps, writes, type FakeWorld } from './booking-sync-fakes'

/**
 * The cron route over a fake Supabase and a fake HubSpot/Resend: the gates
 * (secret, HubSpot key) and that dry mode is read-only end to end.
 */

const state = vi.hoisted(() => ({ world: null as unknown as FakeWorld }))

vi.mock('@/lib/supabase/service', async () => {
  const fakes = await import('./booking-sync-fakes')
  return { createServiceClient: () => fakes.fakeSupabase(state.world) }
})

// vi.mock is hoisted above this import, so the handler loads over the fake.
import { GET, POST } from '@/app/api/booking-sync/route'

const SECRET = 'cron-secret-for-tests'

function req(path = '/api/booking-sync', headers: Record<string, string> = {}) {
  return new NextRequest(`https://mapltours.com${path}`, { headers })
}
const bearer = { authorization: `Bearer ${SECRET}` }

describe('GET /api/booking-sync', () => {
  beforeEach(() => {
    state.world = makeWorld([booking({ email: 'Guest@Gmail.com', booking_type: 'transfer', total_paid: 130 })])
    state.world.resendContacts.add('guest@gmail.com')
    process.env.CRON_SECRET = SECRET
    process.env.HUBSPOT_SERVICE_KEY = 'pat-test'
    process.env.RESEND_API_KEY = 're_test'
    vi.stubGlobal('fetch', vi.fn(fakeFetch(state.world)))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.CRON_SECRET
    delete process.env.HUBSPOT_SERVICE_KEY
    delete process.env.RESEND_API_KEY
  })

  test('401 without the bearer, and nothing is read or written', async () => {
    const r = await GET(req())
    expect(r.status).toBe(401)
    expect(state.world.log).toHaveLength(0)
  })

  test('401 with the wrong bearer', async () => {
    const r = await GET(req('/api/booking-sync', { authorization: 'Bearer nope' }))
    expect(r.status).toBe(401)
    expect(state.world.log).toHaveLength(0)
  })

  test('fails closed when CRON_SECRET is unset, even for an empty bearer', async () => {
    delete process.env.CRON_SECRET
    const r = await GET(req('/api/booking-sync', { authorization: 'Bearer ' }))
    expect(r.status).toBe(500)
    expect(state.world.log).toHaveLength(0)
  })

  test('503 without the HubSpot key: nothing called, nothing stamped', async () => {
    delete process.env.HUBSPOT_SERVICE_KEY
    const r = await GET(req('/api/booking-sync', bearer))
    expect(r.status).toBe(503)
    expect(state.world.log).toHaveLength(0)
    expect(state.world.rows[0].dispatch).toBeNull()
  })

  test('with the bearer: syncs, stamps, answers no-store, and logs counts without an address', async () => {
    const r = await GET(req('/api/booking-sync', bearer))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const body = await r.json()
    expect(body).toMatchObject({ ok: true, dry: false, synced: 1, hubspot_created: 1, events_sent: 1 })
    expect(body).not.toHaveProperty('groups')
    expect(JSON.stringify(body)).not.toContain('guest@gmail.com')
    expect(stamps(state.world)).toHaveLength(1)
    expect(state.world.rows[0].dispatch).toHaveProperty(CRM_PAID_KEY)

    const logged = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('"synced":1')
    expect(logged.toLowerCase()).not.toContain('guest@gmail.com')
    expect(logged).not.toContain('g***@')
  })

  test('the secret in the query string is refused (it would land in access logs); POST with the bearer works', async () => {
    const q = await POST(req(`/api/booking-sync?secret=${SECRET}&dry=1`))
    expect(q.status).toBe(401)
    const r = await POST(req('/api/booking-sync?dry=1', bearer))
    expect(r.status).toBe(200)
  })

  test('?dry=1 reads and reports, masked, and writes nothing anywhere', async () => {
    const r = await GET(req('/api/booking-sync?dry=1', bearer))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ ok: true, dry: true, synced: 1 })
    expect(body.groups[0]).toMatchObject({ email: 'g***@gmail.com', hubspot: 'create', resend: 'would_send' })
    expect(JSON.stringify(body)).not.toContain('guest@gmail.com')
    expect(writes(state.world)).toHaveLength(0)
    expect(fetches(state.world).every((e) => e.method === 'GET')).toBe(true)
    expect(state.world.rows[0].dispatch).toBeNull()
  })

  test('a booking still failing after a day of retries is logged at error level, counts only', async () => {
    state.world.rows[0].dispatch = { [CRM_FAILURES_KEY]: STUCK_AFTER - 1, [CRM_RETRY_AT_KEY]: '2026-01-01T00:00:00.000Z', [CRM_ERROR_KEY]: 'hubspot_get_400' }
    state.world.fail.hubspotGet = 400
    const r = await GET(req('/api/booking-sync', bearer))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ failed: 1, stuck: 1 })
    const errors = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(errors).toContain('"stuck":1')
    expect(errors).toContain('hubspot_get_400')
    expect(errors.toLowerCase()).not.toContain('guest@gmail.com')
    expect(errors).not.toContain('g***@')
  })

  test('a failed candidate query answers 500, not an empty success', async () => {
    state.world.fail.candidateQuery = true
    const r = await GET(req('/api/booking-sync', bearer))
    expect(r.status).toBe(500)
    expect(writes(state.world)).toHaveLength(0)
  })
})
