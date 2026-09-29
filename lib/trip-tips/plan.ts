/**
 * Trip tips v2: which tip, if any, one subscriber gets today.
 *
 * Pure functions, no I/O, so every rule the daily job applies is unit-tested
 * (tests/unit/trip-tips-plan.spec.ts). The I/O is lib/trip-tips/run.ts, the
 * route app/api/trip-tips/route.ts, the cron netlify/functions/trip-tips-cron.mjs.
 *
 * Who gets what is decided by what the address has BOOKED, read from Supabase
 * at send time (never from HubSpot, which holds only the latest type, and never
 * from a Resend event, which carries no dates):
 *
 *   PROSPECT  no active booking      p1 ride costs, p2 tours, p3 before you land,
 *                                    p4 booking rules; 2 days after they joined,
 *                                    then 14 days apart, in that order
 *   RIDE      active ride(s) only    r1 before you fly (arrival 14+ days away),
 *                                    r2 the week before (arrival 5 to 8 days away).
 *                                    Never a tour pitch: the owner's tour upsell
 *                                    owns that.
 *   TOUR      active tour(s) only    t1 the airport ride (first tour 14+ days away),
 *                                    t2 the week before (first tour 5 to 8 days away)
 *   BOTH      rides and tours        b1 like r1 (arrival, and the earlier of arrival
 *                                    and first tour, 14+ days away), b2 the week
 *                                    before the earlier of arrival and first tour.
 *                                    No pitches.
 *
 * The week-before tip takes priority (owner, Sept 27 2026): an early tip (r1,
 * b1, t1) goes only while its anchor is EARLY_TIP_MIN_DAYS_AWAY or more days
 * off, so the 7-day gap it starts is over before the last two days of the
 * week-before window (days 8 to 5), which always keeps runs of its own. And
 * an early tip waits (and may never go) when sending it would fill the
 * 2-in-30-days limit through the whole week-before window, as it would
 * after a prospect tip sent shortly before the booking.
 *
 * An ACTIVE booking is status 'paid', refund_state 'none' (or null) and no
 * refunded_at. Anything else that took money is not active; two cases hold the
 * whole address instead of letting it fall back to PROSPECT:
 *   - a refund request awaiting a decision (refund_state 'requested'), and
 *   - a paid booking that is not cleanly active (refund_state 'declined' or
 *     'approved' while still paid, or refunded_at on a paid row). A declined
 *     cancellation leaves the trip standing; treating that guest as a prospect
 *     would pitch "your first ride" to someone who has one. Held until the
 *     owner decides what a declined request means for tips.
 *
 * Timing:
 *   - Leg times (arrival_at, departure_at) are Jamaica wall-clock stored with a
 *     Z. They become instants only through legInstantMs (lib/dispatch.ts),
 *     never Date.parse on its own. Tour dates are Jamaica calendar days.
 *   - "N days away" counts Jamaica calendar days between today (in Jamaica)
 *     and the day of the anchor, so the answer never depends on the server's
 *     time zone or the hour the job runs.
 *   - Services are grouped into TRIPS (groupTrips): an arrival and the next
 *     departure are one stay (up to MAX_STAY_DAYS), and anything within
 *     TRIP_GAP_DAYS of a stay or of another service joins it. The planner
 *     works on the NEXT trip only: its services pick the track and fill the
 *     email, so a tour in October and a ride in December are two trips, not
 *     one "BOTH" trip with a week-before list spanning two months.
 *   - A trip is over once its last service (latest leg, end of the last tour
 *     day) has passed; the series then stops for that address, and the review
 *     request takes over.
 *
 * Cadence (owner's rules), checked before anything else is worked out:
 *   - never two tips within 7 days to one address,
 *   - never more than 2 in any rolling 30 days,
 *   - nothing within 2 days after any booking was paid (the confirmation owns
 *     that window),
 *   - nothing in the 2 days before a trip starts, and nothing while a trip is
 *     under way: the next trip has begun (an arrival behind, its departure
 *     ahead, however long ago they landed) or any service began in the last
 *     IN_TRIP_LOOKBACK_DAYS (the day-of mail, the guide's call and the review
 *     request own those).
 * A due tip that cannot go today waits for a later run while its window is
 * open; a week-before tip whose window closes is skipped, never sent late.
 *
 * Once only: the ledger (trip_tips_log, one row per address and key) is the
 * record. A key with a 'sent' or 'claimed' row is never planned again, and
 * neither is a key in the same SLOT (r1 and b1 are the same "before you fly"
 * email for a guest whose track changed; r2, t2 and b2 are the same "week
 * before"). A 'failed' row does not count: that key may be tried again.
 */

