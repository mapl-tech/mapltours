import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AI_ASSISTANT_GROUP,
  aiAssistantLabel,
  attributionLabel,
  browserFamily,
  browserLabel,
  captureAttribution,
  firstTouchLabel,
  getStoredAttribution,
  sanitizeAttribution,
  type Attribution,
} from '../../lib/attribution'
import { aggregateBookings, type ReportBookingRow } from '../../lib/weekly-report'
import { buildPurchaseEvent } from '../../lib/meta-capi'
import { buildPurchasePayload } from '../../lib/ga4-server'
import { BookingCard } from '../../components/admin/BookingsDashboard'
import { GET as llmsTxt } from '../../app/llms.txt/route'

/**
 * Muse, Meta's AI agent (muse.ai, launched Sept 2026), beside ChatGPT and the
 * other AI assistants in booking-source tracking. Labels only: the stored
 * attribution is never rewritten. The admin card and the weekly report name a
 * Muse touch "Muse (Meta AI)" and group every assistant as "AI assistant";
 * the assistants that already reached us keep the host label they always had.
 *
 * Muse's browser presents as ordinary Chrome on Linux, so the checkout also
 * records the booking browser's coarse family (`ua`, e.g. "chrome-linux"),
 * only from a fixed vocabulary, never a version or a device.
 */

const MUSE = 'Muse (Meta AI)'

/** attributionLabel exactly as it was before AI assistants were grouped (origin/main d0e9e8a). */
function labelBefore(a: Attribution | null | undefined): string {
  if (!a) return 'Direct or unknown'
  if (a.source) return a.medium ? `${a.source} / ${a.medium}` : a.source
  if (a.referrer) {
    try { return new URL(a.referrer).hostname.replace(/^www\./, '') } catch { return a.referrer.slice(0, 40) }
  }
  if (a.gclid) return 'google / ads'
  if (a.fbclid) return 'facebook / ads'
  return 'Direct'
}

describe('Muse (Meta AI)', () => {
  test.each([
    'muse', 'Muse', ' MUSE ', 'muse.ai', 'www.muse.ai', 'eu.app.muse.ai', 'MUSE.AI.', 'Muse.AI',
    'https://www.muse.ai/c/1', 'muse.ai/chat?x=1', 'muse.ai:443',
  ])('utm_source %j is Muse', (source) => {
    expect(aiAssistantLabel({ source })).toBe(MUSE)
    expect(attributionLabel({ source })).toBe(MUSE)
  })

  test.each([
    'https://muse.ai/', 'https://www.muse.ai/chat/abc', 'https://x.y.muse.ai/', 'https://MUSE.ai/', 'android-app://com.facebook.aura/',
  ])('the referrer %j alone is Muse', (referrer) => {
    expect(aiAssistantLabel({ referrer })).toBe(MUSE)
    expect(attributionLabel({ referrer, landing: '/transfers' })).toBe(MUSE)
  })

  test.each(['notmuse.ai', 'muse.ai.example.com', 'museum', 'amuse', 'muse-ai', 'muse.aix', 'mymuse', 'muse.a', 'ai.muse'])(
    'the look-alike source %j is not Muse and labels exactly as before',
    (source) => {
      expect(aiAssistantLabel({ source })).toBeNull()
      expect(attributionLabel({ source })).toBe(labelBefore({ source }))
    },
  )

  test.each(['https://notmuse.ai/', 'https://muse.ai.example.com/', 'https://museum.com/', 'https://muse.aix/', 'android-app://com.facebook.katana/'])(
    'the look-alike referrer %j is not Muse and labels exactly as before',
    (referrer) => {
      expect(aiAssistantLabel({ referrer })).toBeNull()
      expect(attributionLabel({ referrer })).toBe(labelBefore({ referrer }))
    },
  )

  test('a tagged medium is kept, the way every tagged source keeps its medium', () => {
    expect(attributionLabel({ source: 'muse', medium: 'agent' })).toBe('Muse (Meta AI) / agent')
    // A medium without a source was never shown, and still is not.
    expect(attributionLabel({ referrer: 'https://www.muse.ai/', medium: 'x' })).toBe(MUSE)
  })

  test('the utm_source wins over the referrer, as it always has', () => {
    const tagged: Attribution = { source: 'bio', medium: 'email', referrer: 'https://www.muse.ai/' }
    expect(aiAssistantLabel(tagged)).toBeNull()
    expect(attributionLabel(tagged)).toBe('bio / email')
    expect(attributionLabel({ source: 'muse', referrer: 'https://www.google.com/' })).toBe(MUSE)
  })

  test('the first touch names Muse too, and one assistant on both touches is not repeated', () => {
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_source: 'muse' })).toBe(MUSE)
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_referrer: 'https://www.muse.ai/c/1' })).toBe(MUSE)
    expect(firstTouchLabel({ source: 'www.muse.ai', first_source: 'muse' })).toBeNull()
    expect(firstTouchLabel({ referrer: 'https://muse.ai/', first_source: 'muse.ai' })).toBeNull()
  })
})

