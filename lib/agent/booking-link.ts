/**
 * Booking links: how an AI assistant connected through /mcp hands a traveller
 * to checkout.
 *
 * A remote assistant cannot reach the guest's browser cart (it lives in
 * localStorage), so the connector's booking tools return a mapltours.com/book
 * link instead. Opening it fills the cart with exactly what the assistant
 * validated and lands on checkout with the ride's flights or the tour's date
 * and party already set; the guest adds contact details and pays there.
 *
 * Rules this module enforces:
 *   - No personal data in the URL. Names, emails and phone numbers would land
 *     in browser history, server logs and analytics page URLs; the guest (or
 *     their agent) types them on the page.
 *   - The link is re-validated when it is opened, with the same checks the
 *     tools use (lib/webmcp-tools), because a link can be edited, shared or
 *     opened days later: a pickup that has slipped inside the 24-hour window
 *     is refused with a way forward, never silently booked.
 *   - The price is never in the link. Checkout prices the cart from the rate
 *     card, as it does for every other visitor.
 *   - UTM tags name the assistant (via) and the tool, so the booking is
 *     credited to it through the site's existing attribution capture.
 */
import { MAX_TRANSFER_PASSENGERS, getDestination, type TransferTripType } from '../airport-transfers'
import { earliestBookableExperienceDate, isExperienceDateBookable, MIN_LEAD_TIME_HOURS } from '../booking-window'
import { getExperienceBySlug, getSlug } from '../experiences'
import { flightNo, legBookable, legTime, legsFor, tripTypeOf } from '../webmcp-tools'

export const BOOK_PATH = '/book'
export const MAX_TOUR_GUESTS = 12
const HOTEL_MAX = 120

/** Where every link the connector hands out points. */
export const SITE = 'https://mapltours.com'

/**
 * The origin for the connector's links: always the public site, except a local
 * dev server, whose links tests follow. Behind the custom domain the function
 * sees Netlify's per-deploy host (<deploy id>--mapltours.netlify.app); a link
 * to it would pin the guest to that one deploy, on a domain Apple Pay is not
 * registered for.
 */
export function linkOrigin(requestUrl: URL): string {
  const h = requestUrl.hostname
  return h === 'localhost' || h === '127.0.0.1' ? requestUrl.origin : SITE
}

