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
 * Pages that never carry the tags (Nov 26 2026): /referrals, where a referrer
 * types their Wise account and routing numbers, and the admin's view of the
 * referrers. Hotjar records the page and the Meta pixel's automatic matching
 * reads form fields, so neither may ever run there. A visitor who arrives
 * from a page that loaded them gets the page loaded again, without them,
 * before anything is typed (components/Trackers).
 */
export const NO_TRACKER_PATHS = /^\/(referrals|admin\/referrals)(\/|$)/

export function trackersAllowedOn(pathname: string | null | undefined): boolean {
  return !NO_TRACKER_PATHS.test(String(pathname ?? ''))
}

/**
 * Stripe appends these to a redirect return (Cash App Pay, Klarna, a bank
 * page). A client secret is a secret, and every tag reports the page address
 * (the pixel's `dl`, GA's page_location, Hotjar's recording), so the
 * middleware drops them before the page exists. payment_intent and
 * redirect_status stay: the confirm pages read them, on a reload too.
 * `trip_proof` is the booking proof in the booker's travel party link
 * (lib/travel-party-server), dropped the same way wherever it appears.
 */
export const SECRET_RETURN_PARAMS = ['payment_intent_client_secret', 'setup_intent_client_secret', 'trip_proof'] as const

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
