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

/** A booking id as both checkout routes issue it, and accept it back. */
const BOOKING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The booking id a checkout response issued, or null.
 *
 * Both routes return the row's id on success and on the refusals made after
 * the row exists (a reward conflict, a Stripe outage, a settling intent).
 * Whichever it is, that row is this page's newest checkout, and the next
 * POST for a different order has to name it. A refusal made before any row
 * exists (a coupon or lead-time error, a network failure) carries no id, and
 * the id the page already holds stays the one to name.
 */
export function issuedBookingId(response: unknown): string | null {
  const id = response && typeof response === 'object' ? (response as { bookingId?: unknown }).bookingId : undefined
  return typeof id === 'string' && BOOKING_ID_RE.test(id) ? id : null
}

/**
 * The booking a checkout POST asks the server to supersede, or undefined.
 *
 * Every distinct order (party, date, email, a coupon or gift code) hashes to
 * its own pending row on the server. Without this, an order changed after the
 * quiet save left the earlier row pending with a live PaymentIntent: payable,
 * emailed by the abandoned-cart cron, and, for a signed-in guest, holding the
 * video reward, so the edited order was refused with rewardConflict and the
 * only way through was full price. The server cancels the named row only if
 * it is still pending or declined, of the same type, and the requester's own
 * (same email, or it holds the requester's reward), so naming it is safe.
 *
 * `cachedKey` is the order the page holds an intent for, `lastBookingId` the
 * newest id any response issued (issuedBookingId). Named whenever this POST
 * is for a different order. The same order reuses its intent and never
 * POSTs; an order that hashes to the same row (the tour Pay adds only the
 * waiver, which the server does not hash) names it, and the server skips a
 * supersede of the row it is answering with.
 */
export function supersedeBookingIdFor(
  key: string,
  state: { cachedKey: string | null; lastBookingId: string | null },
): string | undefined {
  if (!state.lastBookingId || !BOOKING_ID_RE.test(state.lastBookingId)) return undefined
  if (state.cachedKey === key) return undefined
  return state.lastBookingId
}

/**
 * What a one-page checkout's pay step resolves to: an intent to confirm, a
 * page to go to (already paid, or settled by gift card), or a refusal.
 *
 * `shownOnPage` on a refusal: the page already says what happened (through
 * the panel's externalError, with figures that follow its own state), so the
 * panel shows nothing of its own and only hands the button back.
 */
export type CheckoutIntentResult =
  | { clientSecret: string; bookingId: string; amountDue: number }
  | { navigate: string }
  | { error: string; shownOnPage?: boolean }

export const PAYMENT_SERVICE_UNREACHABLE = 'Could not reach the payment service. Please check your connection and try again.'
export const PAYMENT_NOT_SET_UP = 'Could not set up payment. Please try again.'

/** A checkout route's answer, turned into what the page has to do about it. */
export interface CheckoutAnswer {
  result: CheckoutIntentResult
  /** The booking id the answer issued (issuedBookingId), success or refusal. */
  bookingId: string | null
  /** True only for an intent the same order may reuse without another POST. */
  reusable: boolean
  /** The gift card code was refused: take it off the page. */
  dropGift: boolean
  /** The coupon code was refused: take it off the page. */
  dropCoupon: boolean
  /** Shown under the code field when a code was refused. */
  codeError: string | null
  /**
   * Tour page only: another live checkout holds the video reward (409
   * rewardConflict), so the server priced nothing with it. The page must
   * untick the reward, which re-prices it, and show its own notice with the
   * new total. Left ticked, every Pay tap re-sends applyReward: true and
   * gets the same 409.
   */
  untickReward: boolean
  /** Server-priced figures, each null when the answer did not carry one. */
  giftAmount: number | null
  couponDiscount: number | null
  amountDue: number | null
  /** The page showed nothing to charge (gift card), and the server now wants a card for the rest. */
  giftShortfall: boolean
}

/**
 * Map a checkout route's JSON answer to the page's next step.
 *
 * Pure, so both one-page checkouts share one tested reading of the server
 * contract (tests/unit/checkout-form.spec.ts). `confirmPath` is the page's
 * confirmation route; `shownCents` / `shownTotal` are what the page showed
 * before the answer; `rewardOnPage` is true on the tour page, which has a
 * reward box to untick. The transfers route has no reward; were it ever to
 * answer rewardConflict, the refusal is shown as plain text rather than
 * swallowed by a notice that page does not render.
 */
export function readCheckoutAnswer(
  data: unknown,
  opts: { confirmPath: string; shownCents: number; shownTotal: number; rewardOnPage: boolean },
): CheckoutAnswer {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const answer: Omit<CheckoutAnswer, 'result'> = {
    bookingId: issuedBookingId(d),
    reusable: false,
    dropGift: false,
    dropCoupon: false,
    codeError: null,
    untickReward: false,
    giftAmount: null,
    couponDiscount: null,
    amountDue: null,
    giftShortfall: false,
  }

  if (typeof d.error === 'string') {
    const dropGift = !!d.giftCode
    const dropCoupon = !!d.couponCode
    const refused = { ...answer, dropGift, dropCoupon, codeError: dropGift || dropCoupon ? d.error : null }
    if (d.rewardConflict && opts.rewardOnPage) {
      return { ...refused, untickReward: true, result: { error: d.error, shownOnPage: true } }
    }
    return { ...refused, result: { error: d.error } }
  }

  const confirm = `${opts.confirmPath}?booking_id=${encodeURIComponent(String(d.bookingId ?? ''))}`
  if (d.alreadyPaid) return { ...answer, result: { navigate: confirm } }
  if (d.fullyCoveredByGift) return { ...answer, giftAmount: num(d.giftAmount), result: { navigate: confirm } }
  if (typeof d.clientSecret !== 'string') return { ...answer, result: { error: PAYMENT_NOT_SET_UP } }

  const amountDue = num(d.amountDue)
  return {
    ...answer,
    reusable: true,
    giftAmount: num(d.giftAmount),
    couponDiscount: num(d.couponDiscount),
    amountDue,
    giftShortfall: amountDue != null && amountDue > 0 && opts.shownCents < 50,
    result: {
      clientSecret: d.clientSecret,
      bookingId: String(d.bookingId ?? ''),
      // An answer without amountDue falls back to the page's figure; the
      // panel re-reads the intent's own amount before it confirms anyway.
      amountDue: amountDue ?? opts.shownTotal,
    },
  }
}
