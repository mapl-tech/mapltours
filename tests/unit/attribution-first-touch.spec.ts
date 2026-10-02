import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  attributionLabel,
  captureAttribution,
  firstTouchLabel,
  getStoredAttribution,
  markAgentAttribution,
  sanitizeAttribution,
  trackingOptedOut,
} from '../../lib/attribution'
import { buildPurchaseEvent } from '../../lib/meta-capi'
import { buildPurchasePayload } from '../../lib/ga4-server'
import { aggregateBookings } from '../../lib/weekly-report'

/**
 * First-touch attribution (lib/attribution): a second localStorage record
 * that keeps the FIRST outside landing beside the existing last-non-direct
 * one, and rides to the checkout as flat first_* keys.
 *
 * The motivating booking: a visitor came from chatgpt.com, took the 5% code,
 * and booked 23 hours later from the code email. The booking said only
 * "bio / email". These tests pin that the first touch now survives, and that
 * the last-touch record is exactly what it was before.
 *
 * Runs in node: window, document, navigator and localStorage are stubbed per
 * test, and Date is faked so ages and expiry are exact.
 */

const LAST = 'mapl-attribution'
const FIRST = 'mapl-first-touch'
const T0 = new Date('2026-10-01T15:00:00.000Z')
const HOUR = 3_600_000
const DAY = 86_400_000
const iso = (offsetMs = 0) => new Date(T0.getTime() + offsetMs).toISOString()

class MemoryStorage {
  data = new Map<string, string>()
  getItem(k: string): string | null { return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string): void { this.data.set(k, String(v)) }
  removeItem(k: string): void { this.data.delete(k) }
  clear(): void { this.data.clear() }
}

let store: MemoryStorage
let windowExtras: Record<string, unknown>
let cookieJar: string

/** Put the stubbed browser on `href`, arriving from `referrer`. */
function page(href: string, referrer = '') {
  const u = new URL(href)
  vi.stubGlobal('window', { ...windowExtras, location: { pathname: u.pathname, search: u.search, hostname: u.hostname } })
  vi.stubGlobal('document', { referrer, cookie: cookieJar })
}
/** A page load: what LayoutShell does on every page. */
function visit(href: string, referrer = '') {
  page(href, referrer)
  captureAttribution()
}
const read = (key: string, s: { getItem(k: string): string | null } = store) => {
  const raw = s.getItem(key)
  return raw == null ? null : JSON.parse(raw)
}
const at = (offsetMs: number) => vi.setSystemTime(new Date(T0.getTime() + offsetMs))
const firstKeys = (a: Record<string, unknown> | null) => Object.keys(a ?? {}).filter((k) => k.startsWith('first_'))
const realPerformance = globalThis.performance
/** The Navigation Timing entry this document was loaded with (its URL). */
function navigationEntry(url: string | 'throws') {
  vi.stubGlobal('performance', {
    now: () => realPerformance.now(),
    getEntriesByType: (t: string) => {
      if (url === 'throws') throw new Error('unsupported')
      return t === 'navigation' ? [{ name: url }] : []
    },
  })
}

