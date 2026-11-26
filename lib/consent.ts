/**
 * Consent for measurement and advertising, for visitors in the UK, the EU and
 * the EEA (owner, Nov 14 2026: "Build a consent prompt").
 *
 * Everywhere else the tags load as they always have, unless the browser sends
 * Do Not Track or Global Privacy Control. In the consent region nothing that
 * measures or advertises may run until the visitor says yes: not the tags
 * (components/Trackers), not the server's Conversions API and GA4 calls for a
 * booking (they read `dnt` from the booking's attribution), not the Lead for
 * a discount code, not the pixel's purchase match. All of those already ask
 * one function, lib/attribution `trackingOptedOut`, and that function asks
 * `consentBlocksTracking` here. Add a new tracking path and it must ask too.
 * Our own note of where a visitor came from follows the same rule: it is not
 * written to their browser, or read back from it, until they may be measured
 * (lib/attribution keeps it in memory for the page meanwhile).
 *
 * What is stored: one first-party cookie, `mapl_consent`, shared with
 * bio.mapltours.com (Domain=.mapltours.com) so a visitor is asked once
 * across both sites. It holds an answer ("yes" or "no", kept 180 days) or,
 * for a visitor outside the region, "na" for a day so the country is not
 * looked up on every page. Nothing is stored for a visitor in the region
 * until they answer: their region is kept in memory for the page only.
 *
 * The bio site has the same module (lib/consent.mts there). Keep the cookie
 * name, its format, the country list and `decide` identical in both.
 */
import { isTrackedHost } from './tracker-gate'

export const CONSENT_COOKIE = 'mapl_consent'

/** Where consent is asked for first. ISO 3166-1 alpha-2, as the geo header gives them. */
export const CONSENT_COUNTRIES: readonly string[] = [
  // The 27 member states of the European Union.
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // Parts of member states that have a code of their own and are inside the EU.
  'AX', 'GF', 'GP', 'MQ', 'RE', 'YT', 'MF',
  // The rest of the European Economic Area, where the same rules apply.
  'IS', 'LI', 'NO',
  // The United Kingdom, its Crown dependencies and Gibraltar.
  'GB', 'JE', 'GG', 'IM', 'GI',
  // Switzerland: outside the EEA, but Google's EU user consent policy has
  // covered visitors there since July 2024, and two of the tags are Google's.
  'CH',
]

/**
 * Time zones outside "Europe/" that belong to the region, for when the
 * country is not known: Iceland; Spain's Canaries, Ceuta and Melilla;
 * Portugal's Madeira and Azores; Cyprus (whose zone is filed under Asia);
 * and the French territories in the list above (French Guiana, Guadeloupe,
 * Martinique, Saint-Martin, Reunion, Mayotte).
 */
export const REGION_ZONES_OUTSIDE_EUROPE: readonly string[] = [
  'Atlantic/Reykjavik', 'Atlantic/Canary', 'Africa/Ceuta', 'Atlantic/Madeira', 'Atlantic/Azores',
  'Asia/Nicosia', 'Asia/Famagusta',
  'America/Cayenne', 'America/Guadeloupe', 'America/Martinique', 'America/Marigot', 'Indian/Reunion', 'Indian/Mayotte',
]
/**
 * Clocks that say nothing about where the visitor is: a browser set to hide
 * its time zone reports UTC wherever it is (Firefox's fingerprinting
 * protection, Tor Browser). They count as "not known".
 */
const PLACELESS_ZONE = /^(UTC|GMT|Etc\/.*)$/i
/**
 * Two-letter answers a lookup can give that are not countries. "UK" and "EU"
 * are not ISO codes but mean the region ("the United Kingdom", "somewhere in
 * the EU"). The others say the place is not known.
 */
const REGION_ALIASES = ['UK', 'EU']
const PLACELESS_CODES = ['XX', 'ZZ', 'AP']

/** The lookup's answer as a country code we can go by, or null when it names no country. */
export function knownCountry(country: string | null | undefined): string | null {
  const c = typeof country === 'string' ? country.trim().toUpperCase() : ''
  return /^[A-Z]{2}$/.test(c) && !PLACELESS_CODES.includes(c) ? c : null
}

export type ConsentAnswer = 'yes' | 'no'
/** What the cookie can hold: an answer, or "na" for a visitor outside the region. */
export type StoredConsent = ConsentAnswer | 'na'
export type ConsentDecision = 'allow' | 'deny' | 'ask' | 'wait'

/** An answer is asked for again after this long. */
export const ANSWER_MAX_AGE_S = 180 * 86_400
/** "Outside the region" is looked up again after this long. */
export const NA_MAX_AGE_S = 86_400

