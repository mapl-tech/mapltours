/**
 * Validates and sanitizes a redirect path to prevent open-redirect and
 * parameter-injection attacks. Only app-relative paths are allowed.
 */

const ALLOWED_PATHS = ['/', '/profile', '/explore', '/checkout']

export function getSafeRedirect(raw: string | null): string {
  const fallback = '/profile'
  if (!raw) return fallback

  // Must start with a single slash (reject protocol-relative "//evil.com")
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback

  // Strip query string and hash, then check against allowlist
  const pathname = raw.split('?')[0].split('#')[0]

  if (!ALLOWED_PATHS.includes(pathname)) return fallback

  // Return only the clean pathname — never pass through raw query params
  return pathname
}