beforeEach(() => {
  store = new MemoryStorage()
  windowExtras = {}
  cookieJar = ''
  vi.stubGlobal('localStorage', store)
  vi.stubGlobal('navigator', {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('first touch: capture', () => {
  test('ChatGPT first, the code email 23 h later: first stays chatgpt.com, last becomes bio / email', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    at(23 * HOUR)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email&utm_campaign=code')

    expect(read(FIRST)).toEqual({ source: 'chatgpt.com', referrer: 'https://chatgpt.com/', landing: '/', ts: iso() })
    // The last touch is written exactly as before this change, key for key.
    expect(store.getItem(LAST)).toBe(JSON.stringify({ source: 'bio', medium: 'email', campaign: 'code', landing: '/transfers', ts: iso(23 * HOUR) }))

    const a = getStoredAttribution()
    expect(a).toEqual({
      source: 'bio', medium: 'email', campaign: 'code', landing: '/transfers', ts: iso(23 * HOUR),
      first_source: 'chatgpt.com', first_referrer: 'https://chatgpt.com/', first_landing: '/', first_ts: iso(),
    })
    expect(attributionLabel(a)).toBe('bio / email')
    expect(firstTouchLabel(a)).toBe('chatgpt.com')
  })

  test('the ChatGPT referrer alone, with no UTM, is a first touch', () => {
    visit('https://mapltours.com/tours/rafting', 'https://chatgpt.com/c/abc')
    expect(read(FIRST)).toEqual({ referrer: 'https://chatgpt.com/c/abc', landing: '/tours/rafting', ts: iso() })
    expect(read(LAST)).toEqual({ referrer: 'https://chatgpt.com/c/abc', landing: '/tours/rafting', ts: iso() })
  })

  test('a direct revisit, or one from our own pages, changes neither record', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    at(23 * HOUR)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')
    const first = store.getItem(FIRST)
    const last = store.getItem(LAST)

    at(2 * DAY)
    visit('https://mapltours.com/explore')
    visit('https://mapltours.com/transfers', 'https://mapltours.com/')
    visit('https://mapltours.com/transfers', 'https://bio.mapltours.com/')
    expect(store.getItem(FIRST)).toBe(first)
    expect(store.getItem(LAST)).toBe(last)
  })

  test('later outside visits never overwrite a live first touch', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    const first = store.getItem(FIRST)
    at(DAY)
    visit('https://mapltours.com/', 'https://www.google.com/')
    at(2 * DAY)
    visit('https://mapltours.com/?utm_source=facebook&utm_medium=paid&fbclid=IwAR1')
    expect(store.getItem(FIRST)).toBe(first)
    expect(read(LAST)).toEqual({ source: 'facebook', medium: 'paid', fbclid: 'IwAR1', landing: '/', ts: iso(2 * DAY) })
  })

  test('a direct first landing is not a first touch; the first landing with signal is', () => {
    visit('https://mapltours.com/')
    expect(store.getItem(FIRST)).toBeNull()
    expect(read(LAST)).toEqual({ landing: '/', ts: iso() })

    at(HOUR)
    visit('https://mapltours.com/explore?utm_source=chatgpt.com')
    expect(read(FIRST)).toEqual({ source: 'chatgpt.com', landing: '/explore', ts: iso(HOUR) })
  })

  test('a click id alone is signal, and the first touch keeps the click id', () => {
    visit('https://mapltours.com/?gclid=abc123')
    expect(read(FIRST)).toEqual({ gclid: 'abc123', landing: '/', ts: iso() })
    expect(read(LAST)).toEqual({ gclid: 'abc123', landing: '/', ts: iso() })
    const a = getStoredAttribution()!
    expect(firstKeys(a).sort()).toEqual(['first_gclid', 'first_landing', 'first_ts'])
  })

  test('an ad click with no UTM or referrer, then the code email: the ad keeps the first-touch credit', () => {
    // An Instagram in-app ad click: fbclid only, no url_tags, no referrer.
    visit('https://mapltours.com/?fbclid=IwAR1')
    at(DAY)
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    at(2 * DAY)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')

    expect(read(FIRST)).toEqual({ fbclid: 'IwAR1', landing: '/', ts: iso() })
    const a = getStoredAttribution()!
    expect(attributionLabel(a)).toBe('bio / email')
    expect(firstTouchLabel(a)).toBe('facebook / ads')
    expect(a.first_fbclid).toBe('IwAR1')
    // The last touch, which the Conversions API reads, has no click id: the
    // first touch's never reaches an ad platform (see the readers test below).
    expect(a.fbclid).toBeUndefined()

    store.clear()
    at(0)
    visit('https://mapltours.com/transfers?gclid=g1')
    at(HOUR)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')
    expect(firstTouchLabel(getStoredAttribution())).toBe('google / ads')
  })

  test('nothing is captured on checkout and confirm pages, for either record', () => {
    visit('https://mapltours.com/checkout?utm_source=chatgpt.com')
    visit('https://mapltours.com/transfers/checkout', 'https://chatgpt.com/')
    visit('https://mapltours.com/transfers/confirm?payment_intent=pi_x', 'https://hooks.stripe.com/')
    expect(store.getItem(FIRST)).toBeNull()
    expect(store.getItem(LAST)).toBeNull()
  })

  test('the first touch uses the last touch\'s scrubbing and length caps', () => {
    const long = 'x'.repeat(500)
    visit(`https://mapltours.com/?utm_source=chat%00gpt${long}&utm_campaign=%0Aspring%0A`, `https://chatgpt.com/${long}`)
    const first = read(FIRST)
    const last = read(LAST)
    for (const k of ['source', 'campaign', 'referrer', 'landing', 'ts']) expect(first[k]).toBe(last[k])
    expect(first.source).toHaveLength(200)
    expect(first.source.startsWith('chatgpt')).toBe(true)
    expect(first.campaign).toBe('spring')
    expect(first.referrer).toHaveLength(300)
  })
})

describe('first touch: coming back from sign-in or payment is not how anyone found us', () => {
  // The last touch has always recorded these landings (and the next outside
  // visit replaces it); these tests pin that it still writes them byte for
  // byte, while the first touch, which nothing replaces for 90 days, skips them.
  const returns: Array<[string, string, string]> = [
    ['Google sign-in, back through /auth/callback', 'https://mapltours.com/experience/martha-brae-rafting', 'https://accounts.google.com/'],
    ['Apple sign-in', 'https://mapltours.com/saved', 'https://appleid.apple.com/'],
    ['a Supabase auth page', 'https://mapltours.com/saved', 'https://abcdefghij.supabase.co/'],
    ['a Stripe redirect page', 'https://mapltours.com/gifts', 'https://hooks.stripe.com/'],
    ['stripe.com itself', 'https://mapltours.com/', 'https://stripe.com/'],
  ]
  for (const [name, href, ref] of returns) {
    test(`${name}: no first touch; the last touch is written as before`, () => {
      visit(href, ref)
      expect(store.getItem(FIRST)).toBeNull()
      expect(store.getItem(LAST)).toBe(JSON.stringify({ referrer: ref, landing: new URL(href).pathname, ts: iso() }))
      expect(firstKeys(getStoredAttribution())).toEqual([])
    })
  }

  test('a gift-card payment return from a provider page, params still in the address bar', () => {
    visit('https://mapltours.com/gifts?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_2&redirect_status=succeeded', 'https://pay.klarna.com/')
    expect(store.getItem(FIRST)).toBeNull()
    expect(store.getItem(LAST)).toBe(JSON.stringify({ referrer: 'https://pay.klarna.com/', landing: '/gifts', ts: iso() }))
  })

  test('the same return after GiftCardsView scrubbed the address bar: the navigation entry still shows it', () => {
    // Child effects run before LayoutShell's, so GiftCardsView's replaceState
    // can empty location.search before captureAttribution reads it.
    navigationEntry('https://mapltours.com/gifts?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_2&redirect_status=succeeded')
    visit('https://mapltours.com/gifts', 'https://acs.examplebank.com/')
    expect(store.getItem(FIRST)).toBeNull()
    expect(store.getItem(LAST)).toBe(JSON.stringify({ referrer: 'https://acs.examplebank.com/', landing: '/gifts', ts: iso() }))
  })

  test('a setup_intent return counts too', () => {
    visit('https://mapltours.com/profile?setup_intent=seti_1&redirect_status=succeeded', 'https://acs.examplebank.com/')
    expect(store.getItem(FIRST)).toBeNull()
  })

  test('a Supabase email link (?code=) opened from webmail is not a first touch', () => {
    visit('https://mapltours.com/profile?code=4f1c2d', 'https://mail.google.com/')
    visit('https://mapltours.com/login?code=9a8b7c', 'https://outlook.live.com/')
    expect(store.getItem(FIRST)).toBeNull()
    expect(read(LAST)).toEqual({ referrer: 'https://outlook.live.com/', landing: '/login', ts: iso() })
  })

  test('a campaign link that also carries code= is still a first touch', () => {
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email&code=JAMAICA5', 'https://mail.google.com/')
    expect(read(FIRST)).toEqual({ source: 'bio', medium: 'email', referrer: 'https://mail.google.com/', landing: '/transfers', ts: iso() })
  })

  test('hosts that only look like sign-in or payment hosts are ordinary referrers', () => {
    visit('https://mapltours.com/', 'https://stripe.com.example.net/')
    expect(read(FIRST)).toEqual({ referrer: 'https://stripe.com.example.net/', landing: '/', ts: iso() })
    store.clear()
    visit('https://mapltours.com/', 'https://notsupabase.co/')
    expect(read(FIRST)).toEqual({ referrer: 'https://notsupabase.co/', landing: '/', ts: iso() })
    store.clear()
    visit('https://mapltours.com/', 'https://www.google.com/')
    expect(read(FIRST)).toEqual({ referrer: 'https://www.google.com/', landing: '/', ts: iso() })
  })

  test('a sign-in return leaves the slot open for the real first touch', () => {
    visit('https://mapltours.com/experience/martha-brae-rafting', 'https://accounts.google.com/')
    at(DAY)
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    at(2 * DAY)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')
    const a = getStoredAttribution()!
    expect(attributionLabel(a)).toBe('bio / email')
    expect(firstTouchLabel(a)).toBe('chatgpt.com')
    expect(a.first_ts).toBe(iso(DAY))
  })

  test('a first touch from before the sign-in is kept', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    const first = store.getItem(FIRST)
    at(HOUR)
    visit('https://mapltours.com/saved', 'https://accounts.google.com/')
    expect(store.getItem(FIRST)).toBe(first)
  })

  test('Navigation Timing that throws: the address bar and referrer still decide', () => {
    navigationEntry('throws')
    visit('https://mapltours.com/saved', 'https://accounts.google.com/')
    expect(store.getItem(FIRST)).toBeNull()
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    expect(read(FIRST)).toEqual({ source: 'chatgpt.com', landing: '/', ts: iso() })
  })
})

