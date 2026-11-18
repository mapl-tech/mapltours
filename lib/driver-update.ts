import { firstLeg, bookingRef, jaTime, legInstantMs, type Bk } from '@/lib/dispatch'
import { aVehicle, bookingVehicle, driverFirstName, phoneDigits, vehicleInWords, type Driver } from '@/lib/drivers'
import type { DriverUpdateProps, StepPart } from '@/emails/DriverUpdate'

/**
 * The driver-update email: what it says, and when it may go.
 *
 * Owner, Nov 18 2026: "the information on the email should be perfect". So
 * nothing here is typed by a person on the day. Every fact in the email is
 * read from the booking (the ride, its day and time, the flight, the hotel,
 * the party) or from the saved driver (lib/drivers.ts), and worded once,
 * here, where tests/unit/driver-update.spec.ts reads every line. The copy is
 * the one the owner approved for the hand-built updates of Nov 17 and 18, with
 * the day, the leg and the driver filled in.
 *
 * Pure (no email or database imports), so the dispatch console can use the
 * same rules to show what the email will do before anyone presses a button.
 * Sending is lib/driver-update-send.ts.
 */

export type Leg = 'arrival' | 'departure'

/** Same words as lib/dayof's AIRPORT (the test holds them together). */
export const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay'
export const SUPPORT_EMAIL = 'contact@mapltours.com'

/** How long after landing an arrival update still helps: the guest may still be inside. */
export const ARRIVAL_GRACE_MIN = 120

/** Where a sent update is recorded on the booking (dispatch map). */
export const sentKey = (leg: Leg) => `driver_update_${leg}_sent`
export const sentDriverKey = (leg: Leg) => `driver_update_${leg}_driver`

const JA_OFFSET_MS = 5 * 3_600_000
/** The Jamaica calendar date (YYYY-MM-DD) of a real instant. Jamaica is UTC-5 all year. */
export function jaDateKey(nowMs: number): string {
  return new Date(nowMs - JA_OFFSET_MS).toISOString().slice(0, 10)
}

/** The rides a booking has, in order: an arrival if it lands, a ride to the airport if it has one. */
export function legsOf(b: Bk): Leg[] {
  const l = firstLeg(b)
  if (!l) return []
  const out: Leg[] = []
  if (l.arrivalAt) out.push('arrival')
  // As the dispatch console: a departure belongs to a round trip, or to a one-way with no arrival.
  if (l.departureAt && (l.tripType === 'round_trip' || !l.arrivalAt)) out.push('departure')
  return out
}

/** The stored wall-clock time of a leg (landing for an arrival, hotel pickup for a departure). */
export function legAt(b: Bk, leg: Leg): string | null {
  const l = firstLeg(b)
  if (!l) return null
  return leg === 'arrival' ? l.arrivalAt : l.departureAt
}

/** "Wednesday, November 25", read verbatim from the stored Jamaica wall clock. */
export function legDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
}
/** "November 25". */
export function legMonthDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' })
}

/**
 * Which day the ride is, said from the guest's side on the Jamaica calendar:
 * "today", "tomorrow", or "on Wednesday, November 25". A flight that landed
 * before midnight, still being met after it, is "tonight".
 */
export function whenWords(iso: string, nowMs: number): { inline: string; eyebrow: string } {
  const day = iso.slice(0, 10)
  const today = jaDateKey(nowMs)
  if (day === today) return { inline: 'today', eyebrow: 'Today' }
  if (day === jaDateKey(nowMs + 24 * 3_600_000)) return { inline: 'tomorrow', eyebrow: 'Tomorrow' }
  if (day < today) return { inline: 'tonight', eyebrow: 'Tonight' }
  // A later day is named once in the headline and again in the trip card;
  // the eyebrow says only what the email is.
  return { inline: `on ${legDay(iso)}`, eyebrow: '' }
}

