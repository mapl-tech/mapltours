import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ANSWER_MAX_AGE_S, CONSENT_COOKIE, CONSENT_COUNTRIES, GEO_TIMEOUT_MS, NA_MAX_AGE_S, REGION_ZONES_OUTSIDE_EUROPE,
  __resetConsentForTests, clearTrackerCookies, consentBlocksTracking, consentCookie, consentDecision, consentUndecided, countryFromGeoEndpoint, decide,
  inConsentRegion, knownCountry, onConsentChange, onConsentPromptRequest, readConsentCookie, requestConsentPrompt, resolveRegion, setConsent, storedConsent,
  trackerCookieNames, watchConsent, type ConsentDecision,
} from '../../lib/consent'
import { getStoredAttribution, trackingOptedOut } from '../../lib/attribution'

/**
 * Consent for measurement and advertising in the UK, the EU and the EEA
 * (owner, Nov 14 2026). The rule is one function, `decide`; everything that
 * tracks asks lib/attribution `trackingOptedOut`, which asks this module. So
 * these tests hold three things: the rule itself, the cookie it rests on,
 * and that a visitor in the region who has not said yes is treated exactly
 * like a visitor whose browser sends Do Not Track, all the way to the
 * `dnt: '1'` on a booking that makes the server skip Meta and GA4.
 *
 * Runs in node with window, document and navigator stubbed per test.
 */
const T0 = Date.parse('2026-11-14T18:00:00Z')
const DAY = 86_400_000

/** A small cookie jar behind document.cookie: honours Max-Age=0 and Domain like a browser does for our purposes. */
class Jar {
  store = new Map<string, string>()
  writes: string[] = []
  get cookie(): string { return Array.from(this.store, ([k, v]) => `${k}=${v}`).join('; ') }
  set cookie(v: string) {
    this.writes.push(v)
    const [pair, ...attrs] = v.split(';').map((s) => s.trim())
    const i = pair.indexOf('=')
    const name = pair.slice(0, i), value = pair.slice(i + 1)
    const maxAge = attrs.map((a) => /^max-age=(-?\d+)$/i.exec(a)?.[1]).find((x) => x !== undefined)
    if (maxAge !== undefined && Number(maxAge) <= 0) this.store.delete(name)
    else this.store.set(name, value)
  }
}

function browser(opts: { host?: string; dnt?: boolean; gpc?: boolean; tz?: string | null; protocol?: string } = {}) {
  const jar = new Jar()
  const listeners = new Map<string, Set<() => void>>()
  vi.stubGlobal('document', jar)
  vi.stubGlobal('navigator', { doNotTrack: opts.dnt ? '1' : null, globalPrivacyControl: opts.gpc === true })
  vi.stubGlobal('window', {
    location: { hostname: opts.host ?? 'mapltours.com', protocol: opts.protocol ?? 'https:' },
    addEventListener: (t: string, l: () => void) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(l) },
    removeEventListener: (t: string, l: () => void) => { listeners.get(t)?.delete(l) },
    dispatchEvent: (e: { type: string }) => { for (const l of Array.from(listeners.get(e.type) ?? [])) l(); return true },
  })
  vi.stubGlobal('Event', class { type: string; constructor(type: string) { this.type = type } })
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  const tz = opts.tz === undefined ? 'America/Toronto' : opts.tz
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation((() => ({ resolvedOptions: () => ({ timeZone: tz }) })) as unknown as typeof Intl.DateTimeFormat)
  return jar
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  __resetConsentForTests()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetConsentForTests()
})

