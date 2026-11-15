import { createHmac, timingSafeEqual } from 'node:crypto'
import { DESTINATIONS } from './airport-transfers'
import { bookingLink, parseHandoff, type Handoff } from './agent/booking-link'
import { isExperienceDateBookable } from './booking-window'
import { experiences, getSlug } from './experiences'
import { legBookable } from './webmcp-tools'

/**
 * The cart reminder follow-ups (owner, Nov 15 2026): three emails per cart.
 * The rules here are pure so the sweep (app/api/abandoned-cart) and its tests
 * share them.
 *
 *   1  the first reminder, 30 minutes to 7 days after checkout was left
 *      (recovery_email_count 1; recovery_email_sent_at is its time and stays it)
 *   2  3 days after the first: the trip, the button, the usual worries. No code.
 *   3  7 days after the first: the same, with JAMAICA5 when the guest can
 *      still use it (no code, no third email).
 *
 * Never a fourth. Each step moves recovery_email_count by one, and a guest
 * who has paid for anything since starting the cart gets no further step.
 */

export interface FollowUpStep {
  step: 2 | 3
  /** Hours after the FIRST reminder. */
  afterHours: number
  /** Whether this step offers the code (and is not sent without one). */
  coupon: boolean
}
export const FOLLOW_UPS: readonly FollowUpStep[] = [
  { step: 2, afterHours: 3 * 24, coupon: false },
  { step: 3, afterHours: 7 * 24, coupon: true },
]
/** A run that misses the moment may still send up to this long after it; later, the moment has passed. */
export const FOLLOW_UP_WINDOW_HOURS = 48
/**
 * How far back the sweep looks for payments and newer carts: a cart can be 7
 * days old at its first reminder, and the third goes up to 9 days after that.
 */
export const FOLLOW_UP_LOOKBACK_DAYS = 17
/**
 * The trip must still be bookable this far past the send, so a guest who opens
 * it the next day can still book it (the 12-hour rule applies on top).
 */
export const FOLLOW_UP_BOOKABLE_AHEAD_HOURS = 24
/** The public code the third email offers (owner, Nov 15 2026). */
export const FOLLOW_UP_COUPON = 'JAMAICA5'

const HOUR = 3_600_000

