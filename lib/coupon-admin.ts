/**
 * The rules an admin may set on a coupon, validated in one place so the
 * create and the edit paths can never disagree, and so a wrong shape is
 * refused with a sentence rather than a Postgres error.
 */

export type AppliesTo = 'tour' | 'transfer' | 'both'
export type CouponKindInput = 'percent' | 'fixed'

export interface CouponFields {
  kind: CouponKindInput
  value: number
  applies_to: AppliesTo
  /** null = unlimited */
  max_uses: number | null
  /** null = no per-address limit */
  uses_per_email: number | null
  min_total: number | null
  /** ISO timestamp or null = never expires */
  expires_at: string | null
  note: string | null
}

export type ParsedCoupon = { ok: true; fields: CouponFields } | { ok: false; error: string }

const blank = (v: unknown) => v == null || v === ''

/** Parse the admin form. Every field is validated; blanks mean "no limit" where that is a valid choice. */
export function parseCouponFields(b: Record<string, unknown>, now: number = Date.now()): ParsedCoupon {
  const kind = b.kind === 'fixed' ? 'fixed' : b.kind === 'percent' ? 'percent' : null
  if (!kind) return { ok: false, error: 'Pick percent or a fixed amount.' }
  const value = Number(b.value)
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'The value must be a number above zero.' }
  if (kind === 'percent' && (value > 100 || !Number.isInteger(value))) return { ok: false, error: 'A percent is a whole number from 1 to 100.' }
  if (kind === 'fixed' && value > 1000) return { ok: false, error: 'A fixed amount is at most $1,000.' }

  const appliesTo = blank(b.appliesTo) ? 'both' : b.appliesTo
  if (appliesTo !== 'tour' && appliesTo !== 'transfer' && appliesTo !== 'both') return { ok: false, error: 'Pick tours, airport rides, or both.' }

  const maxUses = blank(b.maxUses) ? null : Math.round(Number(b.maxUses))
  if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100000)) return { ok: false, error: 'Uses is blank for unlimited, or a number from 1 to 100,000.' }

  const usesPerEmail = blank(b.usesPerEmail) ? null : Math.round(Number(b.usesPerEmail))
  if (usesPerEmail != null && (!Number.isFinite(usesPerEmail) || usesPerEmail < 1 || usesPerEmail > 100)) return { ok: false, error: 'Per guest is blank for no limit, or a number from 1 to 100.' }

  const minTotal = blank(b.minTotal) ? null : Number(b.minTotal)
  if (minTotal != null && (!Number.isFinite(minTotal) || minTotal < 0 || minTotal > 100000)) return { ok: false, error: 'The minimum must be a dollar amount.' }

  let expiresAt: string | null = null
  if (!blank(b.expiresAt)) {
    const t = Date.parse(String(b.expiresAt))
    if (!Number.isFinite(t)) return { ok: false, error: 'The expiry date is not a date.' }
    if (t < now) return { ok: false, error: 'The expiry date is in the past.' }
    expiresAt = new Date(t).toISOString()
  }

  const note = typeof b.note === 'string' && b.note.trim() ? b.note.slice(0, 300) : null

  return { ok: true, fields: { kind, value, applies_to: appliesTo, max_uses: maxUses, uses_per_email: usesPerEmail, min_total: minTotal, expires_at: expiresAt, note } }
}