/**
 * Is this visitor in the region? The country when it is known; the browser's
 * time zone when it is not (the lookup failed); and yes when neither is
 * known, because asking somebody who did not need to be asked costs a tap,
 * and not asking somebody who did is the thing this module exists to stop.
 */
export function inConsentRegion(country: string | null | undefined, timeZone: string | null | undefined): boolean {
  const c = knownCountry(country)
  if (c) return REGION_ALIASES.includes(c) || CONSENT_COUNTRIES.includes(c)
  const tz = typeof timeZone === 'string' ? timeZone.trim() : ''
  if (!tz || PLACELESS_ZONE.test(tz)) return true
  return tz.startsWith('Europe/') || REGION_ZONES_OUTSIDE_EUROPE.includes(tz)
}

/** The cookie's value while it is still good, or null. Never throws. */
export function readConsentCookie(cookie: string | null | undefined, nowMs: number = Date.now()): StoredConsent | null {
  const m = /(?:^|;\s*)mapl_consent=(yes|no|na)\.(\d{9,11})(?=;|$)/.exec(typeof cookie === 'string' ? cookie : '')
  if (!m) return null
  const state = m[1] as StoredConsent
  const ageMs = nowMs - Number(m[2]) * 1000
  // Five minutes of clock slack; a stamp further in the future is not one we wrote.
  if (!(ageMs >= -300_000)) return null
  const maxMs = (state === 'na' ? NA_MAX_AGE_S : ANSWER_MAX_AGE_S) * 1000
  return ageMs <= maxMs ? state : null
}

/** The Set-Cookie text for document.cookie. Shared across mapltours.com and its subdomains; host-only anywhere else. */
export function consentCookie(state: StoredConsent, hostname: string, secure: boolean, nowMs: number = Date.now()): string {
  const maxAge = state === 'na' ? NA_MAX_AGE_S : ANSWER_MAX_AGE_S
  const domain = /(^|\.)mapltours\.com$/i.test(String(hostname ?? '')) ? '; Domain=.mapltours.com' : ''
  return `${CONSENT_COOKIE}=${state}.${Math.floor(nowMs / 1000)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}${domain}`
}

/**
 * The one rule. `optedOut` is Do Not Track or Global Privacy Control, which
 * wins over everything, a "yes" included. `region` is null until it has been
 * worked out for this page.
 */
export function decide(input: { optedOut: boolean; stored: StoredConsent | null; region: boolean | null }): ConsentDecision {
  if (input.optedOut) return 'deny'
  if (input.stored === 'yes') return 'allow'
  if (input.stored === 'no') return 'deny'
  if (input.stored === 'na') return 'allow'
  if (input.region === null) return 'wait'
  return input.region ? 'ask' : 'allow'
}

/**
 * Pages where the question is never put: where a guest pays or signs in, the
 * handoff that opens a checkout, and the staff tools. A visitor in the region
 * who has not answered is simply not tracked there, and is asked on the next
 * page that is none of these.
 */
export const NO_CONSENT_PROMPT_PATHS = /^\/(checkout|transfers\/checkout|transfers\/confirm|book|gifts|login|auth|admin|driver|referrals)(\/|$)/

export function consentPromptAllowedOn(pathname: string | null | undefined): boolean {
  return !NO_CONSENT_PROMPT_PATHS.test(String(pathname ?? ''))
}

/** First-party cookies the tags leave behind, removed when a visitor who had said yes says no. */
export const TRACKER_COOKIE_PATTERNS: readonly RegExp[] = [/^_ga($|_)/, /^_gid$/, /^_gat($|_)/, /^_gac_/, /^_gcl_/, /^_fbp$/, /^_fbc$/, /^_hj/]

/** The names in a cookie string that belong to the tags. */
export function trackerCookieNames(cookie: string | null | undefined): string[] {
  return String(cookie ?? '')
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter((name) => name && TRACKER_COOKIE_PATTERNS.some((re) => re.test(name)))
}

// ───────────────────────── In the browser ─────────────────────────

const CHANGE_EVENT = 'mapl:consent'
const OPEN_EVENT = 'mapl:consent-open'

/** Whether this page load has placed the visitor: true in the region, false outside it, null not yet. */
let regionNow: boolean | null = null
let lookup: Promise<boolean> | null = null
/**
 * The answer given on this page, kept only when the browser did not keep the
 * cookie (cookies refused, or the write did not take): it then stands for the
 * page, ahead of whatever older cookie can still be read, and the question is
 * put again on the next. Null whenever the cookie holds the answer, so that
 * an answer given later in another tab is the one that counts.
 */
let answerNow: ConsentAnswer | null = null

const inBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

