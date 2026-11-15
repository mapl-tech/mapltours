import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Our own note of where a visitor came from (lib/attribution) follows the
 * cookie question too (owner, Nov 14 2026: "Build a consent prompt"). For a
 * visitor who may not be measured, in the UK, the EU or the EEA without a
 * yes, or anyone who has said no, nothing is written to the browser and
 * nothing is read back from it: the landing is held in memory for the page.
 * It still goes with a booking made on that visit, beside the flag that
 * keeps the booking from Google and Meta, and it is stored the moment the
 * visitor says yes or turns out to be outside the region.
 *
 * Everyone else is untouched: attribution-first-touch.spec.ts and
 * attribution-ai-assistants.spec.tsx run the same code with the visitor
 * placed outside the region, and pass unchanged.
 *
 * Each test loads its own copy of the two modules, as a new page load would.
 */
const LAST = 'mapl-attribution'
const FIRST = 'mapl-first-touch'
const SINCE = 'mapl-first-touch-since'
const T0 = new Date('2026-11-14T18:00:00.000Z')
const iso = (offsetMs = 0) => new Date(T0.getTime() + offsetMs).toISOString()

class CountingStorage {
  data = new Map<string, string>()
  reads: string[] = []
  writes: string[] = []
  removes: string[] = []
  getItem(k: string): string | null { this.reads.push(k); return this.data.has(k) ? this.data.get(k)! : null }
  setItem(k: string, v: string): void { this.writes.push(k); this.data.set(k, String(v)) }
  removeItem(k: string): void { this.removes.push(k); this.data.delete(k) }
  /** Forget what was counted, keep what is stored. */
  quiet(): void { this.reads = []; this.writes = []; this.removes = [] }
  get touched(): number { return this.reads.length + this.writes.length + this.removes.length }
}

class Jar {
  store = new Map<string, string>()
  get cookie(): string { return Array.from(this.store, ([k, v]) => `${k}=${v}`).join('; ') }
  set cookie(v: string) {
    const [pair, ...attrs] = v.split(';').map((s) => s.trim())
    const i = pair.indexOf('=')
    const maxAge = attrs.map((a) => /^max-age=(-?\d+)$/i.exec(a)?.[1]).find((x) => x !== undefined)
    if (maxAge !== undefined && Number(maxAge) <= 0) this.store.delete(pair.slice(0, i))
    else this.store.set(pair.slice(0, i), pair.slice(i + 1))
  }
}

let storage: CountingStorage
let jar: Jar & { referrer?: string }
let location: { hostname: string; protocol: string; pathname: string; search: string }

/** The stubbed browser, on the live site, with a clock in `tz`. */
function browser(tz: string | null = 'Europe/London') {
  storage = new CountingStorage()
  jar = new Jar()
  location = { hostname: 'mapltours.com', protocol: 'https:', pathname: '/', search: '' }
  const listeners = new Map<string, Set<() => void>>()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('document', jar)
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('window', {
    location,
    addEventListener: (t: string, l: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(l) },
    removeEventListener: (t: string, l: () => void) => { listeners.get(t)?.delete(l) },
    dispatchEvent: (e: { type: string }) => { for (const l of Array.from(listeners.get(e.type) ?? [])) l(); return true },
  })
  vi.stubGlobal('Event', class { type: string; constructor(type: string) { this.type = type } })
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => ({ resolvedOptions: () => ({ timeZone: tz }) })) as unknown as typeof Intl.DateTimeFormat)
}

/** Move the address bar, as a link inside the site does. */
function go(href: string, referrer?: string) {
  const u = new URL(href)
  location.pathname = u.pathname
  location.search = u.search
  if (referrer !== undefined) jar.referrer = referrer
}

/** A new page load: fresh copies of both modules, nothing placed, nothing held. */
async function load() {
  vi.resetModules()
  const consent = await import('../../lib/consent')
  const attribution = await import('../../lib/attribution')
  return { consent, attribution }
}

