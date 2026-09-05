/**
 * WebMCP tools: what a visitor's in-browser agent (Gemini in Chrome and the
 * like) can do on mapltours.com without scraping the screen.
 *
 * https://developer.chrome.com/docs/ai/webmcp. The page registers each tool
 * with `document.modelContext.registerTool`; the browser hands the agent the
 * name, description and JSON Schema, and calls `execute(input)` with a parsed
 * object. Whatever `execute` returns is serialised for the agent, and a THROWN
 * error reaches it only as "invocation failed", so every failure here is a
 * returned object with an `error` the agent can act on.
 *
 * Pure by design: the module knows nothing about React or the stores. Side
 * effects (cart writes, navigation) come in through `actions`, so the tools
 * are unit-tested with fakes and the component that registers them is thin.
 *
 * Rules the tools enforce, not merely describe:
 *   - Read tools are read-only (annotations.readOnlyHint) and touch nothing.
 *   - The two "start" tools put the ride or tour in the cart and open the
 *     checkout. They never pay. Payment is the traveller's own tap on the
 *     Stripe form, which needs a human gesture; consequentialHint tells the
 *     agent to confirm with the person before calling them. They also refuse
 *     to touch the cart while a Stripe confirm is in flight on the page.
 *   - Leg times are "YYYY-MM-DDTHH:MM" Jamaica wall clock, validated to that
 *     shape and judged against the 24-hour rule as a fixed instant, so the
 *     answer is the same in Tokyo, Berlin and Kingston. The checkout view
 *     avoids isPickupBookable in the browser for the same reason.
 *   - A one-way carries only the legs its direction allows. Fields for the
 *     other leg are an error, never silently stored: the server refuses such
 *     a cart and the form cannot show the stray field.
 *   - Prices come from the same buildQuote / tourPrice the checkout uses.
 *   - Descriptions stay under 500 characters and outputs compact, per
 *     Chrome's prompt-injection guidance; agent input is echoed back only
 *     after validation, and clipped.
 */
import {
  DESTINATIONS,
  MAX_TRANSFER_PASSENGERS,
  ROUND_TRIP_DISCOUNT,
  ZONES,
  buildQuote,
  getDestination,
  searchDestinations,
  type TransferDestination,
  type TransferQuote,
  type TransferTripType,
} from './airport-transfers'
import {
  MIN_LEAD_TIME_HOURS,
  MIN_PICKUP_LEAD_MIN,
  earliestBookableExperienceDate,
  isExperienceDateBookable,
  isPickupBookable,
  leadTimeCutoff,
} from './booking-window'
import type { CartItem } from './cart'
import { fitTourToDay, type DayContext } from './day-route'
import {
  experiences,
  getExperienceBySlug,
  getSlug,
  perTravelerPrice,
  priceUnitLabel,
  tourPrice,
  type Experience,
} from './experiences'
import { CANCELLATION_SUMMARY } from './refund-pricing'

export interface WebMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint?: boolean; consequentialHint?: boolean; untrustedContentHint?: boolean }
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** What happened when a tour was put in the cart. The store can refuse or evict. */
export interface AddTourResult {
  added: boolean
  /** Why the store refused, in words the agent can relay. */
  reason?: string
  /** Titles evicted to make room: a package replaces single tours and vice versa. */
  replaced?: string[]
  /** Other tours still in the cart, which now share this date and party size. */
  sharedWith?: string[]
}

/** Side effects the tools may cause, supplied by the component (or a test). */
export interface WebMcpActions {
  addTransferQuote: (quote: TransferQuote, opts: { fromAirport: boolean }) => string
  updateTransferItem: (id: string, patch: { arrivalAt?: string; arrivalFlight?: string; departureAt?: string; departureFlight?: string }) => void
  addTour: (exp: Experience, guests: number, date?: string, pickupHotel?: string) => AddTourResult
  navigate: (path: string) => void
  /** Called just before a consequential tool opens checkout, so the
   *  booking can be attributed to the agent (see markAgentAttribution). */
  onBookingStarted?: (tool: 'start_transfer_booking' | 'start_tour_booking') => void
  /** True while stripe.confirmPayment is in flight on this page (lib/payment-lock). */
  paymentInFlight?: () => boolean
  /** Absolute origin for links in results, e.g. https://mapltours.com */
  origin: string
  now?: () => Date
}

/* ── The slice of the cart store the tour tools need ─────────────────────── */

export interface TourCartLike {
  items: CartItem[]
  stops: DayContext['stops']
  isInCart: (id: number) => boolean
  conflictsInCart: (exp: Experience) => CartItem[]
  addItem: (exp: Experience) => void
  updateTravelers: (id: number, travelers: number) => void
  updateDate: (id: number, date: string) => void
  setPickup: (location: string) => void
  setDropoff: (location: string) => void
}