describe('the other AI assistants', () => {
  test.each<[Attribution, string]>([
    [{ source: 'chatgpt.com' }, 'chatgpt.com'],
    [{ source: 'chatgpt' }, 'chatgpt.com'],
    [{ referrer: 'https://chatgpt.com/c/abc' }, 'chatgpt.com'],
    [{ referrer: 'https://chat.openai.com/' }, 'chatgpt.com'],
    [{ referrer: 'android-app://com.openai.chatgpt/' }, 'chatgpt.com'],
    [{ referrer: 'https://www.perplexity.ai/search?q=x' }, 'perplexity.ai'],
    [{ source: 'perplexity' }, 'perplexity.ai'],
    [{ referrer: 'https://claude.ai/chat/1' }, 'claude.ai'],
    [{ source: 'claude' }, 'claude.ai'],
    [{ referrer: 'https://gemini.google.com/app' }, 'gemini.google.com'],
    [{ source: 'gemini' }, 'gemini.google.com'],
    [{ referrer: 'https://copilot.microsoft.com/' }, 'copilot.microsoft.com'],
    [{ source: 'copilot' }, 'copilot.microsoft.com'],
    [{ referrer: 'https://www.meta.ai/' }, 'meta.ai'],
  ])('%j is the AI assistant %s', (a, label) => {
    expect(aiAssistantLabel(a)).toBe(label)
    expect(attributionLabel(a)).toBe(label)
  })

  test('the ones that already reached us read exactly as before', () => {
    for (const a of [
      { source: 'chatgpt.com' }, { source: 'chatgpt.com', medium: 'ai' }, { referrer: 'https://chatgpt.com/c/1' },
      { referrer: 'https://www.perplexity.ai/search?q=x' }, { referrer: 'https://claude.ai/' }, { referrer: 'https://gemini.google.com/' },
      { referrer: 'https://copilot.microsoft.com/' }, { referrer: 'https://www.meta.ai/' }, { source: 'perplexity.ai' },
    ]) {
      expect(attributionLabel(a)).toBe(labelBefore(a))
    }
  })

  test('every touch that is not an AI assistant labels exactly as before', () => {
    for (const a of [
      null, undefined, {}, { landing: '/' },
      { source: 'meta', medium: 'paid' }, { source: 'meta' }, { source: 'facebook', medium: 'paid', fbclid: 'IwAR1' },
      { source: 'google', medium: 'cpc' }, { source: 'bio', medium: 'email' }, { source: 'webmcp', medium: 'browser-agent' },
      { referrer: 'https://www.google.com/' }, { referrer: 'https://l.instagram.com/' }, { referrer: 'https://gemini.example.com/' },
      { referrer: 'https://google.com/gemini' }, { referrer: 'not a url' }, { gclid: 'g1' }, { fbclid: 'IwAR1' },
      { source: 'https://[' }, { source: 'openai' }, { source: 'meta ai' },
    ] as Array<Attribution | null | undefined>) {
      expect(aiAssistantLabel(a)).toBeNull()
      expect(attributionLabel(a)).toBe(labelBefore(a))
    }
  })

  test('never throws on what a hand-edited row might hold', () => {
    for (const odd of [null, undefined, 'muse', 42, [], { source: 42 }, { referrer: {} }, { source: {}, referrer: 'https://muse.ai/' }, { referrer: 'https://[' }]) {
      expect(() => aiAssistantLabel(odd as never)).not.toThrow()
      expect(aiAssistantLabel(odd as never)).toBeNull()
    }
  })
})

