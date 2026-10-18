/**
 * The guest details Meta matches a Purchase on, normalised ONE way for both
 * halves of the same event: the browser pixel (lib/analytics, which hands
 * these plain to fbq and lets the pixel hash them) and the Conversions API
 * (lib/meta-capi, which hashes them on the server). Meta compares SHA-256
 * digests, so the two halves only reinforce each other when they normalise
 * identically. tests/unit/meta-match.spec.ts pins the server's digests to the
 * ones the live pixel produced for the same input (Oct 17 2026).
 *
 * Why it matters: Event Match Quality for Purchase was 6.1 with IP, browser
 * and the _fbp cookie only. The pixel's Conversions API Gateway copy, the
 * server event Meta keeps, carried no email at all, because the pixel was
 * never given one. Email, phone, name and a customer id are the strongest
 * keys Meta has.
 *
 * Pure: no I/O, no crypto, safe in the browser and on the server.
 */

/** The main dataset (0055), loaded by components/Trackers. */
export const META_PIXEL_ID = '1607953960710055'

export interface MatchInput {
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
  /** ISO 3166-1 alpha-2, when the booking has one. */
  country?: string | null
}

/** Meta's advanced-matching keys, normalised but NOT hashed. */
export interface MatchFields {
  em?: string
  ph?: string
  fn?: string
  ln?: string
  country?: string
  external_id?: string
}

/** The keys MatchFields may carry, for code that reads one back from storage. */
export const MATCH_KEYS = ['em', 'ph', 'fn', 'ln', 'country', 'external_id'] as const

/** Lowercased and trimmed, and only if it is an address at all. */
export function normalizeEmail(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined
}

/**
 * Digits with the country code and nothing else, as Meta asks ("16505551234").
 *
 * The checkout's phone field is free text, and most guests type a ten-digit
 * North American number with no country code (US, Canada, and Jamaica's own
 * 876). Ten digits whose area code and exchange both start 2-9 are that plan
 * and get the 1. That is a deliberate guess: a foreign number of the same
 * shape typed without its country code (a Mexico City or an Indian mobile)
 * is sent as North American, and can be a real number that belongs to
 * someone else (55 1234 5678 becomes 15512345678, a New Jersey number), whom
 * Meta may then credit with the purchase. Accepted because most guests type a
 * North American number; sending ph only when the guest wrote a country code
 * would remove that risk along with most US guests' phone key (the owner's
 * call). A number typed with + or 00 already carries its country, and eleven
 * to fifteen digits starting 2-9 are taken as carrying theirs. Anything else
 * is left out.
 */
export function normalizePhone(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  // Invisible format characters first: a number copied from Apple Contacts
  // arrives wrapped in bidi marks (U+202D ... U+202C) that trim() and \s do
  // not remove, and they would hide a leading + and a trailing extension.
  // Then a trailing extension ("ext. 4", "x12", "#22"), which is not part of
  // the number. No leading \s* on that pattern: unanchored, it backtracks
  // quadratically over a long run of spaces; \D below drops the spaces.
  let s = v
    .replace(/[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, '')
    .trim()
    .replace(/(?:ext\.?|extension|x|#)\s*\d{1,6}$/i, '')
  if (!s) return undefined
  const plus = s.startsWith('+')
  const intl = plus || s.startsWith('00')
  // "+44 (0) 7911 123456": the bracketed 0 is the trunk prefix, dropped once
  // a country code is written. Only then: "(0)20 7946 0958" stays national
  // and is left out below, never read as a North American number.
  if (intl) s = s.replace(/\(\s*0\s*\)/g, '')
  let digits = s.replace(/\D/g, '')
  if (!plus && digits.startsWith('00')) digits = digits.slice(2)
  if (intl) {
    if (digits.startsWith('1')) return /^1[2-9]\d{2}[2-9]\d{6}$/.test(digits) ? digits : undefined
    return /^[2-9]\d{6,14}$/.test(digits) ? digits : undefined
  }
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `1${digits}`
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return digits
  // Typed without a + but long enough to hold a country code, and not a
  // national number (those start with 0 or a trunk 1).
  if (/^[2-9]\d{10,14}$/.test(digits)) return digits
  return undefined
}

/**
 * Everything that is not a letter. Built with the RegExp constructor because
 * Unicode property escapes need ES2018 and the project compiles to es5,
 * which would refuse (or rewrite) the literal; an engine without them gets
 * the fallback, which strips spaces, digits and ASCII punctuation.
 */
const NON_LETTERS: RegExp = (() => {
  try { return new RegExp('[^\\p{L}\\p{M}]', 'gu') } catch { return /[\s0-9!-/:-@[-`{-~]/g }
})()

/**
 * Lowercase letters only, in UTF-8: Meta asks for no punctuation and no
 * spaces, and keeps accented letters as they are ("José" is "josé").
 */
export function normalizeName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.normalize('NFC').trim().toLowerCase().replace(NON_LETTERS, '')
  return s || undefined
}

/** Two lowercase letters, or nothing: the booking's country is free text. */
export function normalizeCountry(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim().toLowerCase()
  return /^[a-z]{2}$/.test(s) ? s : undefined
}

/**
 * Every key the input supports. external_id is the normalised email: a stable
 * id for the same guest that the browser and the server can both produce
 * without either holding anything the other does not.
 */
export function matchFields(input: MatchInput | null | undefined): MatchFields {
  const out: MatchFields = {}
  if (!input) return out
  const em = normalizeEmail(input.email)
  if (em) { out.em = em; out.external_id = em }
  const ph = normalizePhone(input.phone)
  if (ph) out.ph = ph
  const fn = normalizeName(input.firstName)
  if (fn) out.fn = fn
  const ln = normalizeName(input.lastName)
  if (ln) out.ln = ln
  const country = normalizeCountry(input.country)
  if (country) out.country = country
  return out
}

/**
 * The booking reference both halves use as the event id. Kept here so the
 * analytics bundle does not pull in lib/dispatch; it is the same formula as
 * bookingRef there and humanizeId on both confirm pages, which must stay
 * equal or the remembered details are dropped as another booking's
 * (tests/unit/meta-match-wiring.spec.ts holds them equal).
 */
export function bookingRefOf(bookingId: string): string {
  return 'MAPL-' + bookingId.slice(0, 8).toUpperCase()
}