describe('first touch: expiry', () => {
  test('a first touch dated more than a day ahead (written on a fast clock) counts as absent', () => {
    // Written while the device clock ran a year fast, then the clock was fixed.
    store.setItem(FIRST, JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso(365 * DAY) }))
    expect(getStoredAttribution()).toBeNull()
    visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
    expect(read(FIRST)).toEqual({ source: 'google', medium: 'cpc', landing: '/', ts: iso() })
    expect(getStoredAttribution()!.first_source).toBe('google')
  })

  test('a few hours of clock skew is tolerated', () => {
    store.setItem(FIRST, JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso(6 * HOUR) }))
    visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
    expect(read(FIRST).source).toBe('chatgpt.com')
    expect(getStoredAttribution()!.first_source).toBe('chatgpt.com')
  })

  test('live for 90 days, then absent; the next landing with signal becomes the new first touch', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')

    at(89 * DAY)
    visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
    expect(read(FIRST).source).toBe('chatgpt.com')
    expect(getStoredAttribution()!.first_source).toBe('chatgpt.com')

    at(91 * DAY)
    expect(firstKeys(getStoredAttribution())).toEqual([])
    visit('https://mapltours.com/explore') // direct: does not start a first touch
    expect(read(FIRST).source).toBe('chatgpt.com')
    expect(firstKeys(getStoredAttribution())).toEqual([])

    at(92 * DAY)
    visit('https://mapltours.com/?utm_source=bio&utm_medium=email')
    expect(read(FIRST)).toEqual({ source: 'bio', medium: 'email', landing: '/', ts: iso(92 * DAY) })
  })
})

describe('first touch: corrupt storage counts as absent', () => {
  const corrupt = [
    '{not json',
    '"chatgpt.com"',
    '42',
    'null',
    '[]',
    '{"source":"chatgpt.com"}',
    '{"source":"chatgpt.com","ts":"garbage"}',
    '{"source":"chatgpt.com","ts":42}',
  ]
  for (const raw of corrupt) {
    test(`stored ${raw}`, () => {
      visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
      store.setItem(FIRST, raw)
      const a = getStoredAttribution()
      expect(a).toEqual({ source: 'google', medium: 'cpc', landing: '/', ts: iso() })

      at(HOUR)
      visit('https://mapltours.com/explore?utm_source=bio&utm_medium=email')
      expect(read(FIRST)).toEqual({ source: 'bio', medium: 'email', landing: '/explore', ts: iso(HOUR) })
    })
  }

  test('a tampered first touch reaches the payload as scrubbed, capped strings only', () => {
    visit('https://mapltours.com/?utm_source=google')
    store.setItem(FIRST, JSON.stringify({ source: { x: 1 }, medium: 5, campaign: 'a\u0000b', referrer: 'r'.repeat(400), extra: 'no', ts: iso() }))
    const a = getStoredAttribution()!
    expect(a.first_source).toBeUndefined()
    expect(a.first_medium).toBeUndefined()
    expect(a.first_campaign).toBe('ab')
    expect(a.first_referrer).toHaveLength(300)
    expect(firstKeys(a).sort()).toEqual(['first_campaign', 'first_referrer', 'first_ts'])
  })
})