/**
 * Put a tour in the cart through the real store and report what happened.
 *
 * addItem() is silent by design: it evicts the other kind (a day is one
 * package or self-built single tours), evicts packages that overlap, and
 * refuses a tour too far from the day's others to drive between. An agent
 * that is not told about those reports a checkout that does not contain what
 * the traveller asked for. The date and party size go on EVERY line because
 * checkout treats the cart as one day with one party and applies the first
 * line's values to all of them.
 */
export function addTourToCart(
  getState: () => TourCartLike,
  exp: Experience,
  guests: number,
  date?: string,
  pickupHotel?: string,
): AddTourResult {
  const s = getState()
  const already = s.isInCart(exp.id)
  const evicted = already ? [] : s.conflictsInCart(exp)
  if (!already) {
    const evictedIds = new Set(evicted.map((i) => i.id))
    const kept = s.items.filter((i) => !evictedIds.has(i.id))
    const fit = fitTourToDay(exp, { items: kept, stops: s.stops })
    if (!fit.allowed) {
      return { added: false, reason: fit.reason ?? `${exp.title} is too far from the tours already in the cart to fit the same day.` }
    }
    s.addItem(exp)
    if (!getState().isInCart(exp.id)) return { added: false, reason: `${exp.title} could not be added to the day already in the cart.` }
  }
  const after = getState()
  for (const i of after.items) {
    after.updateTravelers(i.id, guests)
    if (date) after.updateDate(i.id, date)
  }
  if (pickupHotel) {
    after.setPickup(pickupHotel)
    after.setDropoff(pickupHotel)
  }
  const sharedWith = getState().items.filter((i) => i.id !== exp.id).map((i) => i.title)
  return { added: true, replaced: evicted.map((i) => i.title), sharedWith }
}

/* ── Input parsing ───────────────────────────────────────────────────────── */

