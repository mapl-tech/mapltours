/**
 * Booking attribution: where a customer came from.
 *
 * Client side, captureAttribution() records the visitor's landing context
 * (external referrer + UTM/click IDs) in localStorage using last-non-direct
 * logic: a visit WITH signal overwrites, a direct visit never erases an
 * earlier source. getStoredAttribution() is attached to the checkout payload.
 *
 * Beside it, a separate FIRST-touch record (FIRST_TOUCH_KEY) keeps the first
 * landing WITH signal and is never overwritten while it is younger than
 * MAX_AGE_DAYS, so a guest who found us through ChatGPT and booked a day
 * later from the code email is credited to both. It rides along in the
 * checkout payload as flat first_* keys; the last-touch record above, its
 * key and its rules are untouched by it.
 *
 * Server side, sanitizeAttribution() is the trust boundary: allowlisted keys,
 * strings only, control characters stripped, hard length caps, never throws.
 * Attribution is best-effort garnish and must never be able to fail a
 * checkout; the API routes additionally gate the write on the live schema
 * having the column (see lib/checkout-schema.ts).
 */

const KEY = 'mapl-attribution'
const MAX_AGE_DAYS = 90

const ALLOWED_KEYS = [
  'referrer', 'source', 'medium', 'campaign', 'term', 'content',
  'gclid', 'fbclid', 'landing', 'ts',
  // GA4 client and session ids, read from the GA cookies at checkout so the
  // Stripe webhook can report the purchase server-side against the same
  // session (and therefore the same Google Ads click). See lib/ga4-server.
  'ga_client_id', 'ga_session_id',
  // Meta's browser cookies (_fbp browser id, _fbc click id), read the same way
  // so the webhook's Conversions API call can match the purchase to the ad
  // click even when the pixel never fired. See lib/meta-capi.
  'fbp', 'fbc',
  // The visitor's tracking opt-out, recorded at checkout so SERVER-side
  // reporting can honour it too. components/Trackers already withholds every
  // tag from a visitor sending Do Not Track or Global Privacy Control, but
  // the Conversions API fires from the Stripe webhook long after that
  // decision, and it matches on the hashed email rather than a cookie, so
  // nothing about the browser's choice would otherwise reach it. GA4 is
  // implicitly safe because it needs a _ga cookie the opted-out visitor never
  // got; Meta is not. See lib/meta-capi.
  'dnt',
  // The first outside touch (FIRST_TOUCH_KEY), flattened by
  // getStoredAttribution. Reporting only: nothing hashes, prices or sends
  // these anywhere; the last-touch keys above keep their meaning.
  'first_source', 'first_medium', 'first_campaign', 'first_term', 'first_content',
  'first_referrer', 'first_landing', 'first_ts',
  // An ad click that was the first touch. Only the admin label reads these:
  // lib/meta-capi reads fbclid and fbc, lib/ga4-server the GA ids, never these.
  'first_gclid', 'first_fbclid',
  // The browser that booked, as a coarse family ("chrome-linux"), read from
  // navigator.userAgent when the checkout POSTs. Only the values
  // browserFamily() can produce are kept (see sanitizeAttribution): no
  // version, no device, nothing that could single anyone out. Reporting only;
  // nothing hashes, prices or sends it anywhere.
  'ua',
] as const

/** The GA4 web stream this site loads (components/Trackers). */
export const GA4_MEASUREMENT_ID = 'G-2JVWPL4GBE'

/**
 * GA4 client and session ids from a document.cookie string.
 *
 *   _ga                  GA1.1.<client a>.<client b>   -> client_id "a.b"
 *   _ga_<CONTAINER>      GS1.1.<session>.<n>...        (pre-2025)
 *                        GS2.1.s<session>$o<n>$g...    (2025 onward)
 *
 * The container is the measurement id without "G-". Pure so it is testable;
 * missing or malformed cookies yield nothing rather than a guess.
 */