import { legInstantMs } from '@/lib/dispatch'

export type Track = 'PROSPECT' | 'RIDE' | 'TOUR' | 'BOTH'

export const TIP_KEYS = [
  'p1_ride_costs',
  'p2_tours',
  'p3_before_you_land',
  'p4_booking_rules',
  'r1_before_you_fly',
  'r2_week_before',
  't1_airport_ride',
  't2_week_before_tour',
  'b1_before_you_fly',
  'b2_week_before',
] as const
export type TipKey = (typeof TIP_KEYS)[number]

export const TRACK_KEYS: Record<Track, readonly TipKey[]> = {
  PROSPECT: ['p1_ride_costs', 'p2_tours', 'p3_before_you_land', 'p4_booking_rules'],
  RIDE: ['r1_before_you_fly', 'r2_week_before'],
  TOUR: ['t1_airport_ride', 't2_week_before_tour'],
  BOTH: ['b1_before_you_fly', 'b2_week_before'],
}

/**
 * Keys that are the same email for a guest whose track changed. Sending one
 * blocks the others in its slot.
 */
export const SLOT: Record<TipKey, string> = {
  p1_ride_costs: 'p1',
  p2_tours: 'p2',
  p3_before_you_land: 'p3',
  p4_booking_rules: 'p4',
  r1_before_you_fly: 'fly',
  b1_before_you_fly: 'fly',
  r2_week_before: 'week',
  t2_week_before_tour: 'week',
  b2_week_before: 'week',
  t1_airport_ride: 't1',
}

export const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

/** p1 goes no sooner than this after they said yes (HubSpot mapl_tips_at). */
export const JOIN_WAIT_DAYS = 2
/** Each later prospect tip waits this long after the one before it was sent. */
export const PROSPECT_GAP_DAYS = 14
/** Nothing within this long after ANY booking at the address was paid. */
export const AFTER_PAID_DAYS = 2
/**
 * r1 and b1 only while the arrival (for b1, also the earlier of arrival and
 * first tour) is at least this many Jamaica calendar days away; t1 only while
 * the first tour day is. An early tip sent on day 14 holds the address for 7
 * days (MIN_GAP_DAYS), so days 6 and 5 of the week-before window (days 8 to
 * 5) are always free, and day 7 too unless that run starts earlier in the day
 * than the one that sent the early tip. Owner's decision, Sept 27 2026: the
 * week-before tip takes priority. It was 10 days for r1/b1 and 7 for t1,
 * which let an early tip sent 9 to 11 days out hold the address through the
 * whole window.
 */
export const EARLY_TIP_MIN_DAYS_AWAY = 14
/** The week-before window, in Jamaica calendar days before the anchor day. */
export const WEEK_BEFORE_MIN_DAYS = 5
export const WEEK_BEFORE_MAX_DAYS = 8
/** Nothing while the trip starts within this many calendar days. */
export const QUIET_BEFORE_TRIP_DAYS = 2
/** A service that began within this many days means the guest is on (or just back from) a trip. */
export const IN_TRIP_LOOKBACK_DAYS = 14
/**
 * Services this many Jamaica calendar days apart or closer are one trip: a
 * tour the day after landing, two tours in one week, a ride home three days
 * after the last tour. Further apart, a new trip.
 */
export const TRIP_GAP_DAYS = 7
/** An arrival and a later departure (even on separate bookings) are one stay when at most this far apart. */
export const MAX_STAY_DAYS = 60
/** Never two tips (or another marketing mail) within this many days. */
export const MIN_GAP_DAYS = 7
/** Never more than MAX_IN_WINDOW tips in any rolling window this long. */
export const ROLLING_WINDOW_DAYS = 30
export const MAX_IN_WINDOW = 2

