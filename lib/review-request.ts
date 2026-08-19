/**
 * When a guest should be asked to review, and what to ask them about.
 *
 * Pure functions, no I/O, so every boundary is unit-testable and the cron and
 * any manual resend agree on one rule. Mirrors the shape of lib/booking-window.
 *
 * The two products finish at different times and must be asked about
 * differently. A guest who booked an airport transfer has no opinion about a
 * tour they never took, and asking them for one reads as a mail merge that
 * did not know who they were.
 */

const MS_PER_HOUR = 3_600_000

/** Jamaica is UTC-5 year round and does not observe daylight saving. */
const JAMAICA_UTC_OFFSET_HOURS = -5

/** Wait this long after the trip ends before asking. */
export const REVIEW_DELAY_HOURS = 24

/** Stop asking after this. A month-old trip is not worth chasing. */
export const REVIEW_WINDOW_DAYS = 30

/** The dispatch key that records the ask, so it can only ever happen once. */
export const REVIEW_STAMP_KEY = 'review_request_sent'

export interface ReviewableItem {
  item_type?: 'experience' | 'transfer' | null
  title?: string | null
  hotel?: string | null
  destination?: string | null
  trip_type?: 'one_way' | 'round_trip' | null
  /** Jamaica wall-clock, per the lib/dispatch convention. */
  arrival_at?: string | null
  departure_at?: string | null
  /** Tours carry a date only, no time exists anywhere in the model. */
  date?: string | null
}

export interface ReviewableBooking {
  id: string
  status: string
  email?: string | null
  booking_type?: 'tour' | 'transfer' | null
  dispatch?: Record<string, unknown> | null
  booking_items?: ReviewableItem[] | null
}

/**
 * A leg timestamp is stored as Jamaica wall-clock with a Z suffix, so it needs
 * the offset applied to become a real instant. Same rule as legInstantMs in
 * lib/dispatch; duplicated here rather than imported so this module stays free
 * of the server-only boundary and can be tested directly.
 */
function legInstantMs(iso: string): number {
  return Date.parse(iso) - JAMAICA_UTC_OFFSET_HOURS * MS_PER_HOUR
}

/** Midnight ENDING a YYYY-MM-DD day, in Jamaica local time. */
function endOfDayJamaicaMs(date: string): number | null {
  const day = (date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const utcMidnight = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(utcMidnight)) return null
  // Jamaica midnight is 5 hours after UTC midnight; the day ends 24h later.
  return utcMidnight - JAMAICA_UTC_OFFSET_HOURS * MS_PER_HOUR + 24 * MS_PER_HOUR
}

/**
 * When the LAST thing on this booking finished.
 *
 * Deliberately the last, not the first: a round-trip transfer is not over
 * until the ride back to the airport, and asking for a review while the guest
 * still needs you to collect them is both premature and a service risk.
 *
 * Returns null when nothing on the booking carries a usable time, which
 * callers must treat as "unknown", never as "finished".
 */
export function lastServiceEndMs(booking: ReviewableBooking): number | null {
  const items = booking.booking_items ?? []
  const stamps: number[] = []

  for (const i of items) {
    for (const iso of [i.arrival_at, i.departure_at]) {
      if (typeof iso === 'string' && iso.length > 0) {
        const ms = legInstantMs(iso)
        if (!Number.isNaN(ms)) stamps.push(ms)
      }
    }
    if (typeof i.date === 'string' && i.date.length > 0) {
      const ms = endOfDayJamaicaMs(i.date)
      if (ms != null) stamps.push(ms)
    }
  }

  return stamps.length ? Math.max(...stamps) : null
}

export type ReviewSkipReason =
  | 'not_paid'
  | 'no_email'
  | 'already_asked'
  | 'no_service_time'
  | 'trip_not_finished'
  | 'too_long_ago'

