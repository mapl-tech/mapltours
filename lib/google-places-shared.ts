/**
 * Bits of the Google Places integration that are safe anywhere.
 *
 * Split out from lib/google-places.ts because that module is marked
 * `server-only` (it touches the API key). This one only builds a URL, and is
 * imported by the page that renders the cards.
 */

/** URL the browser requests for a photo; the API key stays server-side. */
export function photoProxyUrl(photoName: string, maxWidthPx = 900): string {
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&w=${maxWidthPx}`
}
