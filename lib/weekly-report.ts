/**
 * Weekly performance report: the bookings half.
 *
 * Pure aggregation over raw `bookings` rows so the numbers can be unit tested
 * without Supabase. The route (app/api/report/bookings) fetches every row that
 * was created, paid or refunded inside the window and hands them here.
 *
 * Output is aggregates only. No email, name or phone ever leaves this module;
 * the email is read solely to drop our own test bookings.
 */

export interface ReportBookingRow {
  id: string
  email: string | null
  booking_type: string | null
  status: string | null
  total_paid: number | string | null
  paid_at: string | null
  created_at: string | null
  refunded_at: string | null
  refund_amount: number | string | null
  // Coupon columns (migrations 031/032) may be missing on a database that
  // drifted, in which case the route selects without them.
  coupon_code?: string | null
  coupon_discount?: number | string | null
  attribution: unknown
}

export interface CountRevenue {
  count: number
  revenueUsd: number
}

export interface AttributionRow {
  source: string
  medium: string
  paid: number
  started: number
}

export interface BookingsReport {
  paid: CountRevenue & { byType: { tour: CountRevenue; transfer: CountRevenue } }
  started: { count: number }
  abandoned: { count: number }
  refunds: { count: number; amountUsd: number }
  coupons: { count: number; discountUsd: number }
  attribution: AttributionRow[]
}

/** Our own and synthetic traffic: example.com walkthroughs, Resend test inboxes, the team. */
export const TEST_EMAIL_RE = /@example\.com$|resend\.dev|mapltech\.com|leshanpatterson|leshan_patterson/i

export const ATTRIBUTION_TOP = 8

export function isTestBooking(row: Pick<ReportBookingRow, 'email'>): boolean {
  return !!row.email && TEST_EMAIL_RE.test(row.email.trim())
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0
  return Number.isFinite(n) ? n : 0
}

// Money is summed in cents so a week of numeric(10,2) values does not drift.
function cents(v: unknown): number {
  return Math.round(num(v) * 100)
}

function usd(c: number): number {
  return c / 100
}

/** [since, until): the start instant counts, the end instant belongs to the next window. */
function inWindow(iso: string | null | undefined, sinceMs: number, untilMs: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= sinceMs && t < untilMs
}

function attrKey(attribution: unknown): { source: string; medium: string } {
  const a = attribution && typeof attribution === 'object' ? (attribution as Record<string, unknown>) : {}
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null)
  return { source: clean(a.source) ?? '(direct)', medium: clean(a.medium) ?? '(none)' }
}

export function aggregateBookings(rows: ReportBookingRow[], since: string, until: string): BookingsReport {
  const sinceMs = Date.parse(since)
  const untilMs = Date.parse(until)

  let paidCount = 0
  let paidCents = 0
  const byType = { tour: { count: 0, cents: 0 }, transfer: { count: 0, cents: 0 } }
  let started = 0
  let abandoned = 0
  let refundCount = 0
  let refundCents = 0
  let couponCount = 0
  let couponCents = 0
  const groups = new Map<string, AttributionRow>()

  for (const row of rows) {
    if (isTestBooking(row)) continue

    const wasPaid = inWindow(row.paid_at, sinceMs, untilMs)
    const wasStarted = inWindow(row.created_at, sinceMs, untilMs)

    if (wasPaid) {
      const c = cents(row.total_paid)
      paidCount++
      paidCents += c
      if (row.booking_type === 'tour' || row.booking_type === 'transfer') {
        byType[row.booking_type].count++
        byType[row.booking_type].cents += c
      }
      if (row.coupon_code) {
        couponCount++
        couponCents += cents(row.coupon_discount)
      }
    }

    if (wasStarted) {
      started++
      if (row.status === 'pending') abandoned++
    }

    if (inWindow(row.refunded_at, sinceMs, untilMs)) {
      refundCount++
      refundCents += cents(row.refund_amount)
    }

    if (wasPaid || wasStarted) {
      const { source, medium } = attrKey(row.attribution)
      const key = `${source}\u0000${medium}`
      const g = groups.get(key) ?? { source, medium, paid: 0, started: 0 }
      if (wasPaid) g.paid++
      if (wasStarted) g.started++
      groups.set(key, g)
    }
  }

  const attribution = Array.from(groups.values())
    .sort((a, b) => b.started - a.started || b.paid - a.paid || a.source.localeCompare(b.source))
    .slice(0, ATTRIBUTION_TOP)

  return {
    paid: {
      count: paidCount,
      revenueUsd: usd(paidCents),
      byType: {
        tour: { count: byType.tour.count, revenueUsd: usd(byType.tour.cents) },
        transfer: { count: byType.transfer.count, revenueUsd: usd(byType.transfer.cents) },
      },
    },
    started: { count: started },
    abandoned: { count: abandoned },
    refunds: { count: refundCount, amountUsd: usd(refundCents) },
    coupons: { count: couponCount, discountUsd: usd(couponCents) },
    attribution,
  }
}

export const MAX_WINDOW_DAYS = 62

// Date.parse rolls 2026-09-31 over to October 1 instead of refusing it.
function realDate(raw: string): boolean {
  const [y, m, d] = raw.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Parses and checks the report window. Returns normalized ISO strings or an error message. */
export function parseWindow(
  sinceRaw: string | null,
  untilRaw: string | null
): { since: string; until: string } | { error: string } {
  if (!sinceRaw || !untilRaw) return { error: 'since and until are required ISO instants.' }
  // An instant needs a zone: without one Date.parse reads the server's local
  // time and the window would shift by its offset.
  const iso = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/
  if (!iso.test(sinceRaw) || !iso.test(untilRaw)) return { error: 'since and until must be ISO instants.' }
  if (!realDate(sinceRaw) || !realDate(untilRaw)) return { error: 'since and until must be real calendar dates.' }
  const s = Date.parse(sinceRaw)
  const u = Date.parse(untilRaw)
  if (!Number.isFinite(s) || !Number.isFinite(u)) return { error: 'since and until must be valid dates.' }
  if (u <= s) return { error: 'until must be after since.' }
  if (u - s > MAX_WINDOW_DAYS * 86_400_000) return { error: `The window may be at most ${MAX_WINDOW_DAYS} days.` }
  return { since: new Date(s).toISOString(), until: new Date(u).toISOString() }
}