/**
 * dispatch keys other marketing jobs stamp with an ISO time when they mail a
 * guest. They count toward the 7-day gap (no two marketing mails back to back)
 * but not toward the 2-in-30 tip limit. tour_upsell_sent is the owner's tour
 * upsell (lib/tour-upsell.ts UPSELL_STAMP_KEY, not yet deployed).
 */
export const OTHER_MARKETING_STAMPS: readonly string[] = ['tour_upsell_sent']

/* ── Inputs ─────────────────────────────────────────────────────────────── */

export interface TipBookingItem {
  item_type?: string | null
  experience_id?: number | null
  title?: string | null
  /** Tours: the Jamaica calendar day, YYYY-MM-DD. */
  date?: string | null
  travelers?: number | null
  hotel?: string | null
  zone?: string | null
  trip_type?: string | null
  arrival_flight?: string | null
  /** Jamaica wall-clock with a Z: read only through legInstantMs. */
  arrival_at?: string | null
  departure_flight?: string | null
  departure_at?: string | null
  passengers?: number | null
}

export interface TipBooking {
  id: string
  status: string
  booking_type?: string | null
  email?: string | null
  first_name?: string | null
  paid_at?: string | null
  refunded_at?: string | null
  refund_state?: string | null
  /** Tours: where the guest is picked up (a PICKUP_PLACES name or free text). */
  pickup?: string | null
  dispatch?: Record<string, unknown> | null
  booking_items?: TipBookingItem[] | null
}

export type LedgerStatus = 'claimed' | 'sent' | 'failed'

export interface LedgerRow {
  email: string
  tip_key: string
  track?: string | null
  status: LedgerStatus | string
  created_at: string
  sent_at?: string | null
  booking_id?: string | null
}

/* ── Jamaica time ───────────────────────────────────────────────────────── */

const JAMAICA_OFFSET_MS = 5 * HOUR_MS
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** The Jamaica calendar day of an instant, YYYY-MM-DD. Server time zone never matters. */
export function jamaicaDay(ms: number): string {
  return new Date(ms - JAMAICA_OFFSET_MS).toISOString().slice(0, 10)
}

/** Days since 1970-01-01 for a YYYY-MM-DD, or null when it is not a real date. */
export function dayNumber(ymd: string | null | undefined): number | null {
  const m = YMD.exec(ymd ?? '')
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const back = new Date(ms).toISOString().slice(0, 10)
  return back === ymd ? Math.round(ms / DAY_MS) : null
}

/** Whole Jamaica calendar days from today to `ymd` (0 = today, negative = past). */
export function daysAway(ymd: string, nowMs: number): number | null {
  const a = dayNumber(ymd)
  const b = dayNumber(jamaicaDay(nowMs))
  return a == null || b == null ? null : a - b
}

/** The instant a Jamaica calendar day begins (00:00 in Jamaica). */
function dayStartMs(ymd: string): number | null {
  const n = dayNumber(ymd)
  return n == null ? null : n * DAY_MS + JAMAICA_OFFSET_MS
}

/** A stored leg time as a real instant, or null when it is unreadable. */
export function legMs(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || !iso) return null
  const ms = legInstantMs(iso)
  return Number.isFinite(ms) ? ms : null
}

/** A stored leg time as the guest typed it: Jamaica date and HH:MM. */
export function legWallClock(iso: string): { date: string; time: string } | null {
  const ms = legMs(iso)
  if (ms == null) return null
  const wall = new Date(ms - JAMAICA_OFFSET_MS).toISOString()
  return { date: wall.slice(0, 10), time: wall.slice(11, 16) }
}

/** An ISO time or epoch ms (HubSpot answers either) as epoch ms, or null. */
export function parseInstant(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  const ms = /^\d{10,}$/.test(s) ? Number(s) : Date.parse(s)
  return Number.isFinite(ms) ? ms : null
}

/* ── Bookings ───────────────────────────────────────────────────────────── */

export type BookingState = 'active' | 'refund_requested' | 'unsettled' | 'inactive'

