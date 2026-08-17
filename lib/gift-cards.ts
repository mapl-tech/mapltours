/**
 * Gift-card rules: code format, amount validation, and how much of a cart a
 * card may cover. Pure functions, no I/O, so the money maths is testable and
 * the API routes and the UI agree on one implementation.
 *
 * The stateful parts — reserving balance, recording a spend — live in the API
 * routes, because they need a conditional UPDATE to be safe against two
 * checkouts racing on the same code.
 */

/** Amounts the buyer can pick, plus the bounds for a custom amount. */
export const GIFT_PRESETS = [50, 100, 150, 250] as const
export const GIFT_MIN = 25
export const GIFT_MAX = 1000

/** How long a card stays spendable. */
export const GIFT_VALID_MONTHS = 24

/**
 * Alphabet with no confusable pair intact. For each look-alike pair at most
 * ONE member survives: O/0 and I/1 and S/5 are dropped entirely, B and Z and
 * G are dropped so 8, 2 and 6 are unambiguous. Codes get read aloud, dictated
 * over the phone and retyped off a screenshot, and every surviving pair is a
 * support ticket waiting to happen.
 *
 * 25 symbols ^ 8 characters is ~1.5e11 codes, far too sparse to guess at.
 */
const ALPHABET = 'ACDEFHJKLMNPQRTUVWXY2346789'

/**
 * Draw `count` indices into ALPHABET from a cryptographic source.
 *
 * A gift code is a bearer instrument: whoever types it spends the money, with
 * no account and no second factor. Math.random() is a seeded PRNG whose
 * internal state is recoverable from a handful of outputs, so an attacker who
 * buys one card and sees its code could derive the codes issued around it.
 * Web Crypto is available in both Node and the browser, so this stays usable
 * from the one module the client also imports constants from.
 *
 * Rejection sampling, not modulo: 256 is not a multiple of 27, so `% 27` would
 * make the first four letters of the alphabet measurably likelier than the
 * rest and quietly shrink the keyspace.
 */
function secureIndices(count: number): number[] {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  const out: number[] = []
  const buf = new Uint8Array(count * 2)
  while (out.length < count) {
    globalThis.crypto.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < count; i++) {
      const byte = buf[i]
      if (byte < max) out.push(byte % ALPHABET.length)
    }
  }
  return out
}

/**
 * MAPL-XXXX-XXXX. Prefix makes it obvious what the code belongs to.
 *
 * `randomIndices` is injectable so tests can force collisions and check the
 * shape; production always takes the crypto default.
 */