type Input = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
/** Agent text is never echoed back whole; it can be arbitrarily long. */
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n)}...` : s)
const norm = (v: unknown) => str(v).toLowerCase().replace(/[\s-]+/g, '_')
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const STOP_WORDS = new Set(['tour', 'tours', 'trip', 'trips', 'package', 'packages', 'day', 'the', 'and', 'with', 'for', 'from', 'near', 'jamaica'])
/** Content words of a query: stop words out, punctuation off. */
const words = (s: string) =>
  s.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9']/g, '')).filter((w) => w.length > 2 && !STOP_WORDS.has(w))

/** null when absent, 'invalid' when not one of the documented values. */
function tripTypeOf(v: unknown): TransferTripType | null | 'invalid' {
  const s = norm(v)
  if (!s) return null
  if (s === 'round_trip' || s === 'roundtrip' || s === 'return') return 'round_trip'
  if (s === 'one_way' || s === 'oneway' || s === 'single') return 'one_way'
  return 'invalid'
}
type Direction = 'airport_to_hotel' | 'hotel_to_airport'
function directionOf(v: unknown): Direction | null | 'invalid' {
  const s = norm(v)
  if (!s) return null
  if (s === 'airport_to_hotel' || s === 'hotel_to_airport') return s
  return 'invalid'
}
const flightNo = (v: unknown) => str(v).toUpperCase().replace(/\s+/g, '').slice(0, 10)

const LEG_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
/**
 * A leg time is "YYYY-MM-DDTHH:MM" on the Jamaica wall clock and nothing
 * else. Anything looser is a real hazard, not pedantry: a date-only value
 * parses as midnight and books a driver to the airport at 00:00, and a "Z"
 * or offset suffix shifts the stored pickup by hours.
 */
function legTime(field: string, v: unknown): { value?: string; error?: string } {
  const s = str(v)
  if (!s) return {}
  if (!LEG_TIME.test(s)) {
    return { error: `${field} must be "YYYY-MM-DDTHH:MM" Jamaica local time, no seconds or timezone suffix, e.g. 2026-10-10T14:30` }
  }
  const ms = Date.parse(`${s}:00Z`)
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 16) !== s) return { error: `${field} is not a real date and time: ${s}` }
  return { value: s }
}
/**
 * Judge a Jamaica wall-clock time against the 24-hour rule as a fixed
 * instant. isPickupBookable parses what it is given and then shifts by
 * Jamaica's offset; a bare "YYYY-MM-DDTHH:MM" would parse in the BROWSER'S
 * zone, so the same input would be bookable in Los Angeles and refused in
 * Berlin. With the Z the parse is the same everywhere.
 */
const legBookable = (wallClock: string, now: Date) => isPickupBookable(`${wallClock}:00Z`, now)
/** Earliest bookable moment as Jamaica wall clock (UTC-5, no DST). */
const earliestJamaica = (now: Date) => new Date(leadTimeCutoff(now).getTime() - 5 * 3_600_000).toISOString().slice(0, 16)
const shiftWallClock = (wallClock: string, minutes: number) => new Date(Date.parse(`${wallClock}:00Z`) + minutes * 60_000).toISOString().slice(0, 16)
const leadText = (() => {
  const h = Math.floor(MIN_PICKUP_LEAD_MIN / 60)
  const m = MIN_PICKUP_LEAD_MIN % 60
  return `${h} hours${m ? ` ${m} minutes` : ''}`
})()
const PICKUP_RULE = `hotel pickup for the flight home is ${leadText} before the flight departs`
const PAYMENT_BUSY = 'A payment is being confirmed on this page. Wait for it to finish before changing the cart.'

/* ── Transfers ───────────────────────────────────────────────────────────── */

const OUT_OF_AREA = /kingston|port antonio|mandeville|portland|st\.? thomas|manchester/i
const outOfAreaHint = 'Kingston, Port Antonio and Mandeville are quoted by email at contact@mapltours.com and cannot be booked online.'
const otherAreaFallbacks = () =>
  DESTINATIONS.filter((d) => d.id.endsWith('-other')).map((d) => ({ id: d.id, name: d.name, area: ZONES[d.zone].label }))

/** "listed as closed until Q1 2027"; dropped once that year is behind us. */
function closedUntil(dest: TransferDestination | undefined, now: Date): { closedUntil?: string } {
  const s = dest?.reopens
  if (!s) return {}
  const year = Number((s.match(/\d{4}/) ?? [])[0])
  if (year && year < now.getUTCFullYear()) return {}
  return { closedUntil: `listed as closed until ${s}; confirm with the hotel before booking` }
}

/** A destination by id, or the best name match; ambiguity is returned, not guessed. */
function resolveDestination(raw: unknown):
  | { dest: TransferDestination }
  | { error: string; matches?: { id: string; name: string; area: string }[]; fallbacks?: { id: string; name: string; area: string }[] } {
  const q = str(raw)
  if (!q) return { error: 'destination is required: a hotel or villa name, or an id from find_transfer_destination.' }
  const byId = getDestination(q)
  if (byId) return { dest: byId }
  const results = searchDestinations(q, 6)
  if (results.length === 0) {
    if (OUT_OF_AREA.test(q)) return { error: `No hotel matches "${clip(q)}". ${outOfAreaHint}` }
    return {
      error: `No hotel matches "${clip(q)}". Try the town name, or use the "Other hotel or villa" id for the area; the fare is set by area.`,
      fallbacks: otherAreaFallbacks(),
    }
  }
  const exact = results.find((d) => d.name.toLowerCase() === q.toLowerCase())
  if (exact) return { dest: exact }
  const qWords = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  const strong = results.filter((d) => qWords.every((w) => d.name.toLowerCase().includes(w)))
  if (strong.length === 1) return { dest: strong[0] }
  if (results.length === 1) return { dest: results[0] }
  return {
    error: `"${clip(q)}" matches ${results.length} places; call again with one of these ids or exact names.`,
    matches: results.map((d) => ({ id: d.id, name: d.name, area: ZONES[d.zone].label })),
  }
}

function describeQuote(q: TransferQuote, fromAirport: boolean, origin: string, now: Date) {
  const dest = getDestination(q.destinationId)
  return {
    destination: q.destinationName,
    area: q.zoneLabel,
    driveTimeFromAirport: q.zoneDuration,
    tripType: q.tripType,
    direction: q.tripType === 'round_trip' ? 'airport_to_hotel_and_back' : fromAirport ? 'airport_to_hotel' : 'hotel_to_airport',
    passengers: q.passengers,
    priceUsd: q.priceUsd,
    priceCovers: q.passengers <= 4 ? 'the whole vehicle for up to 4 passengers, all-in, nothing added at checkout' : `all ${q.passengers} passengers, all-in`,
    roundTripDiscount: `${Math.round(ROUND_TRIP_DISCOUNT * 100)}% off two one-ways`,
    includes: ['private driver', 'meet and greet at MBJ arrivals with a name sign', 'flight tracking', 'driver name, vehicle and plate sent before pickup'],
    bookingNotice: `pickups need ${MIN_LEAD_TIME_HOURS} hours' notice`,
    departurePickupGuide: `${PICKUP_RULE}; give start_transfer_booking departure_flight_at and it works the pickup out`,
    cancellation: CANCELLATION_SUMMARY.short,
    ...closedUntil(dest, now),
    bookUrl: `${origin}/transfers?to=${q.destinationId}`,
  }
}