const read = (key: string) => {
  const raw = storage.data.get(key)
  return raw == null ? null : JSON.parse(raw)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a visitor in the region who has not answered', () => {
  test('nothing is written to their browser and nothing is read from it; the landing still goes with a booking, flagged', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'GB')
    go('https://mapltours.com/transfers?utm_source=google&utm_medium=cpc&utm_campaign=mbj&gclid=abc123', 'https://www.google.com/')
    attribution.captureAttribution()
    expect(storage.touched).toBe(0)
    expect(jar.cookie).toBe('')

    // They move on inside the site and book: the landing is the one they arrived on.
    vi.setSystemTime(T0.getTime() + 600_000)
    go('https://mapltours.com/transfers/checkout')
    expect(attribution.getStoredAttribution()).toEqual({
      referrer: 'https://www.google.com/', source: 'google', medium: 'cpc', campaign: 'mbj', gclid: 'abc123',
      landing: '/transfers', ts: iso(), dnt: '1',
    })
    expect(storage.touched).toBe(0)
    // The server keeps the flag, and so skips Meta and GA4 for this booking.
    expect(attribution.sanitizeAttribution(attribution.getStoredAttribution())?.dnt).toBe('1')
  })

  test('records an earlier visit left in the browser are not read either', async () => {
    browser()
    storage.data.set(LAST, JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso(-86_400_000) }))
    storage.data.set(FIRST, JSON.stringify({ source: 'chatgpt.com', landing: '/', ts: iso(-86_400_000) }))
    jar.cookie = '_ga=GA1.1.111.222'
    jar.cookie = '_fbp=fb.1.1700000000000.123456789'
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'IE')
    go('https://mapltours.com/explore')
    attribution.captureAttribution()
    expect(attribution.getStoredAttribution()).toEqual({ landing: '/explore', ts: iso(), dnt: '1' })
    expect(storage.touched).toBe(0)
    // And they are left exactly as they were.
    expect(read(LAST)).toEqual({ source: 'chatgpt.com', landing: '/', ts: iso(-86_400_000) })
  })

  test('a plain landing never replaces a tagged one held on the same page', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'FR')
    go('https://mapltours.com/book?ride=1&utm_source=chatgpt.com&utm_medium=ai_agent')
    attribution.captureAttribution() // the handoff page
    attribution.captureAttribution() // the layout, on the same address
    go('https://mapltours.com/checkout')
    attribution.captureAttribution() // paused on a checkout page: nothing changes
    go('https://mapltours.com/explore')
    attribution.captureAttribution() // no tag on this one
    expect(attribution.getStoredAttribution()).toEqual({ source: 'chatgpt.com', medium: 'ai_agent', landing: '/book', ts: iso(), dnt: '1' })
    expect(storage.touched).toBe(0)
  })

  test('a booking an agent started still says so, and nothing is stored for it', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'DE')
    go('https://mapltours.com/transfers', 'https://www.bing.com/')
    attribution.captureAttribution()
    attribution.markAgentAttribution('start_transfer_booking')
    expect(attribution.getStoredAttribution()).toEqual({
      referrer: 'https://www.bing.com/', source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/transfers', ts: iso(), dnt: '1',
    })
    expect(storage.touched).toBe(0)
  })
})

describe('when they say yes', () => {
  test('the landing they arrived on is stored then, as it was read: last touch, first touch, and no flag on the booking', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'GB')
    go('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    attribution.captureAttribution()
    // Two pages and five minutes later they answer.
    vi.setSystemTime(T0.getTime() + 300_000)
    go('https://mapltours.com/explore')
    consent.setConsent('yes')
    expect(storage.data.get(LAST)).toBe(JSON.stringify({ referrer: 'https://chatgpt.com/', source: 'chatgpt.com', landing: '/', ts: iso() }))
    expect(read(FIRST)).toEqual({ source: 'chatgpt.com', referrer: 'https://chatgpt.com/', landing: '/', ts: iso() })
    expect(attribution.getStoredAttribution()).toEqual({
      referrer: 'https://chatgpt.com/', source: 'chatgpt.com', landing: '/', ts: iso(),
      first_source: 'chatgpt.com', first_referrer: 'https://chatgpt.com/', first_landing: '/', first_ts: iso(),
    })
    // Written once: a second yes, or the next read, stores nothing again.
    storage.quiet()
    consent.setConsent('yes')
    attribution.storeHeldAttribution()
    expect(storage.writes).toEqual([])
  })

  test('a sign-in return held this way becomes the last touch but never the first, as it would have unheld', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'ES')
    go('https://mapltours.com/profile', 'https://accounts.google.com/')
    attribution.captureAttribution()
    consent.setConsent('yes')
    expect(read(LAST)).toEqual({ referrer: 'https://accounts.google.com/', landing: '/profile', ts: iso() })
    expect(read(FIRST)).toBe(null)
  })

  test('an agent-started booking held this way is stored with its first touch', async () => {
    browser()
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'NL')
    go('https://mapltours.com/transfers')
    attribution.markAgentAttribution('start_tour_booking')
    expect(storage.touched).toBe(0)
    consent.setConsent('yes')
    expect(read(LAST)).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/transfers', ts: iso() })
    expect(read(FIRST)).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_tour_booking', landing: '/transfers', ts: iso() })
  })
})

