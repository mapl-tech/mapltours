/**
 * Coupons: the pure rules, shared by the validate endpoint, the checkout and
 * the client preview so every side computes the same cents.
 *
 * A coupon is a price reduction, never tender. It is applied to the tour
 * total after the video reward, in integer cents, and it always leaves at
 * least $1 to charge so Stripe's minimum and the checkout's $1 tolerance are
 * never in play.
 */

/** The alphabet lib/gift-cards.ts uses: no look-alike characters. */
const ALPHABET = 'ACDEFHJKLMNPQRTUVWXY2346789'

/** The charge a coupon may never cut below, in cents. */
export const COUPON_FLOOR_CENTS = 100
/** The largest percent an issued (not admin-created) coupon may carry. */
export const ISSUED_PERCENT_MAX = 10

export type CouponKind = 'percent' | 'fixed'

export interface CouponRow {
  id: string
  code: string
  kind: CouponKind
  value: number | string
  applies_to: 'tour' | 'transfer' | 'both'
  email: string | null
  max_uses: number
  uses: number
  min_total: number | string | null
  starts_at: string | null
  expires_at: string | null
  status: 'active' | 'paused' | 'void'
}

function secureIndices(count: number): number[] {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  const out: number[] = []
  const buf = new Uint8Array(count * 2)
  while (out.length < count) {
    globalThis.crypto.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < count; i++) {
      if (buf[i] < max) out.push(buf[i] % ALPHABET.length)
    }
  }
  return out
}

