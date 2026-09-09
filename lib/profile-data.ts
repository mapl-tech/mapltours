/**
 * Pure derivations for the profile page.
 *
 * Everything here is deterministic and testable without React, Supabase or a
 * browser: how bookings split into upcoming and past, which of them is next,
 * what a guest has actually seen of Jamaica, and how each value is written
 * out. The view only wires hooks to these.
 *
 * Three of these functions exist because the inline versions they replace
 * were wrong in ways a guest could see. Each is called out at its definition.
 */
import { experiences } from './experiences'

export interface ProfileBookingItem {
  title: string
  destination: string
  travelers: number
  /** "YYYY-MM-DD", or null when a transfer carried neither leg time. */
  date: string | null
  /** 0 for airport transfers: /api/profile/bookings stamps them that way. */
  experience_id: number
  /* Transfers only, from the widened route. */
  hotel?: string | null
  tripType?: string | null
  arrivalAt?: string | null
  arrivalFlight?: string | null
  departureAt?: string | null
  departureFlight?: string | null
}

/** Released by the route on the operator's schedule, never ahead of it. */
export interface ProfileDriver {
  name: string
  vehicle: string | null
  plate: string | null
  /** Null until the operator has sent the customer their confirmation. */
  phone: string | null
}

export interface ProfileBooking {
  id: string
  /** "MAPL-XXXXXXXX", stamped by the route. */
  ref?: string
  kind?: 'tour' | 'transfer'
  created_at: string
  paid_at: string | null
  status: string
  refund_state: string
  refund_amount: number | null
  total_paid: number
  gift_card_amount?: number | null
  stripe_payment_id?: string | null
  driver?: ProfileDriver | null
  booking_items: ProfileBookingItem[]
}

