/**
 * Booking sync: the rules for telling the CRM who booked.
 *
 * Pure functions, no I/O, so every decision the cron makes is unit-testable.
 * The I/O lives in lib/booking-sync-run.ts; the cron route is
 * app/api/booking-sync/route.ts, called every 15 minutes by
 * netlify/functions/booking-sync-cron.mjs.
 *
 * What a sync is. A booking carries a money state: 'paid' (the webhook
 * flipped it) or 'refunded' (terminal; the webhook on a full Stripe refund,
 * or an admin approving a cancellation). Each state is synced once, recorded
 * by its own stamp in bookings.dispatch:
 *
 *   crm_paid_synced_at    this booking's paid state reached the CRM
 *   crm_refund_synced_at  this booking's refund reached the CRM
 *
 * A sync never writes the booking's numbers anywhere by increment. It
 * recomputes the WHOLE picture for the guest's email from every booking that
 * address has, and sets it: running it twice, or for two bookings at once,
 * lands on the same values.
 *
 * SAFETY: the stamps, and the retry bookkeeping beside them (crm_sync_*),
 * are the only things the sync ever writes to Supabase, all inside
 * bookings.dispatch through merge_dispatch (an atomic jsonb merge, migration
 * 012). Status and every money column are read, never written.
 */

/** Stamp: this booking's paid state has been synced. */
export const CRM_PAID_KEY = 'crm_paid_synced_at'
/** Stamp: this booking's refund has been synced. */
export const CRM_REFUND_KEY = 'crm_refund_synced_at'
/**
 * Set beside a stamp when the booking was deliberately NOT sent anywhere (a
 * test address, or no usable email), so the row leaves the queue without
 * pretending it reached the CRM.
 */
export const CRM_SKIP_KEY = 'crm_sync_skipped'

/**
 * Retry bookkeeping for a booking whose sync failed. NOT a stamp: the row
 * stays in the queue, but it is not read again before crm_sync_retry_at, and
 * rows that never failed are always taken first. So a booking that fails
 * every time (an address HubSpot rejects, a key without the right access)
 * backs off to one try a day and can never hold back a newer booking. The
 * stamp that finally records the sync removes all three keys.
 *
 *   crm_sync_failures  failed attempts in a row (number)
 *   crm_sync_retry_at  ISO time before which the row is not read again
 *   crm_sync_error     the last short machine reason (never an address)
 */
export const CRM_FAILURES_KEY = 'crm_sync_failures'
export const CRM_RETRY_AT_KEY = 'crm_sync_retry_at'
export const CRM_ERROR_KEY = 'crm_sync_error'
export const CRM_RETRY_KEYS: readonly string[] = [CRM_FAILURES_KEY, CRM_RETRY_AT_KEY, CRM_ERROR_KEY]

/**
 * PostgREST paths that exclude already-stamped rows SERVER-SIDE, so every
 * slot in a run's batch is a live candidate. `dispatch->key IS NULL` is true
 * exactly when the key is absent (or dispatch itself is null). Derived from
 * the keys so the SQL filter and the JS rule can never name different keys.
 */
export const CRM_PAID_FILTER = `dispatch->${CRM_PAID_KEY}`
export const CRM_REFUND_FILTER = `dispatch->${CRM_REFUND_KEY}`
/** `is null`: the row never failed. */
export const CRM_NEVER_FAILED_FILTER = `dispatch->${CRM_RETRY_AT_KEY}`
/**
 * `lte <now ISO>`: a failed row whose retry is due. `->>` reads the value as
 * text; every value is written by toISOString (one fixed format), so text
 * order is time order.
 */
export const CRM_RETRY_DUE_FILTER = `dispatch->>${CRM_RETRY_AT_KEY}`

/** The first retry lands on the next 15-minute run; each failure doubles the wait. */
export const RETRY_BASE_MS = 10 * 60_000
/** Never longer than a day between tries: the sync never gives up. */
export const RETRY_MAX_MS = 24 * 60 * 60_000
/**
 * From this many failures in a row (about a day of trying) a booking is
 * reported as stuck, and the route logs it at error level.
 */
export const STUCK_AFTER = 8

/** Bookings one run will take. Real volume is a handful a day. */
export const SYNC_BATCH = 25

/**
 * Stop starting new work after this. A synchronous Netlify function is cut
 * off at 10 seconds (measured in app/api/abandoned-cart/route.ts). Being cut
 * off is SAFE here, because a booking is stamped only after its CRM writes
 * succeeded: a killed run leaves rows unstamped and the next run redoes
 * idempotent writes. The deadline just lets the run end with a summary.
 */
export const SYNC_DEADLINE_MS = 7_000

/** Each external call gives up after this, so one hung request cannot eat the run. */
export const SYNC_CALL_TIMEOUT_MS = 2_500