/** What the cookie says, or null. Never throws (a sandboxed frame refuses document.cookie). */
function cookieSays(): StoredConsent | null {
  try {
    return readConsentCookie(document.cookie)
  } catch {
    return null
  }
}

/**
 * The visitor's answer: the cookie's, or, where the browser did not keep the
 * cookie, the one given on this page; or null. Never throws.
 */
export function storedConsent(): StoredConsent | null {
  if (!inBrowser()) return null
  return answerNow ?? cookieSays()
}

/**
 * The visitor's answer, as storedConsent gives it, with one thing remembered:
 * a visitor read as "outside the region" is placed there for the rest of the
 * page. That cookie lasts a day and can lapse while a page is open; without
 * this the page would fall back to "not placed" in the middle of a visit,
 * with no lookup running to place it again.
 */
function answerAndPlace(): StoredConsent | null {
  const stored = storedConsent()
  if (stored === 'na' && regionNow === null) regionNow = false
  return stored
}

/** What to do right now, without waiting for anything. */
export function consentDecision(optedOut: boolean): ConsentDecision {
  return decide({ optedOut, stored: answerAndPlace(), region: regionNow })
}

/** True until the visitor has an answer on record or has been placed: the moment the clock stands in for the country. */
export function consentUndecided(): boolean {
  if (!inBrowser()) return false
  try {
    return answerAndPlace() === null && regionNow === null
  } catch {
    return false
  }
}

/**
 * True while measurement and advertising must stay off for want of a yes.
 * Only the live site is ever tracked (lib/tracker-gate), so everywhere else
 * this answers false and dev, previews and tests behave as they did.
 *
 * This is the answer for the paths that cannot wait (a booking being sent, a
 * discount code being asked for). The tags themselves do wait: Trackers loads
 * nothing until the visitor has been placed. In the moment before that, the
 * browser's time zone stands in for the country: a clock in the region is
 * blocked, any other is treated as outside it. That moment is a fraction of
 * a second on every page a visitor without an answer on record opens, and in
 * practice only one thing happens in it: lib/attribution notes the landing,
 * and takes the note back out if the visitor then turns out to be in the
 * region.
 *
 * The clock also decides when the lookup fails. So what a failed lookup can
 * get wrong is narrow, and both ways round: a visitor in the region whose
 * device keeps another region's time is not asked, on that page only (a
 * failed lookup is never remembered); and a visitor outside it whose clock
 * is European, or says nothing, is asked when they need not have been. It
 * never switches reporting off for the visitors whose clocks say North
 * America, who are most of our guests.
 */
export function consentBlocksTracking(): boolean {
  if (!inBrowser()) return false
  try {
    if (!isTrackedHost(window.location.hostname)) return false
    const stored = answerAndPlace()
    const region = regionNow ?? inConsentRegion(null, browserTimeZone())
    return decide({ optedOut: false, stored, region }) !== 'allow'
  } catch {
    return true
  }
}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

function writeCookie(state: StoredConsent): void {
  try {
    document.cookie = consentCookie(state, window.location.hostname, window.location.protocol === 'https:')
  } catch {
    // Cookies refused: an answer lasts for this page (answerNow), and is asked for again on the next.
  }
}

/**
 * Works out, once per page load, whether the visitor is in the region.
 * `countryOf` asks the site's own geo endpoint and may fail or answer null.
 * A visitor the lookup places outside the region gets the one-day "na"
 * cookie; a visitor inside it, or placed by the clock alone, gets nothing
 * stored.
 */
export function resolveRegion(countryOf: () => Promise<string | null>): Promise<boolean> {
  if (regionNow !== null) return Promise.resolve(regionNow)
  if (!lookup) {
    lookup = (async () => {
      let country: string | null = null
      try {
        country = await countryOf()
      } catch {
        country = null
      }
      const region = inConsentRegion(country, browserTimeZone())
      regionNow = region
      // Remembered for a day only when the lookup named a country. A visitor
      // placed by their clock alone is looked up again on the next page.
      if (!region && knownCountry(country) !== null && storedConsent() === null) writeCookie('na')
      // Whoever was waiting on the visitor's place is told, like on an answer:
      // a landing held meanwhile is stored now if it may be (lib/attribution).
      notifyConsentChange()
      return region
    })()
  }
  return lookup
}

function notifyConsentChange(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // An old browser without Event(): the next page load reads the cookie.
  }
}

/** How long the country lookup may take before the clock decides instead. The tags wait this long at most. */
export const GEO_TIMEOUT_MS = 3000