/** The reference a guest quotes to support. Same shape both confirm pages print. */
export function bookingRef(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

/** Airport transfers arrive with experience_id 0; the catalog starts at 1. */
export function isTransfer(item: ProfileBookingItem): boolean {
  return !experiences.some((e) => e.id === item.experience_id)
}

/**
 * The photo for a booked item, or null when there is honestly no photo.
 *
 * The version this replaces was `find(...)?.image || experiences[0].image`,
 * so every airport transfer (experience_id 0) rendered the Rick's Cafe
 * cliff-diving photo. A ride to your hotel is not a cliff dive, and a guest
 * who sees one where their transfer should be has been told something false
 * about what they bought. Null here means the view draws a transfer card
 * instead of guessing.
 */
export function itemImage(item: ProfileBookingItem): string | null {
  return experiences.find((e) => e.id === item.experience_id)?.image ?? null
}

/** The parish an item sits in, or null for a transfer. */
export function itemParish(item: ProfileBookingItem): string | null {
  return experiences.find((e) => e.id === item.experience_id)?.parish ?? null
}

/** The soonest date on a booking, or null when it carries none. */
export function earliestDate(b: ProfileBooking): string | null {
  const dates = b.booking_items.map((i) => i.date).filter((d): d is string => !!d)
  return dates.length ? dates.reduce((a, d) => (d < a ? d : a)) : null
}

/** The latest date on a booking, or null when it carries none. */
export function latestDate(b: ProfileBooking): string | null {
  const dates = b.booking_items.map((i) => i.date).filter((d): d is string => !!d)
  return dates.length ? dates.reduce((a, d) => (d > a ? d : a)) : null
}

/**
 * Split bookings into what is still coming and what is done.
 *
 * The version this replaces used `some(i => i.date >= today)` for upcoming
 * and `every(i => i.date < today)` for past. Both comparisons are false when
 * date is null, because relational comparison coerces null to 0 and the date
 * string to NaN, so a booking with no resolvable date matched NEITHER filter
 * and disappeared from the page completely, taking its cancel button with it.
 * A transfer whose legs are both absent produces exactly that row.
 *
 * Anything undated is treated as upcoming. An undated booking is far more
 * likely to be one we have not run yet than one already travelled, and the
 * failure modes are not symmetrical: showing a finished trip under "upcoming"
 * is untidy, while hiding a live one loses the guest their cancel button.
 */
export function splitBookings(bookings: ProfileBooking[], today: string): {
  upcoming: ProfileBooking[]
  past: ProfileBooking[]
} {
  const upcoming: ProfileBooking[] = []
  const past: ProfileBooking[] = []
  for (const b of bookings) {
    const last = latestDate(b)
    if (last === null || last >= today) upcoming.push(b)
    else past.push(b)
  }
  upcoming.sort((a, c) => (earliestDate(a) ?? '9999').localeCompare(earliestDate(c) ?? '9999'))
  past.sort((a, c) => (latestDate(c) ?? '').localeCompare(latestDate(a) ?? ''))
  return { upcoming, past }
}

/** A booking still owed to the guest: not refunded, so it still counts. */
export function isLive(b: ProfileBooking): boolean {
  return b.status !== 'refunded'
}

export interface NextTrip {
  booking: ProfileBooking
  item: ProfileBookingItem
  date: string
  daysAway: number
}

/**
 * The single next thing happening to this guest, for the top of the page.
 * Refunded bookings are skipped: nobody is coming to pick them up.
 */
export function nextTrip(bookings: ProfileBooking[], today: string): NextTrip | null {
  let best: NextTrip | null = null
  for (const booking of bookings) {
    if (!isLive(booking)) continue
    for (const item of booking.booking_items) {
      if (!item.date || item.date < today) continue
      if (!best || item.date < best.date) {
        best = { booking, item, date: item.date, daysAway: daysBetween(today, item.date) }
      }
    }
  }
  return best
}

/** Whole days from one "YYYY-MM-DD" to another, zone-free. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/** "Today", "Tomorrow", "In 6 days", "In 3 weeks". */
export function countdownLabel(daysAway: number): string {
  if (daysAway <= 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway < 14) return `In ${daysAway} days`
  if (daysAway < 60) {
    const weeks = Math.round(daysAway / 7)
    return `In ${weeks} weeks`
  }
  const months = Math.round(daysAway / 30)
  return `In ${months} months`
}

export interface ProfileStats {
  /** Bookings whose last date has passed, refunds excluded. */
  trips: number
  /** Distinct parishes across every tour booked, refunds excluded. */
  parishes: number
  /** Distinct tours booked, refunds excluded. */
  tours: number
  /** Airport transfers booked, refunds excluded. */
  transfers: number
}

/**
 * The counters under the guest's name.
 *
 * The parish count this replaces counted DISTINCT booking_items.destination
 * and labelled the result "Parishes". A destination is a town for a tour
 * (Ocho Rios, Negril) and a HOTEL NAME for a transfer, while the catalog
 * spans only four real parishes, so the old number was neither parishes nor
 * bounded by them: two hotels and a tour read as "3 parishes". This reads
 * the parish off the catalog entry and counts transfers separately.
 */
export function profileStats(bookings: ProfileBooking[], today: string): ProfileStats {
  const live = bookings.filter(isLive)
  const parishes = new Set<string>()
  const tours = new Set<number>()
  let transfers = 0
  for (const b of live) {
    for (const item of b.booking_items) {
      if (isTransfer(item)) { transfers += 1; continue }
      tours.add(item.experience_id)
      const parish = itemParish(item)
      if (parish) parishes.add(parish)
    }
  }
  const trips = live.filter((b) => {
    const last = latestDate(b)
    return last !== null && last < today
  }).length
  return { trips, parishes: parishes.size, tours: tours.size, transfers }
}

/** "Fri, Oct 17" from "2026-10-17", zone-free so the day never shifts. */
export function formatTripDate(day: string | null): string {
  if (!day) return 'Date to be confirmed'
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "October 17, 2026" from "2026-10-17", zone-free. */
export function formatLongDate(day: string | null): string {
  if (!day) return 'Date to be confirmed'
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Today in Jamaica as "YYYY-MM-DD". The island does not observe DST, so UTC-5 always. */
export function todayInJamaica(now: Date = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
}

/** "1 guest" / "3 guests". */
export function guestLabel(n: number): string {
  return `${n} ${n === 1 ? 'guest' : 'guests'}`
}

/**
 * A booking the page cannot file as upcoming or past.
 *
 * A row with no line items at all is the one that used to crash the page:
 * the past-trips grid read booking_items[0].experience_id straight off an
 * empty array. It is rare, and it means something went wrong at checkout, so
 * it is surfaced with the reference rather than hidden or guessed at.
 */
export function isUnfiled(b: ProfileBooking): boolean {
  return b.booking_items.length === 0
}

/** "10:35 AM" from "2026-10-17T10:35:00", zone-free. */
export function formatLegTime(value: string | null | undefined): string | null {
  if (!value) return null
  const m = value.match(/T(\d{2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = m[2]
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${mm} ${suffix}`
}

export interface TransferLeg {
  kind: 'arrival' | 'departure'
  label: string
  date: string
  time: string | null
  flight: string | null
}

/**
 * The legs of a transfer, in travel order, for display.
 *
 * Only legs the booking actually stored are returned, so a one way never
 * invents the leg it does not have. That mirrors planTransferLegs on the
 * server, where a stray leg was a real defect worth a guard.
 */
export function transferLegs(item: ProfileBookingItem): TransferLeg[] {
  const legs: TransferLeg[] = []
  if (item.arrivalAt) {
    legs.push({
      kind: 'arrival',
      label: 'Airport pickup',
      date: item.arrivalAt.slice(0, 10),
      time: formatLegTime(item.arrivalAt),
      flight: item.arrivalFlight ?? null,
    })
  }
  if (item.departureAt) {
    legs.push({
      kind: 'departure',
      label: 'Hotel pickup for your flight home',
      date: item.departureAt.slice(0, 10),
      time: formatLegTime(item.departureAt),
      flight: item.departureFlight ?? null,
    })
  }
  return legs
}

/** Montego Bay is what a guest recognises; MBJ is airline jargon. */
export function readableTitle(item: ProfileBookingItem): string {
  return item.title.replace(/\bMBJ\b/g, 'Montego Bay airport')
}

/** What a booking's money line should say, given its refund state. */
export function paymentLabel(b: ProfileBooking): { amount: string; note: string | null; struck: boolean } {
  const amount = `$${Number(b.total_paid).toFixed(0)}`
  if (b.status === 'refunded') {
    const back = b.refund_amount != null ? `$${Number(b.refund_amount).toFixed(0)} refunded` : 'Refunded'
    return { amount, note: back, struck: true }
  }
  if (b.refund_state === 'requested') return { amount, note: 'Cancellation under review', struck: false }
  if (b.refund_state === 'declined') return { amount, note: 'Still confirmed', struck: false }
  return { amount, note: null, struck: false }
}