/**
 * Why this booking cannot be asked for a review, or null if it can.
 *
 * Fails closed everywhere: an unreadable date, a missing email or an unknown
 * status all block the send rather than risking a message to someone who is
 * still travelling, or who cancelled.
 */
export function reviewRequestBlockedReason(
  booking: ReviewableBooking,
  nowMs: number = Date.now(),
): ReviewSkipReason | null {
  // 'paid' only. A refunded or cancelled trip did not happen, and asking its
  // guest to review it is the worst message we could send them.
  if (booking.status !== 'paid') return 'not_paid'
  if (!booking.email) return 'no_email'
  if ((booking.dispatch ?? {})[REVIEW_STAMP_KEY]) return 'already_asked'

  const endMs = lastServiceEndMs(booking)
  if (endMs == null) return 'no_service_time'

  if (nowMs < endMs + REVIEW_DELAY_HOURS * MS_PER_HOUR) return 'trip_not_finished'
  if (nowMs > endMs + REVIEW_WINDOW_DAYS * 24 * MS_PER_HOUR) return 'too_long_ago'

  return null
}

export interface ReviewSubject {
  isTransfer: boolean
  /** What to name in the email, e.g. "Azul Beach Resort Negril". */
  tripLabel: string
  /** Human date span, e.g. "15 to 25 August" or "20 September". */
  tripDates: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Format an instant as a Jamaica-local "15 August". */
function dayLabel(ms: number): string {
  const d = new Date(ms + JAMAICA_UTC_OFFSET_HOURS * MS_PER_HOUR)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/**
 * What this guest actually booked, so the email asks about the right thing.
 *
 * A transfer guest is asked about the driver and the airport run. A tour guest
 * is asked about the tour, by name. Getting this wrong is worse than not
 * sending: it tells the guest we do not know who they are.
 */
export function describeForReview(booking: ReviewableBooking): ReviewSubject {
  const items = booking.booking_items ?? []
  const isTransfer =
    booking.booking_type === 'transfer' ||
    items.some((i) => i.item_type === 'transfer')

  if (isTransfer) {
    const leg = items.find((i) => i.hotel || i.destination) ?? items[0]
    const tripLabel = (leg?.hotel || leg?.destination || 'your hotel').trim()

    const stamps: number[] = []
    for (const i of items) {
      for (const iso of [i.arrival_at, i.departure_at]) {
        if (typeof iso === 'string' && iso.length > 0) {
          const ms = legInstantMs(iso)
          if (!Number.isNaN(ms)) stamps.push(ms)
        }
      }
    }
    stamps.sort((a, b) => a - b)
    const first = stamps[0]
    const last = stamps[stamps.length - 1]
    const tripDates =
      stamps.length === 0
        ? ''
        : first === last || dayLabel(first) === dayLabel(last)
          ? dayLabel(first)
          : `${dayLabel(first)} to ${dayLabel(last)}`

    return { isTransfer: true, tripLabel, tripDates }
  }

  // Tours: name what they actually did. One tour by name; several summarised,
  // because a subject line listing four tours reads as spam.
  const titles = items.map((i) => (i.title ?? '').trim()).filter(Boolean)
  const tripLabel =
    titles.length === 0
      ? 'your trip'
      : titles.length === 1
        ? titles[0]
        : `${titles[0]} and ${titles.length - 1} more`

  const dayStamps = items
    .map((i) => (typeof i.date === 'string' ? endOfDayJamaicaMs(i.date) : null))
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b)
  // endOfDay is midnight AFTER the day, so step back into the day itself.
  const toDay = (ms: number) => dayLabel(ms - 1)
  const tripDates =
    dayStamps.length === 0
      ? ''
      : toDay(dayStamps[0]) === toDay(dayStamps[dayStamps.length - 1])
        ? toDay(dayStamps[0])
        : `${toDay(dayStamps[0])} to ${toDay(dayStamps[dayStamps.length - 1])}`

  return { isTransfer: false, tripLabel, tripDates }
}
