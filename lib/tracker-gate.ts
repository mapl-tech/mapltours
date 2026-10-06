/**
 * Where the analytics tags (GA4, the Google Ads tag, the Meta pixel, Hotjar)
 * may run, and what they may see. Pure, so it is testable and safe to import
 * from the middleware.
 */

/**
 * Only the live site feeds the live pixel and GA. Dev servers and deploy
 * previews load the same tags with the same ids, and in September they sent
 * the production Meta pixel 443 events from localhost, checkout starts
 * included.
 */
const TRACKED_HOSTS = ['mapltours.com', 'www.mapltours.com']

export function isTrackedHost(hostname: string): boolean {
  return TRACKED_HOSTS.includes(String(hostname ?? '').toLowerCase())
}

/**
 * Stripe appends these to a redirect return (Cash App Pay, Klarna, a bank
 * page). A client secret is a secret, and every tag reports the page address
 * (the pixel's `dl`, GA's page_location, Hotjar's recording), so the
 * middleware drops them before the page exists. payment_intent and
 * redirect_status stay: the confirm pages read them, on a reload too.
 */
export const SECRET_RETURN_PARAMS = ['payment_intent_client_secret', 'setup_intent_client_secret'] as const

/** The URL without Stripe's secrets, or null when it carries none. Never throws. */
export function withoutSecretParams(href: string): URL | null {
  try {
    const url = new URL(href)
    if (!SECRET_RETURN_PARAMS.some((k) => url.searchParams.has(k))) return null
    for (const k of SECRET_RETURN_PARAMS) url.searchParams.delete(k)
    return url
  } catch {
    return null
  }
}