describe('who is asked', () => {
  test('the list is the EU, the parts of it with their own code, the rest of the EEA, the UK with its dependencies, and Switzerland', () => {
    expect(CONSENT_COUNTRIES.length).toBe(27 + 7 + 3 + 5 + 1)
    // This exact string is also in the bio page's tests/consent.test.mts: one answer serves both sites, so one list.
    expect(CONSENT_COUNTRIES.join(',')).toBe('AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,AX,GF,GP,MQ,RE,YT,MF,IS,LI,NO,GB,JE,GG,IM,GI,CH')
    expect(new Set(CONSENT_COUNTRIES).size).toBe(CONSENT_COUNTRIES.length)
    // Switzerland is asked because two of the tags are Google's, and Google's consent policy covers visitors there.
    for (const c of ['GB', 'IE', 'FR', 'DE', 'ES', 'IT', 'NL', 'SE', 'PL', 'NO', 'IS', 'LI', 'JE', 'GI', 'RE', 'CY', 'CH']) expect(inConsentRegion(c, 'America/Toronto'), c).toBe(true)
    // Where our guests mostly are, and Jamaica itself.
    for (const c of ['US', 'CA', 'JM', 'MX', 'AU', 'BR', 'TR', 'FO']) expect(inConsentRegion(c, 'Europe/London'), c).toBe(false)
    for (const c of CONSENT_COUNTRIES) expect(c).toMatch(/^[A-Z]{2}$/)
  })

  test('the clock rule covers every part of the list that keeps time outside "Europe/"', () => {
    // Without these, a visitor in Limassol or Saint-Denis whose lookup failed was placed outside the region.
    const where: Record<string, string> = {
      'Asia/Nicosia': 'CY', 'Asia/Famagusta': 'CY', 'Africa/Ceuta': 'ES', 'Atlantic/Canary': 'ES', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT',
      'Atlantic/Reykjavik': 'IS', 'America/Cayenne': 'GF', 'America/Guadeloupe': 'GP', 'America/Martinique': 'MQ', 'America/Marigot': 'MF', 'Indian/Reunion': 'RE', 'Indian/Mayotte': 'YT',
    }
    expect([...REGION_ZONES_OUTSIDE_EUROPE].sort()).toEqual(Object.keys(where).sort())
    for (const [tz, country] of Object.entries(where)) {
      expect(inConsentRegion(null, tz), tz).toBe(true)
      expect(CONSENT_COUNTRIES, tz).toContain(country)
    }
    // Every territory in the list with a clock of its own is one of them.
    for (const c of ['GF', 'GP', 'MQ', 'RE', 'YT', 'MF', 'CY', 'IS']) expect(Object.values(where), c).toContain(c)
    // Their neighbours are not swept in with them.
    for (const tz of ['Asia/Beirut', 'Africa/Casablanca', 'America/Paramaribo', 'America/St_Lucia', 'Indian/Mauritius', 'Atlantic/Faroe', 'Atlantic/Bermuda']) expect(inConsentRegion(null, tz), tz).toBe(false)
  })

  test('a two-letter answer that is not a country: "UK" and "EU" mean the region, and the placeholders mean "not known"', () => {
    expect(inConsentRegion('UK', 'America/Toronto')).toBe(true)
    expect(inConsentRegion('EU', 'America/Toronto')).toBe(true)
    expect(inConsentRegion('eu', null)).toBe(true)
    for (const code of ['XX', 'ZZ', 'AP', 'A1', 'O1', 'T1']) {
      expect(knownCountry(code), code).toBe(null)
      expect(inConsentRegion(code, 'Europe/Berlin'), code).toBe(true) // the clock decides
      expect(inConsentRegion(code, 'America/Toronto'), code).toBe(false)
    }
    expect(knownCountry(' gb ')).toBe('GB')
    expect(knownCountry('US')).toBe('US')
    for (const bad of [null, undefined, '', 'GBR', '1', 12 as unknown as string]) expect(knownCountry(bad), String(bad)).toBe(null)
  })

  test('the country decides when it is known, whatever the clock says; case and spaces do not matter', () => {
    expect(inConsentRegion('US', 'Europe/Paris')).toBe(false)
    expect(inConsentRegion('gb', 'America/New_York')).toBe(true)
    expect(inConsentRegion(' de ', null)).toBe(true)
  })

  test('with no country, the browser time zone decides; with neither, the visitor is asked', () => {
    for (const tz of ['Europe/London', 'Europe/Berlin', 'Europe/Dublin', 'Atlantic/Canary', 'Atlantic/Reykjavik']) expect(inConsentRegion(null, tz), tz).toBe(true)
    for (const tz of ['America/Toronto', 'America/New_York', 'America/Jamaica', 'Asia/Tokyo', 'Atlantic/Bermuda']) expect(inConsentRegion(null, tz), tz).toBe(false)
    expect(inConsentRegion(null, null)).toBe(true)
    expect(inConsentRegion('', '')).toBe(true)
    // A clock that hides its place is not a place: a browser set to resist fingerprinting says UTC wherever it is.
    for (const tz of ['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT+5', 'utc']) expect(inConsentRegion(null, tz), tz).toBe(true)
    expect(inConsentRegion('US', 'UTC')).toBe(false)
    // Something that is not a country code is not a country.
    expect(inConsentRegion('GBR', 'America/Toronto')).toBe(false)
    expect(inConsentRegion('1', 'Europe/Paris')).toBe(true)
  })
})

