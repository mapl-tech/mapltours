/**
 * The "trip tips" box beside the 5% code (owner-approved, Sept 24 2026).
 *
 * The owner wants the box ticked by default. Canada's CASL and the UK's PECR
 * do not accept a pre-ticked box as consent, and the ads run in both, so the
 * box starts ticked only for a visitor Netlify places in the US. Everyone
 * else, and anyone we cannot place, starts unticked and ticks it themselves.
 *
 * The bio page's lead function keeps the same two rules and is the one that
 * records consent (HubSpot, the Resend list). This copy decides what the popup
 * shows and whether the site tells the guest tips are on. Change them together.
 */
export const TIPS_LABEL = 'Send me Jamaica trip tips from MAPL Tours Jamaica, about twice a month. Unsubscribe anytime.'
export const TIPS_ON_LINE = 'Trip tips are on. The first one comes in a couple of weeks.'

/** What the box looked like before the visitor touched it. */
export type TipsDefault = 'checked' | 'unchecked'

/** An ISO 3166 alpha-2 code in upper case, or null for anything else. */
export function normaliseCountry(country: unknown): string | null {
  if (typeof country !== 'string') return null
  const c = country.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) ? c : null
}

/** Whether the box starts ticked. Exactly the US; unknown is never the US. */
export function tipsDefaultFor(country: string | null | undefined): boolean {
  return normaliseCountry(country) === 'US'
}

/**
 * Whether a submission is consent we may act on: the box was ticked, and
 * either the visitor ticked it themselves or the pre-tick was lawful where
 * they are. A pre-ticked box from outside the US never counts, even if a
 * client sends one (a stale bundle, a hand-made request).
 */
export function tipsConsentValid(input: {
  optIn: unknown
  defaultShown: unknown
  country: string | null | undefined
}): boolean {
  return input.optIn === true && (input.defaultShown === 'unchecked' || tipsDefaultFor(input.country))
}