/** Where one booking stands for tips. Only 'active' is a trip we plan around. */
export function bookingState(b: Pick<TipBooking, 'status' | 'refund_state' | 'refunded_at'>): BookingState {
  const rs = b.refund_state ?? 'none'
  if (b.status === 'paid') {
    if (rs === 'requested') return 'refund_requested'
    if (rs === 'none' && !b.refunded_at) return 'active'
    return 'unsettled'
  }
  // Refunded (or never paid): not a trip. A request still marked on a row
  // that is not refunded yet is a pending request whatever the status says.
  if (rs === 'requested' && b.status !== 'refunded') return 'refund_requested'
  return 'inactive'
}

export type ServiceKind = 'arrival' | 'departure' | 'tour'

export interface Service {
  kind: ServiceKind
  bookingId: string
  startMs: number
  endMs: number
  /** Jamaica calendar day the service starts. */
  day: string
  item: TipBookingItem
}

function isTransferItem(i: TipBookingItem): boolean {
  return i.item_type === 'transfer' || !!i.arrival_at || !!i.departure_at
}

/**
 * Every dated thing on a booking: arrival and departure legs (instants), and
 * tour days (a whole Jamaica day). A transfer item's `date` is a copy of its
 * leg date and is never read as a tour.
 */
export function servicesOf(b: TipBooking): Service[] {
  const out: Service[] = []
  for (const item of b.booking_items ?? []) {
    if (!item) continue
    if (isTransferItem(item)) {
      for (const [kind, iso] of [['arrival', item.arrival_at], ['departure', item.departure_at]] as const) {
        const ms = legMs(iso)
        if (ms != null) out.push({ kind, bookingId: b.id, startMs: ms, endMs: ms, day: jamaicaDay(ms), item })
      }
      continue
    }
    if (b.booking_type === 'transfer') continue
    if (item.item_type != null && item.item_type !== 'experience') continue
    const start = dayStartMs(item.date ?? '')
    if (start == null) continue
    out.push({ kind: 'tour', bookingId: b.id, startMs: start, endMs: start + DAY_MS, day: item.date as string, item })
  }
  return out
}

export interface Trip {
  /** Every service of the trip, in time order (past ones included). */
  services: Service[]
  startMs: number
  endMs: number
}

/**
 * Group services into trips.
 *   1. An arrival and a departure on the same transfer item are one stay.
 *   2. Any arrival still unpaired takes the next unpaired departure after it,
 *      when no other arrival comes between and the stay is MAX_STAY_DAYS or
 *      less (a one-way in, a one-way home, booked separately).
 *   3. Stays and single services (tours, unpaired legs) merge when the next
 *      one starts within TRIP_GAP_DAYS of the Jamaica day the current one
 *      ends. So a tour inside a stay, or a day either side, is on that trip.
 * Trips come back in time order and never overlap.
 */
export function groupTrips(services: Service[]): Trip[] {
  const dn = (s: Service) => dayNumber(s.day) ?? Math.floor((s.startMs - JAMAICA_OFFSET_MS) / DAY_MS)
  const sorted = [...services].sort((a, b) => a.startMs - b.startMs)
  const paired = new Set<Service>()
  const spans: Array<{ from: number; to: number; members: Service[] }> = []
  const pair = (a: Service, d: Service) => {
    paired.add(a)
    paired.add(d)
    spans.push({ from: dn(a), to: Math.max(dn(a), dn(d)), members: [a, d] })
  }
  for (const a of sorted) {
    if (a.kind !== 'arrival') continue
    const d = sorted.find((s) => s.kind === 'departure' && s.item === a.item && !paired.has(s) && s.startMs >= a.startMs)
    if (d) pair(a, d)
  }
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    if (a.kind !== 'arrival' || paired.has(a)) continue
    for (let j = i + 1; j < sorted.length; j++) {
      const s = sorted[j]
      if (s.kind === 'arrival' && !paired.has(s)) break
      if (s.kind !== 'departure' || paired.has(s)) continue
      if (dn(s) - dn(a) <= MAX_STAY_DAYS) pair(a, s)
      break
    }
  }
  for (const s of sorted) if (!paired.has(s)) spans.push({ from: dn(s), to: dn(s), members: [s] })
  spans.sort((x, y) => x.from - y.from || x.to - y.to)

  const merged: Array<{ from: number; to: number; members: Service[] }> = []
  for (const sp of spans) {
    const last = merged[merged.length - 1]
    if (last && sp.from - last.to <= TRIP_GAP_DAYS) {
      last.to = Math.max(last.to, sp.to)
      last.members.push(...sp.members)
    } else merged.push({ from: sp.from, to: sp.to, members: [...sp.members] })
  }
  return merged.map((t) => {
    const members = t.members.sort((a, b) => a.startMs - b.startMs)
    return {
      services: members,
      startMs: Math.min(...members.map((s) => s.startMs)),
      endMs: Math.max(...members.map((s) => s.endMs)),
    }
  })
}

