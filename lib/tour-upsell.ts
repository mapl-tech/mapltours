import { driveMinutes } from './day-route'
import { experiences, tourPrice, slugify, zoneSells, type Experience, type TourPricing } from './experiences'
import { zoneOfPickup } from './tour-zone-of'
import { EATS, type Eat } from './eats'
import { DESTINATIONS } from './airport-transfers'

/**
 * When to offer a tour to someone who has booked only a transfer, and which
 * tours to offer them.
 *
 * Pure functions, no I/O, so the daily job and any manual resend agree on one
 * rule and every boundary is unit-testable (tests/unit/tour-upsell.spec.ts).
 *
 * A generic "book a tour" mail is worse than no mail. A guest on the Negril
 * cliffs does not want Dunn's River proposed to them, a family travelling with
 * a three-year-old does not want an ATV that takes riders from 8, and a guest
 * who wrote "folding wheelchair" in their booking does not want a robot
 * pitching cliff jumps. Everything needed to do better is on the booking: the
 * hotel, the dates, the party size and the note the guest left at checkout.
 * So the offer is the handful of tours that really fit THIS trip, priced for
 * the party they booked. A guest whose note mentions an accessibility or care
 * need, or a baby, gets no tour email at all (owner, Nov 10 2026).
 */

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000

/** Jamaica is UTC-5 year round and does not observe daylight saving. */
const JAMAICA_UTC_OFFSET_HOURS = -5

/**
 * Aim to land this far before arrival. Far enough out that the guest is still
 * planning the trip, close enough that it is about THIS holiday.
 */
export const UPSELL_TARGET_LEAD_DAYS = 14

/**
 * Never inside this. Tours need notice to staff, so an offer arriving the
 * night before sells something the checkout may refuse.
 */
export const UPSELL_MIN_LEAD_DAYS = 2

/**
 * Never within this of the booking itself, so the offer never reads as an
 * upsell bolted to a receipt.
 */
export const UPSELL_SETTLE_DAYS = 3

/**
 * Fallback reach when the tour has no door-to-door figure for the guest's
 * area: the day planner's one-way drive estimate.
 */
export const UPSELL_MAX_DRIVE_MIN = 90

/**
 * The longest outing worth proposing, door to door. Past this the tour is the
 * whole day and most of the evening (Dunn's River from Negril is 8 to 10).
 */
export const UPSELL_MAX_DAY_HOURS = 8

/** Three. Enough to show range, few enough to decide between. */
export const UPSELL_PICKS = 3

/** Party sizes the tour checkout accepts (lib/agent/booking-link MAX_TOUR_GUESTS). */
export const UPSELL_MAX_PARTY = 12

/** The dispatch key that records the offer, so it can only happen once. */
export const UPSELL_STAMP_KEY = 'tour_upsell_sent'

/**
 * PostgREST path for excluding stamped rows server-side, derived from the key
 * so the SQL filter and the JS rule can never name two different things.
 */
export const UPSELL_STAMP_FILTER = `dispatch->${UPSELL_STAMP_KEY}`

/** No offer within this many days of a trip tip to the same address (lib/trip-tips gives the upsell the same courtesy). */
export const UPSELL_TIP_GAP_DAYS = 7

export interface UpsellItem {
  item_type?: 'experience' | 'transfer' | null
  hotel?: string | null
  destination?: string | null
  passengers?: number | null
  travelers?: number | null
  /** Jamaica wall-clock with a Z suffix, per the lib/dispatch convention. */
  arrival_at?: string | null
  departure_at?: string | null
}

export interface UpsellBooking {
  id: string
  status: string
  email?: string | null
  first_name?: string | null
  booking_type?: 'tour' | 'transfer' | null
  created_at?: string | null
  refund_state?: string | null
  /** What the guest wrote in "Anything we should know?" at checkout. */
  special_requests?: string | null
  dispatch?: Record<string, unknown> | null
  booking_items?: UpsellItem[] | null
}

/* ── The trip ─────────────────────────────────────────────────────────────── */