describe('weekly report: AI assistants group together', () => {
  const SINCE = '2026-09-21T00:00:00.000Z'
  const UNTIL = '2026-09-28T00:00:00.000Z'
  let n = 0
  const row = (attribution: unknown, over: Partial<ReportBookingRow> = {}): ReportBookingRow => ({
    id: `r${++n}`, email: 'guest@example.org', booking_type: 'transfer', status: 'paid', total_paid: 87.4,
    paid_at: '2026-09-22T15:00:00.000Z', created_at: '2026-09-22T14:00:00.000Z', refunded_at: null, refund_amount: null,
    attribution, ...over,
  })

  test('Muse, tagged or by referrer alone, is one row beside ChatGPT; everything else groups as before', () => {
    const rows = [
      row({ source: 'muse' }),
      row({ source: 'www.muse.ai', medium: 'agent' }),
      row({ referrer: 'https://www.muse.ai/c/1' }, { status: 'pending', paid_at: null }),
      row({ referrer: 'android-app://com.facebook.aura/' }),
      row({ source: 'chatgpt.com' }),
      row({ referrer: 'https://chatgpt.com/' }, { status: 'pending', paid_at: null }),
      row({ referrer: 'https://www.perplexity.ai/' }),
      row({ source: 'bio', medium: 'email', referrer: 'https://www.muse.ai/' }),
      row({ source: 'meta', medium: 'paid' }),
      row({ referrer: 'https://www.google.com/' }),
      row(null),
    ]
    const r = aggregateBookings(rows, SINCE, UNTIL)
    expect(r.attribution).toEqual([
      { source: MUSE, medium: AI_ASSISTANT_GROUP, paid: 3, started: 4 },
      { source: '(direct)', medium: '(none)', paid: 2, started: 2 },
      { source: 'chatgpt.com', medium: AI_ASSISTANT_GROUP, paid: 1, started: 2 },
      { source: 'bio', medium: 'email', paid: 1, started: 1 },
      { source: 'meta', medium: 'paid', paid: 1, started: 1 },
      { source: 'perplexity.ai', medium: AI_ASSISTANT_GROUP, paid: 1, started: 1 },
    ])
    expect(AI_ASSISTANT_GROUP).toBe('AI assistant')
    expect(r.started.count).toBe(11)
    expect(r.paid.count).toBe(9)
  })

  test('reads the stored attribution and never changes it', () => {
    const a = Object.freeze({ source: 'muse', medium: 'agent', referrer: 'https://www.muse.ai/' })
    const before = JSON.stringify(a)
    aggregateBookings([row(a)], SINCE, UNTIL)
    expect(JSON.stringify(a)).toBe(before)
  })

  test('our own agent-muse test bookings never count', () => {
    const r = aggregateBookings([row({ source: 'muse' }, { email: 'agent-muse-ride-1@example.com' })], SINCE, UNTIL)
    expect(r.attribution).toEqual([])
    expect(r.paid.count).toBe(0)
  })
})