/** Assistants with their own connector address (/mcp?via=...). Anything else reads as 'mcp'. */
export const VIAS = ['muse', 'chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'grok'] as const
export type Via = (typeof VIAS)[number] | 'mcp'

export function viaOf(raw: unknown): Via {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return (VIAS as readonly string[]).includes(v) ? (v as Via) : 'mcp'
}

export interface RideHandoff {
  kind: 'ride'
  destinationId: string
  tripType: TransferTripType
  passengers: number
  /** True when the ride starts at Sangster (round trips always do). */
  fromAirport: boolean
  /** "YYYY-MM-DDTHH:MM" Jamaica wall clock. */
  arrivalAt?: string
  arrivalFlight?: string
  /** Hotel pickup for the flight home, "YYYY-MM-DDTHH:MM" Jamaica wall clock. */
  departureAt?: string
  departureFlight?: string
}

export interface TourHandoff {
  kind: 'tour'
  slug: string
  guests: number
  /** "YYYY-MM-DD", Jamaica calendar day. */
  date: string
  pickupHotel?: string
}

export type Handoff = RideHandoff | TourHandoff

/** The link a booking tool returns. Short parameter names keep it readable in a chat. */
export function bookingLink(origin: string, h: Handoff, via: Via, tool: string): string {
  const u = new URL(BOOK_PATH, origin)
  const p = u.searchParams
  if (h.kind === 'ride') {
    p.set('ride', h.destinationId)
    p.set('trip', h.tripType)
    if (h.tripType === 'one_way') p.set('dir', h.fromAirport ? 'from_airport' : 'to_airport')
    p.set('pax', String(h.passengers))
    if (h.arrivalAt) p.set('land', h.arrivalAt)
    if (h.arrivalFlight) p.set('in', h.arrivalFlight)
    if (h.departureAt) p.set('pickup', h.departureAt)
    if (h.departureFlight) p.set('out', h.departureFlight)
  } else {
    p.set('tour', h.slug)
    p.set('guests', String(h.guests))
    p.set('date', h.date)
    const hotel = pickupText(h.pickupHotel)
    if (hotel) p.set('hotel', hotel)
  }
  p.set('utm_source', via)
  p.set('utm_medium', 'ai_agent')
  p.set('utm_campaign', 'connector')
  p.set('utm_content', tool)
  return u.toString()
}

export type ParsedHandoff =
  | { ok: true; handoff: Handoff }
  | { ok: false; reason: string; fallbackPath: string; fallbackLabel: string }

const refuse = (reason: string, fallbackPath: string, fallbackLabel: string): ParsedHandoff => ({ ok: false, reason, fallbackPath, fallbackLabel })

// Built from a string: the project's TypeScript target predates the u flag,
// which every browser and Node version the site runs on supports.
const NOT_PLACE_NAME = new RegExp("[^\\p{L}\\p{M}\\p{N} .,'&()/#-]", 'gu')

/**
 * The tour pickup typed into a link reaches the checkout form and, once paid,
 * the confirmation and the operator's email. A link can come from anyone, so
 * keep it to what a place name needs: letters, digits, spaces and . , ' & ( ) / # -.
 * Anything that looks like a link or an address is dropped, not shown.
 */
export function pickupText(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.normalize('NFC') : ''
  if (/https?:|www\.|@|:\/\//i.test(s)) return ''
  return s.replace(NOT_PLACE_NAME, '').replace(/\s+/g, ' ').trim().slice(0, HOTEL_MAX)
}

const int = (v: string | null) => (v !== null && /^\d{1,3}$/.test(v) ? Number(v) : NaN)

/** Read and re-check a /book link. Never throws. */
export function parseHandoff(params: URLSearchParams, now: Date): ParsedHandoff {
  const ride = params.get('ride')
  const tour = params.get('tour')
  if (ride && !tour) return parseRide(params, ride, now)
  if (tour && !ride) return parseTour(params, tour, now)
  return refuse('This booking link is incomplete.', '/transfers', 'Price a ride')
}

function parseRide(params: URLSearchParams, id: string, now: Date): ParsedHandoff {
  const dest = getDestination(id)
  if (!dest || id.startsWith('__')) return refuse('That hotel is not on our rate card any more.', '/transfers', 'Find your hotel')
  const fare = `/transfers?to=${dest.id}`
  const tripType = tripTypeOf(params.get('trip'))
  if (tripType === null || tripType === 'invalid') return refuse('This booking link is missing the trip type.', fare, 'Pick your ride')
  const pax = int(params.get('pax'))
  if (!Number.isInteger(pax) || pax < 1 || pax > MAX_TRANSFER_PASSENGERS) {
    return refuse(`Rides can be booked online for 1 to ${MAX_TRANSFER_PASSENGERS} passengers.`, fare, 'Pick your ride')
  }
  const dir = params.get('dir')
  if (tripType === 'one_way' && dir !== 'from_airport' && dir !== 'to_airport') return refuse('This booking link does not say which way the ride goes.', fare, 'Pick your ride')
  const fromAirport = tripType === 'round_trip' || dir === 'from_airport'
  const legs = legsFor(tripType, fromAirport)

  const land = legTime('land', params.get('land'))
  const pickup = legTime('pickup', params.get('pickup'))
  if (land.error || pickup.error) return refuse('A date or time in this booking link is not valid.', fare, 'Pick your ride')
  // Only the legs this ride has; a stray leg means an edited link, and the
  // server refuses such a cart (lib/transfer-legs).
  if ((!legs.hasArrivalLeg && (land.value || params.get('in'))) || (!legs.hasDepartureLeg && (pickup.value || params.get('out')))) {
    return refuse('This booking link does not match the ride it describes.', fare, 'Pick your ride')
  }
  if (tripType === 'round_trip' && land.value && pickup.value && pickup.value <= land.value) {
    return refuse('The pickup for the flight home is before the arrival in this link.', fare, 'Pick your ride')
  }
  for (const v of [land.value, pickup.value]) {
    if (v && !legBookable(v, now)) {
      return refuse(`Pickups need ${MIN_LEAD_TIME_HOURS} hours' notice, and this one is now too soon to book online. Email contact@mapltours.com and we will try to fit you in.`, fare, 'Choose another time')
    }
  }
  const arrivalFlight = flightNo(params.get('in'))
  const departureFlight = flightNo(params.get('out'))
  return {
    ok: true,
    handoff: {
      kind: 'ride',
      destinationId: dest.id,
      tripType,
      passengers: pax,
      fromAirport,
      ...(land.value ? { arrivalAt: land.value } : {}),
      ...(arrivalFlight ? { arrivalFlight } : {}),
      ...(pickup.value ? { departureAt: pickup.value } : {}),
      ...(departureFlight ? { departureFlight } : {}),
    },
  }
}

function parseTour(params: URLSearchParams, slug: string, now: Date): ParsedHandoff {
  const exp = getExperienceBySlug(slug.toLowerCase())
  if (!exp) return refuse('That tour is not on our list any more.', '/explore', 'See our tours')
  const page = `/experience/${getSlug(exp)}`
  const guests = int(params.get('guests'))
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_TOUR_GUESTS) return refuse(`Tours can be booked online for 1 to ${MAX_TOUR_GUESTS} guests.`, page, 'Book this tour')
  const date = params.get('date') ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    return refuse('This booking link is missing the tour date.', page, 'Book this tour')
  }
  if (!isExperienceDateBookable(date, now)) {
    return refuse(`Tours need ${MIN_LEAD_TIME_HOURS} hours' notice, so this date can no longer be booked online. The earliest date is ${earliestBookableExperienceDate(now)}.`, page, 'Pick another date')
  }
  const hotel = pickupText(params.get('hotel'))
  return { ok: true, handoff: { kind: 'tour', slug: getSlug(exp), guests, date, ...(hotel ? { pickupHotel: hotel } : {}) } }
}