describe('the rule', () => {
  test('every combination', () => {
    const cases: Array<[boolean, 'yes' | 'no' | 'na' | null, boolean | null, string]> = [
      // Do Not Track or Global Privacy Control wins over everything, a yes included.
      [true, 'yes', true, 'deny'], [true, 'yes', false, 'deny'], [true, null, null, 'deny'], [true, 'na', false, 'deny'], [true, 'no', true, 'deny'],
      // A stored answer is the answer, in the region or out of it.
      [false, 'yes', true, 'allow'], [false, 'yes', null, 'allow'], [false, 'yes', false, 'allow'],
      [false, 'no', true, 'deny'], [false, 'no', null, 'deny'], [false, 'no', false, 'deny'],
      // Known to be outside the region within the last day.
      [false, 'na', null, 'allow'], [false, 'na', false, 'allow'],
      // Nothing stored: wait until the visitor is placed, then ask in the region and allow outside it.
      [false, null, null, 'wait'], [false, null, true, 'ask'], [false, null, false, 'allow'],
    ]
    for (const [optedOut, stored, region, want] of cases) expect(decide({ optedOut, stored, region }), JSON.stringify([optedOut, stored, region])).toBe(want)
  })

  test('nothing but a yes, or being outside the region, ever allows', () => {
    for (const optedOut of [true, false]) for (const stored of ['yes', 'no', 'na', null] as const) for (const region of [true, false, null]) {
      const d = decide({ optedOut, stored, region })
      if (d === 'allow') expect(!optedOut && (stored === 'yes' || stored === 'na' || (stored === null && region === false))).toBe(true)
    }
  })
})

