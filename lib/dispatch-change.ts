import { isDue, stampKey } from '@/lib/dayof-rules'
import { firstLeg, legInstantMs, type Bk } from '@/lib/dispatch'
import { ARRIVAL_GRACE_MIN, legsOf, legAt, toldBefore, type Leg } from '@/lib/driver-update'

/**
 * A change saved from the driver portal, and what the guest is told about it.
 * Pure: the route (lib/dispatch-change-server) and the tests call the same
 * rules, and the portal shows what they decided before anything is saved.
 *
 * The owner, Nov 24 2026: "Whenever a driver assignment or pickup time is
 * updated, display a confirmation prompt asking the user to confirm the change
 * before it is saved. It should also contain details about when the system
 * will email the customer, if change happens within the time that the
 * customer would have received the email, send the email after a second
 * confirmation popup. If a change happens and the email is chosen not to be
 * sent, email me an alert."
 *
 * The email a guest gets before each ride is the day-of email (lib/dayof),
 * sent by the hourly job once the ride is due (isDue), and written from the
 * booking as it is at that moment. So for every ride a change touches:
 *
 *   automatic    the day-of email has not gone, and will go before the ride
 *                (for a pickup at the hotel, at least DEPARTURE_NOTICE_MIN
 *                before it). It carries the change; nothing else is sent.
 *   decide       the day-of email already went with the old details, or will
 *                not go in time. The person is asked, in a second step,
 *                whether to email the guest now (the driver-update email) or
 *                not; not emailing tells the office (OPERATIONS_EMAIL).
 *   no_driver    no driver is on the booking, so no day-of email can go; the
 *                guest hears once a driver is assigned.
 *   unreachable  the booking has no email address. The office is told.
 *   over         the ride is over. Nothing to tell.
 *
 * Tours: no email tells a tour guest their driver or pickup time (the tour
 * confirmation says the operator confirms the pickup directly), so a tour
 * change is saved with no email and no second step.
 */

export type ChangeKind = 'driver' | 'time' | 'tour_time'
export type LegOutcome = 'automatic' | 'decide' | 'no_driver' | 'unreachable' | 'over'
export type DecideWhy = 'sent_old' | 'too_late'

/** A day-of email only counts as telling a guest about their hotel pickup if it goes at least this long before it. */
export const DEPARTURE_NOTICE_MIN = 60

const HOUR = 3_600_000

/** The hourly job runs at the top of each hour (netlify/functions/dayof-cron.mjs, @hourly). */
export function nextHourlyRun(nowMs: number): number {
  return Math.floor(nowMs / HOUR) * HOUR + HOUR
}

/**
 * When the hourly job would first send the day-of email for a ride at
 * `legIso`, from now on, or null if it never would before the ride. Only the
 * timing: whether it may send at all (paid, an email, a driver, not already
 * sent) is the caller's to check.
 */
export function dayOfRunAt(legIso: string, nowMs: number): number | null {
  const at = legInstantMs(legIso)
  if (!Number.isFinite(at)) return null
  // isDue is never true more than a day ahead, so start the search there.
  let t = nextHourlyRun(Math.max(nowMs, at - 26 * HOUR))
  for (; t < at; t += HOUR) if (isDue(legIso, t)) return t
  return null
}

/** Is this ride still ahead (an arrival until two hours after landing, while the guest may still be inside)? */
export function legIsAhead(legIso: string, leg: Leg, nowMs: number): boolean {
  const at = legInstantMs(legIso)
  return nowMs < (leg === 'arrival' ? at + ARRIVAL_GRACE_MIN * 60_000 : at)
}

export interface LegPlan {
  leg: Leg
  /** The ride's stored wall-clock time once the change is saved. */
  at: string
  outcome: LegOutcome
  /** For 'decide': the day-of email went with the old details, or cannot go in time. */
  why: DecideWhy | null
  /** When the day-of email went for this ride, if it did (the stamp, ISO). */
  dayOfSentAt: string | null
  /** For 'automatic': when the hourly job will send it (ms). */
  dayOfAt: number | null
  /** The guest had been given a driver for this ride before (lib/driver-update toldBefore). */
  told: boolean
}