describe('before the visitor has been placed', () => {
  test('a European clock holds the landing; placed outside the region, it is stored at once without another call', async () => {
    browser('Europe/Istanbul')
    const { consent, attribution } = await load()
    go('https://mapltours.com/?utm_source=facebook&utm_medium=paid&fbclid=xyz')
    attribution.captureAttribution()
    expect(storage.touched).toBe(0)
    await consent.resolveRegion(async () => 'TR')
    expect(read(LAST)).toEqual({ source: 'facebook', medium: 'paid', fbclid: 'xyz', landing: '/', ts: iso() })
    expect(read(FIRST)).toEqual({ source: 'facebook', medium: 'paid', fbclid: 'xyz', landing: '/', ts: iso() })
    expect(jar.cookie).toBe(`mapl_consent=na.${T0.getTime() / 1000}`)
    expect(attribution.getStoredAttribution()).toMatchObject({ source: 'facebook', first_source: 'facebook' })
    expect(attribution.getStoredAttribution()?.dnt).toBeUndefined()
  })

  test('a European clock placed inside the region keeps holding', async () => {
    browser('Europe/London')
    const { consent, attribution } = await load()
    go('https://mapltours.com/?utm_source=instagram')
    attribution.captureAttribution()
    await consent.resolveRegion(async () => 'GB')
    expect(storage.touched).toBe(0)
    expect(attribution.getStoredAttribution()).toEqual({ source: 'instagram', landing: '/', ts: iso(), dnt: '1' })
  })

  test('a North American clock is written at once, exactly as before the question existed', async () => {
    browser('America/Toronto')
    const { consent, attribution } = await load()
    go('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    attribution.captureAttribution()
    expect(storage.data.get(LAST)).toBe(JSON.stringify({ referrer: 'https://chatgpt.com/', source: 'chatgpt.com', landing: '/', ts: iso() }))
    expect(read(FIRST)).toEqual({ source: 'chatgpt.com', referrer: 'https://chatgpt.com/', landing: '/', ts: iso() })
    await consent.resolveRegion(async () => 'CA')
    expect(attribution.getStoredAttribution()).toEqual({
      referrer: 'https://chatgpt.com/', source: 'chatgpt.com', landing: '/', ts: iso(),
      first_source: 'chatgpt.com', first_referrer: 'https://chatgpt.com/', first_landing: '/', first_ts: iso(),
    })
  })
})

describe('when a visitor says no', () => {
  test('what an earlier visit stored is removed, and nothing is written afterwards', async () => {
    browser('America/New_York')
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'US')
    go('https://mapltours.com/?utm_source=google&gclid=abc')
    attribution.captureAttribution()
    expect(read(LAST)).not.toBe(null)
    expect(read(FIRST)).not.toBe(null)
    expect(storage.data.has(SINCE)).toBe(true)
    consent.setConsent('no')
    expect(Array.from(storage.data.keys())).toEqual([])
    // The same page, later: the booking carries only the flag.
    storage.quiet()
    go('https://mapltours.com/transfers/checkout')
    expect(attribution.getStoredAttribution()).toEqual({ dnt: '1' })
    expect(storage.touched).toBe(0)
    // The next page load reads the no from the cookie: nothing is written or read, and it clears again in case anything was left.
    const next = await load()
    go('https://mapltours.com/?utm_source=google&gclid=def')
    next.attribution.captureAttribution()
    expect(storage.writes).toEqual([])
    expect(storage.reads).toEqual([])
    expect(storage.removes.sort()).toEqual([LAST, FIRST, SINCE].sort())
    expect(next.attribution.getStoredAttribution()).toEqual({ source: 'google', gclid: 'def', landing: '/', ts: iso(), dnt: '1' })
  })

  test('a no given on the bio page, where this site could not be reached, takes out what this site kept when the visitor arrives', async () => {
    browser('America/Toronto')
    storage.data.set(LAST, JSON.stringify({ source: 'bio', medium: 'bio', landing: '/transfers', ts: iso(-3_600_000) }))
    storage.data.set(FIRST, JSON.stringify({ source: 'instagram', landing: '/', ts: iso(-86_400_000) }))
    storage.data.set(SINCE, iso(-90_000_000))
    jar.cookie = `mapl_consent=no.${T0.getTime() / 1000}`
    const { attribution } = await load()
    go('https://mapltours.com/explore')
    attribution.captureAttribution()
    expect(Array.from(storage.data.keys())).toEqual([])
    expect(storage.writes).toEqual([])
    expect(attribution.getStoredAttribution()).toEqual({ landing: '/explore', ts: iso(), dnt: '1' })
    // On a checkout page too, where nothing is captured.
    storage.data.set(LAST, JSON.stringify({ source: 'bio', landing: '/', ts: iso() }))
    go('https://mapltours.com/transfers/checkout')
    attribution.captureAttribution()
    expect(storage.data.has(LAST)).toBe(false)
  })
})