export function readGaIds(cookie: string, measurementId: string = GA4_MEASUREMENT_ID): { ga_client_id?: string; ga_session_id?: string } {
  const out: { ga_client_id?: string; ga_session_id?: string } = {}
  try {
    const jar = new Map<string, string>()
    for (const part of (cookie ?? '').split(';')) {
      const i = part.indexOf('=')
      if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
    }
    const ga = jar.get('_ga')
    const client = ga?.match(/^GA1\.\d+\.(\d+\.\d+)$/)?.[1]
    if (client) out.ga_client_id = client
    const sess = jar.get(`_ga_${measurementId.replace(/^G-/, '')}`)
    const session = sess?.match(/^GS2\.\d+\.s(\d+)/)?.[1] ?? sess?.match(/^GS1\.\d+\.(\d+)\./)?.[1]
    if (session) out.ga_session_id = session
  } catch { /* a bad cookie is not worth a broken checkout */ }
  return out
}

/**
 * Does this visitor's browser ask not to be tracked?
 *
 * Deliberately duplicated from components/Trackers rather than imported: that
 * is a client component, and this module is also pulled into server code.
 * Both must agree, so change them together.
 */
export function trackingOptedOut(): boolean {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    const dnt =
      navigator.doNotTrack === '1' ||
      (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack === '1' ||
      (window as unknown as { doNotTrack?: string }).doNotTrack === '1'
    const gpc =
      (window as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true ||
      (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    return dnt || gpc
  } catch {
    return false
  }
}

/**
 * Meta's `_fbp` (browser id) and `_fbc` (click id) cookies from a
 * document.cookie string, so the Stripe webhook can pass them to the
 * Conversions API for matching. Both cookies carry the `fb.<n>.<...>` shape
 * the API expects; anything malformed is dropped rather than guessed. Pure and
 * testable, mirroring readGaIds. See lib/meta-capi.
 */
export function readMetaIds(cookie: string): { fbp?: string; fbc?: string } {
  const out: { fbp?: string; fbc?: string } = {}
  try {
    const jar = new Map<string, string>()
    for (const part of (cookie ?? '').split(';')) {
      const i = part.indexOf('=')
      if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim())
    }
    const fbp = jar.get('_fbp')
    if (fbp && /^fb\.\d+\.\d+\.\d+$/.test(fbp)) out.fbp = fbp
    const fbc = jar.get('_fbc')
    if (fbc && /^fb\.\d+\.\d+\./.test(fbc)) out.fbc = fbc
  } catch { /* a bad cookie is not worth a broken checkout */ }
  return out
}

export type Attribution = Partial<Record<(typeof ALLOWED_KEYS)[number], string>>

/** Strip control characters (Postgres jsonb rejects U+0000; none are wanted). */
function scrub(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, '').trim()
}

/** Mid-purchase and post-payment pages: never capture here. Stripe/3DS
 *  redirects land on these with bank referrers and secret-bearing query
 *  strings; recording either would pollute or leak (adversarial-review fix). */
function isCapturePausedPath(pathname: string): boolean {
  return pathname.startsWith('/checkout') || pathname.startsWith('/transfers/checkout') || pathname.startsWith('/transfers/confirm')
}

/** Where the first outside touch lives. Its own key, so the last-touch
 *  record under KEY is never read differently or written differently. */
const FIRST_TOUCH_KEY = 'mapl-first-touch'

/** What a first touch keeps: every field a landing records. The click ids
 *  are kept so a landing from an ad click alone still names the ad; the ad
 *  platforms only ever read the last touch's. Tracking cookies stay with the
 *  last touch. */
const FIRST_TOUCH_FIELDS = ['source', 'medium', 'campaign', 'term', 'content', 'referrer', 'gclid', 'fbclid', 'landing', 'ts'] as const

type FirstTouch = Partial<Record<(typeof FIRST_TOUCH_FIELDS)[number], string>>

/** The first-touch fields of a record: strings only, scrubbed, capped. */
function pickFirstTouch(rec: Record<string, unknown>): FirstTouch {
  const out: FirstTouch = {}
  for (const k of FIRST_TOUCH_FIELDS) {
    const v = rec[k]
    if (typeof v === 'string') {
      const clean = scrub(v).slice(0, 300)
      if (clean) out[k] = clean
    }
  }
  return out
}

/** A stored first touch, or null when there is none, it is corrupt (bad
 *  JSON, not an object, missing or unparseable ts) or it is older than
 *  MAX_AGE_DAYS. Expired counts as absent, as it does for the last touch.
 *  A ts more than a day in the future (written while the device clock ran
 *  fast) is corrupt too: a first touch is never overwritten while live, so
 *  it would otherwise hold the slot for 90 days plus the skew.
 *  Pure; never throws. */