describe('first touch: storage that throws', () => {
  test('every call is a quiet no-op when every storage call throws', () => {
    const broken = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('SecurityError') },
    }
    vi.stubGlobal('localStorage', broken)
    page('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    expect(() => captureAttribution()).not.toThrow()
    expect(() => markAgentAttribution('start_tour_booking')).not.toThrow()
    expect(getStoredAttribution()).toBeNull()
  })

  test('no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined)
    page('https://mapltours.com/?utm_source=chatgpt.com')
    expect(() => captureAttribution()).not.toThrow()
    expect(() => markAgentAttribution('start_tour_booking')).not.toThrow()
    expect(getStoredAttribution()).toBeNull()
  })

  test('no window (server render): nothing happens', () => {
    expect(() => captureAttribution()).not.toThrow()
    expect(() => markAgentAttribution('start_tour_booking')).not.toThrow()
    expect(getStoredAttribution()).toBeNull()
    expect(store.data.size).toBe(0)
  })

  test('a full storage for the first touch leaves the last touch exactly as before', () => {
    const quota = new MemoryStorage()
    quota.setItem = (k: string, v: string) => {
      if (k === FIRST) throw new Error('QuotaExceededError')
      quota.data.set(k, String(v))
    }
    vi.stubGlobal('localStorage', quota)
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    expect(quota.getItem(FIRST)).toBeNull()
    expect(quota.getItem(LAST)).toBe(JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso() }))
    expect(getStoredAttribution()).toEqual({ source: 'chatgpt.com', landing: '/', ts: iso() })

    page('https://mapltours.com/tours/x')
    markAgentAttribution('start_tour_booking')
    expect(read(LAST, quota)).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/tours/x', ts: iso() })
  })

  test('an unreadable first touch is never overwritten, and the last touch is still written', () => {
    const blind = new MemoryStorage()
    blind.data.set(FIRST, JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso() }))
    const realGet = blind.getItem.bind(blind)
    blind.getItem = (k: string) => {
      if (k === FIRST) throw new Error('SecurityError')
      return realGet(k)
    }
    vi.stubGlobal('localStorage', blind)
    visit('https://mapltours.com/?utm_source=bio&utm_medium=email')
    markAgentAttribution('start_transfer_booking')
    expect(JSON.parse(blind.data.get(FIRST)!)).toEqual({ source: 'chatgpt.com', landing: '/', ts: iso() })
    expect(read(LAST, blind)).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/', ts: iso() })
    // The checkout still gets the last touch, just without first_* keys.
    expect(getStoredAttribution()).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/', ts: iso() })
  })
})

describe('first touch: opt-out parity with the last touch', () => {
  // captureAttribution has never consulted Do Not Track or Global Privacy
  // Control: it records the landing either way, and getStoredAttribution adds
  // dnt: '1' so server-side reporting (lib/meta-capi) can honour it. The
  // first touch follows the same policy, no more and no less.
  const signals: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
    ['navigator.doNotTrack', { doNotTrack: '1' }, {}],
    ['navigator.msDoNotTrack', { msDoNotTrack: '1' }, {}],
    ['window.doNotTrack', {}, { doNotTrack: '1' }],
    ['window.globalPrivacyControl', {}, { globalPrivacyControl: true }],
    ['navigator.globalPrivacyControl', { globalPrivacyControl: true }, {}],
  ]

  function journey(): { first: string | null; last: string | null; payload: Record<string, unknown> | null; optedOut: boolean } {
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    at(23 * HOUR)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')
    visit('https://mapltours.com/explore')
    return { first: store.getItem(FIRST), last: store.getItem(LAST), payload: getStoredAttribution(), optedOut: trackingOptedOut() }
  }

  for (const [name, nav, win] of signals) {
    test(`${name}: both records are captured exactly as without it, and the payload adds dnt`, () => {
      const plain = journey()
      expect(plain.optedOut).toBe(false)

      store = new MemoryStorage()
      vi.stubGlobal('localStorage', store)
      vi.stubGlobal('navigator', nav)
      windowExtras = win
      at(0)
      const opted = journey()
      expect(opted.optedOut).toBe(true)

      expect(opted.first).toBe(plain.first)
      expect(opted.last).toBe(plain.last)
      expect(opted.payload).toEqual({ ...plain.payload, dnt: '1' })
      expect(opted.payload!.first_source).toBe('chatgpt.com')
    })
  }
})

describe('markAgentAttribution and the first touch', () => {
  test('with no first touch, the agent stamp becomes it', () => {
    page('https://mapltours.com/tours/rafting')
    markAgentAttribution('start_tour_booking')
    const stamp = { source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/tours/rafting', ts: iso() }
    expect(read(FIRST)).toEqual(stamp)
    expect(store.getItem(LAST)).toBe(JSON.stringify(stamp))
  })

  test('the seed carries the referrer the stamp keeps', () => {
    store.setItem(LAST, JSON.stringify({ referrer: 'https://www.perplexity.ai/', landing: '/', ts: iso() }))
    page('https://mapltours.com/transfers')
    markAgentAttribution('start_transfer_booking')
    const stamp = { referrer: 'https://www.perplexity.ai/', source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/transfers', ts: iso() }
    expect(read(FIRST)).toEqual(stamp)
    expect(store.getItem(LAST)).toBe(JSON.stringify(stamp))
  })

  test('an existing first touch is left alone; the last touch is stamped as before', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    const first = store.getItem(FIRST)
    at(HOUR)
    page('https://mapltours.com/tours/rafting')
    markAgentAttribution('start_tour_booking')
    expect(store.getItem(FIRST)).toBe(first)
    expect(store.getItem(LAST)).toBe(JSON.stringify({
      referrer: 'https://chatgpt.com/', source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/tours/rafting', ts: iso(HOUR),
    }))
    const a = getStoredAttribution()!
    expect(attributionLabel(a)).toBe('webmcp / browser-agent')
    expect(firstTouchLabel(a)).toBe('chatgpt.com')
  })

  test('an expired first touch is replaced by the agent stamp', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    at(100 * DAY)
    page('https://mapltours.com/')
    markAgentAttribution('start_tour_booking')
    expect(read(FIRST)).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/', ts: iso(100 * DAY) })
  })
})

