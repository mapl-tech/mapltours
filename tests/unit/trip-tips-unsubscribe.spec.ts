import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  COPY,
  MAILTO_UNSUBSCRIBE,
  footerLine,
  handleUnsubscribe,
  listUnsubscribeHeaders,
  pages,
  signStop,
  unsubscribeUrl,
  verifyStop,
} from '@/lib/trip-tips/unsubscribe'

/**
 * The signed stop link and the endpoint behind it: signing, verification,
 * the inert GET, the confirm POST, the RFC 8058 one-click POST, and that a
 * stop is only ever a stop. Synthetic addresses only.
 */

const SECRET = 'trip-tips-test-secret'
const EMAIL = 'ana_guest+jm@example.org'
const env = { TRIP_TIPS_SECRET: SECRET, RESEND_API_KEY: 're_test' }

function linkParts(email = EMAIL) {
  const u = new URL(unsubscribeUrl(email, SECRET))
  return { url: u.toString(), e: u.searchParams.get('e')!, t: u.searchParams.get('t')! }
}

type Call = { method: string; url: string; body: unknown }
function resendFake(status = 200) {
  const calls: Call[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: (init?.method ?? 'GET').toUpperCase(), url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (status === 0) throw new TypeError('fetch failed')
    return new Response(JSON.stringify({ object: 'contact', id: 'c1' }), { status })
  }) as typeof fetch
  return { f, calls }
}