/** The site's geo endpoint: Netlify's country for the visitor, or the older lookup's when Netlify did not say. */
export async function countryFromGeoEndpoint(timeoutMs: number = GEO_TIMEOUT_MS): Promise<string | null> {
  const res = await fetch('/api/geo', { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
  if (!res.ok) return null
  const j = (await res.json()) as { country?: unknown; country_code?: unknown }
  const c = typeof j.country === 'string' && j.country ? j.country : typeof j.country_code === 'string' ? j.country_code : null
  return c || null
}

/** Records the visitor's answer and tells everything that is listening. A no also clears the tags' own cookies. */
export function setConsent(answer: ConsentAnswer): void {
  if (!inBrowser()) return
  writeCookie(answer)
  answerNow = cookieSays() === answer ? null : answer
  if (answer === 'no') clearTrackerCookies()
  notifyConsentChange()
}

/** Expires the tags' first-party cookies, on this host and on the shared parent domain. */
export function clearTrackerCookies(): void {
  if (!inBrowser()) return
  try {
    const shared = /(^|\.)mapltours\.com$/i.test(window.location.hostname) ? ['; Domain=.mapltours.com', ''] : ['']
    for (const name of trackerCookieNames(document.cookie)) {
      for (const domain of shared) document.cookie = `${name}=; Path=/; Max-Age=0${domain}`
    }
  } catch {
    // Nothing to clear, or cookies refused.
  }
}

export function onConsentChange(listener: () => void): () => void {
  if (!inBrowser()) return () => {}
  window.addEventListener(CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANGE_EVENT, listener)
}

/** The button a guest opened the question from, handed to whoever shows it so the keyboard can go back there. */
let opener: HTMLElement | null = null

/**
 * The footer's "Cookie Preferences": asks whoever shows the prompt to show
 * it now. `from` is the button itself. Safari does not give a button the
 * focus when it is clicked or tapped, so "whatever has the focus" would be
 * nothing there.
 */
export function requestConsentPrompt(from?: HTMLElement | null): void {
  if (!inBrowser()) return
  opener = from ?? null
  try {
    window.dispatchEvent(new Event(OPEN_EVENT))
  } catch {
    // No Event(): nothing opens.
  }
}

export function onConsentPromptRequest(listener: (from: HTMLElement | null) => void): () => void {
  if (!inBrowser()) return () => {}
  const heard = () => {
    const active = document.activeElement
    listener(opener ?? (typeof HTMLElement !== 'undefined' && active instanceof HTMLElement && active !== document.body ? active : null))
    opener = null
  }
  window.addEventListener(OPEN_EVENT, heard)
  return () => window.removeEventListener(OPEN_EVENT, heard)
}

/**
 * Keeps a listener told of the decision for as long as the page is open, and
 * is the one place that decides when to look the visitor's country up.
 *
 *  - It reads the decision at once, and whenever it reads "wait" it makes
 *    sure a lookup is running: at load, and again if an answer on record
 *    lapses while the page is open. "Wait" is never left standing.
 *  - It reads again on an answer, when the tab is looked at again and when
 *    the page comes back from the back/forward cache, because the answer is
 *    a cookie and another tab (or the bio page) can change it.
 *  - A visitor who arrives having already said no has the tags' own cookies
 *    cleared once, here: the no may have been given on the bio page, where
 *    this site's cookies could not be reached.
 *
 * Returns `read`, to read on demand (a change of page), and `stop`.
 */
export function watchConsent(
  onDecision: (decision: ConsentDecision) => void,
  optedOut: () => boolean,
  countryOf: () => Promise<string | null> = countryFromGeoEndpoint,
): { read: () => void; stop: () => void } {
  if (!inBrowser()) return { read: () => {}, stop: () => {} }
  let gone = false
  const read = () => {
    if (gone) return
    const decision = consentDecision(optedOut())
    if (decision === 'wait') void resolveRegion(countryOf).then(read, read)
    onDecision(decision)
  }
  if (storedConsent() === 'no') clearTrackerCookies()
  read()
  const offChange = onConsentChange(read)
  const onVisible = () => { if (document.visibilityState === 'visible') read() }
  const onShow = (e: Event) => { if ((e as PageTransitionEvent).persisted) read() }
  try {
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onShow)
  } catch {
    // No such events here: the decision is still read at load, on an answer and on demand.
  }
  return {
    read,
    stop: () => {
      gone = true
      offChange()
      try {
        document.removeEventListener('visibilitychange', onVisible)
        window.removeEventListener('pageshow', onShow)
      } catch {
        // Nothing was listening.
      }
    },
  }
}

/** Tests only: forget what this page load worked out. */
export function __resetConsentForTests(region: boolean | null = null): void {
  regionNow = region
  lookup = null
  answerNow = null
  opener = null
}