describe('a visitor in the region whose device keeps another region\'s time', () => {
  test('the note the clock let through is taken back out when the lookup places them, and held for the visit instead', async () => {
    // A guest from London reading on a laptop still set to New York. Until the country is known the clock says "outside".
    browser('America/New_York')
    const { consent, attribution } = await load()
    go('https://mapltours.com/transfers?utm_source=google&utm_medium=cpc&gclid=abc', 'https://www.google.com/')
    attribution.captureAttribution()
    expect(read(LAST)).not.toBe(null) // written at once, as it is for every North American clock
    await consent.resolveRegion(async () => 'GB')
    // Placed in the region, not yet answered: nothing of ours is left in the browser.
    expect(Array.from(storage.data.keys())).toEqual([])
    expect(jar.cookie).toBe('')
    storage.quiet()
    // The booking still says where they came from, flagged, and nothing is read to say it.
    go('https://mapltours.com/transfers/checkout')
    expect(attribution.getStoredAttribution()).toEqual({
      referrer: 'https://www.google.com/', source: 'google', medium: 'cpc', gclid: 'abc', landing: '/transfers', ts: iso(), dnt: '1',
    })
    expect(storage.touched).toBe(0)
    // A yes stores it, as it was read.
    consent.setConsent('yes')
    expect(read(LAST)).toEqual({ referrer: 'https://www.google.com/', source: 'google', medium: 'cpc', gclid: 'abc', landing: '/transfers', ts: iso() })
    expect(read(FIRST)).toEqual({ source: 'google', medium: 'cpc', referrer: 'https://www.google.com/', gclid: 'abc', landing: '/transfers', ts: iso() })
  })

  test('placed outside the region after all, the note stays exactly as it was written and nothing is held', async () => {
    browser('America/New_York')
    const { consent, attribution } = await load()
    go('https://mapltours.com/?utm_source=chatgpt.com', 'https://chatgpt.com/')
    attribution.captureAttribution()
    const written = storage.data.get(LAST)
    storage.quiet()
    await consent.resolveRegion(async () => 'US')
    expect(storage.data.get(LAST)).toBe(written)
    expect(storage.writes).toEqual([])
    expect(storage.removes).toEqual([])
    expect(attribution.getStoredAttribution()?.dnt).toBeUndefined()
    expect(attribution.getStoredAttribution()?.first_source).toBe('chatgpt.com')
  })

  test('an agent-started booking written in that moment is taken back the same way', async () => {
    browser('America/Chicago')
    const { consent, attribution } = await load()
    go('https://mapltours.com/transfers')
    attribution.markAgentAttribution('start_transfer_booking')
    expect(read(LAST)?.source).toBe('webmcp')
    await consent.resolveRegion(async () => 'IE')
    expect(Array.from(storage.data.keys())).toEqual([])
    expect(attribution.getStoredAttribution()).toEqual({ source: 'webmcp', medium: 'browser-agent', content: 'start_transfer_booking', landing: '/transfers', ts: iso(), dnt: '1' })
  })
})

describe('it can never break a page', () => {
  test('storage that throws, or a browser without events, changes nothing for the visitor', async () => {
    browser()
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => { throw new Error('SecurityError') } })
    const { consent, attribution } = await load()
    await consent.resolveRegion(async () => 'GB')
    go('https://mapltours.com/?utm_source=google')
    expect(() => attribution.captureAttribution()).not.toThrow()
    expect(() => consent.setConsent('yes')).not.toThrow()
    expect(() => attribution.storeHeldAttribution()).not.toThrow()
    expect(() => consent.setConsent('no')).not.toThrow()
    expect(() => attribution.forgetAttribution()).not.toThrow()
    expect(() => attribution.getStoredAttribution()).not.toThrow()
  })

  test('on the server there is nothing to hold, store or forget', async () => {
    const { attribution } = await load()
    expect(() => { attribution.captureAttribution(); attribution.storeHeldAttribution(); attribution.forgetAttribution(); attribution.markAgentAttribution('x') }).not.toThrow()
    expect(attribution.getStoredAttribution()).toBe(null)
  })
})