/* ── What the email builder gets ────────────────────────────────────────── */

export interface LegFacts {
  date: string
  time: string
  flight: string | null
}

export interface TourFacts {
  title: string
  date: string
  experienceId: number | null
  travelers: number | null
}

/** Trip facts for lib/trip-tips/emails.ts buildTip, from the bookings only. */
export interface TripFacts {
  firstName: string | null
  hotel: string | null
  zone: string | null
  arrival: LegFacts | null
  departure: LegFacts | null
  tours: TourFacts[]
  passengers: number | null
}

export const NO_TRIP: TripFacts = {
  firstName: null,
  hotel: null,
  zone: null,
  arrival: null,
  departure: null,
  tours: [],
  passengers: null,
}

const clip = (s: unknown, n: number): string | null => {
  if (typeof s !== 'string') return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, n) : null
}

const count = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 && n < 100 ? n : null
}

function legFacts(s: Service | null, flightOf: (i: TipBookingItem) => string | null | undefined): LegFacts | null {
  if (!s) return null
  const iso = s.kind === 'arrival' ? s.item.arrival_at : s.item.departure_at
  const wall = iso ? legWallClock(iso) : null
  if (!wall) return null
  return { ...wall, flight: clip(flightOf(s.item), 12) }
}

/* ── The decision ───────────────────────────────────────────────────────── */

export type HoldReason =
  | 'refund_requested'
  | 'unsettled_booking'
  | 'no_service_time'
  | 'trip_ended'
  | 'in_trip'
  | 'quiet_before_trip'
  | 'just_paid'
  | 'cadence_7d'
  | 'cadence_30d'
  | 'no_joined_at'
  | 'series_done'
  | 'nothing_due'

export type Decision =
  | {
      send: true
      key: TipKey
      track: Track
      /** The booking the tip is about (null for PROSPECT). */
      bookingId: string | null
      /**
       * Runs left in this key's window, counting today (1 = last chance).
       * Infinity for a prospect tip, which has no closing window. The run
       * sends the most urgent first when it has to stop early.
       */
      runsLeft: number
      facts: TripFacts
    }
  | {
      send: false
      track: Track | null
      reason: HoldReason
    }

export interface PersonInput {
  /** Lower-cased. */
  email: string
  /** When they said yes (HubSpot mapl_tips_at), epoch ms, or null if unknown. */
  joinedAtMs: number | null
  /** Every booking at exactly this address that took money (paid or refunded). */
  bookings: TipBooking[]
  /** This address's ledger rows. */
  ledger: LedgerRow[]
}

/** Ledger rows that stand for a tip that went (or may have gone) out. */
function mailed(ledger: LedgerRow[]): Array<{ key: string; atMs: number }> {
  const out: Array<{ key: string; atMs: number }> = []
  for (const r of ledger) {
    if (r.status !== 'sent' && r.status !== 'claimed') continue
    const at = parseInstant(r.sent_at) ?? parseInstant(r.created_at)
    // A row without a readable time still blocks its key; for cadence it
    // counts as just now, which holds the address rather than rushing it.
    out.push({ key: r.tip_key, atMs: at ?? Number.POSITIVE_INFINITY })
  }
  return out
}

/** Other marketing mail the guest got, from the bookings' dispatch stamps. */
function otherMarketingMs(bookings: TipBooking[]): number[] {
  const out: number[] = []
  for (const b of bookings) {
    for (const k of OTHER_MARKETING_STAMPS) {
      const v = b.dispatch?.[k]
      if (v === undefined || v === null || v === false) continue
      out.push(parseInstant(v) ?? Number.POSITIVE_INFINITY)
    }
  }
  return out
}