/**
 * Addresses that are ours or synthetic. Same rule as the bio's weekly report
 * (TEST_EMAIL in the bio repo's netlify/lib/report/util.mts). They never reach
 * HubSpot or Resend; their rows are stamped as skipped so they leave the queue.
 */
export const TEST_EMAIL = /@example\.com$|resend\.dev|mapltech\.com|leshanpatterson|leshan_patterson/i

/** The columns the sync reads. All verified on the live table 2026-09-24. */
export const SYNC_BOOKING_SELECT =
  'id, status, booking_type, email, first_name, last_name, total_paid, paid_at, refunded_at, refund_amount, admin_charge, dispatch'

export interface SyncBooking {
  id: string
  status: string
  booking_type?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  /** The whole cart, gift-funded share included. */
  total_paid?: number | string | null
  paid_at?: string | null
  refunded_at?: string | null
  /** Value returned to the guest, as the refund path recorded it. */
  refund_amount?: number | string | null
  /** What MAPL kept from a refunded booking. */
  admin_charge?: number | string | null
  dispatch?: Record<string, unknown> | null
}

export type SyncState = 'paid' | 'refund'

function hasKey(d: Record<string, unknown> | null | undefined, key: string): boolean {
  return !!d && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, key)
}

/**
 * Which money state of this booking still has to reach the CRM, or null.
 *
 * Only 'paid' and 'refunded' are money states. 'pending', 'failed' and
 * 'canceled' never took money and are never synced. A refunded booking whose
 * paid state was never synced (paid and refunded between two runs) syncs only
 * its refund: it is not a live booking, and firing booking.paid for it would
 * stop a guest's welcome tips for a trip that is not happening.
 */
export function pendingSyncState(b: Pick<SyncBooking, 'status' | 'dispatch'>): SyncState | null {
  if (b.status === 'paid') return hasKey(b.dispatch, CRM_PAID_KEY) ? null : 'paid'
  if (b.status === 'refunded') return hasKey(b.dispatch, CRM_REFUND_KEY) ? null : 'refund'
  return null
}

export function stampKeyFor(state: SyncState): string {
  return state === 'paid' ? CRM_PAID_KEY : CRM_REFUND_KEY
}

/**
 * The patch that records a sync. A skip carries its reason beside the stamp,
 * so a skipped row is never mistaken for one that reached the CRM.
 */
export function stampPatch(state: SyncState, nowIso: string, skipped?: 'test_address' | 'no_email'): Record<string, string> {
  return { [stampKeyFor(state)]: nowIso, ...(skipped ? { [CRM_SKIP_KEY]: skipped } : {}) }
}

/** How long to wait after the nth failure in a row: 10 min, doubling, at most a day. */
export function retryDelayMs(failures: number): number {
  const n = Number.isFinite(failures) ? Math.max(1, Math.floor(failures)) : 1
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(n - 1, 30))
}