describe('signing', () => {
  test('the token is HMAC-SHA256 over "trip-tips:v1:stop:<lower-cased email>", base64url', () => {
    const want = createHmac('sha256', SECRET).update(`trip-tips:v1:stop:${EMAIL}`).digest('base64url')
    expect(signStop(EMAIL, SECRET)).toBe(want)
    expect(signStop(` ${EMAIL.toUpperCase()} `, SECRET)).toBe(want)
  })

  test('the link is on mapltours.com and carries the address and the token', () => {
    const { url, e, t } = linkParts()
    expect(url.startsWith('https://mapltours.com/api/trip-tips/unsubscribe?e=')).toBe(true)
    expect(Buffer.from(e, 'base64url').toString('utf8')).toBe(EMAIL)
    expect(verifyStop(e, t, SECRET)).toBe(EMAIL)
  })

  test('anything we did not sign is refused', () => {
    const { e, t } = linkParts()
    const other = linkParts('ben@example.net')
    expect(verifyStop(e, t, 'another-secret')).toBeNull()
    expect(verifyStop(e, other.t, SECRET)).toBeNull()
    expect(verifyStop(other.e, t, SECRET)).toBeNull()
    expect(verifyStop(`${e}=`, t, SECRET)).toBeNull()
    expect(verifyStop(e, `${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`, SECRET)).toBeNull()
    expect(verifyStop(e, t.slice(0, 20), SECRET)).toBeNull()
    expect(verifyStop(e, t, '')).toBeNull()
    for (const v of [null, undefined, 42, '', 'short']) {
      expect(verifyStop(v, t, SECRET)).toBeNull()
      expect(verifyStop(e, v, SECRET)).toBeNull()
    }
    // An upper-case address, even correctly signed, is not a link we make.
    const upper = Buffer.from('Ana@Example.org').toString('base64url')
    expect(verifyStop(upper, createHmac('sha256', SECRET).update('trip-tips:v1:stop:Ana@Example.org').digest('base64url'), SECRET)).toBeNull()
  })

  test('every address the job mails verifies, so its stop link and one-click work', async () => {
    // normalizeEmail (lib/booking-sync.ts) accepts these, so the job mails
    // them; the link must come back as the same address.
    for (const addr of ['jane~trips@example.org', 'o&m@example.org', 'a#b@example.org', 'josé@example.org', "o'neil@example.ie", 'x@sub.example.co.uk']) {
      const { url, e, t } = linkParts(addr)
      expect(verifyStop(e, t, SECRET), addr).toBe(addr)
      const { f, calls } = resendFake()
      expect((await handleUnsubscribe(new Request(url), env, f)).status, addr).toBe(200)
      const one = await handleUnsubscribe(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), env, f, () => {})
      expect(one.status, addr).toBe(200)
      expect(calls, addr).toHaveLength(1)
    }
    // Still refused: control characters and anything longer than an address can be.
    const ctl = linkParts('a\u0001b@example.org')
    expect(verifyStop(ctl.e, ctl.t, SECRET)).toBeNull()
    const long = linkParts(`${'a'.repeat(320)}@example.org`)
    expect(verifyStop(long.e, long.t, SECRET)).toBeNull()
  })

  test('the header names both routes, https first, and asks for one-click', () => {
    const { url } = linkParts()
    expect(listUnsubscribeHeaders(url)).toEqual({
      'List-Unsubscribe': `<${url}>, <${MAILTO_UNSUBSCRIBE}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(MAILTO_UNSUBSCRIBE).toBe('mailto:contact@mapltours.com?subject=stop')
  })
})

describe('the endpoint', () => {
  let logs: string[]
  const log = (l: string) => { logs.push(l) }
  beforeEach(() => { logs = [] })

  test('GET shows the confirm page and records nothing', async () => {
    const { url, e, t } = linkParts()
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request(url), env, f, log)
    expect(r.status).toBe(200)
    const html = await r.text()
    expect(html).toContain(COPY.heading)
    expect(html).toContain('ana_guest+jm@example.org')
    expect(html).toContain('method="post" action="/api/trip-tips/unsubscribe"')
    expect(html).toContain(`name="e" value="${e}"`)
    expect(html).toContain(`name="t" value="${t}"`)
    expect(calls).toHaveLength(0)
    expect(logs).toHaveLength(0)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-frame-options')).toBe('DENY')
    expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    expect(r.headers.get('content-security-policy')).toContain("form-action 'self'")
  })

  test('HEAD answers without a body and records nothing', async () => {
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request(linkParts().url, { method: 'HEAD' }), env, f, log)
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('')
    expect(calls).toHaveLength(0)
  })

  test('a broken link gets the way out by email, and nothing is called', async () => {
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe?e=abcd&t=nope'), env, f, log)
    expect(r.status).toBe(400)
    expect(await r.text()).toContain('contact@mapltours.com')
    expect(calls).toHaveLength(0)
  })

  test('without the secret nothing can be checked: 503', async () => {
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request(linkParts().url), { RESEND_API_KEY: 're_test' }, f, log)
    expect(r.status).toBe(503)
    expect(calls).toHaveLength(0)
  })

  test('the page button records the stop: one PATCH, unsubscribed true, then the done page', async () => {
    const { e, t } = linkParts()
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ e, t }).toString(),
    }), env, f, log)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain(COPY.done)
    expect(calls).toEqual([{ method: 'PATCH', url: 'https://api.resend.com/contacts/ana_guest%2Bjm@example.org', body: { unsubscribed: true } }])
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0])).toEqual({ event: 'stopped', email: 'a***@example.org', via: 'page', ok: true, status: 200 })
    expect(logs[0]).not.toContain('ana_guest')
  })

  test.each([
    ['urlencoded', 'application/x-www-form-urlencoded'],
    ['multipart', 'multipart/form-data'],
  ])('a mail client\'s one-click POST (%s) records the stop directly and answers 200 with no redirect', async (_l, type) => {
    const { url } = linkParts()
    const { f, calls } = resendFake()
    const body = type === 'multipart/form-data'
      ? (() => { const fd = new FormData(); fd.set('List-Unsubscribe', 'One-Click'); return fd })()
      : 'List-Unsubscribe=One-Click'
    const init: RequestInit = { method: 'POST', body }
    if (typeof body === 'string') init.headers = { 'content-type': type }
    const r = await handleUnsubscribe(new Request(url, init), env, f, log)
    expect(r.status).toBe(200)
    expect(r.headers.get('location')).toBeNull()
    expect(r.headers.get('content-type')).toContain('text/plain')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'PATCH', body: { unsubscribed: true } })
    expect(JSON.parse(logs[0]).via).toBe('one_click')
  })

  test('Resend having no contact is a stop already: done', async () => {
    const { e, t } = linkParts()
    const { f } = resendFake(404)
    const r = await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `e=${e}&t=${t}`,
    }), env, f, log)
    expect(r.status).toBe(200)
  })

  test.each([500, 0])('a failed stop (%s) says so and offers the button again; one-click answers 502', async (status) => {
    const { url, e, t } = linkParts()
    const page = await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `e=${e}&t=${t}`,
    }), env, resendFake(status).f, log)
    expect(page.status).toBe(502)
    const html = await page.text()
    expect(html).toContain(COPY.retry)
    expect(html).toContain(`name="t" value="${t}"`)

    const one = await handleUnsubscribe(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), env, resendFake(status).f, log)
    expect(one.status).toBe(502)
  })

  test('a POST with a bad token records nothing', async () => {
    const { e } = linkParts()
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request(`https://mapltours.com/api/trip-tips/unsubscribe?e=${e}&t=${'A'.repeat(43)}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click',
    }), env, f, log)
    expect(r.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('without the Resend key a valid stop cannot be recorded: 503, nothing called', async () => {
    const { e, t } = linkParts()
    const { f, calls } = resendFake()
    const r = await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `e=${e}&t=${t}`,
    }), { TRIP_TIPS_SECRET: SECRET }, f, log)
    expect(r.status).toBe(503)
    expect(calls).toHaveLength(0)
  })

  test('other methods are refused', async () => {
    const r = await handleUnsubscribe(new Request(linkParts().url, { method: 'PUT' }), env, resendFake().f, log)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('GET, HEAD, POST')
  })

  test('nothing here ever lifts a stop', async () => {
    const { url, e, t } = linkParts()
    const { f, calls } = resendFake()
    await handleUnsubscribe(new Request(url), env, f, log)
    await handleUnsubscribe(new Request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }), env, f, log)
    await handleUnsubscribe(new Request('https://mapltours.com/api/trip-tips/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `e=${e}&t=${t}&unsubscribed=false` }), env, f, log)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c.body).toEqual({ unsubscribed: true })
  })
})

