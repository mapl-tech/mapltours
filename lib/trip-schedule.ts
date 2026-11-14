/**
 * The trip schedule: every moment somebody has to be somewhere, as one flat
 * list the admin's and the driver's calendars both read.
 *
 * A booking is not a moment. A round-trip ride is TWO drives, often a week
 * apart, and the lists that showed one row per booking put the whole booking
 * in the past the day after the guest landed, with the drive back to the
 * airport still to come. Here each leg is its own event on its own day, and a
 * tour is an event on its day.
 *
 * Times are the guest's Jamaica wall-clock, stored verbatim with a Z (see
 * lib/dispatch legInstantMs): the DAY of a leg is the first ten characters of
 * its stamp, and its real instant is five hours later than the stamp parses
 * to. Jamaica has no daylight saving, so the offset is fixed.
 *
 * Pure: no I/O, no clock except the `nowMs` a caller passes. Tested in
 * tests/unit/trip-schedule.spec.ts.
 */
import { bookingRef, plural } from './admin-format'

const JAMAICA_OFFSET_MS = 5 * 3_600_000
/** A drive still counts as "next" until this long after its time (a late flight, a slow bag hall). */
const STILL_CURRENT_MS = 2 * 3_600_000

export type ScheduleKind = 'arrival' | 'departure' | 'tour'

export interface ScheduleEvent {
  /** Unique per event, stable across renders. */
  key: string
  bookingId: string
  /** "MAPL-ABCDEF12" */
  ref: string
  kind: ScheduleKind
  /** Jamaica calendar day, YYYY-MM-DD. */
  day: string
  /** A ride leg's Jamaica wall-clock stamp as stored; null for a tour, which has a day and no clock time. */
  at: string | null
  guest: string
  /** Where a drive starts and ends; null for a tour. */
  from: string | null
  to: string | null
  /** A tour's name ("Dunn's River Falls Climb"), or how many share the day ("2 tours"); null for a ride. */
  title: string | null
  /** "2 passengers" / "4 travelers" */
  party: string
  flight: string | null
  /** A tour's requested start, 'HH:MM' Jamaica, when the booking carries one. */
  pickupTime: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export function isDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
}

/** A stored leg stamp we can place on a day. */
function stampDay(stamp: unknown): string | null {
  if (typeof stamp !== 'string' || Number.isNaN(Date.parse(stamp))) return null
  const day = stamp.slice(0, 10)
  return isDay(day) ? day : null
}

/** Today on Jamaica's calendar, for an instant. */
export function jamaicaDay(nowMs: number): string {
  return new Date(nowMs - JAMAICA_OFFSET_MS).toISOString().slice(0, 10)
}

/** The real instant an event starts: a leg's own time, a tour's midnight in Jamaica. */
export function eventInstantMs(e: Pick<ScheduleEvent, 'at' | 'day'>): number {
  return Date.parse(e.at ?? `${e.day}T00:00:00Z`) + JAMAICA_OFFSET_MS
}

/** Soonest first; on one day a tour (no clock time) leads the timed rides. */
function byMoment(a: ScheduleEvent, b: ScheduleEvent): number {
  return (a.at ?? a.day).localeCompare(b.at ?? b.day) || a.key.localeCompare(b.key)
}

function guestOf(first: unknown, last: unknown): string {
  return [first, last].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || 'Guest'
}

/**
 * The admin's schedule, from booking rows with their booking_items. Only PAID
 * bookings: a refunded or unpaid booking is nobody's drive.
 */
export function scheduleFromBookings(rows: Row[]): ScheduleEvent[] {
  const out: ScheduleEvent[] = []
  for (const b of rows ?? []) {
    if (!b || b.status !== 'paid') continue
    const guest = guestOf(b.first_name, b.last_name)
    const ref = bookingRef(b.id)
    const items = (b.booking_items ?? []) as Row[]
    if ((b.booking_type ?? 'tour') === 'transfer') {
      items.forEach((i, n) => {
        const airport = i?.airport ?? 'MBJ'
        const place = i?.hotel ?? i?.destination ?? 'the hotel'
        const party = plural(Number(i?.passengers ?? i?.travelers ?? 1), 'passenger')
        const base = { bookingId: b.id, ref, guest, title: null, party, pickupTime: null }
        const arr = stampDay(i?.arrival_at)
        if (arr) out.push({ ...base, key: `${b.id}:a${n}`, kind: 'arrival', day: arr, at: i.arrival_at, from: airport, to: place, flight: i.arrival_flight ?? null })
        const dep = stampDay(i?.departure_at)
        if (dep) out.push({ ...base, key: `${b.id}:d${n}`, kind: 'departure', day: dep, at: i.departure_at, from: place, to: airport, flight: i.departure_flight ?? null })
      })
    } else {
      out.push(...tourEvents(b.id, ref, guest, items.map((i) => ({ title: i?.title ?? 'Tour', date: i?.date ?? null, travelers: Number(i?.travelers ?? 1) })), b.pickup_time ?? null))
    }
  }
  return out.sort(byMoment)
}