function parseFirstTouch(raw: string | null): FirstTouch | null {
  try {
    if (!raw) return null
    const rec: unknown = JSON.parse(raw)
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null
    const ts = (rec as Record<string, unknown>).ts
    const ageMs = Date.now() - Date.parse(typeof ts === 'string' ? ts : '')
    if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_DAYS * 86400_000 || ageMs < -86400_000) return null
    return pickFirstTouch(rec as Record<string, unknown>)
  } catch {
    return null
  }
}

/** The live first touch in this browser, or null. Never throws. */
function readFirstTouch(): FirstTouch | null {
  try {
    return parseFirstTouch(localStorage.getItem(FIRST_TOUCH_KEY))
  } catch {
    return null
  }
}

/**
 * Keep `touch` as the first touch unless a live one is already stored. A
 * first touch is never overwritten before it expires, and nothing is written
 * when the stored one cannot even be read. Never throws, so a full or
 * blocked storage cannot disturb the last-touch write that follows it.
 */
function keepFirstTouch(touch: Attribution): void {
  try {
    if (parseFirstTouch(localStorage.getItem(FIRST_TOUCH_KEY))) return
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(pickFirstTouch(touch)))
  } catch { /* never break the page over analytics */ }
}

/** Where Google and Apple sign-in, Supabase auth and Stripe's payment
 *  redirects send a guest back from. None of them is how anyone found us. */
const RETURN_HOSTS = ['accounts.google.com', 'appleid.apple.com']
const RETURN_HOST_DOMAINS = ['supabase.co', 'stripe.com']
/** The params Stripe adds to a return_url (any provider or bank page in
 *  between leaves its own referrer, so the params are the reliable sign). */
const RETURN_PARAMS = ['payment_intent', 'payment_intent_client_secret', 'setup_intent', 'setup_intent_client_secret', 'redirect_status']

/**
 * Is this landing the guest coming BACK from sign-in or a payment step
 * rather than arriving from somewhere? Such a landing never becomes the
 * first touch, which would otherwise hold "accounts.google.com" or a bank
 * for 90 days. The last touch is not asked: it records it exactly as before
 * and the next outside visit replaces it.
 *
 * Reads the navigation entry as well as the address bar, because a page can
 * scrub its return params before this runs (GiftCardsView does, and child
 * effects run before LayoutShell's). `code` is Supabase's email-link return
 * (password reset, the claim-account link); a campaign link carries
 * utm_source, so a `code` beside one is left alone. Never throws.
 */
function isReturnLanding(): boolean {
  try {
    const searches = [window.location.search]
    try {
      const nav = performance.getEntriesByType('navigation')[0]
      if (nav?.name) searches.push(new URL(nav.name).search)
    } catch { /* no Navigation Timing: the address bar is all there is */ }
    for (const s of searches) {
      const p = new URLSearchParams(s)
      if (RETURN_PARAMS.some((k) => p.has(k))) return true
      if (p.has('code') && !p.has('utm_source')) return true
    }
    const p = new URLSearchParams(window.location.search)
    const tagged = p.has('utm_source') || p.has('gclid') || p.has('fbclid')
    if (!tagged && isReturnPage(window.location.pathname)) return true
    let host = ''
    try { host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '' } catch { host = '' }
    return isReturnHost(host)
  } catch {
    return false
  }
}

function isReturnHost(host: string): boolean {
  return RETURN_HOSTS.includes(host) || RETURN_HOST_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
}

/** Pages a guest only reaches coming back: sign-in, the account and booking
 *  emails' "view your booking" links, the driver and admin portals. A landing
 *  on one without a campaign tag or click id is never how anyone found us.
 *  (/gifts is not here: it is a public page people find from search.) */
const RETURN_PAGES = ['/login', '/profile', '/auth', '/driver', '/admin']