/** Which legs a ride has, from the STATED direction alone (mirrors lib/transfer-legs on the server). */
function legsFor(tripType: TransferTripType, fromAirport: boolean) {
  return {
    hasArrivalLeg: tripType === 'round_trip' || fromAirport,
    hasDepartureLeg: tripType === 'round_trip' || !fromAirport,
  }
}

/* ── Tours ───────────────────────────────────────────────────────────────── */

function tourRow(exp: Experience) {
  return {
    slug: getSlug(exp),
    title: exp.title,
    kind: exp.kind === 'package' ? 'package' : 'single',
    area: `${exp.destination}, ${exp.parish}`,
    duration: exp.duration,
    fromPriceUsd: exp.price,
    priceUnit: priceUnitLabel(exp.pricing),
  }
}

function tourSummary(exp: Experience, origin: string) {
  return { ...tourRow(exp), url: `${origin}/experience/${getSlug(exp)}` }
}

/** The one number the traveller pays for this party, and what it covers. */
function priceForParty(exp: Experience, guests: number) {
  const p = exp.pricing
  const total = tourPrice(p, guests)
  const per = perTravelerPrice(p, guests)
  const covers =
    p.mode === 'group'
      ? guests > p.tierMax
        ? `total for ${guests} guests: the flat rate covers up to ${p.tierMax}, extra guests at a per-person rate`
        : `total for ${guests} guests, a flat rate that covers up to ${p.tierMax}`
      : `total for ${guests} guests`
  return { guests, priceUsd: total, covers, ...(per !== null ? { perGuestUsd: per } : {}) }
}

function resolveTour(raw: unknown): { exp: Experience } | { error: string; matches?: { slug: string; title: string }[] } {
  const q = str(raw)
  if (!q) return { error: 'tour is required: a tour title or slug from list_tours.' }
  const bySlug = getExperienceBySlug(q.toLowerCase())
  if (bySlug) return { exp: bySlug }
  const lc = q.toLowerCase()
  const exact = experiences.find((e) => e.title.toLowerCase() === lc)
  if (exact) return { exp: exact }
  const ws = words(q)
  if (ws.length === 0) return { error: `"${clip(q)}" is too general. Use list_tours to see the ${experiences.length} on offer.` }
  // "Ricks Cafe" has to find "Rick's Cafe": match the spaced and the squashed title.
  const has = (e: Experience, w: string) => e.title.toLowerCase().includes(w) || squash(e.title).includes(squash(w))
  const hits = experiences.filter((e) => ws.every((w) => has(e, w)))
  if (hits.length === 1) return { exp: hits[0] }
  // "Rick" matches both the tour and the package that contains it; the tour whose title STARTS with the query wins.
  const phrase = ws.join(' ')
  const starts = hits.filter((e) => e.title.toLowerCase().startsWith(phrase) || squash(e.title).startsWith(squash(phrase)))
  if (starts.length === 1) return { exp: starts[0] }
  const loose = hits.length ? hits : experiences.filter((e) => ws.some((w) => has(e, w)))
  if (loose.length === 0) return { error: `No tour matches "${clip(q)}". Use list_tours to see the ${experiences.length} on offer.` }
  if (loose.length === 1) return { exp: loose[0] }
  return { error: `"${clip(q)}" matches ${loose.length} tours; call again with one slug.`, matches: loose.slice(0, 8).map((e) => ({ slug: getSlug(e), title: e.title })) }
}

/* ── The tools ───────────────────────────────────────────────────────────── */

const LIST_MAX = 12