describe('the page copy', () => {
  const all = [pages.confirm(EMAIL, 'e', 't'), pages.done(), pages.broken(), pages.sorry(), pages.retry('e', 't')]
  const visible = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ')

  test('no em or en dashes, no exclamation marks, the brand in mixed case, and no mailing address by default', () => {
    for (const html of all) {
      const text = visible(html)
      expect(text).not.toMatch(/[–—]/)
      expect(text).not.toContain('!')
      expect(text).not.toMatch(/MAPL TOURS/)
      expect(text).toContain('MAPL Tours Jamaica')
      // Owner, Sept 27 2026: no address. The footer names the brand and links the privacy page.
      expect(html).toMatch(/<footer><p>MAPL Tours Jamaica\. <a href="https:\/\/mapltours\.com\/privacy">Privacy<\/a><\/p><\/footer>/)
      expect(html).not.toMatch(/Jimmy Cliff|Boulevard|St\. James/)
    }
  })

  test('the footer carries the mailing address once one is set', () => {
    expect(footerLine()).toBe('MAPL Tours Jamaica')
    expect(footerLine('MAPL Tours Jamaica, PO Box 123, Montego Bay')).toBe('MAPL Tours Jamaica, PO Box 123, Montego Bay')
    expect(footerLine('  ')).toBe('MAPL Tours Jamaica')
  })

  test('the address shown is escaped', () => {
    expect(pages.confirm('<b>@example.org', 'e', 't')).toContain('&lt;b&gt;@example.org')
  })

  test('the gold button carries the dark ink', () => {
    expect(pages.confirm(EMAIL, 'e', 't')).toContain('background:#A58326;color:#1A1508')
  })
})

describe('the Next route', () => {
  beforeEach(() => {
    process.env.TRIP_TIPS_SECRET = SECRET
    process.env.RESEND_API_KEY = 're_test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.TRIP_TIPS_SECRET
    delete process.env.RESEND_API_KEY
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('is never prerendered or cached, and answers GET, HEAD and POST', async () => {
    const mod = await import('@/app/api/trip-tips/unsubscribe/route')
    expect(mod.dynamic).toBe('force-dynamic')
    expect(mod.revalidate).toBe(0)
    expect(mod.runtime).toBe('nodejs')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.HEAD).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })

  test('wires the environment: a one-click POST reaches Resend', async () => {
    const { f, calls } = resendFake()
    vi.stubGlobal('fetch', f)
    const mod = await import('@/app/api/trip-tips/unsubscribe/route')
    const r = await mod.POST(new Request(linkParts().url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' }))
    expect(r.status).toBe(200)
    expect(calls).toHaveLength(1)
  })
})
