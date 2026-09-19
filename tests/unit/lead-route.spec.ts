import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { buildLeadEvent } from '../../lib/meta-capi'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))

import { POST } from '@/app/api/lead/route'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function req(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('https://mapltours.com/api/lead', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (iPhone)', cookie: '_fbp=fb.1.1700000000000.123456; other=x', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/lead (the 5% code popup)', () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  let upstreamReply: { status: number; body: unknown } = { status: 200, body: { ok: true, code: 'JAMAICA5' } }

  beforeEach(() => {
    calls.length = 0
    upstreamReply = { status: 200, body: { ok: true, code: 'JAMAICA5' } }
    process.env.META_PIXEL_ID = '1607953960710055'
    process.env.META_CAPI_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} })
      if (String(url).includes('graph.facebook.com')) return new Response('{"events_received":1}', { status: 200 })
      return new Response(JSON.stringify(upstreamReply.body), { status: upstreamReply.status })
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_PIXEL_ID
    delete process.env.META_CAPI_TOKEN
  })

  test('a good address goes to the bio function as the site channel, then to the main pixel with the browser event id', async () => {
    const r = await POST(req({ email: 'Guest@Example.com ', place: 'explore', page: 'https://mapltours.com/explore?utm_source=ig', eventId: 'evt-12345678' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, code: 'JAMAICA5' })

    const up = calls.find((c) => c.url.includes('bio.mapltours.com/api/lead'))!
    expect(up.body).toEqual({ email: 'guest@example.com', source: 'popup-explore', page: 'https://mapltours.com/explore?utm_source=ig', channel: 'site' })
    expect('eventId' in up.body).toBe(false)

    const meta = calls.find((c) => c.url.includes('graph.facebook.com'))!
    expect(meta.url).toContain('/1607953960710055/events')
    const ev = (meta.body.data as Array<Record<string, unknown>>)[0]
    expect(ev.event_name).toBe('Lead')
    expect(ev.event_id).toBe('evt-12345678')
    expect(ev.event_source_url).toBe('https://mapltours.com/explore?utm_source=ig')
    const ud = ev.user_data as Record<string, unknown>
    expect(ud.em).toEqual([sha('guest@example.com')])
    expect(ud.client_ip_address).toBe('203.0.113.9')
    expect(ud.fbp).toBe('fb.1.1700000000000.123456')
    expect((ev.custom_data as Record<string, unknown>).content_name).toBe('popup-explore')
  })

  test('no event id from the browser (tracking declined): the email still goes, Meta hears nothing', async () => {
    const r = await POST(req({ email: 'guest@example.com', place: 'home', page: 'https://mapltours.com/' }))
    expect(r.status).toBe(200)
    expect(calls.some((c) => c.url.includes('graph.facebook.com'))).toBe(false)
    expect(calls.some((c) => c.url.includes('bio.mapltours.com'))).toBe(true)
  })

  test('the honeypot says yes and calls nobody', async () => {
    const r = await POST(req({ email: 'bot@example.com', website: 'http://spam', place: 'home' }))
    expect(r.status).toBe(200)
    expect(calls.length).toBe(0)
  })

  test('a bad address is refused before anything is sent', async () => {
    const r = await POST(req({ email: 'not-an-email', place: 'home' }))
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toMatch(/email address/)
    expect(calls.length).toBe(0)
  })

  test('the bio refusing an address passes its sentence through; a bio outage is a generic 502', async () => {
    upstreamReply = { status: 502, body: { error: 'That address was refused by our email provider. Try another one.' } }
    let r = await POST(req({ email: 'guest@example.com', place: 'home' }))
    expect(r.status).toBe(502)
    expect(((await r.json()) as { error: string }).error).toMatch(/refused by our email provider/)

    upstreamReply = { status: 500, body: { error: 'Email is not configured yet. Please try again later.' } }
    r = await POST(req({ email: 'guest@example.com', place: 'home' }))
    expect(r.status).toBe(502)
    expect(((await r.json()) as { error: string }).error).toBe('We could not send it just now. Try again in a moment.')
  })

  test('the transfers page is a known place', async () => {
    await POST(req({ email: 'guest@example.com', place: 'transfers', page: 'https://mapltours.com/transfers' }))
    expect(calls.find((c) => c.url.includes('bio.mapltours.com'))!.body.source).toBe('popup-transfers')
  })

  test('an unknown place is treated as home; a stray page URL is dropped', async () => {
    await POST(req({ email: 'guest@example.com', place: '../admin', page: 'javascript:alert(1)' }))
    const up = calls.find((c) => c.url.includes('bio.mapltours.com'))!
    expect(up.body.source).toBe('popup-home')
    expect(up.body.page).toBe('')
  })
})

describe('buildLeadEvent', () => {
  beforeEach(() => { process.env.META_PIXEL_ID = '1607953960710055'; process.env.META_CAPI_TOKEN = 'test-token' })
  afterEach(() => { delete process.env.META_PIXEL_ID; delete process.env.META_CAPI_TOKEN })

  test('skips without the env, an event id, or a usable email', () => {
    delete process.env.META_CAPI_TOKEN
    expect(buildLeadEvent({ email: 'a@b.co', eventId: 'evt-12345678' })).toHaveProperty('skipped')
    process.env.META_CAPI_TOKEN = 'test-token'
    expect(buildLeadEvent({ email: 'a@b.co', eventId: 'short' })).toHaveProperty('skipped')
    expect(buildLeadEvent({ email: 'nope', eventId: 'evt-12345678' })).toHaveProperty('skipped')
  })

  test('an off-site source url falls back to the home page', () => {
    const p = buildLeadEvent({ email: 'a@b.co', eventId: 'evt-12345678', sourceUrl: 'https://evil.example/x' }, 1_700_000_000_000)
    expect('body' in p && (p.body.data as Array<Record<string, unknown>>)[0].event_source_url).toBe('https://mapltours.com/')
    expect('body' in p && (p.body.data as Array<Record<string, unknown>>)[0].event_time).toBe(1_700_000_000)
  })
})
