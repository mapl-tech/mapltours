/**
 * The origin a server route should send a browser to.
 *
 * Behind the custom domain, a Netlify function's request URL is the
 * per-deploy host (<deploy id>--mapltours.netlify.app), not mapltours.com.
 * A redirect built from it lands the guest on a host that holds none of
 * their cookies and is frozen at one deploy: after Google sign-in the session
 * was set for mapltours.com and the guest was then sent to the deploy host's
 * /profile, which showed the login page as if sign-in had failed. So every
 * redirect names the public site, except on a local dev server, which keeps
 * its own origin. (lib/agent/booking-link linkOrigin is the same rule for the
 * links the AI connector hands out.)
 */
export const SITE_ORIGIN = 'https://mapltours.com'

export function siteOrigin(requestUrl: URL): string {
  const h = requestUrl.hostname
  return h === 'localhost' || h === '127.0.0.1' ? requestUrl.origin : SITE_ORIGIN
}
