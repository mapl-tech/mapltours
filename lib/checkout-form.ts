/**
 * Pure validation and derivation for the one-page checkouts.
 *
 * Everything here is deterministic and testable without React or Stripe:
 * which fields are missing, the message for each, the hotel pickup derived
 * from a flight time, and a stable key for "has the order changed since the
 * server last priced it". The components only wire these to state.
 */
import { MIN_PICKUP_LEAD_MIN, earliestBookableExperienceDate } from './booking-window'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const LEG_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export interface ContactFields {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

/** Field key → message shown under the field. Empty object means valid. */
export type FieldErrors = Record<string, string>

export function validateContact(f: ContactFields): FieldErrors {
  const e: FieldErrors = {}
  if (!f.firstName?.trim()) e.firstName = 'Add your first name'
  if (!f.lastName?.trim()) e.lastName = 'Add your last name'
  const email = (f.email ?? '').trim()
  if (!email) e.email = 'Add your email so we can send your confirmation'
  else if (!EMAIL_RE.test(email)) e.email = 'That email does not look right'
  const digits = (f.phone ?? '').replace(/\D/g, '')
  if (!digits) e.phone = 'Add a phone number your driver can reach'
  else if (digits.length < 7) e.phone = 'That phone number looks too short'
  return e
}

export interface TourFormInput {
  contact: ContactFields
  pickup: string
  tripDate: string
  waiverAccepted: boolean
  now?: Date
}

/** Everything the tour checkout needs before it will take a card. */
export function validateTourForm(input: TourFormInput): FieldErrors {
  const e = validateContact(input.contact)
  if (!input.pickup?.trim()) e.pickup = 'Choose where we pick you up'
  const earliest = earliestBookableExperienceDate(input.now ?? new Date())
  if (!input.tripDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.tripDate)) e.tripDate = 'Pick a date'
  else if (input.tripDate < earliest) e.tripDate = `Tours need a day\u2019s notice; the earliest date is ${formatDate(earliest)}`
  if (!input.waiverAccepted) e.waiver = 'Please accept the activity waiver to continue'
  return e
}

/** Flight numbers: non-empty, at least one digit, at most 10 chars (matches the server). */
export function flightOk(v: string | undefined | null): boolean {
  const t = (v ?? '').trim()
  return t.length >= 2 && t.length <= 10 && /\d/.test(t)
}

export interface TransferLegsInput {
  tripType: 'round_trip' | 'one_way'
  fromAirport: boolean
  arrivalAt?: string
  arrivalFlight?: string
  departureAt?: string
  departureFlight?: string
}

export interface TransferFormInput {
  contact: ContactFields
  legs: TransferLegsInput
  /** Earliest bookable pickup as "YYYY-MM-DDTHH:MM" Jamaica wall clock. */
  minDateTime: string
}

/** Which legs a ride has, from the stated direction alone. */
export function legsFor(tripType: 'round_trip' | 'one_way', fromAirport: boolean) {
  return {
    hasArrivalLeg: tripType === 'round_trip' || fromAirport,
    hasDepartureLeg: tripType === 'round_trip' || !fromAirport,
  }
}

export function validateTransferForm(input: TransferFormInput): FieldErrors {
  const e = validateContact(input.contact)
  const { legs, minDateTime } = input
  const { hasArrivalLeg, hasDepartureLeg } = legsFor(legs.tripType, legs.fromAirport)
  if (hasArrivalLeg) {
    if (!legs.arrivalAt) e.arrivalAt = 'Add when your flight lands'
    else if (minDateTime && legs.arrivalAt < minDateTime) e.arrivalAt = 'Pickups need 24 hours’ notice; choose a later time'
    if (!flightOk(legs.arrivalFlight)) e.arrivalFlight = 'Add your arrival flight number, e.g. AA1234'
  }
  if (hasDepartureLeg) {
    if (!legs.departureAt) e.departureAt = 'Add when your flight home departs'
    else if (minDateTime && legs.departureAt < minDateTime) e.departureAt = 'Pickups need 24 hours’ notice; choose a later time'
    else if (legs.tripType === 'round_trip' && legs.arrivalAt && legs.departureAt <= legs.arrivalAt) e.departureAt = 'The flight home must be after you arrive'
    if (!flightOk(legs.departureFlight)) e.departureFlight = 'Add your departure flight number, e.g. AA4321'
  }
  return e
}

/** Shift a "YYYY-MM-DDTHH:MM" wall-clock value by minutes, staying zone-free. */
export function shiftWallClock(value: string, minutes: number): string {
  if (!LEG_TIME_RE.test(value)) return ''
  const ms = Date.parse(`${value}:00Z`)
  if (Number.isNaN(ms)) return ''
  return new Date(ms + minutes * 60_000).toISOString().slice(0, 16)
}

/** Hotel pickup for the flight home: the flight time minus the standard lead. */
export function pickupFromFlight(flightAt: string): string {
  return shiftWallClock(flightAt, -MIN_PICKUP_LEAD_MIN)
}

/** The inverse, to seed a flight time from a pickup already in the cart. */
export function flightFromPickup(pickupAt: string): string {
  return shiftWallClock(pickupAt, MIN_PICKUP_LEAD_MIN)
}

export const PICKUP_LEAD_TEXT = (() => {
  const h = Math.floor(MIN_PICKUP_LEAD_MIN / 60)
  const m = MIN_PICKUP_LEAD_MIN % 60
  return m ? `${h}½ hours` : `${h} hours`
})()

/** "Fri, Oct 17" from "2026-10-17" (zone-free). */
export function formatDate(day: string): string {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** "Fri, Oct 17 · 10:00 AM" from "2026-10-17T10:00" (zone-free). */
export function formatWallClock(value: string): string {
  if (!LEG_TIME_RE.test(value)) return value
  const [day, time] = value.split('T')
  const [hh, mm] = time.split(':').map(Number)
  const suffix = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${formatDate(day)} · ${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}

/** Stable key for an order payload: the same order always yields the same key. */
export function orderKey(payload: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v
  return JSON.stringify(sort(payload))
}