/**
 * A leg timestamp is stored as Jamaica wall-clock with a Z suffix, so it needs
 * the offset applied to become a real instant (same rule as legInstantMs in
 * lib/dispatch, duplicated so this module stays clear of the server-only
 * boundary).
 */
function legInstantMs(iso: string): number {
  return Date.parse(iso) - JAMAICA_UTC_OFFSET_HOURS * MS_PER_HOUR
}

function legTimes(booking: UpsellBooking, key: 'arrival_at' | 'departure_at'): string[] {
  return (booking.booking_items ?? [])
    .map((i) => i[key])
    .filter((v): v is string => typeof v === 'string' && v.length > 0 && Number.isFinite(Date.parse(v)))
}

/** The transfer leg that lands them, i.e. the start of the holiday. */
export function arrivalMs(booking: UpsellBooking): number | null {
  const t = legTimes(booking, 'arrival_at').map(legInstantMs)
  return t.length ? Math.min(...t) : null
}

/** The leg that takes them home, or null for a one way. */
export function departureMs(booking: UpsellBooking): number | null {
  const t = legTimes(booking, 'departure_at').map(legInstantMs)
  return t.length ? Math.max(...t) : null
}

/**
 * Whole days with nothing else in them. The arrival and departure days are
 * both eaten by a flight and a transfer, so neither counts: the count is the
 * calendar days strictly between the landing day and the day they leave, in
 * Jamaica. It used to be elapsed time in whole days minus one, which lost a
 * day whenever the ride home was earlier in the day than the landing (most
 * stays: land 1 pm on the 25th, picked up 10 am on the 28th is two free days,
 * the 26th and 27th, not one). Same leg choice as firstFreeDay.
 */
export function freeDays(booking: UpsellBooking): number | null {
  const arrivals = legTimes(booking, 'arrival_at').sort()
  const departures = legTimes(booking, 'departure_at').sort()
  if (!arrivals.length || !departures.length) return null
  const landing = arrivals[0].slice(0, 10)
  const home = departures[departures.length - 1].slice(0, 10)
  const between = Math.round((Date.parse(`${home}T12:00:00Z`) - Date.parse(`${landing}T12:00:00Z`)) / MS_PER_DAY) - 1
  return Math.max(0, between)
}

/** "YYYY-MM-DD" plus n days, as calendar arithmetic (no time zone involved). */
function addDays(day: string, n: number): string {
  const ms = Date.parse(`${day}T12:00:00Z`) + n * MS_PER_DAY
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The day the email suggests for a tour: the first full day after landing, in
 * Jamaica, or the landing day itself when the trip is too short to have one.
 * The checkout lets the guest move it, and the email says so.
 */
export function firstFreeDay(booking: UpsellBooking): string | null {
  const arrivals = legTimes(booking, 'arrival_at').sort()
  if (!arrivals.length) return null
  const landing = arrivals[0].slice(0, 10)
  const next = addDays(landing, 1)
  const departures = legTimes(booking, 'departure_at').sort()
  const home = departures.length ? departures[departures.length - 1].slice(0, 10) : null
  return home && next >= home ? landing : next
}

/** The hotel they are staying at, from whichever leg names one. */
export function stayHotel(booking: UpsellBooking): string | null {
  for (const i of booking.booking_items ?? []) {
    const h = i.hotel ?? i.destination
    if (typeof h === 'string' && h.trim()) return h.trim()
  }
  return null
}

/** How many people the transfer was booked for. */
export function partySize(booking: UpsellBooking): number {
  for (const i of booking.booking_items ?? []) {
    const n = i.passengers ?? i.travelers
    if (typeof n === 'number' && n > 0) return Math.floor(n)
  }
  return 1
}

/**
 * The resort area the tours' door-to-door times are written for (lib/experiences
 * `fromHotel`): Negril, Montego Bay, Rose Hall, Ocho Rios or Runaway Bay, or
 * null where no tour states a time (Falmouth, Lucea and Hanover).
 */
export type StayArea = 'Negril' | 'Montego Bay' | 'Rose Hall' | 'Ocho Rios' | 'Runaway Bay'

export function stayArea(hotel: string | null): StayArea | null {
  if (!hotel) return null
  if (/negril/i.test(hotel)) return 'Negril'
  if (/rose hall/i.test(hotel)) return 'Rose Hall'
  if (/runaway bay/i.test(hotel)) return 'Runaway Bay'
  if (/ocho rios|\bochi\b/i.test(hotel)) return 'Ocho Rios'
  if (/montego bay|hip strip/i.test(hotel)) return 'Montego Bay'
  const dest = DESTINATIONS.find((d) => d.name.toLowerCase() === hotel.toLowerCase())
  if (!dest) return null
  if (dest.zone === 'A') return 'Montego Bay'
  if (dest.zone === 'E' && /st\.? ann/i.test(dest.parish)) return 'Ocho Rios'
  return null
}

/**
 * The place name the email uses for where they are staying: the area when we
 * know it, else the town written in the hotel's name ("Riu Palace Aquarelle
 * (Falmouth)", "Grand Palladium Jamaica, Lucea"), else the hotel itself.
 */
export function stayTown(hotel: string): string {
  const area = stayArea(hotel)
  if (area) return area
  const paren = hotel.match(/\(([^)]+)\)\s*$/)
  if (paren) return paren[1].trim()
  const comma = hotel.split(',').map((s) => s.trim()).filter(Boolean)
  if (comma.length > 1) return comma[comma.length - 1]
  return hotel
}