/** MAPL-XXXX-XXXX, the same shape as a gift code so guests recognise it. */
export function generateCouponCode(randomIndices: (count: number) => number[] = secureIndices): string {
  const chars = randomIndices(8).map((i) => ALPHABET[i % ALPHABET.length])
  return `MAPL-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

/**
 * Canonical form of whatever the guest typed. Issued codes come back as
 * MAPL-XXXX-XXXX; admin word codes (WELCOME5) as uppercase letters and
 * digits, 4 to 24 long. Anything else is not a code.
 */
export function normalizeCouponCode(input: string): string | null {
  const cleaned = (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!cleaned) return null
  if (cleaned.startsWith('MAPL') && cleaned.length === 12) {
    const body = cleaned.slice(4)
    if (body.split('').every((c) => ALPHABET.includes(c))) return `MAPL-${body.slice(0, 4)}-${body.slice(4)}`
  }
  if (cleaned.length < 4 || cleaned.length > 24) return null
  return cleaned
}

/** Lowercased, trimmed; the only form an email is compared in. */
export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

/**
 * How many cents a coupon takes off `baseCents`. Percent is rounded to the
 * nearest cent; fixed is capped at the base; both leave the floor.
 */
export function couponDiscountCents(kind: CouponKind, value: number, baseCents: number): number {
  if (!Number.isFinite(baseCents) || baseCents <= 0 || !Number.isFinite(value) || value <= 0) return 0
  const raw = kind === 'percent' ? Math.round((baseCents * value) / 100) : Math.round(value * 100)
  const ceiling = Math.max(0, baseCents - COUPON_FLOOR_CENTS)
  return Math.max(0, Math.min(raw, baseCents, ceiling))
}

export type CouponBlockedReason =
  | 'not_found'
  | 'not_active'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'wrong_email'
  | 'min_total'
  | 'not_tours'
  | 'too_small'

export type CouponApplication =
  | { applicable: true; discountCents: number; chargeCents: number }
  | { applicable: false; reason: CouponBlockedReason }

export interface CouponContext {
  /** The total the coupon applies to, in cents, after any reward. */
  baseCents: number
  /** The guest's email as typed; compared lowercased. */
  email?: string | null
  bookingType?: 'tour' | 'transfer'
  now?: Date
}

/** Every rule, in the order a guest would want to hear about it. */
export function applyCoupon(row: CouponRow | null | undefined, ctx: CouponContext): CouponApplication {
  if (!row) return { applicable: false, reason: 'not_found' }
  const now = ctx.now ?? new Date()
  if (row.status !== 'active') return { applicable: false, reason: 'not_active' }
  if (row.starts_at && Date.parse(row.starts_at) > now.getTime()) return { applicable: false, reason: 'not_started' }
  if (row.expires_at && Date.parse(row.expires_at) < now.getTime()) return { applicable: false, reason: 'expired' }
  if (Number(row.uses) >= Number(row.max_uses)) return { applicable: false, reason: 'exhausted' }
  const type = ctx.bookingType ?? 'tour'
  if (row.applies_to !== 'both' && row.applies_to !== type) return { applicable: false, reason: 'not_tours' }
  if (row.email) {
    const given = normalizeEmail(ctx.email)
    if (!given || given !== normalizeEmail(row.email)) return { applicable: false, reason: 'wrong_email' }
  }
  const minCents = row.min_total == null ? 0 : Math.round(Number(row.min_total) * 100)
  if (minCents > 0 && ctx.baseCents < minCents) return { applicable: false, reason: 'min_total' }
  const discountCents = couponDiscountCents(row.kind, Number(row.value), ctx.baseCents)
  if (discountCents <= 0) return { applicable: false, reason: 'too_small' }
  return { applicable: true, discountCents, chargeCents: ctx.baseCents - discountCents }
}

/** What the guest reads. Plain, specific, never blaming. */
export function couponBlockedMessage(reason: CouponBlockedReason, row?: Pick<CouponRow, 'min_total' | 'email'> | null): string {
  switch (reason) {
    case 'not_found': return 'We could not find that code. Check the spelling and try again.'
    case 'not_active': return 'That code is no longer active.'
    case 'not_started': return 'That code is not active yet.'
    case 'expired': return 'That code has expired.'
    case 'exhausted': return 'That code has already been used.'
    case 'wrong_email': return 'That code was sent to a different email address. Enter the address it was sent to and try again.'
    case 'min_total': return `That code needs a booking of at least $${Number(row?.min_total ?? 0).toFixed(0)}.`
    case 'not_tours': return 'That code works on tours, not on airport rides.'
    case 'too_small': return 'That code cannot be applied to this total.'
  }
}

/** A short rule in plain words, for the admin and the receipt. */
export function describeCoupon(row: Pick<CouponRow, 'kind' | 'value' | 'applies_to' | 'max_uses' | 'email' | 'min_total' | 'expires_at'>): string {
  const off = row.kind === 'percent' ? `${Number(row.value)}% off` : `$${Number(row.value).toFixed(0)} off`
  const what = row.applies_to === 'both' ? 'tours and rides' : row.applies_to === 'transfer' ? 'airport rides' : 'tours'
  const uses = row.max_uses === 1 ? 'one use' : `${row.max_uses} uses`
  const parts = [`${off} ${what}`, uses]
  if (row.email) parts.push(`for ${row.email}`)
  if (row.min_total) parts.push(`on $${Number(row.min_total).toFixed(0)} or more`)
  if (row.expires_at) parts.push(`until ${new Date(row.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Jamaica' })}`)
  return parts.join(', ')
}

export type CouponBackendFault = 'unreachable' | 'missing_table' | 'other'

export function classifyCouponBackendError(err: unknown): CouponBackendFault {
  const msg = (
    err instanceof Error ? err.message
    : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message)
    : String(err ?? '')
  ).toLowerCase()
  if (msg.includes('fetch failed') || msg.includes('enotfound') || msg.includes('getaddrinfo') || msg.includes('econnrefused') || msg.includes('network')) return 'unreachable'
  if (msg.includes('does not exist') || msg.includes('could not find the table') || msg.includes('schema cache') || msg.includes('relation')) return 'missing_table'
  return 'other'
}

export function couponBackendMessage(fault: CouponBackendFault): string {
  switch (fault) {
    case 'unreachable': return 'Codes cannot be checked right now. Please try again in a moment.'
    case 'missing_table': return 'Codes are not switched on yet. Please contact us and we will sort you out.'
    case 'other': return 'Could not check that code. Please try again.'
  }
}