/**
 * The cadence gate alone: whether the ledger (and other marketing stamps)
 * allow any tip today. Exported so the run can skip reading bookings for an
 * address that cannot be mailed today anyway.
 */
export function cadenceHold(ledger: LedgerRow[], nowMs: number, otherMs: number[] = []): 'cadence_7d' | 'cadence_30d' | null {
  const tips = mailed(ledger).map((m) => m.atMs)
  const gap = MIN_GAP_DAYS * DAY_MS
  if ([...tips, ...otherMs].some((t) => nowMs - t < gap)) return 'cadence_7d'
  const windowMs = ROLLING_WINDOW_DAYS * DAY_MS
  if (tips.filter((t) => nowMs - t < windowMs).length >= MAX_IN_WINDOW) return 'cadence_30d'
  return null
}

const hold = (track: Track | null, reason: HoldReason): Decision => ({ send: false, track, reason })

/**
 * The one tip this address should get today, or why it gets none.
 *
 * Fails closed: an unreadable date, a pending refund, a half-settled booking,
 * a missing join time or a ledger row it cannot place all hold the address
 * rather than risk a wrong or early email.
 */
export function planPerson(p: PersonInput, nowMs: number): Decision {
  const states = p.bookings.map((b) => ({ b, state: bookingState(b) }))
  if (states.some((s) => s.state === 'refund_requested')) return hold(null, 'refund_requested')
  if (states.some((s) => s.state === 'unsettled')) return hold(null, 'unsettled_booking')

  const done = mailed(p.ledger)
  const doneSlots = new Set(done.map((d) => SLOT[d.key as TipKey] ?? d.key))
  const sentAt = (key: TipKey): number | null => {
    const hit = done.filter((d) => d.key === key)
    return hit.length ? Math.min(...hit.map((h) => h.atMs)) : null
  }

  const cadence = cadenceHold(p.ledger, nowMs, otherMarketingMs(p.bookings))
  const paidTimes = p.bookings.map((b) => parseInstant(b.paid_at)).filter((t): t is number => t != null)
  const justPaid = paidTimes.some((t) => nowMs - t < AFTER_PAID_DAYS * DAY_MS)

  const active = states.filter((s) => s.state === 'active').map((s) => s.b)

  /* PROSPECT ─ nothing booked (or everything refunded). */
  if (!active.length) {
    const track: Track = 'PROSPECT'
    if (cadence) return hold(track, cadence)
    if (justPaid) return hold(track, 'just_paid')
    const keys = TRACK_KEYS.PROSPECT
    const next = keys.findIndex((k) => !doneSlots.has(SLOT[k]))
    if (next === -1) return hold(track, 'series_done')
    const key = keys[next]
    let dueAt: number | null
    if (next === 0) {
      if (p.joinedAtMs == null) return hold(track, 'no_joined_at')
      dueAt = p.joinedAtMs + JOIN_WAIT_DAYS * DAY_MS
    } else {
      const prev = sentAt(keys[next - 1])
      // The previous key is done by slot but not by name (cannot happen for
      // prospect keys, whose slots are their own): hold rather than guess.
      if (prev == null || !Number.isFinite(prev)) return hold(track, 'nothing_due')
      dueAt = prev + PROSPECT_GAP_DAYS * DAY_MS
    }
    if (nowMs < dueAt) return hold(track, 'nothing_due')
    return { send: true, key, track, bookingId: null, runsLeft: Number.POSITIVE_INFINITY, facts: NO_TRIP }
  }

  /* Booked ─ plan around the next trip. */
  const services = active.flatMap(servicesOf)
  const datedBookings = new Set(services.map((s) => s.bookingId))
  const undated = active.some((b) => !datedBookings.has(b.id))

  // The next trip: the first one not over yet. Only its services count from
  // here on (track, anchors, facts); a later trip waits its turn.
  const trip = groupTrips(services).find((t) => t.endMs > nowMs)
  if (!trip) return hold(null, undated ? 'no_service_time' : 'trip_ended')
  const upcoming = trip.services.filter((s) => s.endMs > nowMs)

  const upcomingIds = new Set(upcoming.map((s) => s.bookingId))
  const rides = upcoming.some((s) => s.kind === 'arrival' || s.kind === 'departure')
  const tours = upcoming.some((s) => s.kind === 'tour')
  const track: Track = rides && tours ? 'BOTH' : rides ? 'RIDE' : 'TOUR'

  if (cadence) return hold(track, cadence)
  if (justPaid) return hold(track, 'just_paid')

  // On the trip now: the next trip has begun (landed a month ago, flying
  // home next week), or anything began within the lookback.
  const lookback = nowMs - IN_TRIP_LOOKBACK_DAYS * DAY_MS
  if (trip.startMs <= nowMs || services.some((s) => s.startMs <= nowMs && s.startMs >= lookback)) return hold(track, 'in_trip')

  const nextStart = upcoming.reduce((a, s) => (s.startMs < a.startMs ? s : a))
  const startIn = daysAway(nextStart.day, nowMs)
  if (startIn == null || startIn <= QUIET_BEFORE_TRIP_DAYS) return hold(track, 'quiet_before_trip')

  const firstOf = (kind: ServiceKind) =>
    upcoming.filter((s) => s.kind === kind).reduce<Service | null>((a, s) => (!a || s.startMs < a.startMs ? s : a), null)
  const arrival = firstOf('arrival')
  const firstTour = firstOf('tour')
  const arrivalIn = arrival ? daysAway(arrival.day, nowMs) : null
  const tourIn = firstTour ? daysAway(firstTour.day, nowMs) : null

  const inWeek = (d: number | null) => d != null && d >= WEEK_BEFORE_MIN_DAYS && d <= WEEK_BEFORE_MAX_DAYS
  const open = (k: TipKey) => !doneSlots.has(SLOT[k])
  /**
   * The week-before tip takes priority: an early tip sent now must leave it
   * room under the 2-in-30 limit. Checked at the window's LAST day (the
   * anchor day less WEEK_BEFORE_MIN_DAYS, the most room the window ever has):
   * if the tips already sent plus this one would still fill the limit there,
   * the early tip is not sent. A tip with no readable time counts (fail
   * closed). Only while the week-before slot is still open.
   *
   * Judged from the START of that Jamaica day, not at this run's time of day
   * on it: the cron never fires to the second, and that day's run starting
   * a few minutes earlier in its day than this one would still count a tip
   * (a prospect tip sent 30 days before it) that this run saw age out.
   */
  const crowdsWeekBefore = (anchorIn: number, weekKey: TipKey) => {
    if (!open(weekKey)) return false
    const lastRun = ((dayNumber(jamaicaDay(nowMs)) as number) + anchorIn - WEEK_BEFORE_MIN_DAYS) * DAY_MS + JAMAICA_OFFSET_MS
    const counted = [...done.map((d) => d.atMs), nowMs].filter((t) => lastRun - t < ROLLING_WINDOW_DAYS * DAY_MS)
    return counted.length >= MAX_IN_WINDOW
  }

  let key: TipKey | null = null
  let anchor: Service | null = null
  let runsLeft = 0

  if (track === 'RIDE') {
    if (arrival && arrivalIn != null && arrivalIn >= EARLY_TIP_MIN_DAYS_AWAY && open('r1_before_you_fly') && !crowdsWeekBefore(arrivalIn, 'r2_week_before')) {
      key = 'r1_before_you_fly'; anchor = arrival; runsLeft = arrivalIn - EARLY_TIP_MIN_DAYS_AWAY + 1
    } else if (arrival && inWeek(arrivalIn) && open('r2_week_before')) {
      key = 'r2_week_before'; anchor = arrival; runsLeft = (arrivalIn as number) - WEEK_BEFORE_MIN_DAYS + 1
    }
  } else if (track === 'TOUR') {
    if (firstTour && tourIn != null && tourIn >= EARLY_TIP_MIN_DAYS_AWAY && open('t1_airport_ride') && !crowdsWeekBefore(tourIn, 't2_week_before_tour')) {
      key = 't1_airport_ride'; anchor = firstTour; runsLeft = tourIn - EARLY_TIP_MIN_DAYS_AWAY + 1
    } else if (firstTour && inWeek(tourIn) && open('t2_week_before_tour')) {
      key = 't2_week_before_tour'; anchor = firstTour; runsLeft = (tourIn as number) - WEEK_BEFORE_MIN_DAYS + 1
    }
  } else {
    // BOTH: the trip starts at the earlier of arrival and first tour, and b2
    // is anchored there, so b1 needs that day 14+ away too (it implies the
    // arrival is; both are checked so the rule reads as written).
    const earliest = [arrival, firstTour].filter((s): s is Service => !!s).reduce((a, s) => (s.startMs < a.startMs ? s : a))
    const earliestIn = daysAway(earliest.day, nowMs)
    if (
      arrival && arrivalIn != null && arrivalIn >= EARLY_TIP_MIN_DAYS_AWAY &&
      earliestIn != null && earliestIn >= EARLY_TIP_MIN_DAYS_AWAY && open('b1_before_you_fly') &&
      !crowdsWeekBefore(earliestIn, 'b2_week_before')
    ) {
      key = 'b1_before_you_fly'; anchor = arrival; runsLeft = earliestIn - EARLY_TIP_MIN_DAYS_AWAY + 1
    } else if (inWeek(earliestIn) && open('b2_week_before')) {
      key = 'b2_week_before'; anchor = earliest; runsLeft = (earliestIn as number) - WEEK_BEFORE_MIN_DAYS + 1
    }
  }

  if (!key || !anchor) {
    const allDone = TRACK_KEYS[track].every((k) => !open(k))
    return hold(track, allDone ? 'series_done' : 'nothing_due')
  }

  return {
    send: true,
    key,
    track,
    bookingId: anchor.bookingId,
    runsLeft,
    facts: tripFacts(active.filter((b) => upcomingIds.has(b.id)), upcoming, track, anchor),
  }
}