/* ── Who the party is ─────────────────────────────────────────────────────── */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
}

/** Ages written as "3 year old", "three-year-old", "2yo": only ages the guest stated. */
function statedAges(note: string): number[] {
  const ages: number[] = []
  const word = Object.keys(NUMBER_WORDS).join('|')
  // Array.from, not for...of: the project's TypeScript target predates iterating a matchAll.
  Array.from(note.matchAll(new RegExp(`\\b(\\d{1,2}|${word})[\\s-]*(?:years?|yrs?)[\\s-]*old\\b`, 'gi'))).forEach((m) => {
    const v = m[1].toLowerCase()
    ages.push(/^\d+$/.test(v) ? Number(v) : NUMBER_WORDS[v])
  })
  Array.from(note.matchAll(/\b(\d{1,2})\s*(?:yo|y\/o|y\.o\.)(?![a-z])/gi)).forEach((m) => ages.push(Number(m[1])))
  return ages
}

/**
 * The youngest child the guest's note mentions, or null when it mentions none.
 *
 * Read conservatively, because the cost of a wrong guess is a family offered
 * a tour their child cannot do: "our three year old" is 3, "a 2yo" is 2, a
 * toddler 2, a car or child seat 3, a booster 5, and a child named without an
 * age ("our son", "the kids") is taken as 5. A baby never gets this far:
 * hasBaby stops the email first.
 */
export function youngestChildAge(note: string | null | undefined): number | null {
  if (!note) return null
  const ages = statedAges(note)
  if (/\b\d{1,2}[\s-]*months?[\s-]*old\b|\b(?:baby|babies|infants?|newborns?)\b/i.test(note)) ages.push(0)
  if (/\btoddlers?\b/i.test(note)) ages.push(2)
  if (/\b(?:car|child|baby|infant)[\s-]*seats?\b/i.test(note)) ages.push(3)
  if (/\bbooster\b/i.test(note)) ages.push(5)
  if (!ages.length && /\b(?:kids?|child|children|son|sons|daughters?|grand(?:child|children|kids?|sons?|daughters?))\b/i.test(note)) ages.push(5)
  return ages.length ? Math.min(...ages) : null
}

