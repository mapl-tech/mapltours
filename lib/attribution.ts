/**
 * Booking attribution: where a customer came from.
 *
 * Client side, captureAttribution() records the visitor's landing context
 * (external referrer + UTM/click IDs) in localStorage using last-non-direct
 * logic: a visit WITH signal overwrites, a direct visit never erases an
 * earlier source. getStoredAttribution() is attached to the checkout payload.
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
    const fresh: Attribution = {
      ...(existing?.referrer ? { referrer: existing.referrer } : {}),
      source: 'webmcp',
      medium: 'browser-agent',
      content: scrub(tool).slice(0, 60),
      landing: scrub(window.location.pathname).slice(0, 200),
      ts: new Date().toISOString(),
    }
    localStorage.setItem(KEY, JSON.stringify(fresh))
  } catch { /* never break the page over analytics */ }
}

/**
 * The stored attribution to attach to a checkout payload (or null), plus the
 * GA4 client and session ids as they stand at this moment. Called when the
 * checkout POSTs, which is the session we want the server-side purchase to
 * land in.
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
    if (!stored && !Object.keys(ga).length && !Object.keys(meta).length && !Object.keys(optOut).length) return null
    return { ...(stored ?? {}), ...ga, ...meta, ...optOut }
  } catch { return null }
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
        if (clean) out[k] = clean
      }
    }
    return Object.keys(out).length ? out : null
  } catch { return null }
}

/** Human label for the admin card: "chatgpt.com", "google / cpc", "Direct". */
export function attributionLabel(a: Attribution | null | undefined): string {
  if (!a) return 'Direct or unknown'
  if (a.source) return a.medium ? `${a.source} / ${a.medium}` : a.source
  if (a.referrer) {
    try { return new URL(a.referrer).hostname.replace(/^www\./, '') } catch { return a.referrer.slice(0, 40) }
  }
  if (a.gclid) return 'google / ads'
  if (a.fbclid) return 'facebook / ads'
  return 'Direct'
}