function isReturnPage(pathname: string): boolean {
  return RETURN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** When THIS browser first ran code that keeps first touches. Written
 *  once, from the same device clock as every record's ts, so "older than
 *  this" means "written before this browser could keep a first touch",
 *  whatever the deploy time or the device's clock. */
const FIRST_TOUCH_SINCE_KEY = 'mapl-first-touch-since'

/** The marker in ms, writing it on the first run. Null when it cannot be
 *  read, written or parsed: no seed is better than a wrong one. */
function firstTouchSince(): number | null {
  try {
    const raw = localStorage.getItem(FIRST_TOUCH_SINCE_KEY)
    if (raw != null) {
      const ms = Date.parse(raw)
      return Number.isFinite(ms) ? ms : null
    }
    const now = new Date().toISOString()
    localStorage.setItem(FIRST_TOUCH_SINCE_KEY, now)
    return localStorage.getItem(FIRST_TOUCH_SINCE_KEY) === now ? Date.parse(now) : null
  } catch {
    return null
  }
}

/**
 * The outside touch a browser recorded BEFORE it could keep first touches,
 * when it is fit to be the first touch: written before `sinceMs`, live
 * (90 days, not dated more than a day ahead), naming a source, referrer or
 * click id, and not a sign-in, payment or account-email return. Pure; never
 * throws.
 */
function priorOutsideTouch(existing: unknown, sinceMs: number): Attribution | null {
  try {
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return null
    const rec = existing as Record<string, unknown>
    const text = (v: unknown) => (typeof v === 'string' ? v : '')
    const tsMs = Date.parse(text(rec.ts))
    if (!Number.isFinite(tsMs) || tsMs >= sinceMs) return null
    const ageMs = Date.now() - tsMs
    if (ageMs > MAX_AGE_DAYS * 86400_000 || ageMs < -86400_000) return null
    const tagged = !!(text(rec.source) || text(rec.gclid) || text(rec.fbclid))
    if (!tagged && !text(rec.referrer)) return null
    let host = ''
    try { host = text(rec.referrer) ? new URL(text(rec.referrer)).hostname.toLowerCase() : '' } catch { host = '' }
    if (isReturnHost(host)) return null
    if (!tagged && isReturnPage(text(rec.landing))) return null
    return rec as Attribution
  } catch {
    return null
  }
}

/**
 * One-time migration, per browser. A browser that visited before first
 * touches were kept holds only its last outside touch; the first time it runs
 * this code, that older touch becomes its first touch, so a guest who came
 * from ChatGPT last week and returns today from the code email still credits
 * ChatGPT. Runs before anything else is written on the page load, whatever
 * the landing (direct, a sign-in return, a campaign). Records written after
 * the marker never qualify, so it acts once. Never throws.
 */
function seedFirstTouch(existing: unknown): void {
  try {
    const since = firstTouchSince()
    if (since === null) return
    const prior = priorOutsideTouch(existing, since)
    if (prior) keepFirstTouch(prior)
  } catch { /* never break the page over analytics */ }
}

/** Record the visit's origin. Safe to call on every page load; never throws. */
export function captureAttribution(): void {
  try {
    if (typeof window === 'undefined') return
    if (isCapturePausedPath(window.location.pathname)) return
    const p = new URLSearchParams(window.location.search)
    let referrer = ''
    try {
      const refHost = document.referrer ? new URL(document.referrer).hostname : ''
      const internal = !refHost || refHost === window.location.hostname || refHost.endsWith('.mapltours.com') || refHost === 'mapltours.com'
      if (!internal) referrer = scrub(document.referrer).slice(0, 300)
    } catch { /* unparseable referrer, treat as none */ }

    const fresh: Attribution = {}
    if (referrer) fresh.referrer = referrer
    for (const [param, key] of [
      ['utm_source', 'source'], ['utm_medium', 'medium'], ['utm_campaign', 'campaign'],
      ['utm_term', 'term'], ['utm_content', 'content'], ['gclid', 'gclid'], ['fbclid', 'fbclid'],
    ] as const) {
      const v = p.get(param)
      if (v) {
        const clean = scrub(v).slice(0, 200)
        if (clean) fresh[key] = clean
      }
    }
    const hasSignal = Object.keys(fresh).length > 0

    let existing: Attribution | null = null
    try { existing = JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { existing = null }
    seedFirstTouch(existing)
    // Corrupt or unparseable ts must count as expired, not immortal.
    const ageMs = Date.now() - Date.parse(existing?.ts ?? '')
    const expired = !Number.isFinite(ageMs) || ageMs > MAX_AGE_DAYS * 86400_000

    // Last-non-direct: overwrite on real signal; keep an unexpired source on
    // direct revisits; record a plain direct landing only when nothing stored.
    if (!hasSignal && existing && !expired) return
    // Pathname ONLY: query strings can carry secrets (payment intents, auth
    // codes); the campaign params we want are already captured above.
    fresh.landing = scrub(window.location.pathname).slice(0, 200)
    fresh.ts = new Date().toISOString()
    // First touch: the same fields, kept only from a landing WITH signal that
    // is not a sign-in or payment return, and only while no live first touch
    // exists. Reads `fresh`, never changes it.
    if (hasSignal && !isReturnLanding()) keepFirstTouch(fresh)
    localStorage.setItem(KEY, JSON.stringify(fresh))
  } catch { /* never break the page over analytics */ }
}

/** A visitor's browser agent (WebMCP) started a booking: record it as the
 *  source so agent-driven bookings are countable in the admin and in
 *  `bookings.attribution`. Overrides UTM/referrer source but keeps the
 *  referrer so we still know which page the agent came from. Never throws. */
export function markAgentAttribution(tool: string): void {
  try {
    if (typeof window === 'undefined') return
    let existing: Attribution | null = null
    try { existing = JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { existing = null }
    seedFirstTouch(existing)
    const fresh: Attribution = {
      ...(existing?.referrer ? { referrer: existing.referrer } : {}),
      source: 'webmcp',
      medium: 'browser-agent',
      content: scrub(tool).slice(0, 60),
      landing: scrub(window.location.pathname).slice(0, 200),
      ts: new Date().toISOString(),
    }
    // An agent-started booking with no earlier outside touch still gets one;
    // an existing first touch is left alone.
    keepFirstTouch(fresh)
    localStorage.setItem(KEY, JSON.stringify(fresh))
  } catch { /* never break the page over analytics */ }
}

/**
 * The stored attribution to attach to a checkout payload (or null), plus the
 * GA4 client and session ids as they stand at this moment. Called when the
 * checkout POSTs, which is the session we want the server-side purchase to
 * land in.
 *
 * A live first touch is added as flat first_* keys (first_source,
 * first_referrer, first_ts, ...). They never replace a last-touch key, and
 * the opt-out flag is added exactly as before. The booking browser's coarse
 * family is added as `ua` to a payload that exists anyway; it is read here,
 * at checkout, and never written to the stored record.
 */
export function getStoredAttribution(): Attribution | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(KEY)
    const stored = raw ? (JSON.parse(raw) as Attribution) : null
    const cookie = typeof document !== 'undefined' ? document.cookie : ''
    const ga = readGaIds(cookie)
    const meta = readMetaIds(cookie)
    const optOut: Attribution = trackingOptedOut() ? { dnt: '1' } : {}
    const first = firstTouchKeys(readFirstTouch())
    if (!stored && !Object.keys(first).length && !Object.keys(ga).length && !Object.keys(meta).length && !Object.keys(optOut).length) return null
    // Added only to a payload that exists anyway, so a guest with nothing
    // recorded still sends null, as before.
    return { ...(stored ?? {}), ...first, ...ga, ...meta, ...optOut, ...liveBrowserFamily() }
  } catch { return null }
}

/** This browser's family as the `ua` key, or nothing. Never throws. */
function liveBrowserFamily(): Attribution {
  try {
    const family = browserFamily(typeof navigator !== 'undefined' ? navigator.userAgent : undefined)
    return family ? { ua: family } : {}
  } catch {
    return {}
  }
}

const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other'] as const
const SYSTEMS = ['windows', 'mac', 'ios', 'android', 'chromeos', 'linux', 'other'] as const
/** Exactly the values browserFamily() can return. */
const BROWSER_FAMILY_RE = new RegExp(`^(${BROWSERS.join('|')})-(${SYSTEMS.join('|')})$`)

/**
 * A coarse browser family from a user-agent string: one of seven browsers
 * and seven systems ("chrome-linux", "safari-ios", "other-other"), never a
 * version or a device. Meta's Muse agent browses as ordinary Chrome on Linux,
 * so "chrome-linux" beside a booking is a hint, not proof: plenty of people
 * use that too. Null for a missing or empty string. Pure; never throws.
 */
export function browserFamily(userAgent: unknown): string | null {
  if (typeof userAgent !== 'string' || !userAgent.trim()) return null
  const ua = userAgent
  // Order matters: iOS says "like Mac OS X", Android says "Linux; Android".
  const system =
    /iPhone|iPad|iPod/.test(ua) ? 'ios'
    : /Android/.test(ua) ? 'android'
    : /CrOS/.test(ua) ? 'chromeos'
    : /Windows/.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'mac'
    : /Linux/.test(ua) ? 'linux'
    : 'other'
  // Edge, Opera and Samsung also say "Chrome/", and Chrome says "Safari/".
  const browser =
    /Edg(A|iOS)?\/|Edge\//.test(ua) ? 'edge'
    : /OPR\/|OPiOS\/|Opera/.test(ua) ? 'opera'
    : /SamsungBrowser\//.test(ua) ? 'samsung'
    : /Firefox\/|FxiOS\//.test(ua) ? 'firefox'
    : /CriOS\/|Chrome\/|Chromium\//.test(ua) ? 'chrome'
    : /Safari\//.test(ua) ? 'safari'
    : 'other'
  return `${browser}-${system}`
}

const BROWSER_NAMES: Record<(typeof BROWSERS)[number], string> = {
  chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', opera: 'Opera', other: 'Another browser',
}
const SYSTEM_NAMES: Record<(typeof SYSTEMS)[number], string> = {
  windows: 'Windows', mac: 'macOS', ios: 'iOS', android: 'Android', chromeos: 'ChromeOS', linux: 'Linux', other: 'another system',
}

/** "Chrome on Linux" for the admin card, or null for anything browserFamily()
 *  could not have produced. Never throws. */
export function browserLabel(ua: unknown): string | null {
  const m = typeof ua === 'string' ? BROWSER_FAMILY_RE.exec(ua) : null
  if (!m) return null
  return `${BROWSER_NAMES[m[1] as (typeof BROWSERS)[number]]} on ${SYSTEM_NAMES[m[2] as (typeof SYSTEMS)[number]]}`
}

/** A first touch as the flat first_* keys the checkout payload carries. */
function firstTouchKeys(touch: FirstTouch | null): Attribution {
  const out: Attribution = {}
  if (!touch) return out
  for (const k of FIRST_TOUCH_FIELDS) {
    const v = touch[k]
    if (v) out[`first_${k}`] = v
  }
  return out
}

/** Server trust boundary: allowlisted string fields, control characters
 *  stripped (jsonb rejects U+0000), capped, never throws. */
export function sanitizeAttribution(raw: unknown): Attribution | null {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const out: Attribution = {}
    for (const k of ALLOWED_KEYS) {
      const v = (raw as Record<string, unknown>)[k]
      if (typeof v === 'string') {
        const clean = scrub(v).slice(0, 300)
        // `ua` is kept only as a family browserFamily() can produce, so a
        // client can never store a full user-agent string through it.
        if (k === 'ua' && !BROWSER_FAMILY_RE.test(clean)) continue
        if (clean) out[k] = clean
      }
    }
    return Object.keys(out).length ? out : null
  } catch { return null }
}