/** One event per day a tour booking runs on: its tours that day, named when there is one. */
function tourEvents(
  bookingId: string, ref: string, guest: string,
  items: { title: string; date: string | null; travelers: number }[], pickupTime: string | null,
): ScheduleEvent[] {
  const days = new Map<string, { title: string; travelers: number }[]>()
  for (const i of items) {
    const day = String(i.date ?? '').slice(0, 10)
    if (!isDay(day)) continue
    days.set(day, [...(days.get(day) ?? []), i])
  }
  return Array.from(days, ([day, list]) => ({
    key: `${bookingId}:t${day}`, bookingId, ref, kind: 'tour' as const, day, at: null, guest, from: null, to: null,
    title: list.length === 1 ? list[0].title : `${list.length} tours`,
    party: plural(Math.max(...list.map((l) => l.travelers || 1)), 'traveler'),
    flight: null,
    pickupTime: /^\d{2}:\d{2}$/.test(pickupTime ?? '') ? pickupTime : null,
  }))
}

/** The driver's schedule, from the driver-safe shapes lib/driver builds (no prices anywhere). */
export function scheduleFromDriver(
  trips: { id: string; ref: string; guestName: string; passengers: number; hotel: string; airport: string; arrivalAt: string | null; arrivalFlight: string | null; departureAt: string | null; departureFlight: string | null }[],
  tours: { id: string; ref: string; guestName: string; items: { title: string; date: string | null; travelers: number }[] }[] = [],
): ScheduleEvent[] {
  const out: ScheduleEvent[] = []
  for (const t of trips ?? []) {
    const base = { bookingId: t.id, ref: t.ref, guest: t.guestName, title: null, party: plural(t.passengers, 'passenger'), pickupTime: null }
    const arr = stampDay(t.arrivalAt)
    if (arr) out.push({ ...base, key: `${t.id}:a0`, kind: 'arrival', day: arr, at: t.arrivalAt, from: t.airport, to: t.hotel, flight: t.arrivalFlight })
    const dep = stampDay(t.departureAt)
    if (dep) out.push({ ...base, key: `${t.id}:d0`, kind: 'departure', day: dep, at: t.departureAt, from: t.hotel, to: t.airport, flight: t.departureFlight })
  }
  for (const t of tours ?? []) out.push(...tourEvents(t.id, t.ref, t.guestName, t.items, null))
  return out.sort(byMoment)
}

/** Events grouped by day, each day's list soonest first. */
export function eventsByDay(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>()
  for (const e of [...events].sort(byMoment)) map.set(e.day, [...(map.get(e.day) ?? []), e])
  return map
}

/**
 * The next thing to be somewhere for: the soonest drive that has not run
 * (still "next" for two hours past its time), or a tour on a day that has not
 * ended in Jamaica. Null when nothing is ahead.
 */
export function nextUp(events: ScheduleEvent[], nowMs: number): ScheduleEvent | null {
  const today = jamaicaDay(nowMs)
  return [...events].sort(byMoment).find((e) => (e.kind === 'tour' ? e.day >= today : eventInstantMs(e) >= nowMs - STILL_CURRENT_MS)) ?? null
}

/** Everything else on the same Jamaica day as an event (not the event itself). */
export function sameDayOthers(events: ScheduleEvent[], e: ScheduleEvent): ScheduleEvent[] {
  return events.filter((x) => x.day === e.day && x.key !== e.key).sort(byMoment)
}