/**
 * The party includes a baby, so no tour email goes out (owner, Nov 10 2026:
 * "do not send emails to anyone with accessibility issues or babies").
 *
 * A baby is a stated age of 1 or under, anything in months, or the words
 * baby, infant, newborn, bassinet, crib, pram, a baby or infant seat. A car
 * seat, child seat, stroller or cot with NO age stated could be for a baby,
 * so it counts as one too; with a stated age of 2 or more it does not ("a
 * child seat for our three year old" is a toddler, and still gets the email,
 * with only the tours a 3-year-old can do).
 */
export function hasBaby(note: string | null | undefined): boolean {
  if (!note) return false
  if (/\b(?:baby|babies|infants?|newborns?|bassinets?|cribs?|prams?)\b|\b\d{1,2}[\s-]*months?[\s-]*old\b|\b(?:baby|infant)[\s-]*seats?\b/i.test(note)) return true
  const stated = statedAges(note)
  if (stated.some((a) => a <= 1)) return true
  return !stated.length && /\b(?:car|child)[\s-]*seats?\b|\bstrollers?\b|\bcots?\b/i.test(note)
}

/**
 * The note mentions an accessibility or care need (owner, Nov 10 2026: no
 * email to anyone with accessibility issues): a wheelchair, walker, cane or
 * other mobility aid, sight or hearing loss, a service animal, autism or
 * special needs, and also pregnancy or a medical condition, because every
 * tour lists fitness limits these guests should not be sold past by a robot.
 * Matched generously on purpose: a false match costs one email, a missed one
 * sends a cliff jump to someone in a wheelchair.
 */
export function accessibilityNeed(note: string | null | undefined): boolean {
  if (!note) return false
  return /wheel\s*-?chairs?|mobility|walkers?\b|rollator|scooter|crutch|\bcanes?\b|disab|handicap|accessib|special needs|can'?t walk|cannot walk|unable to walk|(?:difficulty|trouble) walking|oxygen|amputee|prosthe|\bblind\b|visually impaired|vision impair|low vision|\bdeaf\b|hard of hearing|hearing (?:impair|loss|aid)|sign language|guide dog|service (?:dog|animal)|autis|pregnan|medical|dialysis|seizure|heart condition|(?:knee|hip) replacement/i.test(note)
}

/**
 * The youngest age a tour takes, read from its `ages` line: "All ages" is 0,
 * "6 and up" is 6, "16+ to drive, 8+ to ride" is 8 (a child can ride).
 * Unknown is null, and a party with a child is never offered an unknown.
 */
export function minAgeOf(ages: string | null | undefined): number | null {
  if (!ages) return null
  if (/all ages/i.test(ages)) return 0
  const found = Array.from(ages.matchAll(/(\d{1,2})\s*(?:\+|and up|and over|or older)/gi)).map((m) => Number(m[1]))
  return found.length ? Math.min(...found) : null
}

/* ── Prices ───────────────────────────────────────────────────────────────── */

/**
 * True when the rate card makes this party pay a sudden multiple of what one
 * fewer person pays per head, the 3-to-4 step that triples six tours
 * (Rafting $128 for three, $459 for four). The owner and the operator have not
 * confirmed those figures, so no tour is offered at a price that rests on one.
 * Real per-person and per-group pricing never trips it: a head never costs
 * more because the party grew. When the rate card is settled the guard passes
 * by itself.
 */
export function priceJumps(pricing: TourPricing, party: number): boolean {
  for (let n = 2; n <= party; n++) {
    const prev = tourPrice(pricing, n - 1) / (n - 1)
    const cur = tourPrice(pricing, n) / n
    if (cur > prev * 1.25) return true
  }
  return false
}

/**
 * True when the jump appears at ANY party size the email could quote, not
 * only up to this guest's party. The clear kayak (Nov 12 2026) showed why: its
 * 3-to-4 jump meant the "party of up to 3" rate was really per person, so a
 * couple was quoted $230 for a $360 shoot. A tour whose rate card jumps is not
 * offered to anyone until the operator confirms it; fixing the catalog lifts
 * this by itself.
 */
export function rateCardUnsettled(pricing: TourPricing): boolean {
  return priceJumps(pricing, UPSELL_MAX_PARTY)
}