/** What the admin card and the weekly report call every AI assistant's group. */
export const AI_ASSISTANT_GROUP = 'AI assistant'

/**
 * AI assistants that send guests here, how each one arrives, and its label.
 * `hosts` match the host itself or any subdomain, whether it arrives as the
 * referrer or as a utm_source written as a host ("chatgpt.com" is ChatGPT's
 * own tag); an Android app arrives as the referrer android-app://<package>/,
 * whose host is the package. `names` are bare utm_source values, the form
 * /llms.txt asks agents to use ("utm_source=muse").
 *
 * The assistants that already reached us keep the host they have always been
 * labelled with, so existing cards read as before. Muse is Meta's agent
 * (muse.ai, launched Sept 2026, Android app com.facebook.aura); meta.ai is
 * Meta's separate assistant. The bare source "meta" is deliberately absent:
 * here it means Meta's ads. Labels only: nothing stored, hashed, priced or
 * sent reads this.
 */
const AI_ASSISTANTS: ReadonlyArray<{ label: string; hosts: readonly string[]; names: readonly string[] }> = [
  { label: 'chatgpt.com', hosts: ['chatgpt.com', 'chat.openai.com', 'com.openai.chatgpt'], names: ['chatgpt'] },
  { label: 'perplexity.ai', hosts: ['perplexity.ai'], names: ['perplexity'] },
  { label: 'claude.ai', hosts: ['claude.ai'], names: ['claude'] },
  { label: 'gemini.google.com', hosts: ['gemini.google.com'], names: ['gemini'] },
  { label: 'copilot.microsoft.com', hosts: ['copilot.microsoft.com'], names: ['copilot'] },
  { label: 'meta.ai', hosts: ['meta.ai'], names: [] },
  { label: 'Muse (Meta AI)', hosts: ['muse.ai', 'com.facebook.aura'], names: ['muse'] },
]