/** "AA1311" and "aa 1311" read "AA 1311"; anything else (such as "521") is shown as the guest gave it. */
export function flightLabel(raw: string | null | undefined): string | null {
  const f = (raw ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  if (!f) return null
  const m = f.match(/^([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4}[A-Z]?)$/)
  return m ? `${m[1]} ${m[2]}` : f
}

/**
 * Has the guest already been given a driver for this ride? Then the email
 * says it replaces those details; otherwise it only introduces the driver,
 * because "this replaces the driver we sent you" would be false. Counts the
 * day-of email, an earlier driver update, and the confirmation the operator
 * sends from the console (step "Send confirmation to the customer", which
 * names the driver). An arrival's details also stand for the ride back.
 */
export function toldBefore(b: Bk, leg: Leg): boolean {
  const d = (b.dispatch ?? {}) as Record<string, string>
  if (d.customer_confirmed) return true
  if (d[`dayof_${leg}_sent`] || d[sentKey(leg)]) return true
  return leg === 'departure' && !!(d.dayof_arrival_sent || d[sentKey('arrival')])
}

/**
 * Why this email cannot be written for this booking, ride and driver, or
 * null. Applies to the preview and the test as well as the real send.
 */
export function buildProblem(b: Bk, leg: Leg, driver: Driver | null): string | null {
  if (!b || b.booking_type !== 'transfer') return 'This is not an airport transfer.'
  const l = firstLeg(b)
  if (!l) return 'This booking has no ride on it.'
  if (!legsOf(b).includes(leg)) return leg === 'arrival' ? 'This booking has no arrival.' : 'This booking has no ride to the airport.'
  if (!l.hotel?.trim()) return 'This booking has no hotel, so the email cannot say where the ride goes.'
  if (!(l.passengers >= 1)) return 'This booking has no party size.'
  if (!driver) return 'Choose a driver.'
  if (!driver.active) return `${driver.name} is retired. Choose another driver, or bring them back on the Drivers page.`
  if (!driver.name || !driver.whatsapp || !driver.vehicle || !driver.colour || !driver.plate) return `${driver.name || 'This driver'} is missing a detail. Complete it on the Drivers page.`
  return null
}

/**
 * Why it cannot be sent to the guest now, or null. Stricter than
 * buildProblem: the booking must be paid, have an email, and the ride must
 * still be ahead (an arrival up to two hours after landing, while the guest
 * may still be inside; a ride to the airport until its pickup time).
 */
export function guestSendProblem(b: Bk, leg: Leg, driver: Driver | null, nowMs: number): string | null {
  const built = buildProblem(b, leg, driver)
  if (built) return built
  if (b.status !== 'paid') return 'This booking is not paid, so nothing goes to the guest.'
  if (!b.email) return 'This booking has no email address.'
  const at = legAt(b, leg)!
  const atMs = legInstantMs(at)
  const end = leg === 'arrival' ? atMs + ARRIVAL_GRACE_MIN * 60_000 : atMs
  if (nowMs > end) return leg === 'arrival' ? 'This arrival is over, so an update would only confuse the guest.' : 'This pickup time has passed.'
  return null
}

export interface DriverUpdateEmail {
  subject: string
  props: DriverUpdateProps
}

/**
 * The email, written from the booking and the driver. Call buildProblem
 * first: this assumes the ride, the hotel and the driver are all there.
 * `told` is whether the guest had a driver for this ride before this email
 * (toldBefore), read before any stamp this send adds.
 */
export function buildDriverUpdate(b: Bk, leg: Leg, driver: Driver, nowMs: number, told: boolean = toldBefore(b, leg)): DriverUpdateEmail {
  const l = firstLeg(b)!
  const at = legAt(b, leg)!
  const ref = bookingRef(b.id)
  const when = whenWords(at, nowMs)
  const isArrival = leg === 'arrival'
  const first = driverFirstName(driver)
  const flight = flightLabel(isArrival ? l.arrivalFlight : l.departureFlight)
  const time = jaTime(at)
  const replaces = ' This replaces the driver and vehicle we sent you earlier. Everything else about your pickup stays the same.'

  const subject = isArrival
    ? `Your driver ${when.inline}: ${driver.name}, ${vehicleInWords(driver)} (${ref})`
    : `Your ride to the airport ${when.inline}: ${driver.name}, ${vehicleInWords(driver)} (${ref})`

  const headline = `${told ? 'A new driver' : 'Your driver'} for ${isArrival ? 'your arrival' : 'your ride to the airport'} ${when.inline}.`

  const lead = isArrival
    ? `${driver.name} will be waiting just outside the arrivals hall with a MAPL Tours Jamaica sign showing your name.${told ? replaces : ''}`
    // The day is in the headline just above; the lead gives the time.
    : `${driver.name} will pick you up at your hotel at ${time} in ${aVehicle(driver)}, and take you to Sangster International Airport for your flight.${told ? replaces : ''}`

  const whenRow = `${legDay(at)}, ${time} Jamaica time`
  const tripRows = isArrival
    ? [
        { label: 'Flight lands', value: whenRow },
        ...(flight ? [{ label: 'Flight', value: flight }] : []),
        { label: 'Pick up', value: AIRPORT },
        { label: 'Drop off', value: l.hotel },
        { label: 'Passengers', value: String(l.passengers) },
      ]
    : [
        { label: 'Hotel pickup', value: whenRow },
        { label: 'Pick up', value: l.hotel },
        { label: 'Drop off', value: AIRPORT },
        ...(flight ? [{ label: 'Flight', value: flight }] : []),
        { label: 'Passengers', value: String(l.passengers) },
      ]

  const steps: StepPart[][] = isArrival
    ? [
        [{ t: flight ? 'Clear immigration and pick up your bags. No rush, we are tracking the flight.' : 'Clear immigration and pick up your bags. No rush.' }],
        [{ t: 'Walk out through customs, past the public hall, and step outside.' }],
        [{ t: `Turn right: ${first} is in front of the sixth car rental office, holding a ` }, { t: 'MAPL Tours Jamaica', b: true }, { t: ' sign with your name on it.' }],
        [{ t: `If you do not see the sign within a few minutes, message the WhatsApp number above, or reply to this email and we will call ${first} for you.` }],
      ]
    : [
        [{ t: 'Be in the lobby a few minutes before the pickup time above.' }],
        [{ t: `${first} will be waiting in ${aVehicle(driver)}, plate ${driver.plate}.` }],
        [{ t: `If anything changes with your flight or your plans, message the WhatsApp number above or reply to this email, and we will let ${first} know.` }],
      ]

  const notes: string[] = []
  // The ride back is confirmed by its own day-of email, which names whoever
  // is on the booking then. Said only on an arrival that has a ride back.
  if (isArrival && legsOf(b).includes('departure') && l.departureAt) {
    notes.push(`We will confirm your driver for the ride back to the airport on ${legMonthDay(l.departureAt)} closer to the day.`)
  }
  notes.push(`Anything at all, reply to this email or write to ${SUPPORT_EMAIL} and a person will answer. Booking reference ${ref}.`)

  return {
    subject,
    props: {
      preheader: `${isArrival ? 'Your driver' : 'Your driver to the airport'} ${when.inline} is ${driver.name}, ${vehicleInWords(driver)}, plate ${driver.plate} · ${ref}`,
      eyebrow: when.eyebrow ? `${when.eyebrow} · Driver update` : 'Driver update',
      headline,
      lead,
      bookingRef: ref,
      driver: {
        name: driver.name,
        vehicle: bookingVehicle(driver),
        plate: driver.plate,
        whatsapp: driver.whatsapp,
        whatsappLink: `https://wa.me/${phoneDigits(driver.whatsapp)}`,
      },
      tripTitle: isArrival ? 'Your pickup' : 'Your departure',
      tripRows,
      stepsTitle: isArrival ? 'When you land' : 'Before you go',
      steps,
      notes,
    },
  }
}