/* ── How long the day takes ───────────────────────────────────────────────── */

export interface DoorToDoor {
  lo: number
  hi: number
}

const AREA_WORDS: Record<StayArea, RegExp> = {
  'Negril': /negril/i,
  'Montego Bay': /montego bay|hip strip/i,
  'Rose Hall': /rose hall/i,
  'Ocho Rios': /ocho rios/i,
  'Runaway Bay': /runaway bay/i,
}

/**
 * The outing's door-to-door hours for a guest staying in `area`, read from the
 * tour's researched `fromHotel` line ("Allow 3.5 to 4 hours from Negril, 6 to
 * 7 from Montego Bay and Rose Hall ..."), or null when the line gives no
 * number for that area. Parenthetical asides are not read: they qualify the
 * clause before them and are too loose to quote.
 */
export function doorToDoorHours(fromHotel: string | null | undefined, area: StayArea | null): DoorToDoor | null {
  if (!fromHotel || !area) return null
  const words = AREA_WORDS[area]
  const text = fromHotel.replace(/\([^)]*\)/g, ' ')
  const num = '(\\d+(?:\\.\\d+)?)'
  const range = `${num}(?:\\s+to\\s+${num})?`
  for (const sentence of text.split(/\.\s+|\.$/)) {
    // "From Ocho Rios or Runaway Bay it is an 8 to 12 hour day"
    const day = sentence.match(new RegExp(`from\\s+(.+?)\\s+it is an?\\s+${range}\\s*hours?\\s+day`, 'i'))
    if (day && words.test(day[1])) return { lo: Number(day[2]), hi: Number(day[3] ?? day[2]) }
    // "Allow about 3 hours from Ocho Rios or Runaway Bay, 5 to 6 from Rose Hall, and 8 to 10 from Negril"
    for (const clause of sentence.split(/,\s*|\s+and\s+(?=(?:about\s+)?\d)/i)) {
      const m = clause.match(new RegExp(`(?:about\\s+)?${range}\\s*(?:hours?\\s+)?from\\s+(.+)$`, 'i'))
      if (m && words.test(m[3])) return { lo: Number(m[1]), hi: Number(m[2] ?? m[1]) }
    }
  }
  return null
}

/* ── When to send ─────────────────────────────────────────────────────────── */

/**
 * When this booking's offer should go out: UPSELL_TARGET_LEAD_DAYS before
 * arrival, but never sooner than UPSELL_SETTLE_DAYS after booking and never
 * inside UPSELL_MIN_LEAD_DAYS of arrival. null when no honest slot exists.
 */
export function upsellSendDueMs(booking: UpsellBooking): number | null {
  const arrival = arrivalMs(booking)
  if (arrival == null) return null
  const target = arrival - UPSELL_TARGET_LEAD_DAYS * MS_PER_DAY
  const latest = arrival - UPSELL_MIN_LEAD_DAYS * MS_PER_DAY
  const bookedAt = booking.created_at ? Date.parse(booking.created_at) : NaN
  const earliest = Number.isFinite(bookedAt) ? bookedAt + UPSELL_SETTLE_DAYS * MS_PER_DAY : target
  const due = Math.max(target, earliest)
  return due <= latest ? due : null
}

export type UpsellSkipReason =
  | 'not_paid'
  | 'refunded'
  | 'not_a_transfer'
  | 'already_has_tour'
  | 'no_email'
  | 'no_arrival'
  | 'no_window'
  | 'too_early'
  | 'too_late'
  | 'already_sent'
  | 'party_too_big'
  | 'accessibility_need'
  | 'baby_in_party'
  | 'nothing_nearby'

/**
 * Why this booking must not be mailed, or null when it should be. `hasTour`
 * comes from the caller (it needs a second query: any paid tour for this
 * guest, not only on this booking).
 */