describe('the cookie', () => {
  test('is written for the whole of mapltours.com, so the bio page and the site share one answer', () => {
    expect(consentCookie('yes', 'mapltours.com', true, T0)).toBe(`mapl_consent=yes.${T0 / 1000}; Path=/; Max-Age=${ANSWER_MAX_AGE_S}; SameSite=Lax; Secure; Domain=.mapltours.com`)
    expect(consentCookie('no', 'bio.mapltours.com', true, T0)).toContain('; Domain=.mapltours.com')
    expect(consentCookie('na', 'www.mapltours.com', true, T0)).toContain(`Max-Age=${NA_MAX_AGE_S};`)
    // Anywhere else it belongs to that host alone, and is not marked Secure over plain http.
    expect(consentCookie('yes', 'localhost', false, T0)).toBe(`mapl_consent=yes.${T0 / 1000}; Path=/; Max-Age=${ANSWER_MAX_AGE_S}; SameSite=Lax`)
    expect(consentCookie('yes', 'notmapltours.com', true, T0)).not.toContain('Domain=')
    expect(consentCookie('yes', 'mapltours.com.evil.example', true, T0)).not.toContain('Domain=')
    expect(CONSENT_COOKIE).toBe('mapl_consent')
    expect(ANSWER_MAX_AGE_S).toBe(180 * 86_400)
  })

  test('is read back among other cookies, and only while it is good', () => {
    const at = T0 / 1000
    expect(readConsentCookie(`_ga=GA1.1.1; mapl_consent=yes.${at}; x=1`, T0)).toBe('yes')
    expect(readConsentCookie(`mapl_consent=no.${at}`, T0 + 179 * DAY)).toBe('no')
    expect(readConsentCookie(`mapl_consent=no.${at}`, T0 + 181 * DAY)).toBe(null)
    expect(readConsentCookie(`mapl_consent=na.${at}`, T0 + DAY - 1000)).toBe('na')
    expect(readConsentCookie(`mapl_consent=na.${at}`, T0 + DAY + 1000)).toBe(null)
    // Not ours, not whole, or stamped in the future.
    for (const bad of ['', 'mapl_consent=yes', 'mapl_consent=maybe.1763143200', 'xmapl_consent=yes.1763143200', `mapl_consent=yes.${at}0000`, 'mapl_consent=yes.abc', `mapl_consent=yes.${at + 3600}`]) expect(readConsentCookie(bad, T0), bad).toBe(null)
    expect(readConsentCookie(null, T0)).toBe(null)
    expect(readConsentCookie(undefined, T0)).toBe(null)
  })

  test('the names of the tags\' own cookies are picked out, and nothing else', () => {
    expect(trackerCookieNames('_ga=1; _ga_2JVWPL4GBE=2; _gid=3; _gcl_au=4; _gcl_aw=5; _fbp=6; _fbc=7; _hjSession_123=8; _hjSessionUser_123=9')).toEqual(['_ga', '_ga_2JVWPL4GBE', '_gid', '_gcl_au', '_gcl_aw', '_fbp', '_fbc', '_hjSession_123', '_hjSessionUser_123'])
    expect(trackerCookieNames('mapl_consent=yes.1; mapl_trip=x; sb-access-token=y; __stripe_mid=z; _gaming=1; fbp=1')).toEqual([])
    expect(trackerCookieNames(null)).toEqual([])
  })
})

