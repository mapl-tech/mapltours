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
] as const

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

/** The stored attribution to attach to a checkout payload (or null). */
export function getStoredAttribution(): Attribution | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Attribution) : null
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