describe('getStoredAttribution with a first touch', () => {
  test('merges last touch, first touch, GA and Meta cookies and the opt-out flag', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    at(HOUR)
    visit('https://mapltours.com/transfers?utm_source=bio&utm_medium=email')
    cookieJar = '_ga=GA1.1.111.222; _ga_2JVWPL4GBE=GS2.1.s1747323152$o2$g0; _fbp=fb.1.1725000000000.987654321'
    windowExtras = { globalPrivacyControl: true }
    page('https://mapltours.com/checkout')
    expect(getStoredAttribution()).toEqual({
      source: 'bio', medium: 'email', landing: '/transfers', ts: iso(HOUR),
      first_source: 'chatgpt.com', first_landing: '/', first_ts: iso(),
      ga_client_id: '111.222', ga_session_id: '1747323152',
      fbp: 'fb.1.1725000000000.987654321',
      dnt: '1',
    })
  })

  test('a first touch with no last touch still reaches the checkout', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com')
    store.removeItem(LAST)
    expect(getStoredAttribution()).toEqual({ first_source: 'chatgpt.com', first_landing: '/', first_ts: iso() })
  })

  test('nothing stored and no cookies is still null', () => {
    page('https://mapltours.com/checkout')
    expect(getStoredAttribution()).toBeNull()
  })

  test('without a first touch the payload is exactly the last touch, as before', () => {
    store.setItem(LAST, JSON.stringify({ source: 'google', medium: 'cpc', gclid: 'g1', landing: '/', ts: iso() }))
    page('https://mapltours.com/checkout')
    expect(getStoredAttribution()).toEqual({ source: 'google', medium: 'cpc', gclid: 'g1', landing: '/', ts: iso() })
  })

  test('first_* keys never replace a last-touch key', () => {
    visit('https://mapltours.com/?utm_source=chatgpt.com&utm_medium=ai&utm_campaign=c1&utm_term=t1&utm_content=x1', 'https://chatgpt.com/')
    at(HOUR)
    visit('https://mapltours.com/tours?utm_source=bio&utm_medium=email&utm_campaign=c2&utm_term=t2&utm_content=x2', 'https://mail.google.com/')
    const a = getStoredAttribution()!
    expect(a).toMatchObject({ source: 'bio', medium: 'email', campaign: 'c2', term: 't2', content: 'x2', referrer: 'https://mail.google.com/', landing: '/tours', ts: iso(HOUR) })
    expect(a).toMatchObject({
      first_source: 'chatgpt.com', first_medium: 'ai', first_campaign: 'c1', first_term: 't1', first_content: 'x1',
      first_referrer: 'https://chatgpt.com/', first_landing: '/', first_ts: iso(),
    })
  })
})

describe('sanitizeAttribution and first_* keys', () => {
  test('keeps all ten first_* keys next to the existing ones', () => {
    const input = {
      source: 'bio', medium: 'email', landing: '/transfers', ts: '2026-09-21T14:00:00.000Z', dnt: '1',
      first_source: 'chatgpt.com', first_medium: 'ai', first_campaign: 'c', first_term: 't', first_content: 'x',
      first_referrer: 'https://chatgpt.com/', first_gclid: 'g1', first_fbclid: 'IwAR1', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z',
    }
    expect(sanitizeAttribution(input)).toEqual(input)
  })

  test('clips at 300 and strips control characters, the same rule as every key', () => {
    const out = sanitizeAttribution({ first_referrer: 'r'.repeat(500), first_source: ' chat\u0000gpt.com\n ', referrer: 'r'.repeat(500), first_gclid: 'g'.repeat(500), first_fbclid: 'Iw\u0000AR1\n' })!
    expect(out.first_referrer).toHaveLength(300)
    expect(out.first_referrer).toBe(out.referrer)
    expect(out.first_source).toBe('chatgpt.com')
    expect(out.first_gclid).toHaveLength(300)
    expect(out.first_fbclid).toBe('IwAR1')
  })

  test('rejects non-strings, empty values and unknown first_* keys', () => {
    expect(sanitizeAttribution({
      first_source: 42, first_medium: true, first_campaign: null, first_term: { a: 1 }, first_content: ['x'],
      first_referrer: '   ', first_landing: '', first_gclid: 7, first_fbclid: ['x'],
      first_fbp: 'fb.1.2.3', first_ga_client_id: '1.2', first_dnt: '1', first_evil: 'x',
    })).toBeNull()
    expect(sanitizeAttribution({ source: 'google', first_source: 7, first_ts: '2026-09-20T15:00:00.000Z' }))
      .toEqual({ source: 'google', first_ts: '2026-09-20T15:00:00.000Z' })
  })

  test('input without first_* keys comes out exactly as before', () => {
    expect(sanitizeAttribution({ source: 'bio', medium: 'email', landing: '/', ts: 't', gclid: 'g', fbp: 'fb.1.2.3', dnt: '1', evil: 'x' }))
      .toEqual({ source: 'bio', medium: 'email', landing: '/', ts: 't', gclid: 'g', fbp: 'fb.1.2.3', dnt: '1' })
  })
})