describe('admin card', () => {
  const booking = (attribution: Record<string, string> | null) => ({
    id: 'b0000000-0000-4000-8000-000000000002',
    booking_type: 'tour',
    status: 'paid',
    currency: 'usd',
    total_paid: 190,
    paid_at: '2026-09-27T15:00:00.000Z',
    created_at: '2026-09-27T14:55:00.000Z',
    first_name: 'Guest',
    last_name: 'Example',
    booking_items: [{ title: 'Martha Brae Rafting', destination: 'Falmouth', date: '2026-10-02', travelers: 2, price_per_person: 95 }],
    attribution,
  })
  const card = (a: Record<string, string> | null) => renderToStaticMarkup(<BookingCard b={booking(a)} variant="paid" open onToggle={() => {}} />)
  const field = (html: string, k: string) => html.match(new RegExp(`<div[^>]*><span[^>]*>${k}</span>[\\s\\S]*?</div>`))?.[0] ?? ''
  const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  const LAST = { source: 'bio', medium: 'email', landing: '/transfers', ts: '2026-09-27T14:00:00.000Z' }

  test('a Muse booking reads "Muse (Meta AI) · AI assistant"', () => {
    expect(text(field(card({ source: 'muse', landing: '/transfers', ts: LAST.ts }), 'Found via'))).toBe('Found viaMuse (Meta AI) · AI assistant · landed on /transfers')
    expect(text(field(card({ referrer: 'https://www.muse.ai/c/1', landing: '/', ts: LAST.ts }), 'Found via'))).toBe('Found viaMuse (Meta AI) · AI assistant · landed on /')
  })

  test('a ChatGPT booking keeps its label and joins the group', () => {
    expect(text(field(card({ source: 'chatgpt.com', landing: '/', ts: LAST.ts }), 'Found via'))).toBe('Found viachatgpt.com · AI assistant · landed on /')
  })

  test('Muse as the first touch is named in "(first: ...)"', () => {
    expect(text(field(card({ ...LAST, first_source: 'muse', first_landing: '/', first_ts: '2026-09-26T15:00:00.000Z' }), 'Found via')))
      .toBe('Found viabio / email (first: Muse (Meta AI)) · landed on /transfers')
  })

  test('the browser family shows as its own line, and only when recorded', () => {
    expect(text(field(card({ ...LAST, ua: 'chrome-linux' }), 'Browser'))).toBe('BrowserChrome on Linux')
    expect(text(field(card({ ...LAST, ua: 'safari-ios' }), 'Browser'))).toBe('BrowserSafari on iOS')
    expect(card(LAST)).not.toContain('>Browser<')
    expect(card(null)).not.toContain('>Browser<')
    // A tampered row with a full user-agent string shows nothing.
    expect(card({ ...LAST, ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0' })).not.toContain('>Browser<')
    // The Found via field is untouched by it.
    expect(field(card({ ...LAST, ua: 'chrome-linux' }), 'Found via')).toBe(field(card(LAST), 'Found via'))
  })
})

describe('browserFamily', () => {
  test.each([
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'chrome-linux'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36', 'chrome-linux'],
    ['Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36', 'chrome-android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', 'safari-ios'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1', 'chrome-ios'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15', 'firefox-ios'],
    ['Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1', 'safari-ios'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', 'safari-mac'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'chrome-mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'chrome-windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'edge-windows'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0', 'edge-android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0', 'opera-windows'],
    ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36', 'samsung-android'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0', 'firefox-linux'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', 'firefox-windows'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'chrome-chromeos'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0', 'other-ios'],
    ['curl/8.4.0', 'other-other'],
    ['Node.js/24', 'other-other'],
  ])('%s -> %s', (ua, family) => {
    expect(browserFamily(ua)).toBe(family)
  })

  test('null when there is no user agent', () => {
    for (const v of [undefined, null, '', '   ', 42, {}]) expect(browserFamily(v)).toBeNull()
  })

  test('every family it can produce survives the server, has a label, and carries no digits', () => {
    const browsers = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other']
    const systems = ['windows', 'mac', 'ios', 'android', 'chromeos', 'linux', 'other']
    for (const b of browsers) {
      for (const s of systems) {
        const ua = `${b}-${s}`
        expect(sanitizeAttribution({ ua })).toEqual({ ua })
        expect(browserLabel(ua)).toMatch(/^[A-Z][A-Za-z ]+ on [A-Za-z ]+$/)
      }
    }
    expect(browserLabel('chrome-linux')).toBe('Chrome on Linux')
    expect(browserLabel('other-other')).toBe('Another browser on another system')
  })
})

describe('sanitizeAttribution and ua', () => {
  test('keeps a family, drops anything else', () => {
    expect(sanitizeAttribution({ source: 'muse', ua: 'chrome-linux' })).toEqual({ source: 'muse', ua: 'chrome-linux' })
    expect(sanitizeAttribution({ ua: ' chrome-linux\u0000 ' })).toEqual({ ua: 'chrome-linux' })
    for (const ua of ['Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0', 'Chrome-Linux', 'chrome_linux', 'chrome-linux-x', 'chrome-plan9', 'x-linux', '', ' ', 42, null]) {
      expect(sanitizeAttribution({ source: 'bio', ua })).toEqual({ source: 'bio' })
      expect(sanitizeAttribution({ ua })).toBeNull()
    }
  })

  test('input without ua comes out exactly as before', () => {
    const input = { referrer: 'https://www.muse.ai/', source: 'muse', medium: 'agent', landing: '/transfers', ts: '2026-09-27T14:00:00.000Z', ga_client_id: '1.2', dnt: '1' }
    expect(sanitizeAttribution(input)).toEqual(input)
  })
})

describe('getStoredAttribution adds the booking browser as ua', () => {
  const LAST = 'mapl-attribution'
  const CHROME_LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
  let store: Map<string, string>

  function browser(opts: { href?: string; referrer?: string; userAgent?: string | 'throws' | null } = {}) {
    const u = new URL(opts.href ?? 'https://mapltours.com/transfers')
    vi.stubGlobal('window', { location: { pathname: u.pathname, search: u.search, hostname: u.hostname } })
    vi.stubGlobal('document', { referrer: opts.referrer ?? '', cookie: '' })
    const nav: Record<string, unknown> = {}
    if (opts.userAgent === 'throws') Object.defineProperty(nav, 'userAgent', { get() { throw new Error('blocked') } })
    else if (opts.userAgent != null) nav.userAgent = opts.userAgent
    vi.stubGlobal('navigator', nav)
  }

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T15:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('a Muse visit in Chrome on Linux: the stored record is unchanged, the payload adds ua', () => {
    browser({ href: 'https://mapltours.com/transfers?utm_source=muse', userAgent: CHROME_LINUX })
    captureAttribution()
    const stored = store.get(LAST)
    expect(stored).toBe(JSON.stringify({ source: 'muse', landing: '/transfers', ts: '2026-09-27T15:00:00.000Z' }))

    browser({ href: 'https://mapltours.com/transfers/checkout', userAgent: CHROME_LINUX })
    const a = getStoredAttribution()
    expect(a).toEqual({
      source: 'muse', landing: '/transfers', ts: '2026-09-27T15:00:00.000Z',
      first_source: 'muse', first_landing: '/transfers', first_ts: '2026-09-27T15:00:00.000Z',
      ua: 'chrome-linux',
    })
    expect(attributionLabel(a)).toBe(MUSE)
    // ua is read at checkout and never written anywhere.
    expect(store.get(LAST)).toBe(stored)
    for (const v of Array.from(store.values())) expect(v).not.toContain('"ua"')
  })

  test('nothing recorded is still null, whatever the browser', () => {
    browser({ href: 'https://mapltours.com/checkout', userAgent: CHROME_LINUX })
    expect(getStoredAttribution()).toBeNull()
  })

  test('no user agent, or one that throws: the payload is exactly as before', () => {
    const rec = { source: 'bio', medium: 'email', landing: '/', ts: '2026-09-27T14:00:00.000Z' }
    store.set(LAST, JSON.stringify(rec))
    browser({ userAgent: null })
    expect(getStoredAttribution()).toEqual(rec)
    browser({ userAgent: 'throws' })
    expect(getStoredAttribution()).toEqual(rec)
    browser({ userAgent: '' })
    expect(getStoredAttribution()).toEqual(rec)
  })

  test('a ua planted in storage is replaced by the live browser', () => {
    store.set(LAST, JSON.stringify({ source: 'bio', ts: '2026-09-27T14:00:00.000Z', ua: 'Mozilla/5.0 planted' }))
    browser({ userAgent: CHROME_LINUX })
    expect(getStoredAttribution()?.ua).toBe('chrome-linux')
  })
})

describe('readers of bookings.attribution ignore ua and the AI labels', () => {
  const PAID = '2026-09-27T15:00:00.000Z'
  const NOW = Date.parse('2026-09-27T16:00:00.000Z')
  const row = (attribution: Record<string, string>) => ({
    id: 'b0000000-0000-4000-8000-000000000003', booking_type: 'transfer', status: 'paid', total_paid: 87.4, currency: 'usd',
    email: 'guest@example.org', pickup: 'MBJ', dropoff: 'Hotel', paid_at: PAID, created_at: PAID, refunded_at: null, refund_amount: null, attribution,
  })
  const BASE = { source: 'muse', landing: '/transfers', ts: PAID, ga_client_id: '111.222', ga_session_id: '1747323152', fbp: 'fb.1.1725000000000.987654321' }

  afterEach(() => { vi.unstubAllEnvs() })

  test('the Meta Conversions API event is identical with and without ua', () => {
    vi.stubEnv('META_PIXEL_ID', '1234567890')
    vi.stubEnv('META_CAPI_TOKEN', 'test-token')
    const before = buildPurchaseEvent(row(BASE), NOW)
    expect('body' in before).toBe(true)
    expect(buildPurchaseEvent(row({ ...BASE, ua: 'chrome-linux' }), NOW)).toEqual(before)
  })

  test('the GA4 Measurement Protocol payload is identical with and without ua', () => {
    vi.stubEnv('GA4_API_SECRET', 'test-secret')
    const before = buildPurchasePayload(row(BASE), NOW)
    expect('body' in before).toBe(true)
    expect(buildPurchasePayload(row({ ...BASE, ua: 'chrome-linux' }), NOW)).toEqual(before)
  })

  test('the weekly report is identical with and without ua', () => {
    const since = '2026-09-21T00:00:00.000Z'
    const until = '2026-09-28T00:00:00.000Z'
    for (const a of [BASE, { source: 'bio', medium: 'email' }]) {
      expect(aggregateBookings([row({ ...a, ua: 'chrome-linux' })], since, until)).toEqual(aggregateBookings([row(a)], since, until))
    }
  })
})

describe('llms.txt asks agents to tag their links', () => {
  test('names utm_source with an example for Muse, and says it never changes a price', async () => {
    const body = await llmsTxt().text()
    const para = body.split('\n\n').find((p) => p.includes('utm_source')) ?? ''
    expect(para).toContain('add utm_source with your name to the first link you open')
    expect(para).toContain('https://mapltours.com/transfers?utm_source=muse')
    expect(para).toContain('It changes no price, and checkout pages do not read it.')
    expect(para).not.toMatch(/[—–]/)
    // It sits in the section written for AI agents.
    expect(body.indexOf(para)).toBeGreaterThan(body.indexOf('## For AI agents'))
  })

  test('the example links land where capture runs: not a checkout page', () => {
    const body = llmsTxt()
    return body.text().then((t) => {
      for (const m of Array.from(t.matchAll(/https:\/\/mapltours\.com(\/[^\s?]*)\?utm_source=/g))) {
        expect(m[1].startsWith('/checkout') || m[1].startsWith('/transfers/checkout')).toBe(false)
      }
    })
  })
})