export function upsellBlockedReason(
  booking: UpsellBooking,
  nowMs: number,
  opts: { hasTour: boolean; nearbyCount: number },
): UpsellSkipReason | null {
  if (booking.status !== 'paid') return 'not_paid'
  if (booking.refund_state && booking.refund_state !== 'none') return 'refunded'
  if (booking.booking_type !== 'transfer') return 'not_a_transfer'
  if (opts.hasTour) return 'already_has_tour'
  if (!booking.email) return 'no_email'

  const arrival = arrivalMs(booking)
  if (arrival == null) return 'no_arrival'
  if (booking.dispatch?.[UPSELL_STAMP_KEY]) return 'already_sent'

  const due = upsellSendDueMs(booking)
  if (due == null) return 'no_window'
  if (nowMs < due) return 'too_early'
  if (nowMs > arrival - UPSELL_MIN_LEAD_DAYS * MS_PER_DAY) return 'too_late'

  if (partySize(booking) > UPSELL_MAX_PARTY) return 'party_too_big'
  if (accessibilityNeed(booking.special_requests)) return 'accessibility_need'
  if (hasBaby(booking.special_requests)) return 'baby_in_party'
  if (opts.nearbyCount === 0) return 'nothing_nearby'
  return null
}

/* ── What to offer ────────────────────────────────────────────────────────── */

export interface UpsellPick {
  id: number
  title: string
  slug: string
  destination: string
  /** Time at the activity, e.g. "3 hrs at Rick's". */
  duration: string
  /** The tour's own one-line pitch. */
  description: string
  /** The tour's age line, e.g. "8 and up". */
  ages: string | null
  image: string
  /** Door-to-door hours for their area, or null when not published for it. */
  doorToDoor: DoorToDoor | null
  /** The day planner's one-way drive estimate, used for ranking only and never printed. */
  driveMinutes: number | null
  /** All-in total for THIS party, hotel pickup included. */
  total: number
  partySize: number
  /** Site-relative path to the email JPEG of the tour photo (public/email/tours). */
  emailImage: string
}

/**
 * The tours worth proposing to someone staying at `hotel`, best fit first:
 * the shortest day out where the tour publishes a door-to-door time for the
 * guest's area, then the nearest by the day planner's estimate.
 *
 * Out: packages (they repeat the singles), anything longer than
 * UPSELL_MAX_DAY_HOURS door to door or beyond UPSELL_MAX_DRIVE_MIN when no
 * time is published, anything the youngest child is too young for (a tour
 * with no age line counts as too young), any tour whose rate card is not
 * settled (rateCardUnsettled), and a tour priced by pickup area that is not
 * sold from the guest's hotel. A tour priced by area is quoted from the
 * hotel's own zone (lib/tour-zone-of), the zone checkout charges from when
 * the email's link opens it.
 */
export function curateForStay(
  hotel: string | null,
  party: number,
  catalog: Experience[] = experiences,
  opts: { youngest?: number | null } = {},
): UpsellPick[] {
  if (!hotel) return []
  const area = stayArea(hotel)
  const zone = zoneOfPickup(hotel)
  const youngest = opts.youngest ?? null
  return catalog
    .filter((e) => e.kind === 'single')
    .map((e) => ({ e, d2d: doorToDoorHours(e.fromHotel, area), mins: driveMinutes(hotel, e.destination) }))
    .filter(({ d2d, mins }) => (d2d ? d2d.hi <= UPSELL_MAX_DAY_HOURS : mins !== null && mins <= UPSELL_MAX_DRIVE_MIN))
    .filter(({ e }) => {
      if (youngest === null) return true
      const min = minAgeOf(e.ages)
      return min !== null && min <= youngest
    })
    .filter(({ e }) => !rateCardUnsettled(e.pricing))
    // A tour the operator only runs for a bigger party is never offered to a
    // smaller one (the zipline needs 2 or more, Collin, Nov 12 2026).
    .filter(({ e }) => party >= (e.minGuests ?? 1))
    .filter(({ e }) => zoneSells(e.pricing, zone))
    .sort((a, b) => {
      if (!!a.d2d !== !!b.d2d) return a.d2d ? -1 : 1
      if (a.d2d && b.d2d && a.d2d.hi !== b.d2d.hi) return a.d2d.hi - b.d2d.hi
      if (!a.d2d && !b.d2d && a.mins !== b.mins) return (a.mins ?? 0) - (b.mins ?? 0)
      return a.e.title.localeCompare(b.e.title)
    })
    .slice(0, UPSELL_PICKS)
    .map(({ e, d2d, mins }) => {
      const slug = slugify(e.title)
      return {
        id: e.id,
        title: e.title,
        slug,
        destination: e.destination,
        duration: e.duration,
        description: e.description,
        ages: e.ages ?? null,
        image: e.image,
        doorToDoor: d2d,
        driveMinutes: mins === null ? null : Math.round(mins),
        total: tourPrice(e.pricing, party, zone),
        partySize: party,
        emailImage: `/email/tours/${slug}.jpg`,
      }
    })
}