describe('firstTouchLabel', () => {
  test('names the first touch when it differs from the last', () => {
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_source: 'chatgpt.com' })).toBe('chatgpt.com')
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_source: 'google', first_medium: 'cpc' })).toBe('google / cpc')
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_referrer: 'https://www.perplexity.ai/search?q=x' })).toBe('perplexity.ai')
    expect(firstTouchLabel({ landing: '/', first_source: 'chatgpt.com' })).toBe('chatgpt.com')
    expect(firstTouchLabel({ source: 'bio', first_referrer: 'not a url' })).toBe('not a url')
  })

  test('null when it reads the same as the last touch', () => {
    expect(firstTouchLabel({ source: 'chatgpt.com', first_source: 'chatgpt.com' })).toBeNull()
    expect(firstTouchLabel({ source: 'google', medium: 'cpc', first_source: 'google', first_medium: 'cpc', first_campaign: 'other' })).toBeNull()
    expect(firstTouchLabel({ referrer: 'https://chatgpt.com/c/1', first_referrer: 'https://chatgpt.com/c/2' })).toBeNull()
  })

  test('an ad click alone is labelled the way attributionLabel labels one', () => {
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_gclid: 'g1', first_landing: '/' })).toBe('google / ads')
    expect(firstTouchLabel({ source: 'bio', medium: 'email', first_fbclid: 'IwAR1' })).toBe('facebook / ads')
    // attributionLabel's order: source, then referrer, then the click ids.
    expect(firstTouchLabel({ source: 'bio', first_referrer: 'https://www.google.com/', first_gclid: 'g1' })).toBe('google.com')
    expect(firstTouchLabel({ source: 'bio', first_source: 'meta', first_medium: 'paid', first_fbclid: 'IwAR1' })).toBe('meta / paid')
    // The same ad on both touches reads the same, so it is not repeated.
    expect(firstTouchLabel({ gclid: 'g2', first_gclid: 'g1' })).toBeNull()
  })

  test('null when there is no first touch, or it names no source, referrer or click id', () => {
    expect(firstTouchLabel(null)).toBeNull()
    expect(firstTouchLabel(undefined)).toBeNull()
    expect(firstTouchLabel({ source: 'bio', medium: 'email' })).toBeNull()
    expect(firstTouchLabel({ source: 'bio', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z' })).toBeNull()
    expect(firstTouchLabel({ source: 'bio', first_campaign: 'c', first_medium: 'email' })).toBeNull()
    expect(firstTouchLabel({ source: 'bio', first_source: '   ' })).toBeNull()
  })

  test('ignores what a hand-edited row might hold', () => {
    const odd = { source: 'bio', first_source: 42, first_referrer: { x: 1 } } as unknown as Record<string, string>
    expect(firstTouchLabel(odd)).toBeNull()
    expect(firstTouchLabel('chatgpt.com' as unknown as Record<string, string>)).toBeNull()
  })

  test('attributionLabel does not read first_* keys', () => {
    expect(attributionLabel({ source: 'bio', medium: 'email', first_source: 'chatgpt.com' })).toBe('bio / email')
    expect(attributionLabel({ first_source: 'chatgpt.com', first_referrer: 'https://chatgpt.com/' })).toBe('Direct')
  })
})

describe('readers of bookings.attribution ignore every first_* key', () => {
  // lib/meta-capi (webhook), lib/ga4-server (webhook) and lib/weekly-report
  // (/api/report/bookings, read by the bio site's Monday email) must produce
  // exactly what they produce today whether or not a booking has a first touch.
  const LAST_TOUCH = {
    source: 'bio', medium: 'email', landing: '/transfers', ts: '2026-09-21T14:00:00.000Z',
    ga_client_id: '111.222', ga_session_id: '1747323152', fbp: 'fb.1.1725000000000.987654321',
  }
  const FIRST_TOUCH = {
    first_source: 'chatgpt.com', first_medium: 'ai', first_campaign: 'c', first_term: 't', first_content: 'x',
    first_referrer: 'https://chatgpt.com/', first_gclid: 'g1', first_fbclid: 'IwAR1', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z',
  }
  const PAID = '2026-09-21T15:00:00.000Z'
  const NOW = Date.parse('2026-09-21T16:00:00.000Z')
  const row = (attribution: Record<string, string>) => ({
    id: 'b0000000-0000-4000-8000-000000000001', booking_type: 'transfer', status: 'paid', total_paid: 87.4, currency: 'usd',
    email: 'guest@example.org', pickup: 'MBJ', dropoff: 'Hotel', paid_at: PAID, created_at: PAID,
    refunded_at: null, refund_amount: null, attribution,
  })

  afterEach(() => { vi.unstubAllEnvs() })

  test('the Meta Conversions API event is identical, and first_fbclid never becomes fbc', () => {
    vi.stubEnv('META_PIXEL_ID', '1234567890')
    vi.stubEnv('META_CAPI_TOKEN', 'test-token')
    const before = buildPurchaseEvent(row(LAST_TOUCH), NOW)
    const after = buildPurchaseEvent(row({ ...LAST_TOUCH, ...FIRST_TOUCH }), NOW)
    expect('body' in before).toBe(true)
    expect(after).toEqual(before)
    expect(JSON.stringify(after)).not.toContain('IwAR1')

    // Only the first touch has a click id: still no fbc, exactly as with none.
    const noClick = { source: 'bio', medium: 'email', ts: LAST_TOUCH.ts }
    expect(buildPurchaseEvent(row({ ...noClick, first_fbclid: 'IwAR1' }), NOW)).toEqual(buildPurchaseEvent(row(noClick), NOW))
  })

  test('the GA4 Measurement Protocol payload is identical', () => {
    vi.stubEnv('GA4_API_SECRET', 'test-secret')
    const before = buildPurchasePayload(row(LAST_TOUCH), NOW)
    const after = buildPurchasePayload(row({ ...LAST_TOUCH, ...FIRST_TOUCH }), NOW)
    expect('body' in before).toBe(true)
    expect(after).toEqual(before)
  })

  test('the weekly report groups by the last touch only, as before', () => {
    const since = '2026-09-21T00:00:00.000Z'
    const until = '2026-09-28T00:00:00.000Z'
    const before = aggregateBookings([row(LAST_TOUCH)], since, until)
    const after = aggregateBookings([row({ ...LAST_TOUCH, ...FIRST_TOUCH })], since, until)
    expect(after).toEqual(before)
    expect(after.attribution).toEqual([{ source: 'bio', medium: 'email', paid: 1, started: 1 }])
  })
})

/**
 * Browsers that visited BEFORE first touches were kept hold only a last-touch
 * record. The first time a browser runs the new code it stamps
 * 'mapl-first-touch-since' and, whatever the landing, makes that older
 * outside touch its first touch, so a guest who came from ChatGPT last week
 * and returns from the code email today still credits ChatGPT. Records
 * written after the stamp never qualify, so it happens once.
 */
describe('first touch: seeded once from a record written before this browser kept first touches', () => {
  const SINCE = 'mapl-first-touch-since'
  const PRE = iso(-6 * DAY)
  const email = 'https://mapltours.com/transfers?utm_source=bio&utm_medium=email&utm_campaign=bio_coupon'
  const emailTouch = (offset = 0) => ({ referrer: 'https://mail.google.com/', source: 'bio', medium: 'email', campaign: 'bio_coupon', landing: '/transfers', ts: iso(offset) })
  const oldLast = (rec: Record<string, unknown>) => store.setItem(LAST, JSON.stringify(rec))
  const chatgpt = { referrer: 'https://chatgpt.com/', landing: '/transfers', ts: PRE }

  test('a ChatGPT visit from before is the first touch when the code email lands', () => {
    oldLast(chatgpt)
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual(chatgpt)
    expect(store.getItem(SINCE)).toBe(iso())
    // The last touch is written byte for byte as it always was.
    expect(store.getItem(LAST)).toBe(JSON.stringify(emailTouch()))
    const a = getStoredAttribution()!
    expect(attributionLabel(a)).toBe('bio / email')
    expect(firstTouchLabel(a)).toBe('chatgpt.com')
    expect(a.first_ts).toBe(PRE)
    expect(a[SINCE as keyof typeof a]).toBeUndefined()
  })

  test('the seed happens on the first page load, even a direct one, and leaves the last touch alone', () => {
    oldLast(chatgpt)
    const last = store.getItem(LAST)
    visit('https://mapltours.com/tours')
    expect(read(FIRST)).toEqual(chatgpt)
    expect(store.getItem(LAST)).toBe(last)
    // A booking now carries it, even with no outside landing since.
    expect(getStoredAttribution()?.first_referrer).toBe('https://chatgpt.com/')
  })

  test('a sign-in or payment return as the first page load still seeds, and records nothing from the return', () => {
    for (const [href, ref] of [
      ['https://mapltours.com/saved', 'https://accounts.google.com/'],
      ['https://mapltours.com/profile?code=4f1c2d', 'https://mail.google.com/'],
      ['https://mapltours.com/gifts?payment_intent=pi_1&redirect_status=succeeded', 'https://pay.klarna.com/'],
    ]) {
      store.clear()
      oldLast(chatgpt)
      visit(href, ref)
      expect(read(FIRST), href).toEqual(chatgpt)
      at(HOUR)
      visit(email, 'https://mail.google.com/')
      expect(firstTouchLabel(getStoredAttribution()), href).toBe('chatgpt.com')
      at(0)
    }
  })

  test('the stamp is written once and never moves; later records never seed', () => {
    visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
    expect(store.getItem(SINCE)).toBe(iso())
    at(HOUR)
    // A sign-in return writes a last touch but, deliberately, no first touch.
    store.removeItem(FIRST)
    visit('https://mapltours.com/saved', 'https://accounts.google.com/')
    at(2 * HOUR)
    visit(email, 'https://mail.google.com/')
    expect(store.getItem(SINCE)).toBe(iso())
    expect(read(FIRST)).toEqual(emailTouch(2 * HOUR))
  })

  test('the stamp is exact: a record 1 ms older seeds, one from the same moment does not', () => {
    store.setItem(SINCE, iso(-DAY))
    oldLast({ ...chatgpt, ts: iso(-DAY - 1) })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)?.referrer).toBe('https://chatgpt.com/')

    store.clear()
    store.setItem(SINCE, iso(-DAY))
    oldLast({ ...chatgpt, ts: iso(-DAY) })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual(emailTouch())
  })

  test('no seed when the stamp cannot be kept or read; the last touch is written as before', () => {
    // Unparseable stamp.
    store.setItem(SINCE, 'garbage')
    oldLast(chatgpt)
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual(emailTouch())
    expect(store.getItem(LAST)).toBe(JSON.stringify(emailTouch()))

    // A stamp write that does not stick (quota) or a key that throws.
    for (const broken of ['drop', 'throw'] as const) {
      store = new MemoryStorage()
      const real = store
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => { if (k === SINCE && broken === 'throw') throw new Error('blocked'); return real.getItem(k) },
        setItem: (k: string, v: string) => { if (k === SINCE) { if (broken === 'throw') throw new Error('quota'); return } real.setItem(k, v) },
        removeItem: (k: string) => real.removeItem(k),
      })
      oldLast(chatgpt)
      visit(email, 'https://mail.google.com/')
      expect(read(FIRST), broken).toEqual(emailTouch())
      expect(real.getItem(LAST), broken).toBe(JSON.stringify(emailTouch()))
    }
  })

  test('a record dated more than a day ahead (a clock that ran fast) is not a seed', () => {
    store.setItem(SINCE, iso(30 * DAY))
    oldLast({ ...chatgpt, ts: iso(5 * DAY) })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual(emailTouch())
    expect(getStoredAttribution()?.first_source).toBe('bio')
  })

  test('the seed keeps its own visit time, so it expires 90 days after that visit', () => {
    oldLast({ source: 'chatgpt.com', landing: '/', ts: PRE })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)?.source).toBe('chatgpt.com')
    at(-6 * DAY + 89 * DAY)
    expect(getStoredAttribution()?.first_source).toBe('chatgpt.com')
    at(-6 * DAY + 91 * DAY)
    expect(firstKeys(getStoredAttribution())).toEqual([])
    visit('https://mapltours.com/?utm_source=google&utm_medium=cpc')
    expect(read(FIRST)).toEqual({ source: 'google', medium: 'cpc', landing: '/', ts: iso(-6 * DAY + 91 * DAY) })
  })

  test('an old record past 90 days is not a seed', () => {
    oldLast({ ...chatgpt, ts: iso(-91 * DAY) })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual(emailTouch())
  })

  test('an expired or future-dated old record writes nothing, even on a direct landing', () => {
    oldLast({ ...chatgpt, ts: iso(-91 * DAY) })
    visit('https://mapltours.com/tours')
    expect(store.getItem(FIRST)).toBeNull()

    store.clear()
    store.setItem(SINCE, iso(30 * DAY))
    oldLast({ ...chatgpt, ts: iso(5 * DAY) })
    visit('https://mapltours.com/tours')
    expect(store.getItem(FIRST)).toBeNull()
  })

  test('an old record naming no source, referrer or click id is not a seed', () => {
    for (const rec of [
      { landing: '/', ts: PRE },
      { medium: 'email', campaign: 'x', landing: '/', ts: PRE },
      { source: { x: 1 }, referrer: 5, landing: '/', ts: PRE },
    ]) {
      store.clear()
      oldLast(rec)
      visit(email, 'https://mail.google.com/')
      expect(read(FIRST), JSON.stringify(rec)).toEqual(emailTouch())
    }
  })

  test('an old sign-in, payment or account-email return is not a seed', () => {
    for (const rec of [
      { referrer: 'https://accounts.google.com/', landing: '/experience/rafting', ts: PRE },
      { referrer: 'https://appleid.apple.com/', landing: '/saved', ts: PRE },
      { referrer: 'https://abcd.supabase.co/', landing: '/saved', ts: PRE },
      { referrer: 'https://checkout.stripe.com/', landing: '/', ts: PRE },
      { referrer: 'https://mail.google.com/', landing: '/profile', ts: PRE },
      { referrer: 'https://mail.google.com/', landing: '/login', ts: PRE },
      { referrer: 'https://x.example/', landing: '/auth/callback', ts: PRE },
      { referrer: 'https://x.example/', landing: '/driver', ts: PRE },
      { referrer: 'https://x.example/', landing: '/admin/bookings', ts: PRE },
    ]) {
      store.clear()
      oldLast(rec)
      visit(email, 'https://mail.google.com/')
      expect(read(FIRST), JSON.stringify(rec)).toEqual(emailTouch())
    }
  })

  test('tagged or ad-click records on those pages, public pages like /gifts, and look-alike paths still seed', () => {
    for (const rec of [
      { source: 'instagram', medium: 'social', landing: '/profile', ts: PRE },
      { gclid: 'Cj0abc', landing: '/login', ts: PRE },
      { referrer: 'https://l.facebook.com/', fbclid: 'IwAR1', landing: '/admin', ts: PRE },
      { referrer: 'https://www.google.com/', landing: '/gifts', ts: PRE },
      { referrer: 'https://chatgpt.com/', landing: '/gifts', ts: PRE },
      { referrer: 'https://www.instagram.com/', landing: '/profiles-of-drivers', ts: PRE },
    ]) {
      store.clear()
      oldLast(rec)
      visit(email, 'https://mail.google.com/')
      expect(read(FIRST), JSON.stringify(rec)).toEqual(rec)
    }
  })

  test('an old ad click alone seeds, and is labelled as the ad', () => {
    oldLast({ gclid: 'Cj0abc', landing: '/transfers', ts: PRE })
    visit(email, 'https://mail.google.com/')
    expect(read(FIRST)).toEqual({ gclid: 'Cj0abc', landing: '/transfers', ts: PRE })
    expect(firstTouchLabel(getStoredAttribution())).toBe('google / ads')
  })

  test('a live first touch is never replaced by an old record', () => {
    store.setItem(FIRST, JSON.stringify({ source: 'google', medium: 'cpc', landing: '/', ts: iso(-HOUR) }))
    oldLast(chatgpt)
    const before = store.getItem(FIRST)
    visit(email, 'https://mail.google.com/')
    expect(store.getItem(FIRST)).toBe(before)
  })

  test('corrupt old records are not seeds', () => {
    for (const raw of ['{not json', '42', '[]', '"chatgpt.com"', 'null',
      JSON.stringify({ source: 'chatgpt.com' }),
      JSON.stringify({ source: 'chatgpt.com', ts: 'garbage' }),
      JSON.stringify({ source: 'chatgpt.com', ts: 42 })]) {
      store.clear()
      store.setItem(LAST, raw)
      visit(email, 'https://mail.google.com/')
      expect(read(FIRST), raw).toEqual(emailTouch())
    }
  })

  test('the seed is scrubbed and capped like any first touch', () => {
    oldLast({ source: 'chat\u0000gpt.com', referrer: `https://chatgpt.com/${'x'.repeat(400)}`, extra: 'no', ts: PRE })
    visit(email, 'https://mail.google.com/')
    const f = read(FIRST)
    expect(f.source).toBe('chatgpt.com')
    expect(f.referrer).toHaveLength(300)
    expect(f.extra).toBeUndefined()
    expect(f.ts).toBe(PRE)
  })

  test('checkout pages neither stamp nor seed', () => {
    oldLast(chatgpt)
    visit('https://mapltours.com/checkout')
    expect(store.getItem(SINCE)).toBeNull()
    expect(store.getItem(FIRST)).toBeNull()
  })

  test('an agent-started booking seeds from the old record and stamps the last touch as before', () => {
    oldLast(chatgpt)
    page('https://mapltours.com/transfers')
    markAgentAttribution('start_transfer_booking')
    expect(read(FIRST)).toEqual(chatgpt)
    expect(store.getItem(LAST)).toBe(JSON.stringify({
      referrer: 'https://chatgpt.com/', source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/transfers', ts: iso(),
    }))

    store.clear()
    oldLast({ referrer: 'https://accounts.google.com/', landing: '/saved', ts: PRE })
    page('https://mapltours.com/transfers')
    markAgentAttribution('start_transfer_booking')
    expect(read(FIRST)?.source).toBe('webmcp')
  })
})