export function buildWebMcpTools(actions: WebMcpActions): WebMcpTool[] {
  const now = actions.now ?? (() => new Date())
  const origin = actions.origin.replace(/\/$/, '')
  const busy = () => actions.paymentInFlight?.() === true

  const find_transfer_destination: WebMcpTool = {
    name: 'find_transfer_destination',
    description: `Find hotels and villas MAPL Tours drives to from Sangster International Airport (MBJ), Montego Bay, Jamaica. Returns up to 8 matches with the id to use in get_transfer_quote, or the "Other hotel or villa" id for each area when nothing matches. Covers ${DESTINATIONS.length} properties from Montego Bay to Negril, Ocho Rios, Falmouth and Lucea. Kingston, Port Antonio and Mandeville are quoted by email instead.`,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Hotel, villa, resort or town name, e.g. "Sandals Negril" or "Ocho Rios"' } },
      required: ['query'],
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Input) => {
      const q = str(input.query)
      if (!q) return { error: 'query is required' }
      const results = searchDestinations(q, 8)
      if (results.length === 0) {
        if (OUT_OF_AREA.test(q)) return { matches: [], hint: outOfAreaHint }
        return { matches: [], hint: 'No match. Try the town name, or use the "Other hotel or villa" id for the area; the fare is set by area.', fallbacks: otherAreaFallbacks() }
      }
      const t = now()
      return { matches: results.map((d) => ({ id: d.id, name: d.name, area: ZONES[d.zone].label, driveTimeFromAirport: ZONES[d.zone].duration, ...closedUntil(d, t) })) }
    },
  }

  const get_transfer_quote: WebMcpTool = {
    name: 'get_transfer_quote',
    description: 'Exact all-in price in USD for a private airport transfer between Sangster International Airport (MBJ) and a hotel or villa, per vehicle for up to 4 passengers (5 to 7 priced per person). Round trip or one way, either direction. Also says how long before the flight home the hotel pickup should be. Use before start_transfer_booking. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Hotel or villa name, or an id from find_transfer_destination' },
        trip_type: { type: 'string', enum: ['round_trip', 'one_way'], description: 'Default round_trip (airport to hotel and back)' },
        passengers: { type: 'integer', minimum: 1, maximum: MAX_TRANSFER_PASSENGERS, description: 'Number of passengers, 1 to 7. Default 2' },
        direction: { type: 'string', enum: ['airport_to_hotel', 'hotel_to_airport'], description: 'One-way only. Default airport_to_hotel' },
      },
      required: ['destination'],
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Input) => {
      const r = resolveDestination(input.destination)
      if ('error' in r) return r
      const tripType = tripTypeOf(input.trip_type) ?? 'round_trip'
      if (tripType === 'invalid') return { error: 'trip_type must be round_trip or one_way' }
      const passengers = Math.round(num(input.passengers, 2))
      if (passengers < 1 || passengers > MAX_TRANSFER_PASSENGERS) return { error: `passengers must be between 1 and ${MAX_TRANSFER_PASSENGERS}; larger groups are quoted by email at contact@mapltours.com` }
      const dir = directionOf(input.direction)
      if (dir === 'invalid') return { error: 'direction must be airport_to_hotel or hotel_to_airport' }
      const quote = buildQuote(r.dest.id, tripType, passengers)
      if (!quote) return { error: 'This destination is quoted individually. Email contact@mapltours.com with the dates.' }
      return describeQuote(quote, tripType === 'round_trip' || dir !== 'hotel_to_airport', origin, now())
    },
  }

  const check_transfer_timing: WebMcpTool = {
    name: 'check_transfer_timing',
    description: `Check whether a pickup can be booked online. Bookings need ${MIN_LEAD_TIME_HOURS} hours' notice in Jamaica time. Give arrival_at (flight lands at MBJ) and, for the flight home, departure_at (hotel pickup) or departure_flight_at (flight departs; the pickup is worked out from it), each as "YYYY-MM-DDTHH:MM" Jamaica local time with no timezone suffix. Returns whether each leg is bookable and the earliest bookable time. Read-only.`,
    inputSchema: {
      type: 'object',
      properties: {
        arrival_at: { type: 'string', description: 'Flight arrival at MBJ, "YYYY-MM-DDTHH:MM" Jamaica time' },
        departure_at: { type: 'string', description: 'Hotel pickup for the flight home, "YYYY-MM-DDTHH:MM" Jamaica time' },
        departure_flight_at: { type: 'string', description: `Flight home departs MBJ, "YYYY-MM-DDTHH:MM" Jamaica time; the hotel pickup is ${leadText} earlier` },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Input) => {
      const a = legTime('arrival_at', input.arrival_at)
      if (a.error) return { error: a.error }
      const d = legTime('departure_at', input.departure_at)
      if (d.error) return { error: d.error }
      const f = legTime('departure_flight_at', input.departure_flight_at)
      if (f.error) return { error: f.error }
      const recommended = f.value ? shiftWallClock(f.value, -MIN_PICKUP_LEAD_MIN) : undefined
      const departureAt = d.value ?? recommended
      if (!a.value && !departureAt) return { error: 'give arrival_at, departure_at or departure_flight_at' }
      const t = now()
      const legs: Record<string, unknown> = {}
      if (a.value) legs.arrival = { at: a.value, bookable: legBookable(a.value, t) }
      if (departureAt) {
        legs.departure = {
          at: departureAt,
          bookable: legBookable(departureAt, t),
          ...(recommended ? { recommendedHotelPickup: recommended, rule: PICKUP_RULE } : {}),
          ...(recommended && d.value && d.value > recommended ? { warning: `departure_at leaves less than ${leadText} before the flight; ${recommended} is safer` } : {}),
        }
      }
      const ok = [a.value, departureAt].filter((v): v is string => !!v).every((v) => legBookable(v, t))
      return {
        bookable: ok,
        ...legs,
        earliestBookableJamaicaTime: earliestJamaica(t),
        ...(ok ? {} : { alternative: 'For a pickup sooner than that, the traveller can email contact@mapltours.com; it cannot be booked online.' }),
      }
    },
  }

  const start_transfer_booking: WebMcpTool = {
    name: 'start_transfer_booking',
    description: 'Put an airport transfer in the cart and open the checkout page with the ride and flight details filled in. Does NOT pay: the traveller reviews and pays by card or Apple Pay themselves. A one-way needs direction: airport_to_hotel takes arrival_at and arrival_flight; hotel_to_airport takes departure_at (or departure_flight_at) and departure_flight; a round trip takes both. Confirm hotel, trip type, passengers and price with the traveller first (get_transfer_quote).',
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Hotel or villa name, or id from find_transfer_destination' },
        trip_type: { type: 'string', enum: ['round_trip', 'one_way'] },
        passengers: { type: 'integer', minimum: 1, maximum: MAX_TRANSFER_PASSENGERS },
        direction: { type: 'string', enum: ['airport_to_hotel', 'hotel_to_airport'], description: 'Required for a one-way' },
        arrival_at: { type: 'string', description: 'Flight arrival at MBJ, "YYYY-MM-DDTHH:MM" Jamaica time' },
        arrival_flight: { type: 'string', description: 'Arrival flight number, e.g. AA1234' },
        departure_at: { type: 'string', description: `Hotel pickup for the flight home, "YYYY-MM-DDTHH:MM" Jamaica time. If you only know the flight time, pass departure_flight_at instead` },
        departure_flight_at: { type: 'string', description: `Flight home departs MBJ, "YYYY-MM-DDTHH:MM" Jamaica time; pickup is set ${leadText} earlier` },
        departure_flight: { type: 'string', description: 'Departure flight number' },
      },
      required: ['destination', 'trip_type', 'passengers'],
    },
    annotations: { consequentialHint: true },
    execute: async (input: Input) => {
      if (busy()) return { error: PAYMENT_BUSY }
      const r = resolveDestination(input.destination)
      if ('error' in r) return r
      const tripType = tripTypeOf(input.trip_type)
      if (tripType === null) return { error: 'trip_type is required: round_trip or one_way' }
      if (tripType === 'invalid') return { error: 'trip_type must be round_trip or one_way' }
      const passengers = Math.round(num(input.passengers, 0))
      if (passengers < 1 || passengers > MAX_TRANSFER_PASSENGERS) return { error: `passengers must be between 1 and ${MAX_TRANSFER_PASSENGERS}` }
      const dir = directionOf(input.direction)
      if (dir === 'invalid') return { error: 'direction must be airport_to_hotel or hotel_to_airport' }
      if (tripType === 'one_way' && dir === null) return { error: 'direction is required for a one-way: airport_to_hotel (an arrival) or hotel_to_airport (a departure)' }
      const fromAirport = tripType === 'round_trip' || dir === 'airport_to_hotel'

      const a = legTime('arrival_at', input.arrival_at)
      if (a.error) return { error: a.error }
      const d = legTime('departure_at', input.departure_at)
      if (d.error) return { error: d.error }
      const f = legTime('departure_flight_at', input.departure_flight_at)
      if (f.error) return { error: f.error }
      const arrivalFlight = flightNo(input.arrival_flight)
      const departureFlight = flightNo(input.departure_flight)
      const recommended = f.value ? shiftWallClock(f.value, -MIN_PICKUP_LEAD_MIN) : undefined
      const departureAt = d.value ?? recommended

      // Only the legs the stated direction allows. A stray leg is refused,
      // not dropped: the server refuses such a cart and the form cannot show it.
      const legs = legsFor(tripType, fromAirport)
      if (!legs.hasArrivalLeg && (a.value || arrivalFlight)) {
        return { error: 'A hotel_to_airport one-way has no arrival leg. Give departure_at (hotel pickup time) or departure_flight_at, and departure_flight; or set direction to airport_to_hotel, or trip_type to round_trip.' }
      }
      if (!legs.hasDepartureLeg && (departureAt || departureFlight)) {
        return { error: 'An airport_to_hotel one-way has no departure leg. Give arrival_at and arrival_flight; or set direction to hotel_to_airport, or trip_type to round_trip.' }
      }
      if (tripType === 'round_trip' && a.value && departureAt && departureAt <= a.value) {
        return { error: 'departure_at (hotel pickup for the flight home) must be after arrival_at' }
      }
      const t = now()
      const scheduled = [a.value, departureAt].filter((v): v is string => !!v)
      if (scheduled.some((v) => !legBookable(v, t))) {
        return { error: `That pickup is inside the ${MIN_LEAD_TIME_HOURS}-hour booking window and cannot be booked online. The earliest bookable time is ${earliestJamaica(t)} Jamaica time; sooner than that, the traveller can email contact@mapltours.com.` }
      }
      const quote = buildQuote(r.dest.id, tripType, passengers)
      if (!quote) return { error: 'This destination is quoted individually. Email contact@mapltours.com.' }

      const id = actions.addTransferQuote(quote, { fromAirport })
      const patch: Parameters<WebMcpActions['updateTransferItem']>[1] = {}
      if (a.value) patch.arrivalAt = a.value
      if (arrivalFlight) patch.arrivalFlight = arrivalFlight
      if (departureAt) patch.departureAt = departureAt
      if (departureFlight) patch.departureFlight = departureFlight
      if (Object.keys(patch).length) actions.updateTransferItem(id, patch)
      actions.onBookingStarted?.('start_transfer_booking')
      actions.navigate('/transfers/checkout')
      return {
        status: 'checkout_opened',
        url: `${origin}/transfers/checkout`,
        ride: describeQuote(quote, fromAirport, origin, t),
        prefilled: Object.keys(patch),
        ...(recommended && !d.value ? { departurePickupSet: `${departureAt}, ${leadText} before the ${f.value} flight` } : {}),
        ...(recommended && d.value && d.value > recommended ? { warning: `departure_at leaves less than ${leadText} before the flight; ${recommended} is safer` } : {}),
        nextStep: 'The traveller checks the ride, adds name, email, phone and any missing flight details, then pays on this page. Nothing is charged until they complete payment.',
      }
    },
  }

  const list_tours: WebMcpTool = {
    name: 'list_tours',
    description: `List the ${experiences.length} private tours and day packages MAPL Tours runs in Jamaica (Dunn's River, Blue Hole, bamboo rafting, Rick's Cafe, zipline, ATV, horseback and more). fromPriceUsd is the price for the smallest party; priceUnit says whether it covers a party of up to N people or one person. Use get_tour with guests for the exact total. Hotel pickup included. Optional keyword or area filter; returns up to ${LIST_MAX} rows. Read-only.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword, e.g. "waterfall", "rafting", "sunset"' },
        area: { type: 'string', description: 'Town or area, e.g. "Ocho Rios", "Negril", "Montego Bay"' },
      },
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Input) => {
      const ws = words(str(input.query))
      const area = str(input.area).toLowerCase()
      const hay = (e: Experience) => `${e.title} ${e.description} ${e.tags.join(' ')} ${e.category}`.toLowerCase()
      const inArea = (e: Experience) => !area || `${e.destination} ${e.parish}`.toLowerCase().includes(area)
      // Every content word first; any word only when that finds nothing.
      let hits = experiences.filter((e) => inArea(e) && ws.every((w) => hay(e).includes(w)))
      if (hits.length === 0 && ws.length) hits = experiences.filter((e) => inArea(e) && ws.some((w) => hay(e).includes(w)))
      return {
        count: hits.length,
        urlPrefix: `${origin}/experience/`,
        tours: hits.slice(0, LIST_MAX).map(tourRow),
        ...(hits.length > LIST_MAX ? { more: true, hint: `${hits.length - LIST_MAX} more; filter by query or area` } : {}),
      }
    },
  }

  const get_tour: WebMcpTool = {
    name: 'get_tour',
    description: 'Details for one tour: what it includes, ages, fitness, what to bring, the exact total for a party size, and the earliest bookable date. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        tour: { type: 'string', description: 'Tour title or slug from list_tours' },
        guests: { type: 'integer', minimum: 1, maximum: 12, description: 'Party size to price, default 2' },
      },
      required: ['tour'],
    },
    annotations: { readOnlyHint: true },
    execute: async (input: Input) => {
      const r = resolveTour(input.tour)
      if ('error' in r) return r
      const e = r.exp
      const guests = Math.max(1, Math.min(12, Math.round(num(input.guests, 2))))
      const few = (arr?: string[]) => (arr ?? []).slice(0, 6)
      const earliest = earliestBookableExperienceDate(now())
      return {
        ...tourSummary(e, origin),
        summary: e.description,
        about: (e.about ?? '').slice(0, 400),
        priceForParty: priceForParty(e, guests),
        included: few(e.included),
        notIncluded: few(e.notIncluded),
        ages: e.ages ?? null,
        fitness: (e.fitness ?? '').slice(0, 240),
        bring: few(e.bring),
        pickup: e.meetingPoint ?? 'Hotel pickup',
        earliestDate: earliest,
        bookingNotice: `${MIN_LEAD_TIME_HOURS} hours' notice counted from midnight Jamaica time, so the earliest date is ${earliest}`,
        cancellation: CANCELLATION_SUMMARY.short,
      }
    },
  }

  const start_tour_booking: WebMcpTool = {
    name: 'start_tour_booking',
    description: 'Put a tour or day package in the cart for a date and party size and open the checkout page. Does NOT pay: the traveller adds contact details, accepts the activity waiver and pays by card or Apple Pay. The date and party size apply to every tour in the cart (one day, one party); adding a package removes single tours and vice versa, and the result says so. Confirm tour, date, guests and price with the traveller first (get_tour).',
    inputSchema: {
      type: 'object',
      properties: {
        tour: { type: 'string', description: 'Tour title or slug from list_tours' },
        guests: { type: 'integer', minimum: 1, maximum: 12 },
        date: { type: 'string', description: `Tour date "YYYY-MM-DD" (Jamaica); needs ${MIN_LEAD_TIME_HOURS} hours' notice, get_tour gives the earliest date` },
        pickup_hotel: { type: 'string', description: 'Where the traveller is staying, for the hotel pickup' },
      },
      required: ['tour', 'guests'],
    },
    annotations: { consequentialHint: true },
    execute: async (input: Input) => {
      if (busy()) return { error: PAYMENT_BUSY }
      const r = resolveTour(input.tour)
      if ('error' in r) return r
      const guests = Math.round(num(input.guests, 0))
      if (guests < 1 || guests > 12) return { error: 'guests must be between 1 and 12' }
      const date = str(input.date) || undefined
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date must be "YYYY-MM-DD"' }
      const t = now()
      const earliest = earliestBookableExperienceDate(t)
      if (date && !isExperienceDateBookable(date, t)) {
        return { error: `Tours need ${MIN_LEAD_TIME_HOURS} hours' notice counted from midnight Jamaica time; the earliest date is ${earliest}.` }
      }
      const res = actions.addTour(r.exp, guests, date, clip(str(input.pickup_hotel), 120) || undefined)
      if (!res.added) {
        return { error: `${res.reason ?? `${r.exp.title} could not be added to the day already in the cart.`} Remove the other tour on the checkout page first, or book it separately.` }
      }
      actions.onBookingStarted?.('start_tour_booking')
      actions.navigate('/checkout')
      return {
        status: 'checkout_opened',
        url: `${origin}/checkout`,
        tour: tourSummary(r.exp, origin),
        priceForParty: priceForParty(r.exp, guests),
        date: date ?? `to be chosen on the page (earliest ${earliest})`,
        ...(res.replaced?.length ? { replaced: res.replaced, replacedWhy: 'A day is either one package or self-built single tours, and no attraction can be on it twice; those were removed.' } : {}),
        ...(res.sharedWith?.length ? { sharedWith: res.sharedWith, sharedWhy: 'One day, one party: every tour in the cart now has this date and party size.' } : {}),
        nextStep: 'The traveller confirms the date and pickup, adds contact details, accepts the activity waiver and pays on this page. Nothing is charged until they complete payment.',
      }
    },
  }

  return [find_transfer_destination, get_transfer_quote, check_transfer_timing, start_transfer_booking, list_tours, get_tour, start_tour_booking]
}

/** Minimal shape of document.modelContext we rely on (Chrome 149+). */
export interface ModelContextLike {
  registerTool: (tool: { name: string; description: string; inputSchema: unknown; annotations?: unknown; execute: (input: Record<string, unknown>) => Promise<unknown> }, options?: { signal?: AbortSignal }) => unknown
}

export function registerWebMcpTools(mc: ModelContextLike, tools: WebMcpTool[], signal?: AbortSignal): number {
  let n = 0
  for (const t of tools) {
    try {
      // Every result goes back as an object; a thrown error would reach the agent only as "invocation failed".
      const execute = async (input: Record<string, unknown>) => {
        try { return await t.execute(input ?? {}) } catch (e) { return { error: e instanceof Error ? e.message : 'unexpected error' } }
      }
      const reg = mc.registerTool({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations, execute }, signal ? { signal } : undefined)
      // registerTool returns a promise in Chrome; it rejects when the signal aborts. Swallow that, it is not a failure.
      if (reg && typeof (reg as Promise<unknown>).catch === 'function') (reg as Promise<unknown>).catch(() => {})
      n++
    } catch { /* a bad descriptor must not break the rest */ }
  }
  return n
}
