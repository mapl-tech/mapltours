/**
 * Validates and sanitizes a redirect path to prevent open-redirect and
 * parameter-injection attacks. Only app-relative paths are allowed.
 */

// Exact paths a post-login redirect may land on.
const ALLOWED_EXACT = ['/', '/profile', '/explore', '/checkout']
// Namespaces a redirect may land in. Covers the engagement loop
// (/experience/<slug> after liking/commenting), the post-payment confirm
// pages, and the admin moderation queue, none of which are static and so
// can't be enumerated exactly.
const ALLOWED_PREFIXES = ['/experience/', '/checkout/', '/transfers/', '/admin/']

export function getSafeRedirect(raw: string | null): string {
  const fallback = '/profile'
  if (!raw) return fallback

  // Must start with a single slash (reject protocol-relative "//evil.com"
  // and absolute "https://evil.com").
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback

  // Strip query string and hash before validating, and never pass raw query
  // params through (guards against redirect=/checkout?x=//evil injection).
  const pathname = raw.split('?')[0].split('#')[0]

  // Reject any backslash or encoded-slash trickery that could smuggle a host.
  if (pathname.includes('\\') || pathname.toLowerCase().includes('%2f')) return fallback

  const allowed =
    ALLOWED_EXACT.includes(pathname) ||
    ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
  if (!allowed) return fallback

  return pathname
}