/** Failed attempts in a row recorded on the row so far. */
export function priorFailures(b: Pick<SyncBooking, 'dispatch'>): number {
  const n = Number(b.dispatch?.[CRM_FAILURES_KEY])
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** The patch that records one more failed attempt and when to try again. */
export function failurePatch(b: Pick<SyncBooking, 'dispatch'>, nowMs: number, reason: string): Record<string, string | number> {
  const failures = priorFailures(b) + 1
  return {
    [CRM_FAILURES_KEY]: failures,
    [CRM_RETRY_AT_KEY]: new Date(nowMs + retryDelayMs(failures)).toISOString(),
    [CRM_ERROR_KEY]: reason.slice(0, 60),
  }
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lower-cased, trimmed, and plausibly an address; otherwise null. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase()
  return EMAIL_SHAPE.test(e) ? e : null
}

export function isTestAddress(email: string): boolean {
  return TEST_EMAIL.test(email)
}

/** First character, then ***@domain. The only form an address takes in output. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return `${email[0]}***@${email.slice(at + 1)}`
}

/** A money column as integer cents, or null when absent or unreadable. */
function cents(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** A booking that took money: paid, or paid and then refunded. */
export function wasPaid(b: Pick<SyncBooking, 'status'>): boolean {
  return b.status === 'paid' || b.status === 'refunded'
}

/**
 * What MAPL kept from this booking, in cents: total_paid less what went back.
 *
 * A refunded booking reads admin_charge first. Both refund paths write it as
 * what MAPL kept, and it is the one figure that is right on both:
 *   - admin approval (app/api/admin/refunds/[id]) records refund_amount as
 *     cash + gift credit and admin_charge = total_paid - refund_amount;
 *   - a Dashboard refund (the charge.refunded webhook) records refund_amount
 *     as Stripe's CASH figure only and returns the gift-funded share to the
 *     card separately, so total_paid - refund_amount would still count that
 *     returned gift share as kept. admin_charge there is captured cash less
 *     cash refunded, which with the gift share returned is what was kept.
 * Without admin_charge (its stamp is best effort in the webhook), fall back to
 * total_paid - refund_amount; with neither, a refunded booking counts 0, the
 * conservative reading of a refund whose size was never recorded.
 *
 * Always within [0, total_paid]: a sync must never report more than the
 * booking was worth, or a negative.
 */
export function keptCents(b: SyncBooking): number {
  const total = Math.max(0, cents(b.total_paid) ?? 0)
  if (b.status === 'paid') {
    return clamp(total - (cents(b.refund_amount) ?? 0), 0, total)
  }
  if (b.status === 'refunded') {
    const charge = cents(b.admin_charge)
    if (charge !== null) return clamp(charge, 0, total)
    const refunded = cents(b.refund_amount)
    if (refunded !== null) return clamp(total - refunded, 0, total)
    return 0
  }
  return 0
}

export type BookingType = 'tour' | 'transfer'

function bookingType(v: string | null | undefined): BookingType {
  // The column is NOT NULL DEFAULT 'tour' with a check for the two values
  // (migration 006), so anything that is not 'transfer' is a tour.
  return v === 'transfer' ? 'transfer' : 'tour'
}

function paidMs(b: Pick<SyncBooking, 'paid_at'>): number | null {
  if (!b.paid_at) return null
  const ms = Date.parse(b.paid_at)
  return Number.isNaN(ms) ? null : ms
}

export interface CrmAggregate {
  /** USD, net of refunds, over bookings that took money. */
  totalCents: number
  /** Epoch ms of the latest paid_at, or null when none is readable. */
  lastBookingAtMs: number | null
  /** Type of the booking with that latest paid_at. */
  bookingType: BookingType | null
  /** At least one booking is paid right now (not refunded). */
  hasPaid: boolean
  /** Bookings that took money, refunded ones included. */
  bookingsCounted: number
}

/**
 * The CRM picture for one address, from ALL its bookings. Idempotent: the
 * same rows always give the same values, whatever order they arrive in or
 * however many times one appears.
 */
export function aggregateForEmail(rows: SyncBooking[]): CrmAggregate {
  const byId = new Map<string, SyncBooking>()
  for (const r of rows) byId.set(r.id, r)
  const counted = Array.from(byId.values()).filter(wasPaid)

  let totalCents = 0
  let latest: SyncBooking | null = null
  let latestMs = -Infinity
  for (const b of counted) {
    totalCents += keptCents(b)
    const ms = paidMs(b)
    // Ties broken by id so the answer never depends on row order.
    if (ms !== null && (ms > latestMs || (ms === latestMs && latest && b.id > latest.id))) {
      latest = b
      latestMs = ms
    }
  }
  return {
    totalCents,
    lastBookingAtMs: latest ? latestMs : null,
    bookingType: latest ? bookingType(latest.booking_type) : null,
    hasPaid: counted.some((b) => b.status === 'paid'),
    bookingsCounted: counted.length,
  }
}

/**
 * Lifecycle stages below customer, in HubSpot's order (read from the portal's
 * lifecyclestage property 2026-09-24: subscriber, lead, marketingqualifiedlead,
 * salesqualifiedlead, opportunity, customer, evangelist, other). Empty means
 * never set.
 */
export const STAGES_BEFORE_CUSTOMER: readonly string[] = [
  '',
  'subscriber',
  'lead',
  'marketingqualifiedlead',
  'salesqualifiedlead',
  'opportunity',
]

/**
 * Whether to write lifecyclestage=customer. Never a downgrade: evangelist,
 * other, customer itself and any custom stage this code does not know are
 * left exactly as they are. Only a stage known to be earlier moves up.
 */
export function shouldSetCustomer(currentStage: string | null | undefined, hasPaid: boolean): boolean {
  if (!hasPaid) return false
  return STAGES_BEFORE_CUSTOMER.includes((currentStage ?? '').trim().toLowerCase())
}

/**
 * The booking properties for HubSpot. Strings, as HubSpot's API takes them;
 * the datetime as epoch ms, the same form the bio writes mapl_lead_at in.
 */
export function crmProperties(agg: CrmAggregate): Record<string, string> {
  return {
    mapl_bookings_total: (agg.totalCents / 100).toFixed(2),
    ...(agg.lastBookingAtMs !== null ? { mapl_last_booking_at: String(agg.lastBookingAtMs) } : {}),
    ...(agg.bookingType ? { mapl_booking_type: agg.bookingType } : {}),
  }
}

/** The name to create a contact with: the latest booking that carries one. */
export function contactName(rows: SyncBooking[]): { firstname?: string; lastname?: string } {
  const named = rows
    .filter((r) => (r.first_name ?? '').trim() || (r.last_name ?? '').trim())
    .sort((a, b) => (paidMs(b) ?? 0) - (paidMs(a) ?? 0))
  const r = named[0]
  if (!r) return {}
  const first = (r.first_name ?? '').trim().slice(0, 100)
  const last = (r.last_name ?? '').trim().slice(0, 100)
  return { ...(first ? { firstname: first } : {}), ...(last ? { lastname: last } : {}) }
}

export interface SyncGroup {
  /** Normalized address. Never leaves the server unmasked. */
  email: string
  test: boolean
  /** This address's bookings that are waiting for a sync, with the state each waits on. */
  candidates: { booking: SyncBooking; state: SyncState }[]
}

/**
 * Group this run's waiting bookings by address. Bookings with no usable
 * address come back separately: they can never be synced, so the run stamps
 * them skipped rather than re-reading them forever.
 */
export function groupCandidates(rows: SyncBooking[]): {
  groups: SyncGroup[]
  noEmail: { booking: SyncBooking; state: SyncState }[]
} {
  const groups = new Map<string, SyncGroup>()
  const noEmail: { booking: SyncBooking; state: SyncState }[] = []
  const seen = new Set<string>()
  for (const b of rows) {
    if (seen.has(b.id)) continue
    seen.add(b.id)
    const state = pendingSyncState(b)
    if (!state) continue
    const email = normalizeEmail(b.email)
    if (!email) {
      noEmail.push({ booking: b, state })
      continue
    }
    let g = groups.get(email)
    if (!g) {
      g = { email, test: isTestAddress(email), candidates: [] }
      groups.set(email, g)
    }
    g.candidates.push({ booking: b, state })
  }
  return { groups: Array.from(groups.values()), noEmail }
}

/**
 * Reconcile a group with the rows just re-read for its address.
 *
 * `rows` is every booking the address query returned, keeping only those
 * whose address really is the group's (PostgREST reads `*` in an ilike value
 * as a wildcard and a backslash cannot escape it, so the query alone can
 * match other guests' rows).
 *
 * A candidate was read at the start of the run, seconds earlier. When its
 * fresh copy no longer waits on the same state (refunded meanwhile, a refund
 * claim released back to paid, or stamped by an overlapping run), it is
 * STALE: this run neither stamps it nor lets it send booking.paid, and the
 * next run takes it as it is then. `aggregate` holds the fresh copy of every
 * booking, plus any candidate the query did not return (an address stored
 * with stray whitespace), so the totals are never computed from a stale row.
 */
export function reconcileGroup(group: SyncGroup, rows: SyncBooking[]): {
  live: SyncGroup['candidates']
  stale: number
  aggregate: SyncBooking[]
} {
  const fresh = rows.filter((r) => normalizeEmail(r.email) === group.email)
  const byId = new Map(fresh.map((r) => [r.id, r]))
  const live: SyncGroup['candidates'] = []
  let stale = 0
  for (const c of group.candidates) {
    const now = byId.get(c.booking.id)
    if (!now) live.push(c)
    else if (pendingSyncState(now) === c.state) live.push({ booking: now, state: c.state })
    else stale += 1
  }
  const missing = group.candidates.filter((c) => !byId.has(c.booking.id)).map((c) => c.booking)
  return { live, stale, aggregate: [...fresh, ...missing] }
}

/**
 * The booking.paid event this group should send, or null.
 *
 * Only a booking newly synced as PAID sends one (a refund never does), and
 * never for a test address. One event per address per run, typed by the
 * latest of its newly paid bookings: the event only has to end the welcome
 * tips' wait, and one does that.
 */
export function paidEventFor(group: SyncGroup): { type: BookingType } | null {
  if (group.test) return null
  const paid = group.candidates.filter((c) => c.state === 'paid').map((c) => c.booking)
  if (!paid.length) return null
  const latest = paid.sort((a, b) => (paidMs(b) ?? 0) - (paidMs(a) ?? 0) || (a.id < b.id ? 1 : -1))[0]
  return { type: bookingType(latest.booking_type) }
}

/** What the Resend step came to. */
export type ResendOutcome =
  /** No event was due (a refund, or a test address). */
  | 'not_needed'
  /** The address is not a Resend contact, so there is no welcome series to stop. */
  | 'no_contact'
  /** The event was accepted. */
  | 'sent'
  /** The contact check or the event failed; try again next run. */
  | 'failed'

/**
 * Whether the group's bookings may be stamped. Only after HubSpot took the
 * write AND the Resend step either was not needed or went through. Anything
 * else leaves the rows unstamped, so the next run tries the whole thing again.
 */
export function mayStamp(hubspotOk: boolean, resend: ResendOutcome): boolean {
  return hubspotOk && resend !== 'failed'
}
