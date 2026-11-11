/**
 * The registered company behind the brand. MAPL Tours Limited was registered
 * in Jamaica (registration complete, created Oct 16 2026); MAPL Tours Jamaica
 * is its trading name.
 *
 * Owner, Nov 11 2026: name the company in the Terms, the Privacy Policy and
 * every footer, but print no address. No company number either: it was not
 * on the registration notice, and a guessed one is worse than none.
 *
 * Stripe still shows MAPL TECH INC. as the business on the account (owner:
 * no Stripe changes yet), so card statements do not name this company.
 */

export const LEGAL_NAME = 'MAPL Tours Limited'

/** "MAPL Tours Limited, trading as MAPL Tours Jamaica": the footer line on the site and in emails. */
export const TRADING_AS = `${LEGAL_NAME}, trading as MAPL Tours Jamaica`