/** Due when the first reminder went between `afterHours` and 48 hours past it. */
export function followUpDue(firstSentAt: string | null | undefined, now: number, afterHours: number): boolean {
  const at = Date.parse(String(firstSentAt ?? ''))
  if (Number.isNaN(at)) return false
  const age = now - at
  return age >= afterHours * HOUR && age < (afterHours + FOLLOW_UP_WINDOW_HOURS) * HOUR
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

/**
 * A stored leg time as the guest's Jamaica wall clock, "YYYY-MM-DDTHH:MM".
 * Leg times are stored as that wall clock carrying a Z (lib/dispatch
 * legInstantMs), so the first 16 characters are the wall clock itself.
 */
function wallClock(stored: unknown): string | undefined {
  const s = typeof stored === 'string' ? stored : ''
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : undefined
}

function destinationIdByName(name: unknown): string | null {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return null
  const hits = DESTINATIONS.filter((d) => d.name === n)
  return hits.length === 1 ? hits[0].id : null
}

/**
 * What a /book link needs to rebuild this cart on any device, or null when
 * the cart cannot be carried by one link (several tours, a hotel we cannot
 * name exactly, a tour no longer listed). Only the cart's own content: no
 * name, email or phone ever goes into the link.
 */
export function handoffFromBooking(b: Row): Handoff | null {
  const items = (b?.booking_items ?? []) as Row[]
  if (items.length !== 1) return null
  const i = items[0]
  if (b.booking_type === 'transfer') {
    const destinationId = destinationIdByName(i.hotel ?? i.destination)
    if (!destinationId) return null
    const tripType = i.trip_type === 'round_trip' ? 'round_trip' : i.trip_type === 'one_way' ? 'one_way' : null
    if (!tripType) return null
    const arrivalAt = wallClock(i.arrival_at)
    const departureAt = wallClock(i.departure_at)
    const passengers = Number(i.passengers ?? i.travelers)
    if (!Number.isInteger(passengers) || passengers < 1) return null
    return {
      kind: 'ride',
      destinationId,
      tripType,
      passengers,
      fromAirport: tripType === 'round_trip' || !!arrivalAt,
      ...(arrivalAt ? { arrivalAt } : {}),
      ...(i.arrival_flight ? { arrivalFlight: String(i.arrival_flight) } : {}),
      ...(departureAt ? { departureAt } : {}),
      ...(i.departure_flight ? { departureFlight: String(i.departure_flight) } : {}),
    }
  }
  const exp = experiences.find((e) => e.id === Number(i.experience_id))
  const guests = Number(i.travelers)
  const date = typeof i.date === 'string' ? i.date.slice(0, 10) : ''
  if (!exp || !Number.isInteger(guests) || guests < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return {
    kind: 'tour',
    slug: getSlug(exp),
    guests,
    date,
    ...(typeof b.pickup === 'string' && b.pickup.trim() ? { pickupHotel: b.pickup } : {}),
  }
}

/** The campaign tags: a booking from these emails is credited to its step in bookings.attribution. */
export function followUpUtm(step: 2 | 3) {
  return { source: 'email', medium: 'email', campaign: 'cart_reminder', content: `reminder_${step}` }
}

/** The link a follow-up's button opens: the trip rebuilt on any device. */
export function followUpLink(origin: string, h: Handoff, step: 2 | 3): string {
  return bookingLink(origin, h, 'mcp', `reminder_${step}`, followUpUtm(step))
}

/**
 * Whether the trip can still be booked a day from now: the same check the
 * /book page runs when the link is opened (12-hour rule included), or for a
 * cart a link cannot carry, every tour date on it.
 */
export function stillBookable(b: Row, link: string | null, now: number): boolean {
  const later = new Date(now + FOLLOW_UP_BOOKABLE_AHEAD_HOURS * HOUR)
  if (link) return parseHandoff(new URL(link).searchParams, later).ok
  const items = (b?.booking_items ?? []) as Row[]
  if (!items.length) return false
  if (b.booking_type === 'transfer') {
    return items.every((i) => {
      const legs = [wallClock(i.arrival_at), wallClock(i.departure_at)].filter((v): v is string => !!v)
      return legs.length > 0 && legs.every((v) => legBookable(v, later))
    })
  }
  return items.every((i) => typeof i.date === 'string' && isExperienceDateBookable(i.date.slice(0, 10), later))
}

/**
 * What the code is taken from, exactly as the checkout routes compute it for
 * a cart without a code, or null when the follow-up should not offer one: a
 * code already on the cart (one per booking), or a gift card on it (the
 * guest is already paying part with credit, and the email would have to
 * explain two discounts).
 */
export function couponBasis(b: Row): { baseCents: number; marginCents: number; bookingType: 'tour' | 'transfer' } | null {
  if (b?.coupon_code) return null
  if (Number(b?.gift_card_amount ?? 0) > 0) return null
  const baseCents = Math.round(Number(b?.total_paid) * 100)
  if (!Number.isFinite(baseCents) || baseCents <= 0) return null
  const fee = Number(b?.booking_fee ?? 0)
  const reward = Number(b?.reward_discount ?? 0)
  const isTransfer = b.booking_type === 'transfer'
  // The same margin the routes pass to resolveCoupon: the fee on a ride, the
  // fee less any clip reward on a tour.
  const marginCents = Math.max(0, Math.round(((isTransfer ? fee : fee - reward) || 0) * 100))
  return { baseCents, marginCents, bookingType: isTransfer ? 'transfer' : 'tour' }
}

/* ── The stop link ───────────────────────────────────────────────────── */

const STOP_PREFIX = 'cart-reminders:v1:stop:'
export const CART_STOP_PATH = '/api/cart-reminders/stop'

/** CART_REMINDER_SECRET, else the mention or trip-tips key under this prefix. */
export function cartReminderSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.CART_REMINDER_SECRET || env.MENTIONS_SECRET || env.TRIP_TIPS_SECRET
  return s && s.length >= 16 ? s : null
}

export function signCartStop(bookingId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${STOP_PREFIX}${bookingId.toLowerCase()}`).digest('base64url')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function verifyCartStop(bookingId: unknown, token: unknown, secret: string): bookingId is string {
  if (typeof bookingId !== 'string' || !UUID_RE.test(bookingId) || typeof token !== 'string' || token.length > 100) return false
  const want = Buffer.from(signCartStop(bookingId, secret))
  const got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}

/** The link names the cart, never the address: the address is read from the booking when it is used. */
export function cartStopUrl(origin: string, bookingId: string, secret: string): string {
  const id = bookingId.toLowerCase()
  return `${origin.replace(/\/$/, '')}${CART_STOP_PATH}?b=${id}&t=${signCartStop(id, secret)}`
}
