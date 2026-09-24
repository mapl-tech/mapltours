/**
 * Headers for a response that is about one visitor and must never be served
 * to another. Netlify's CDN reads its own header ahead of Cache-Control, so
 * both are set: a cached /api/geo would hand every visitor the first
 * visitor's country, and with it the first visitor's trip-tips default.
 */
export const NO_STORE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
}