export interface UpsellEat {
  name: string
  town: string
  knownFor: string
  description: string
  /** Google Maps deep link. Nothing here is bookable through MAPL Tours Jamaica. */
  mapsUrl: string
}

/**
 * One place to eat near where they are staying: a recommendation with a
 * directions link and no price, rating or button (lib/eats is not bookable).
 * Ties break by name so a rerun never shuffles the tip.
 */
export function curateEatForStay(hotel: string | null, catalog: Eat[] = EATS): UpsellEat | null {
  if (!hotel) return null
  const nearest = catalog
    .map((e) => ({ e, mins: driveMinutes(hotel, e.town) }))
    .filter((r): r is { e: Eat; mins: number } => r.mins !== null && r.mins <= UPSELL_MAX_DRIVE_MIN)
    .sort((a, b) => a.mins - b.mins || a.e.name.localeCompare(b.e.name))[0]
  if (!nearest) return null
  return {
    name: nearest.e.name,
    town: nearest.e.town,
    knownFor: nearest.e.knownFor,
    description: nearest.e.description,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nearest.e.mapsQuery)}`,
  }
}

/** Everything the email needs. */
export interface UpsellPlan {
  bookingId: string
  email: string
  firstName: string | null
  hotel: string
  /** Where they are staying, as the email names it. */
  town: string
  arrivalMs: number
  /** The suggested tour day, "YYYY-MM-DD". */
  tourDay: string
  freeDays: number | null
  party: number
  /** The youngest child the note mentions, or null. */
  youngest: number | null
  picks: UpsellPick[]
  eat: UpsellEat | null
}

export function planUpsell(
  booking: UpsellBooking,
  nowMs: number,
  opts: { hasTour: boolean; catalog?: Experience[] },
): { plan: UpsellPlan } | { skipped: UpsellSkipReason } {
  const hotel = stayHotel(booking)
  const party = partySize(booking)
  const youngest = youngestChildAge(booking.special_requests)
  const picks = curateForStay(hotel, party, opts.catalog ?? experiences, { youngest })

  const blocked = upsellBlockedReason(booking, nowMs, { hasTour: opts.hasTour, nearbyCount: picks.length })
  if (blocked) return { skipped: blocked }

  return {
    plan: {
      bookingId: booking.id,
      email: (booking.email as string).trim().toLowerCase(),
      firstName: booking.first_name?.trim() || null,
      hotel: hotel as string,
      town: stayTown(hotel as string),
      arrivalMs: arrivalMs(booking) as number,
      tourDay: firstFreeDay(booking) as string,
      freeDays: freeDays(booking),
      party,
      youngest,
      picks,
      eat: curateEatForStay(hotel),
    },
  }
}

/** One run's ceiling, mirroring the review job's budget guard. */
export const UPSELL_SEND_BATCH = 12
export const UPSELL_DEADLINE_MS = 7_000

export function upsellRunOverBudget(sendsAttempted: number, elapsedMs: number): boolean {
  return sendsAttempted >= UPSELL_SEND_BATCH || elapsedMs >= UPSELL_DEADLINE_MS
}