/**
 * What the email may say about this trip, from the next trip's services
 * only. RIDE gets no tours (there are none, and it never pitches them); TOUR
 * gets no legs, and its `hotel` is the tour booking's pickup place, which t1
 * prices the airport ride to when it is a rate-card property.
 */
export function tripFacts(bookings: TipBooking[], upcoming: Service[], track: Track, anchor: Service): TripFacts {
  const byStart = [...upcoming].sort((a, b) => a.startMs - b.startMs)
  const arrival = track === 'TOUR' ? null : byStart.find((s) => s.kind === 'arrival') ?? null
  const departure = track === 'TOUR'
    ? null
    : byStart.find((s) => s.kind === 'departure' && (!arrival || s.startMs >= arrival.startMs)) ?? null
  const legItem = (arrival ?? departure)?.item ?? null

  const tours: TourFacts[] = track === 'RIDE'
    ? []
    : byStart
        .filter((s) => s.kind === 'tour')
        .map((s) => ({
          title: clip(s.item.title, 120) ?? '',
          date: s.day,
          experienceId: typeof s.item.experience_id === 'number' ? s.item.experience_id : null,
          travelers: count(s.item.travelers),
        }))
        .filter((t) => t.title)

  const nameFrom = bookings.find((b) => b.id === anchor.bookingId) ?? bookings[0]
  const firstName = clip(nameFrom?.first_name, 40)
  const pickup = track === 'TOUR' ? clip(nameFrom?.pickup, 120) : null

  return {
    firstName,
    hotel: legItem ? clip(legItem.hotel, 120) : pickup,
    zone: legItem ? clip(legItem.zone, 60) : null,
    arrival: legFacts(arrival, (i) => i.arrival_flight),
    departure: legFacts(departure, (i) => i.departure_flight),
    tours,
    passengers: legItem ? count(legItem.passengers) : null,
  }
}

/**
 * Order for a run that may have to stop early: the tip whose window closes
 * soonest first, prospects (no window) last, then a stable order by address
 * so two runs agree.
 */
export function sendOrder<T extends { runsLeft: number; email: string }>(a: T, b: T): number {
  if (a.runsLeft !== b.runsLeft) return a.runsLeft < b.runsLeft ? -1 : 1
  return a.email < b.email ? -1 : a.email > b.email ? 1 : 0
}