export function generateGiftCode(randomIndices: (count: number) => number[] = secureIndices): string {
  const chars = randomIndices(8).map((i) => ALPHABET[i % ALPHABET.length])
  return `MAPL-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/** Accepts the canonical form and forgiving variants (lowercase, no dashes). */
export function normalizeGiftCode(input: string): string | null {
  const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned.startsWith('MAPL')) return null
  const body = cleaned.slice(4)
  if (body.length !== 8) return null
  if (!body.split('').every((c) => ALPHABET.includes(c))) return null
  return `MAPL-${body.slice(0, 4)}-${body.slice(4)}`
}

export type GiftAmountError = 'not_a_number' | 'below_min' | 'above_max' | 'not_whole'

/**
 * Validate a purchase amount. Whole dollars only: fractional gift values are
 * a rounding problem at redemption for no benefit to anyone.
 */
export function validateGiftAmount(amount: unknown): { ok: true; amount: number } | { ok: false; error: GiftAmountError } {
  const n = Number(amount)
  if (!Number.isFinite(n)) return { ok: false, error: 'not_a_number' }
  if (!Number.isInteger(n)) return { ok: false, error: 'not_whole' }
  if (n < GIFT_MIN) return { ok: false, error: 'below_min' }
  if (n > GIFT_MAX) return { ok: false, error: 'above_max' }
  return { ok: true, amount: n }
}

export function giftAmountMessage(error: GiftAmountError): string {
  switch (error) {
    case 'below_min': return `Gift cards start at $${GIFT_MIN}.`
    case 'above_max': return `Gift cards go up to $${GIFT_MAX}. For more, please contact us.`
    case 'not_whole': return 'Please choose a whole dollar amount.'
    case 'not_a_number': return 'Please enter a valid amount.'
  }
}

export interface RedeemableCard {
  status: string
  balance: number | string
  expires_at?: string | null
}

export type GiftBlockedReason = 'not_found' | 'not_active' | 'no_balance' | 'expired'

export type GiftApplication =
  | {
      applicable: true
      /** Cents taken off this cart. */
      appliesCents: number
      /** Cents still owed on a card after the gift is applied. */
      remainingDueCents: number
      /** Cents left on the gift card afterwards. */
      cardBalanceAfterCents: number
      /** True when the gift covers the whole cart and no card charge is due. */
      coversFullAmount: boolean
    }
  | { applicable: false; reason: GiftBlockedReason }

/**
 * How much of a cart a card can pay for.
 *
 * Works in cents throughout: applying a percentage-free discount to a float
 * total is where a cent goes missing, and here that cent is the difference
 * between a PaymentIntent and a failed charge.
 */
export function applyGiftCard(
  card: RedeemableCard | null,
  cartTotalCents: number,
  now: Date = new Date(),
): GiftApplication {
  if (!card) return { applicable: false, reason: 'not_found' }
  if (card.status !== 'active') return { applicable: false, reason: 'not_active' }

  if (card.expires_at) {
    const exp = Date.parse(card.expires_at)
    if (!Number.isNaN(exp) && now.getTime() > exp) {
      return { applicable: false, reason: 'expired' }
    }
  }

  const balanceCents = Math.round(Number(card.balance) * 100)
  if (!Number.isFinite(balanceCents) || balanceCents <= 0) {
    return { applicable: false, reason: 'no_balance' }
  }

  const appliesCents = Math.min(balanceCents, Math.max(0, cartTotalCents))
  return {
    applicable: true,
    appliesCents,
    remainingDueCents: Math.max(0, cartTotalCents - appliesCents),
    cardBalanceAfterCents: balanceCents - appliesCents,
    coversFullAmount: appliesCents >= cartTotalCents && cartTotalCents > 0,
  }
}

export function giftBlockedMessage(reason: GiftBlockedReason): string {
  switch (reason) {
    case 'not_found': return 'We could not find that gift card code.'
    case 'not_active': return 'That gift card is not active yet, or has already been used up.'
    case 'no_balance': return 'That gift card has no balance left.'
    case 'expired': return 'That gift card has expired.'
  }
}

/** Expiry stamp for a card bought now. */
export function giftExpiryFrom(now: Date = new Date()): Date {
  const d = new Date(now.getTime())
  d.setMonth(d.getMonth() + GIFT_VALID_MONTHS)
  return d
}

/**
 * Classify a Supabase failure so callers can tell "gift cards aren't set up on
 * this deployment" from "something went wrong, retry might help".
 *
 * The distinction matters operationally. An unconfigured backend produces a
 * DNS/connection failure, and telling the customer to "please try again" sends
 * them into a loop that can never succeed while telling the operator nothing.
 * A missing table means the migrations haven't run, which is a deploy step,
 * not a transient fault.
 */
export type GiftBackendFault = 'unreachable' | 'missing_table' | 'other'

export function classifyGiftBackendError(err: unknown): GiftBackendFault {
  const msg = (
    err instanceof Error ? err.message
    : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message)
    : String(err ?? '')
  ).toLowerCase()

  if (
    msg.includes('fetch failed') || msg.includes('enotfound') ||
    msg.includes('getaddrinfo') || msg.includes('econnrefused') ||
    msg.includes('network')
  ) return 'unreachable'

  // PostgREST: undefined table / schema cache miss.
  if (
    msg.includes('does not exist') || msg.includes('could not find the table') ||
    msg.includes('schema cache') || msg.includes('relation')
  ) return 'missing_table'

  return 'other'
}

export function giftBackendMessage(fault: GiftBackendFault): string {
  switch (fault) {
    case 'unreachable':
      return 'Gift cards are not available on this site yet. Please contact us and we will sort you out.'
    case 'missing_table':
      return 'Gift cards are not switched on yet. Please contact us and we will sort you out.'
    case 'other':
      return 'Could not create the gift card. Please try again.'
  }
}