describe('in the browser, on the live site', () => {
  test('a visitor outside the region is placed once, allowed, and remembered for a day without being asked', async () => {
    const jar = browser()
    expect(consentDecision(false)).toBe('wait') // the tags wait for this
    // The paths that cannot wait go by the browser's clock for that moment: Toronto is outside the region.
    expect(consentBlocksTracking()).toBe(false)
    let asked = 0
    const region = await resolveRegion(async () => { asked++; return 'CA' })
    expect(region).toBe(false)
    expect(consentDecision(false)).toBe('allow')
    expect(consentBlocksTracking()).toBe(false)
    expect(storedConsent()).toBe('na')
    expect(jar.writes).toEqual([`mapl_consent=na.${T0 / 1000}; Path=/; Max-Age=86400; SameSite=Lax; Secure; Domain=.mapltours.com`])
    // Asked for the country once per page load, however many callers there are.
    await resolveRegion(async () => { asked++; return 'GB' })
    expect(asked).toBe(1)
    // The next page load reads the cookie and does not need to wait.
    __resetConsentForTests()
    expect(consentDecision(false)).toBe('allow')
    expect(trackingOptedOut()).toBe(false)
  })

  test('a visitor in the region is asked, nothing is stored until they answer, and until then they count as opted out', async () => {
    const jar = browser()
    expect(await resolveRegion(async () => 'GB')).toBe(true)
    expect(consentDecision(false)).toBe('ask')
    expect(jar.writes).toEqual([])
    expect(jar.cookie).toBe('')
    expect(consentBlocksTracking()).toBe(true)
    expect(trackingOptedOut()).toBe(true)
    // The booking made now tells the server not to report it to Meta or GA4.
    expect(getStoredAttribution()).toEqual({ dnt: '1' })
  })

  test('yes turns everything on and is remembered for 180 days; listeners hear it', async () => {
    const jar = browser()
    await resolveRegion(async () => 'FR')
    let heard = 0
    const off = onConsentChange(() => { heard++ })
    setConsent('yes')
    expect(heard).toBe(1)
    expect(storedConsent()).toBe('yes')
    expect(jar.writes[0]).toBe(`mapl_consent=yes.${T0 / 1000}; Path=/; Max-Age=${ANSWER_MAX_AGE_S}; SameSite=Lax; Secure; Domain=.mapltours.com`)
    expect(consentDecision(false)).toBe('allow')
    expect(trackingOptedOut()).toBe(false)
    expect(getStoredAttribution()).toBe(null) // no opt-out flag, and nothing else recorded in this test
    off()
    setConsent('yes')
    expect(heard).toBe(1)
    // 181 days later the answer has lapsed and the visitor is asked again.
    vi.setSystemTime(T0 + 181 * DAY)
    __resetConsentForTests(true)
    expect(consentDecision(false)).toBe('ask')
  })

  test('no keeps everything off, and clears the cookies the tags had set, on the host and on the shared domain', async () => {
    const jar = browser()
    await resolveRegion(async () => 'DE')
    setConsent('yes')
    jar.cookie = '_ga=GA1.1.1'; jar.cookie = '_fbp=fb.1.2.3'; jar.cookie = '_hjSession_55=abc'; jar.cookie = 'mapl_trip=keep'; jar.cookie = '__stripe_mid=keep'
    jar.writes.length = 0
    setConsent('no')
    expect(storedConsent()).toBe('no')
    expect(consentDecision(false)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
    expect(jar.cookie).toBe(`mapl_consent=no.${T0 / 1000}; mapl_trip=keep; __stripe_mid=keep`)
    for (const name of ['_ga', '_fbp', '_hjSession_55']) {
      expect(jar.writes).toContain(`${name}=; Path=/; Max-Age=0; Domain=.mapltours.com`)
      expect(jar.writes).toContain(`${name}=; Path=/; Max-Age=0`)
    }
    // A no is an answer: the visitor is not asked again on the next page.
    __resetConsentForTests(true)
    expect(consentDecision(false)).toBe('deny')
  })

  test('a visitor outside the region can still say no, from the footer, and it holds', async () => {
    browser()
    await resolveRegion(async () => 'US')
    expect(trackingOptedOut()).toBe(false)
    setConsent('no')
    expect(consentDecision(false)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
    expect(getStoredAttribution()).toEqual({ dnt: '1' })
  })

  test('when the country lookup fails, the browser time zone places the visitor; with neither, they are asked', async () => {
    browser({ tz: 'Europe/London' })
    expect(await resolveRegion(async () => { throw new Error('offline') })).toBe(true)
    expect(consentDecision(false)).toBe('ask')
    __resetConsentForTests()
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    browser({ tz: 'America/New_York' })
    expect(await resolveRegion(async () => null)).toBe(false)
    expect(consentDecision(false)).toBe('allow')
    __resetConsentForTests()
    vi.unstubAllGlobals(); vi.restoreAllMocks()
    browser({ tz: null })
    expect(await resolveRegion(async () => null)).toBe(true)
  })

  test('before the visitor is placed, or if the lookup never runs, the clock stands in: a European one is blocked, any other is not', () => {
    browser({ tz: 'Europe/London' })
    expect(consentDecision(false)).toBe('wait')
    expect(consentBlocksTracking()).toBe(true)
    expect(trackingOptedOut()).toBe(true)
    expect(getStoredAttribution()).toEqual({ dnt: '1' })
    vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetConsentForTests()
    browser({ tz: 'America/Chicago' })
    expect(consentDecision(false)).toBe('wait')
    expect(consentBlocksTracking()).toBe(false)
    expect(getStoredAttribution()).toBe(null)
    // No clock to go by at all: blocked.
    vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetConsentForTests()
    browser({ tz: null })
    expect(consentBlocksTracking()).toBe(true)
    // A stored yes is a yes without any lookup, wherever the clock says the visitor is.
    vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetConsentForTests()
    const jar = browser({ tz: 'Europe/Paris' })
    jar.cookie = `mapl_consent=yes.${T0 / 1000}`
    expect(consentBlocksTracking()).toBe(false)
  })

  test('placing the visitor tells whoever is listening, like an answer does', async () => {
    browser({ tz: 'Europe/Istanbul' })
    let heard = 0
    onConsentChange(() => { heard++ })
    expect(consentUndecided()).toBe(true)
    expect(consentBlocksTracking()).toBe(true) // a European clock, not yet placed
    await resolveRegion(async () => 'TR')
    expect(heard).toBe(1)
    expect(consentUndecided()).toBe(false)
    expect(consentBlocksTracking()).toBe(false)
  })

  test('"outside the region" is remembered only when the lookup named a country; a visitor placed by the clock is looked up again on the next page', async () => {
    const jar = browser({ tz: 'America/Toronto' })
    for (const answer of [null, 'XX', '', 'A1']) {
      __resetConsentForTests()
      expect(await resolveRegion(async () => answer), String(answer)).toBe(false)
      expect(consentDecision(false), String(answer)).toBe('allow') // for this page
      expect(jar.writes, String(answer)).toEqual([])
      expect(storedConsent(), String(answer)).toBe(null)
    }
    __resetConsentForTests()
    expect(await resolveRegion(async () => { throw new Error('offline') })).toBe(false)
    expect(jar.writes).toEqual([])
    // The next page load starts over.
    __resetConsentForTests()
    expect(consentDecision(false)).toBe('wait')
    // A named country is remembered.
    expect(await resolveRegion(async () => 'JM')).toBe(false)
    expect(jar.writes.length).toBe(1)
    expect(storedConsent()).toBe('na')
  })

  test('the day-long "outside the region" cookie lapsing while a page is open changes nothing on that page', async () => {
    const jar = browser({ tz: 'Europe/Istanbul' }) // a clock that would be blocked if the page fell back to it
    jar.cookie = `mapl_consent=na.${T0 / 1000 - 86_000}` // written almost a day ago
    expect(consentDecision(false)).toBe('allow')
    expect(consentBlocksTracking()).toBe(false)
    vi.setSystemTime(T0 + 10 * 60_000) // ten minutes on: the cookie is past its day
    expect(storedConsent()).toBe(null)
    expect(consentDecision(false)).toBe('allow')
    expect(consentBlocksTracking()).toBe(false)
    expect(trackingOptedOut()).toBe(false)
    expect(consentUndecided()).toBe(false)
  })

  test('the lookup is cut off at three seconds, and the clock decides instead', async () => {
    // Real timers for this one (the cut-off is a real timer), set before the browser is stubbed: the fake clock
    // carries its own Intl, and leaving it would take the stubbed time zone with it.
    vi.useRealTimers()
    browser({ tz: 'Europe/Madrid' })
    expect(GEO_TIMEOUT_MS).toBe(3000)
    // A lookup that never answers by itself: it ends only when its signal says stop.
    const seen: Array<{ url: string; cache?: string; hasSignal: boolean }> = []
    vi.stubGlobal('fetch', (url: string, init?: { signal?: AbortSignal; cache?: string }) => new Promise((_resolve, reject) => {
      seen.push({ url, cache: init?.cache, hasSignal: init?.signal instanceof AbortSignal })
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const started = Date.now()
    expect(await resolveRegion(() => countryFromGeoEndpoint(40))).toBe(true) // Madrid's clock
    expect(Date.now() - started).toBeLessThan(1500)
    expect(seen).toEqual([{ url: '/api/geo', cache: 'no-store', hasSignal: true }])
  })

  test('a browser that refuses cookies can still answer: the answer lasts for the page, and the card goes away', async () => {
    browser({ tz: 'Europe/Dublin' })
    const refusing = { get cookie(): string { throw new Error('SecurityError') }, set cookie(_v: string) { throw new Error('SecurityError') } }
    vi.stubGlobal('document', refusing)
    expect(await resolveRegion(async () => 'IE')).toBe(true)
    expect(consentDecision(false)).toBe('ask')
    expect(() => setConsent('no')).not.toThrow()
    expect(consentDecision(false)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
    expect(() => setConsent('yes')).not.toThrow()
    expect(consentDecision(false)).toBe('allow')
    expect(trackingOptedOut()).toBe(false)
    // The next page load has nothing to read, and asks again.
    __resetConsentForTests(true)
    expect(consentDecision(false)).toBe('ask')
  })

  test('a cookie that will not take the new answer does not outvote the visitor: the answer given on the page stands', async () => {
    // An older "outside the region" cookie can still be read, but writes are dropped (a full jar, a blocking extension).
    const jar = browser()
    jar.cookie = `mapl_consent=na.${T0 / 1000}`
    const frozen = { get cookie(): string { return jar.cookie }, set cookie(_v: string) { /* dropped */ } }
    vi.stubGlobal('document', frozen)
    expect(consentDecision(false)).toBe('allow')
    setConsent('no')
    expect(storedConsent()).toBe('no')
    expect(consentDecision(false)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
    setConsent('yes')
    expect(consentDecision(false)).toBe('allow')
  })

  test('once the cookie holds the answer, the cookie is what counts: an answer given later in another tab is read', async () => {
    const jar = browser()
    await resolveRegion(async () => 'GB')
    setConsent('yes')
    expect(consentDecision(false)).toBe('allow')
    // The other tab says no: it rewrites the shared cookie.
    jar.cookie = `mapl_consent=no.${T0 / 1000}`
    expect(storedConsent()).toBe('no')
    expect(consentDecision(false)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
  })

  test('watching the decision: read at once, a lookup started whenever it is "wait", read again on an answer and when the tab is looked at again', async () => {
    const jar = browser({ tz: 'America/Toronto' })
    const doc = jar as unknown as { visibilityState: string; addEventListener: (t: string, l: () => void) => void; removeEventListener: (t: string, l: () => void) => void }
    const docListeners = new Map<string, Set<() => void>>()
    doc.visibilityState = 'visible'
    doc.addEventListener = (t, l) => { if (!docListeners.has(t)) docListeners.set(t, new Set()); docListeners.get(t)!.add(l) }
    doc.removeEventListener = (t, l) => { docListeners.get(t)?.delete(l) }
    const seen: ConsentDecision[] = []
    let lookups = 0
    const watch = watchConsent((d) => { seen.push(d) }, () => false, async () => { lookups++; return 'GB' })
    expect(seen).toEqual(['wait'])
    await resolveRegion(async () => 'never asked: the lookup above is the one in flight')
    await Promise.resolve()
    expect(lookups).toBe(1)
    expect(seen[seen.length - 1]).toBe('ask')
    setConsent('yes')
    expect(seen[seen.length - 1]).toBe('allow')
    // Another tab says no: nothing tells this page until it is looked at again.
    jar.cookie = `mapl_consent=no.${T0 / 1000}`
    expect(seen[seen.length - 1]).toBe('allow')
    for (const l of Array.from(docListeners.get('visibilitychange') ?? [])) l()
    expect(seen[seen.length - 1]).toBe('deny')
    // On demand (a change of page).
    jar.cookie = `mapl_consent=yes.${T0 / 1000}`
    watch.read()
    expect(seen[seen.length - 1]).toBe('allow')
    // The answer lapses while the page is open: a visitor in the region is asked again, with no second lookup needed.
    vi.setSystemTime(T0 + 181 * DAY)
    watch.read()
    expect(seen[seen.length - 1]).toBe('ask')
    expect(lookups).toBe(1)
    // Stopped, it hears nothing more.
    const n = seen.length
    watch.stop()
    setConsent('no')
    watch.read()
    expect(seen.length).toBe(n)
    expect(docListeners.get('visibilitychange')?.size ?? 0).toBe(0)
  })

  test('watching the decision: an answer that lapses on a page that never looked the country up starts the lookup then', async () => {
    const jar = browser({ tz: 'Europe/Dublin' })
    jar.cookie = `mapl_consent=yes.${T0 / 1000 - 179 * 86_400}` // a yes from 179 days ago
    const seen: ConsentDecision[] = []
    let lookups = 0
    const watch = watchConsent((d) => { seen.push(d) }, () => false, async () => { lookups++; return 'IE' })
    expect(seen).toEqual(['allow'])
    expect(lookups).toBe(0)
    vi.setSystemTime(T0 + 2 * DAY) // the 180 days are up
    watch.read()
    expect(seen[seen.length - 1]).toBe('wait')
    expect(lookups).toBe(1) // "wait" is never left standing
    await resolveRegion(async () => null)
    await Promise.resolve()
    expect(seen[seen.length - 1]).toBe('ask')
    watch.stop()
  })

  test('a visitor who arrives having said no elsewhere has the tags\' cookies cleared once, as the page starts watching', () => {
    const jar = browser()
    jar.cookie = `mapl_consent=no.${T0 / 1000}`
    jar.cookie = '_ga=GA1.1.1.2'; jar.cookie = '_gac_UA1=1.2.3'; jar.cookie = '_fbp=fb.1.2.3'; jar.cookie = 'mapl_trip=keep'
    const seen: ConsentDecision[] = []
    const watch = watchConsent((d) => { seen.push(d) }, () => false, async () => 'GB')
    expect(seen).toEqual(['deny'])
    expect(jar.cookie).toBe(`mapl_consent=no.${T0 / 1000}; mapl_trip=keep`)
    watch.stop()
    // A yes, or no answer at all, clears nothing.
    __resetConsentForTests()
    jar.cookie = `mapl_consent=yes.${T0 / 1000}`
    jar.cookie = '_ga=GA1.1.1.2'
    watchConsent(() => {}, () => false, async () => 'GB').stop()
    expect(jar.cookie).toContain('_ga=GA1.1.1.2')
  })

  test('"Cookie Preferences" hands over the button it was opened from, so the keyboard can go back to it', () => {
    browser()
    const button = { tagName: 'BUTTON' } as unknown as HTMLElement
    const got: Array<HTMLElement | null> = []
    const off = onConsentPromptRequest((from) => { got.push(from) })
    requestConsentPrompt(button)
    expect(got).toEqual([button])
    // No button handed over, and nothing focused that could stand in for it: null, never a throw.
    requestConsentPrompt()
    expect(got).toEqual([button, null])
    off()
    requestConsentPrompt(button)
    expect(got.length).toBe(2)
  })

  test('Do Not Track still wins: a yes does not undo it', async () => {
    browser({ dnt: true })
    await resolveRegion(async () => 'GB')
    setConsent('yes')
    expect(consentDecision(true)).toBe('deny')
    expect(trackingOptedOut()).toBe(true)
    expect(getStoredAttribution()).toEqual({ dnt: '1' })
  })

  test('clearing cookies off the live domain touches only that host', () => {
    const jar = browser({ host: 'localhost', protocol: 'http:' })
    jar.cookie = '_ga=1'
    jar.writes.length = 0
    clearTrackerCookies()
    expect(jar.writes).toEqual(['_ga=; Path=/; Max-Age=0'])
  })
})

describe('anywhere but the live site', () => {
  test('consent never blocks, because nothing is tracked there: dev, previews and tests behave as before', async () => {
    browser({ host: 'localhost', protocol: 'http:' })
    expect(consentBlocksTracking()).toBe(false)
    expect(trackingOptedOut()).toBe(false)
    await resolveRegion(async () => 'GB')
    expect(consentDecision(false)).toBe('ask')
    expect(consentBlocksTracking()).toBe(false)
    expect(getStoredAttribution()).toBe(null)
    for (const host of ['deploy-preview-12--mapltours.netlify.app', '6af8e3711e85182e80e2c8cd--mapltours.netlify.app', 'bio.mapltours.com']) {
      vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetConsentForTests(true)
      browser({ host })
      expect(consentBlocksTracking(), host).toBe(false)
    }
  })

  test('on the server there is no visitor to ask', () => {
    expect(storedConsent()).toBe(null)
    expect(consentBlocksTracking()).toBe(false)
    expect(trackingOptedOut()).toBe(false)
    setConsent('yes') // does nothing, and does not throw
    expect(onConsentChange(() => {})()).toBe(undefined)
  })
})