/** The leg's outcome, judged on the booking as it will be once the change is saved. */
export function legPlan(after: Bk, leg: Leg, nowMs: number, told: boolean): LegPlan {
  const at = legAt(after, leg) as string
  const sent = ((after.dispatch ?? {}) as Record<string, unknown>)[stampKey(leg)]
  const dayOfSentAt = typeof sent === 'string' && sent ? sent : sent ? String(sent) : null
  const base = { leg, at, why: null, dayOfSentAt, dayOfAt: null, told }
  if (!legIsAhead(at, leg, nowMs)) return { ...base, outcome: 'over' }
  if (!after.email) return { ...base, outcome: 'unreachable' }
  if (dayOfSentAt) return { ...base, outcome: 'decide', why: 'sent_old' }
  if (!after.driver_name || !after.driver_phone) return { ...base, outcome: 'no_driver' }
  const runAt = dayOfRunAt(at, nowMs)
  const notice = leg === 'departure' ? DEPARTURE_NOTICE_MIN * 60_000 : 0
  if (runAt !== null && runAt <= legInstantMs(at) - notice) return { ...base, outcome: 'automatic', dayOfAt: runAt }
  return { ...base, outcome: 'decide', why: 'too_late' }
}

export interface DriverValues {
  driver_name: string | null
  driver_phone: string | null
  driver_vehicle: string | null
  driver_plate: string | null
}

/** The booking's own driver columns, exactly as stored (what a change must find unchanged). */
export function driverValues(b: Bk): DriverValues {
  return {
    driver_name: b.driver_name ?? null,
    driver_phone: b.driver_phone ?? null,
    driver_vehicle: b.driver_vehicle ?? null,
    driver_plate: b.driver_plate ?? null,
  }
}

export type ChangeRequest =
  | { kind: 'driver'; after: DriverValues }
  | { kind: 'time'; leg: Leg; at: string }
  | { kind: 'tour_time'; time: string }

export interface ChangePlan {
  kind: ChangeKind
  leg: Leg | null
  /** What the booking holds now: the change is saved only if it still does. */
  before: Record<string, string | null>
  after: Record<string, string | null>
  /** Every ride the change touches, in order. Empty for a tour. */
  legs: LegPlan[]
  /** The rides that need the second step: email the guest now, or not. */
  decide: Leg[]
  /** The rides where nobody can be emailed (no address): the office is told. */
  unreachable: Leg[]
}

/**
 * The booking a change would leave behind. Only what the plan reads is moved:
 * the driver columns, a ride's time, a tour's pickup time.
 */
export function bookingAfter(b: Bk, req: ChangeRequest): Bk {
  if (req.kind === 'driver') return { ...b, ...req.after }
  if (req.kind === 'tour_time') return { ...b, pickup_time: req.time }
  const items = ((b.booking_items ?? []) as Record<string, unknown>[]).map((i, n) =>
    n === 0 ? { ...i, [req.leg === 'arrival' ? 'arrival_at' : 'departure_at']: req.at } : i)
  return { ...b, booking_items: items }
}

/**
 * The plan for one change. `b` is the booking as read now. The caller has
 * already checked that the change is allowed (lib/dispatch-change-server);
 * this only says what it does and who hears about it.
 */
