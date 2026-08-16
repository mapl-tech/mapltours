/**
 * Minimum lead time: nothing may be booked less than 24 hours before it runs.
 *
 * Pure functions, no I/O, so the boundaries are unit-testable and the client
 * date pickers and the checkout routes agree on one rule. The server is
 * authoritative, exactly as with pricing.
 *
 * The two products need different maths because they store different things:
 *
 *   • Transfers carry a real pickup timestamp (the flight arrival), so the
 *     24 hours is measured exactly.
 *
 *   • Experiences store a DATE ONLY, with no start time anywhere in the model
 *     (`duration` is prose like "Full day"). We therefore assume the earliest
 *     possible start, midnight Jamaica time, and require 24 hours before THAT.
 *     Assuming a later start would let a 9am tour be booked with 10 hours'
 *     notice, which is the thing this is meant to prevent. The practical
 *     effect is that experiences need roughly one to two days' notice.
 */

/** Hours of notice required before an experience or a pickup. */
export const MIN_LEAD_TIME_HOURS = 24

const MS_PER_HOUR = 3_600_000

/**
 * Jamaica is UTC-5 year round and does not observe daylight saving, so a
 * fixed offset is correct here rather than a timezone database lookup.
 */
const JAMAICA_UTC_OFFSET_HOURS = -5

/** Milliseconds at the start of a YYYY-MM-DD day, in Jamaica local time. */
function startOfDayJamaicaMs(date: string): number | null {
  const day = (date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const utcMidnight = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(utcMidnight)) return null
  // Jamaica midnight happens 5 hours AFTER UTC midnight.
  return utcMidnight - JAMAICA_UTC_OFFSET_HOURS * MS_PER_HOUR
}

/** The cutoff instant: nothing starting before this may be booked. */
export function leadTimeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() + MIN_LEAD_TIME_HOURS * MS_PER_HOUR)
}

/**
 * Can an experience on this date still be booked?
 *
 * Unparseable dates return false: a date we cannot read is one we cannot
 * confirm is far enough out, and this should fail closed.
 */
export function isExperienceDateBookable(date: string, now: Date = new Date()): boolean {
  const startMs = startOfDayJamaicaMs(date)
  if (startMs == null) return false
  return startMs >= leadTimeCutoff(now).getTime()
}

/**
 * Earliest experience date a traveler may pick, as YYYY-MM-DD.
 *
 * Drives the `min` attribute on the date pickers so an unbookable date cannot
 * be chosen in the first place. Walks forward from today rather than doing
 * offset arithmetic, so it can never disagree with isExperienceDateBookable.
 */
export function earliestBookableExperienceDate(now: Date = new Date()): string {
  const cursor = new Date(now.getTime())
  for (let i = 0; i < 5; i++) {
    const day = new Date(cursor.getTime() + i * 24 * MS_PER_HOUR).toISOString().slice(0, 10)
    if (isExperienceDateBookable(day, now)) return day
  }
  // Unreachable in practice; keeps the return type honest.
  return new Date(now.getTime() + 2 * 24 * MS_PER_HOUR).toISOString().slice(0, 10)
}

/**
 * Can a transfer with this pickup timestamp still be booked?
 *
 * `pickup` is an ISO datetime (the flight arrival, or the departure pickup).
 * Exact, because transfers actually store the time.
 */
export function isPickupBookable(pickup: string, now: Date = new Date()): boolean {
  const ms = Date.parse(pickup)
  if (Number.isNaN(ms)) return false
  return ms >= leadTimeCutoff(now).getTime()
}

/**
 * Check every leg of a transfer booking. The earliest leg governs: a return
 * trip booked 30 hours before the OUTBOUND pickup is fine, one booked 3 hours
 * before it is not, regardless of when the return leg falls.
 */
export function areTransferLegsBookable(
  legs: { arrivalAt?: string | null; departureAt?: string | null },
  now: Date = new Date(),
): boolean {
  const stamps = [legs.arrivalAt, legs.departureAt].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  )
  if (stamps.length === 0) return true // nothing scheduled to validate
  return stamps.every((s) => isPickupBookable(s, now))
}

/** Customer-facing message when something is inside the window. */
export const LEAD_TIME_MESSAGE =
  'Bookings close 24 hours before. Please choose a later date or contact us to arrange it.'

/**
 * When the earliest part of a booking is due to start.
 *
 * Used by the refund rules to tell whether a booking has already been
 * delivered. Mixed shapes on purpose: tour items carry a date only (so the
 * same assumed-midnight convention as above applies), transfer legs carry
 * real timestamps.
 *
 * Returns null when nothing on the booking has a usable time, which callers
 * must treat as "unknown", not as "already started".
 */
export function earliestServiceStart(
  items: Array<{
    date?: string | null
    arrival_at?: string | null
    departure_at?: string | null
  }>,
): Date | null {
  const candidates: number[] = []
  for (const item of items ?? []) {
    const start = startOfDayJamaicaMs(item.date ?? '')
    if (start != null) candidates.push(start)
    for (const stamp of [item.arrival_at, item.departure_at]) {
      if (!stamp) continue
      const ms = Date.parse(stamp)
      if (!Number.isNaN(ms)) candidates.push(ms)
    }
  }
  if (candidates.length === 0) return null
  return new Date(Math.min(...candidates))
}