describe('first touch: pages only reached coming back are never a first touch', () => {
  test('a booking email link to /profile or the login bounce keeps no first touch; the last touch is as before', () => {
    for (const href of ['https://mapltours.com/profile', 'https://mapltours.com/login?redirect=%2Fprofile', 'https://mapltours.com/driver', 'https://mapltours.com/admin/bookings']) {
      store.clear()
      visit(href, 'https://mail.google.com/')
      expect(store.getItem(FIRST), href).toBeNull()
      expect(read(LAST), href).toEqual({ referrer: 'https://mail.google.com/', landing: new URL(href).pathname, ts: iso() })
    }
  })

  test('a campaign tag or click id on those pages is a real landing', () => {
    for (const href of ['https://mapltours.com/profile?utm_source=bio&utm_medium=email', 'https://mapltours.com/login?gclid=Cj0abc', 'https://mapltours.com/profile?fbclid=IwAR1']) {
      store.clear()
      visit(href, 'https://mail.google.com/')
      expect(read(FIRST), href)?.not.toBeNull()
    }
  })

  test('/gifts and look-alike paths are ordinary landings', () => {
    for (const href of ['https://mapltours.com/gifts', 'https://mapltours.com/profiles-of-drivers']) {
      store.clear()
      visit(href, 'https://www.google.com/')
      expect(read(FIRST), href).toEqual({ referrer: 'https://www.google.com/', landing: new URL(href).pathname, ts: iso() })
    }
  })
})