export function planChange(b: Bk, req: ChangeRequest, nowMs: number): ChangePlan {
  const after = bookingAfter(b, req)
  if (req.kind === 'tour_time') {
    return {
      kind: 'tour_time', leg: null,
      before: { pickup_time: b.pickup_time ?? null }, after: { pickup_time: req.time },
      legs: [], decide: [], unreachable: [],
    }
  }
  if (req.kind === 'driver' && b.booking_type === 'tour') {
    return {
      kind: 'driver', leg: null,
      before: { ...driverValues(b) }, after: { ...req.after },
      legs: [], decide: [], unreachable: [],
    }
  }
  const touched: Leg[] = req.kind === 'time' ? [req.leg] : legsOf(after)
  const legs = touched.map((leg) => legPlan(after, leg, nowMs, toldBefore(b, leg)))
  const kept = req.kind === 'driver' ? legs.filter((l) => l.outcome !== 'over') : legs
  return {
    kind: req.kind,
    leg: req.kind === 'time' ? req.leg : null,
    before: req.kind === 'driver' ? { ...driverValues(b) } : { at: legAt(b, req.leg) },
    after: req.kind === 'driver' ? { ...req.after } : { at: req.at },
    legs: kept,
    decide: kept.filter((l) => l.outcome === 'decide').map((l) => l.leg),
    unreachable: kept.filter((l) => l.outcome === 'unreachable').map((l) => l.leg),
  }
}

/**
 * What the person confirmed: the change and, for every ride, who hears about
 * it and how. The route saves only when the plan it works out at the moment
 * of saving gives the same key; otherwise the person is shown the new plan.
 * Times the job will run are left out (they move on the hour without changing
 * what happens).
 */
export function planKey(p: ChangePlan): string {
  const sorted = (o: Record<string, string | null>) => Object.keys(o).sort().map((k) => [k, o[k]])
  return JSON.stringify([p.kind, p.leg, sorted(p.before), sorted(p.after), p.legs.map((l) => [l.leg, l.outcome, l.why])])
}

/* ── Checks on the requested values (the route answers these words) ── */

/** "YYYY-MM-DDTHH:MM", a real calendar day, as the portal's time field gives it. */
export const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/
export const TOUR_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** The stored form of a portal time: Jamaica wall clock carrying +00:00, as checkout stores it. */
export function storedWallClock(value: string): string | null {
  const m = value.match(WALL_CLOCK_RE)
  if (!m) return null
  const ms = Date.parse(`${value}:00Z`)
  if (Number.isNaN(ms)) return null
  // A day that does not exist (Feb 30) rolls over in Date; refuse it rather than move the ride.
  if (new Date(ms).toISOString().slice(0, 16) !== value) return null
  return `${value}:00+00:00`
}

/** How far ahead a ride may be moved: a typo in the year must not quietly book next year. */
export const MAX_AHEAD_DAYS = 366

/**
 * Why this ride's time cannot be changed to `value`, or null. `b` is the
 * booking as read now.
 */
export function timeChangeProblem(b: Bk, leg: Leg, value: string, nowMs: number): string | null {
  if (b.booking_type !== 'transfer') return 'Only an airport ride has a ride time.'
  const l = firstLeg(b)
  if (!l || !legsOf(b).includes(leg)) return leg === 'arrival' ? 'This booking has no arrival.' : 'This booking has no ride to the airport.'
  const current = legAt(b, leg) as string
  if (!legIsAhead(current, leg, nowMs)) return leg === 'arrival' ? 'This arrival is over.' : 'This ride to the airport is over.'
  const stored = storedWallClock(value)
  if (!stored) return 'Choose a day and a time.'
  const at = legInstantMs(stored)
  if (at === legInstantMs(current)) return 'That is the time the ride already has.'
  if (at <= nowMs) return 'Choose a time that has not passed yet.'
  if (at > nowMs + MAX_AHEAD_DAYS * 24 * HOUR) return 'Choose a time within the next year.'
  if (leg === 'arrival' && l.departureAt && at >= legInstantMs(l.departureAt)) return 'The flight has to land before the ride back to the airport.'
  if (leg === 'departure' && l.arrivalAt && at <= legInstantMs(l.arrivalAt)) return 'The ride to the airport has to be after the arrival.'
  return null
}
