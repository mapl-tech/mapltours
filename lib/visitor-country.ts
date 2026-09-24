import { normaliseCountry } from '@/lib/trip-tips'

/**
 * The visitor's country, from the headers Netlify stamps on every request.
 *
 * `x-nf-geo` is base64-encoded JSON (`{"city":…,"country":{"code":"US",…}}`);
 * local tools and older docs show it as plain JSON, so both are read.
 * `x-country` is the older bare code, tried second. Nothing here calls out:
 * the answer is already on the request, so /api/geo (what the popup shows)
 * and /api/lead (what the bio records) read the same thing.
 *
 * A visitor could forge these headers only to misstate their own country,
 * which gains them nothing, so no further proof is asked for.
 */
type HeaderSource = { get(name: string): string | null }

// Netlify's value is a few hundred bytes; anything far larger is not it.
const MAX_GEO_HEADER = 4096

export function countryFromHeaders(headers: HeaderSource): string | null {
  return countryFromNfGeo(headers.get('x-nf-geo')) ?? normaliseCountry(headers.get('x-country'))
}

export function countryFromNfGeo(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text || text.length > MAX_GEO_HEADER) return null
  try {
    const json = text.startsWith('{') ? text : decodeBase64(text)
    const geo = JSON.parse(json) as { country?: { code?: unknown } } | null
    return normaliseCountry(geo?.country?.code)
  } catch {
    return null
  }
}

// atob rather than Buffer so the helper runs in any runtime; the bytes go
// through TextDecoder because city names (Montréal) are UTF-8.
function decodeBase64(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
}