/** "today", "tomorrow", "in 3 days", and for a drive today "in 5 hrs", "in 40 min" or "now". */
export function untilLabel(e: ScheduleEvent, nowMs: number): string {
  const today = jamaicaDay(nowMs)
  const days = Math.round((Date.parse(`${e.day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days > 1) return `in ${days} days`
  if (days === 1) return 'tomorrow'
  if (days < 0) return 'earlier'
  if (e.kind === 'tour') return 'today'
  const mins = Math.round((eventInstantMs(e) - nowMs) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  return `in ${hrs} hr${hrs === 1 ? '' : 's'}`
}

/* ── The month grid ─────────────────────────────────────────────────────── */

/** "2026-11" for a day. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

/** A month n months on (or back). */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/** "November 2026" */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

/** "Saturday, November 14" (with the year when it is not `thisYear`). */
export function longDay(day: string, thisYear?: string): string {
  const year = thisYear && day.slice(0, 4) === thisYear ? {} : { year: 'numeric' as const }
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', ...year })
}

/** "Sat, Nov 14" */
export function shortDay(day: string, thisYear?: string): string {
  const year = thisYear && day.slice(0, 4) === thisYear ? {} : { year: 'numeric' as const }
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...year })
}

/** A leg's clock time: "5:30 PM" (Jamaica wall-clock, read back as stored). */
export function clock(at: string | null): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
}

/** '08:30' -> '8:30 AM' */
export function clockFromHHMM(hhmm: string | null): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return ''
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * The weeks a month's grid shows, Sunday first: whole weeks, so the first and
 * last rows carry the neighbouring months' days (marked `inMonth: false`).
 */
export function monthWeeks(month: string): { day: string; inMonth: boolean }[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const start = new Date(first)
  start.setUTCDate(1 - first.getUTCDay())
  const weeks: { day: string; inMonth: boolean }[][] = []
  const cursor = new Date(start)
  do {
    const week: { day: string; inMonth: boolean }[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ day: cursor.toISOString().slice(0, 10), inMonth: cursor.getUTCMonth() === m - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getUTCMonth() === m - 1 && cursor.getUTCFullYear() === y)
  return weeks
}

/** What a day holds, in words: "2 rides and 1 tour", "1 ride", "no trips". */
export function daySummary(list: ScheduleEvent[]): string {
  const rides = list.filter((e) => e.kind !== 'tour').length
  const tours = list.length - rides
  const parts = [rides ? plural(rides, 'ride') : '', tours ? plural(tours, 'tour') : ''].filter(Boolean)
  return parts.length ? parts.join(' and ') : 'no trips'
}

/** What one event is, in words, for a label or a screen reader: "Lands 5:30 PM", "Hotel pickup 9:00 AM", "Tour". */
export function eventWhen(e: ScheduleEvent): string {
  if (e.kind === 'tour') return e.pickupTime ? `Tour, pickup ${clockFromHHMM(e.pickupTime)}` : 'Tour'
  return `${e.kind === 'arrival' ? 'Lands' : 'Hotel pickup'} ${clock(e.at)}`
}

/* ── One booking's moments, for a list that shows one row per booking ───── */

export interface ServiceMoment { day: string; at: string | null; kind: 'lands' | 'pickup' | 'tour' }

/** Every moment of service on a booking row, soonest first: each ride leg, each tour day. */
export function serviceMoments(b: Row): ServiceMoment[] {
  const out: ServiceMoment[] = []
  for (const i of (b?.booking_items ?? []) as Row[]) {
    const arr = stampDay(i?.arrival_at)
    const dep = stampDay(i?.departure_at)
    if (arr) out.push({ day: arr, at: i.arrival_at, kind: 'lands' })
    if (dep) out.push({ day: dep, at: i.departure_at, kind: 'pickup' })
    if (!arr && !dep) {
      const day = String(i?.date ?? '').slice(0, 10)
      if (isDay(day)) out.push({ day, at: null, kind: 'tour' })
    }
  }
  return out.sort((a, b) => (a.at ?? a.day).localeCompare(b.at ?? b.day))
}

/**
 * The moment a booking is waiting on: its soonest service from `today` on.
 * Null once everything on it has happened. A round trip whose guest has landed
 * still has its drive back to the airport ahead, and that is what this names.
 */
export function nextService(b: Row, today: string): ServiceMoment | null {
  return serviceMoments(b).find((m) => m.day >= today) ?? null
}
