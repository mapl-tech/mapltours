/**
 * Which browser may see a booking's full confirmation page.
 *
 * The confirmation address carries the PaymentIntent id (or, for a gift-card
 * booking, the booking id), and every analytics tag reports the page address,
 * so by October 2026 four guests' confirmation links sat in GA4, the Meta
 * pixel and Hotjar. Anyone holding one saw the guest's first name, hotel,
 * flights and pickup times: enough to stand at arrivals posing as the driver.
 *
 * Now the page shows the trip only to a browser that can prove it booked it,
 * and to a guest signed in with the booking's email. Everyone else gets a
 * short "this booking is confirmed, sign in to see it" page.
 *
 * The proof is one HttpOnly cookie listing what this browser has been given:
 *   - a booking proof (`b_<id>_<signature>`), set by the checkout routes on
 *     the answer that names the booking (lib/confirm-proof-server), and
 *   - a PaymentIntent client secret, which Stripe appends to a redirect
 *     return. The middleware used to drop it; it now keeps it here, out of
 *     the address and out of reach of every script on the page.
 *
 * Pure and dependency-free so the middleware (edge runtime) can import it.
 */

export const PROOF_COOKIE = 'mapl_trip'

/** Chrome keeps no cookie longer than 400 days, and trips are booked up to a year out. */
export const PROOF_MAX_AGE_S = 400 * 24 * 60 * 60

/** The newest proofs a browser keeps. A guest books a handful of times, never dozens. */
export const PROOF_MAX_ENTRIES = 12

const SEPARATOR = '~'
const ENTRY = /^[A-Za-z0-9_-]{10,200}$/

/** The proofs in a cookie value, newest first. Junk is dropped, never thrown on. */
export function readProofs(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string' || !raw) return []
  return raw.split(SEPARATOR).filter((e) => ENTRY.test(e)).slice(0, PROOF_MAX_ENTRIES)
}

/** The cookie value with `entry` added as the newest proof, deduplicated and capped. */
export function addProof(raw: string | null | undefined, entry: string): string {
  const rest = readProofs(raw).filter((e) => e !== entry)
  return (ENTRY.test(entry) ? [entry, ...rest] : rest).slice(0, PROOF_MAX_ENTRIES).join(SEPARATOR)
}

/**
 * The client secret Stripe handed back, if it belongs to this PaymentIntent.
 * A secret is `<intent id>_secret_<random>`; anything else is not kept.
 */
export function clientSecretFor(secret: string | null | undefined, paymentIntentId: string | null | undefined): string | null {
  if (typeof secret !== 'string' || typeof paymentIntentId !== 'string') return null
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return null
  if (!secret.startsWith(`${paymentIntentId}_secret_`) || !/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(secret)) return null
  return ENTRY.test(secret) ? secret : null
}

/** The two pages a proof unlocks. */
export function isConfirmPath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/+$/, '')
  return p === '/checkout/confirm' || p === '/transfers/confirm'
}

/**
 * The cookie itself. HttpOnly, so no tag or script can read it; Lax, so it
 * arrives when the guest opens the link from an email or comes back from a
 * bank page; Secure wherever the site is served over https.
 */
export function proofCookie(value: string, secure: boolean) {
  return {
    name: PROOF_COOKIE,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: PROOF_MAX_AGE_S,
  }
}
