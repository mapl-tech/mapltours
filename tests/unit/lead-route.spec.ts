import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { buildLeadEvent } from '../../lib/meta-capi'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))

import { POST } from '@/app/api/lead/route'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
// Netlify's geo header: base64 of a UTF-8 JSON object.
const nfGeo = (code: string) => Buffer.from(JSON.stringify({ city: 'X', country: { code } }), 'utf8').toString('base64')

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
    expect(await r.json()).toEqual({ ok: true, code: 'JAMAICA5', tips: false })

    const up = calls.find((c) => c.url.includes('bio.mapltours.com/api/lead'))!
    // A popup from before the box existed sends no tips fields: that is no consent.
    expect(up.body).toEqual({
      email: 'guest@example.com', source: 'popup-explore', page: 'https://mapltours.com/explore?utm_source=ig', channel: 'site',
      optIn: false, optInDefault: 'checked', country: null,
    })
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

describe('POST /api/lead: the trip-tips box', () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  let upstreamBody: Record<string, unknown> = { ok: true, code: 'JAMAICA5' }

  beforeEach(() => {
    calls.length = 0
    upstreamBody = { ok: true, code: 'JAMAICA5' }
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} })
      return new Response(JSON.stringify(upstreamBody), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const relayed = () => calls.find((c) => c.url.includes('bio.mapltours.com/api/lead'))!.body
  const send = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    const r = await POST(req({ email: 'guest@example.com', place: 'home', ...body }, headers))
    return { r, j: (await r.json()) as { ok?: boolean; tips?: boolean } }
  }

  test('the relay proves itself to the bio with the shared secret, and sends none when unset', async () => {
    const seen: Array<string | null> = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('x-mapl-relay'))
      return new Response(JSON.stringify({ ok: true, code: 'JAMAICA5' }), { status: 200 })
    }))
    process.env.LEAD_RELAY_SECRET = 'relay-secret-for-tests'
    await send({})
    delete process.env.LEAD_RELAY_SECRET
    await send({})
    expect(seen).toEqual(['relay-secret-for-tests', null])
  })

  test('the relay carries the box, its default, and the country Netlify placed the visitor in', async () => {
    upstreamBody = { ok: true, code: 'JAMAICA5', tips: true }
    const { j } = await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('US') })
    expect(relayed()).toMatchObject({ channel: 'site', optIn: true, optInDefault: 'checked', country: 'US' })
    expect(j.tips).toBe(true)
  })

  test('the country comes from the request headers, never from the body', async () => {
    await send({ optIn: true, optInDefault: 'checked', country: 'US' }, { 'x-nf-geo': nfGeo('CA') })
    expect(relayed().country).toBe('CA')
    calls.length = 0
    await send({ optIn: true, optInDefault: 'checked', country: 'US' })
    expect(relayed().country).toBeNull()
  })

  test('x-country is the fallback header, upper-cased', async () => {
    await send({ optIn: true, optInDefault: 'unchecked' }, { 'x-country': 'gb' })
    expect(relayed().country).toBe('GB')
  })

  test('garbage is normalised: only a literal true is a tick, an unreadable default is "checked", a bad country is null', async () => {
    for (const optIn of ['yes', 'true', 1, 'on', null]) {
      calls.length = 0
      const { j } = await send({ optIn, optInDefault: 'unchecked' }, { 'x-nf-geo': nfGeo('US') })
      expect(relayed().optIn, String(optIn)).toBe(false)
      expect(j.tips).toBe(false)
    }
    for (const optInDefault of ['maybe', 'UNCHECKED', '', 0, null, { v: 'unchecked' }]) {
      calls.length = 0
      await send({ optIn: true, optInDefault }, { 'x-nf-geo': nfGeo('CA') })
      expect(relayed().optInDefault, JSON.stringify(optInDefault)).toBe('checked')
    }
    calls.length = 0
    await send({ optIn: true, optInDefault: 'unchecked' }, { 'x-nf-geo': 'not-json!!', 'x-country': 'USA' })
    expect(relayed().country).toBeNull()
  })

  test('the popup may say tips are on only for consent the bio will accept', async () => {
    // Even with the bio saying yes, the local rule still refuses a pre-tick
    // it would not have accepted.
    upstreamBody = { ok: true, code: 'JAMAICA5', tips: true }
    // Pre-ticked outside the US (or unknown): relayed as it came, never "on".
    expect((await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('CA') })).j.tips).toBe(false)
    expect((await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('GB') })).j.tips).toBe(false)
    expect((await send({ optIn: true, optInDefault: 'checked' })).j.tips).toBe(false)
    // Ticked by the visitor: on anywhere.
    expect((await send({ optIn: true, optInDefault: 'unchecked' }, { 'x-nf-geo': nfGeo('CA') })).j.tips).toBe(true)
    // Unticked: off, even in the US.
    expect((await send({ optIn: false, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('US') })).j.tips).toBe(false)
  })

  test('a no from the bio wins', async () => {
    upstreamBody = { ok: true, code: 'JAMAICA5', tips: false }
    expect((await send({ optIn: true, optInDefault: 'unchecked' }, { 'x-nf-geo': nfGeo('US') })).j.tips).toBe(false)
  })

  test('a bio reply without `tips` is a no: an older bio that ignored the box recorded nothing', async () => {
    upstreamBody = { ok: true, code: 'JAMAICA5' }
    expect((await send({ optIn: true, optInDefault: 'unchecked' }, { 'x-nf-geo': nfGeo('CA') })).j.tips).toBe(false)
    expect((await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('US') })).j.tips).toBe(false)
    for (const tips of ['yes', 1, 'true', null]) {
      upstreamBody = { ok: true, code: 'JAMAICA5', tips }
      expect((await send({ optIn: true, optInDefault: 'unchecked' })).j.tips, JSON.stringify(tips)).toBe(false)
    }
  })

  test('a lead with no readable geo header logs one line saying which header arrived, and nothing about the visitor', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': nfGeo('US') })
      expect(warn.mock.calls.some(([m]) => m === '[lead] no geo header')).toBe(false)
      await send({ optIn: true, optInDefault: 'checked' }, { 'x-nf-geo': 'garbage!!' })
      const call = warn.mock.calls.find(([m]) => m === '[lead] no geo header')!
      expect(call[1]).toEqual({ nfGeo: true, xCountry: false })
      expect(JSON.stringify(warn.mock.calls)).not.toContain('guest@example.com')
    } finally {
      warn.mockRestore()
    }
  })

  test('every answer is no-store, for the browser and for the Netlify CDN', async () => {
    const check = (r: Response) => {
      expect(r.headers.get('cache-control')).toBe('no-store')
      expect(r.headers.get('netlify-cdn-cache-control')).toBe('no-store')
    }
    check((await send({ optIn: true, optInDefault: 'unchecked' })).r)
    check((await send({ email: 'nope' })).r)
    check((await send({ website: 'http://spam' })).r)
    upstreamBody = { error: 'down' }
    check((await send({})).r)
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