function assistantByHost(host: string): string | null {
  const h = host.toLowerCase().replace(/\.+$/, '')
  if (!h) return null
  return AI_ASSISTANTS.find((a) => a.hosts.some((x) => h === x || h.endsWith(`.${x}`)))?.label ?? null
}

/** A utm_source: a bare name ("muse"), a host ("www.muse.ai") or a URL. Throws on a bad URL. */
function assistantBySource(source: string): string | null {
  const v = source.trim().toLowerCase()
  if (!v) return null
  const named = AI_ASSISTANTS.find((a) => a.names.includes(v))
  if (named) return named.label
  return assistantByHost(v.includes('://') ? new URL(v).hostname : v.split(/[/?#:]/)[0])
}

/**
 * The AI assistant a touch came from ("chatgpt.com", "Muse (Meta AI)"), or
 * null. Read the way attributionLabel reads a touch: the utm_source when
 * there is one, otherwise the referrer, so a booking tagged utm_source=bio
 * that happened to come through a chat link stays "bio". Never throws.
 */
export function aiAssistantLabel(a: { source?: unknown; referrer?: unknown } | null | undefined): string | null {
  try {
    if (!a || typeof a !== 'object') return null
    if (a.source) return typeof a.source === 'string' ? assistantBySource(a.source) : null
    if (a.referrer) return typeof a.referrer === 'string' ? assistantByHost(new URL(a.referrer).hostname) : null
    return null
  } catch {
    return null
  }
}

/** Human label for the admin card: "chatgpt.com", "google / cpc", "Direct".
 *  An AI assistant reads as its label ("Muse (Meta AI)"), with the medium
 *  when the link was tagged with one. */
export function attributionLabel(a: Attribution | null | undefined): string {
  if (!a) return 'Direct or unknown'
  const ai = aiAssistantLabel(a)
  if (ai) return a.source && a.medium ? `${ai} / ${a.medium}` : ai
  if (a.source) return a.medium ? `${a.source} / ${a.medium}` : a.source
  if (a.referrer) {
    try { return new URL(a.referrer).hostname.replace(/^www\./, '') } catch { return a.referrer.slice(0, 40) }
  }
  if (a.gclid) return 'google / ads'
  if (a.fbclid) return 'facebook / ads'
  return 'Direct'
}

/**
 * The first touch for the admin card, labelled the way attributionLabel
 * labels the last one ("chatgpt.com", "google / cpc"), so the card can read
 * "bio / email (first: chatgpt.com)" or, for an ad click alone,
 * "(first: google / ads)". Null when there is no first touch, when it names
 * no source, referrer or click id, or when it reads the same as the last
 * touch, so bookings without a different first touch look exactly as before.
 * Never throws.
 */
export function firstTouchLabel(a: Attribution | null | undefined): string | null {
  try {
    if (!a || typeof a !== 'object') return null
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
    const source = text(a.first_source)
    const medium = text(a.first_medium)
    const referrer = text(a.first_referrer)
    const gclid = text(a.first_gclid)
    const fbclid = text(a.first_fbclid)
    if (!source && !referrer && !gclid && !fbclid) return null
    const label = attributionLabel({
      ...(source ? { source } : {}),
      ...(medium ? { medium } : {}),
      ...(referrer ? { referrer } : {}),
      ...(gclid ? { gclid } : {}),
      ...(fbclid ? { fbclid } : {}),
    })
    return label === attributionLabel(a) ? null : label.slice(0, 80)
  } catch {
    return null
  }
}
