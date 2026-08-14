/**
 * Transfer dispatch logic - pure, framework-free helpers shared by the admin
 * dispatch console. Nothing here mutates money or touches the payment path; it
 * only DERIVES display values and message text from an existing booking.
 *
 * Money model (corrected with the operator, Aug 14 2026):
 *   the SUPPLIER is paid the subtotal in full, and MAPL's entire margin is
 *   the customer-facing fee charged on top:
 *     transfers: customer pays fare + 10% trip fee -> driver gets the fare
 *     tours:     customer pays price + 20% fee     -> operator gets the price
 *   => driver is owed  subtotal  (round-trips split half per leg)
 *   => MAPL keeps      fee - Stripe fee
 *   There is no separate markup: the fee IS the markup.
 *
 * Time model: the checkout stores the customer's typed wall-clock (a
 * `datetime-local`, no zone) as `...T13:09:00+00:00`. That wall-clock IS the
 * Jamaica local time the customer intended, so we format with timeZone 'UTC'
 * to read it back verbatim (never convert), and label it Jamaica time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Bk = any

export interface TransferLeg {
  hotel: string
  airport: string
  zone: string | null
  tripType: 'one_way' | 'round_trip'
  passengers: number
  arrivalFlight: string | null
  arrivalAt: string | null
  departureFlight: string | null
  departureAt: string | null
  price: number
}

export function firstLeg(b: Bk): TransferLeg | null {
  const i = (b.booking_items ?? [])[0]
  if (!i) return null
  return {
    hotel: i.hotel ?? i.destination ?? '',
    airport: i.airport ?? 'MBJ',
    zone: i.zone ?? null,
    tripType: (i.trip_type ?? 'one_way') as 'one_way' | 'round_trip',
    passengers: i.passengers ?? i.travelers ?? 1,
    arrivalFlight: i.arrival_flight ?? null,
    arrivalAt: i.arrival_at ?? null,
    departureFlight: i.departure_flight ?? null,
    departureAt: i.departure_at ?? null,
    price: Number(i.price_per_person ?? 0),
  }
}

export function bookingRef(id: string): string {
  return 'MAPL-' + id.slice(0, 8).toUpperCase()
}

/* ── Money ── */

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
/**
 * What MAPL owes the supplier for a booking: the SUBTOTAL IN FULL.
 * The customer-facing fee (10% transfers, 20% tours) is MAPL's whole margin,
 * so nothing is deducted from the supplier's rate. Used for the transfer
 * driver and, on the cash-flow page, for tour operators.
 */
export function supplierPayout(subtotal: number): number {
  return round2(subtotal)
}
export function money(n: number | null | undefined): string {
  return '$' + Number(n ?? 0).toFixed(2)
}

export interface MoneyBlock {
  customerPaid: number
  /** the fare, which IS the driver's rate (MAPL's margin is the trip fee). */
  fare: number
  /** the 10% trip fee charged on top: MAPL's entire margin on a transfer. */
  transferFee: number
  stripeFee: number | null
  /** what Stripe deposits (customer paid minus Stripe fee), BEFORE the driver. */
  netToMapl: number | null
  /** paid to the driver: the full fare. */
  driverTotal: number
  driverPerLeg: number
  /** MAPL's actual profit: the trip fee minus the Stripe fee. */
  maplKeeps: number | null
  isRoundTrip: boolean
}

export function moneyBlock(b: Bk, stripeFee: number | null): MoneyBlock {
  const fare = Number(b.subtotal ?? 0)
  const transferFee = Number(b.booking_fee ?? 0)
  const customerPaid = Number(b.total_paid ?? 0)
  const driverTotal = supplierPayout(fare)
  const netToMapl = stripeFee != null ? round2(customerPaid - stripeFee) : null
  const leg = firstLeg(b)
  const isRoundTrip = leg?.tripType === 'round_trip'
  return {
    customerPaid,
    fare,
    transferFee,
    stripeFee,
    netToMapl,
    driverTotal,
    driverPerLeg: isRoundTrip ? round2(driverTotal / 2) : driverTotal,
    maplKeeps: netToMapl != null ? round2(netToMapl - driverTotal) : null,
    isRoundTrip,
  }
}

/* ── Time (Jamaica wall-clock, read verbatim from the stored value) ── */

const JA = { timeZone: 'UTC' } as const // stored wall-clock == Jamaica local

export function jaDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleDateString('en-US', { ...JA, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  } catch { return String(iso) }
}
export function jaTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleTimeString('en-US', { ...JA, hour: 'numeric', minute: '2-digit' })
  } catch { return '-' }
}
/** shift a stored wall-clock time by N minutes, returning a new ISO. */
export function shiftIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

/** Customers typically clear customs + bags ~45 min after landing. */
export const ARRIVAL_CLEAR_MIN = 45
/** Sensible gap between hotel pickup and flight departure: below this, warn.
 *  (~1h drive from most zones + 2.5h international check-in.) */
export const MIN_PICKUP_LEAD_MIN = 210

/* ── Google Calendar link (correct Jamaica timezone via ctz) ── */

function wallStamp(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`
}
export function gcalLink(opts: { title: string; startIso: string; durationMin: number; location: string; details: string }): string {
  const endIso = shiftIso(opts.startIso, opts.durationMin)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: opts.title,
    dates: `${wallStamp(opts.startIso)}/${wallStamp(endIso)}`,
    ctz: 'America/Jamaica',
    location: opts.location,
    details: opts.details,
  })
  return 'https://calendar.google.com/calendar/render?' + params.toString()
}

export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? '').replace(/[^\d]/g, '')
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

/* ── WhatsApp / message templates (from the operator's workflow) ── */

const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay, Jamaica'

export function msgDriverRequest(b: Bk, m: MoneyBlock): string {
  const leg = firstLeg(b)!
  const name = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim()
  const lines = [
    'MAPL TOURS JAMAICA - NEW TRANSFER REQUEST',
    '',
    `Booking #: ${bookingRef(b.id)}`,
    `Customer: ${name}`,
    `Customer WhatsApp/phone: ${b.phone ?? '-'} (${b.country ?? ''})`.trim(),
    `Passengers: ${leg.passengers}`,
    `Transfer type: ${leg.tripType === 'round_trip' ? 'Round trip' : 'One-way'}`,
    `Pay: ${money(m.driverTotal)} USD total${m.isRoundTrip ? ` (${money(m.driverPerLeg)} per leg)` : ''}`,
    '',
    'ARRIVAL',
    `Pick up: ${AIRPORT}`,
    `Drop-off: ${leg.hotel}`,
    `Date: ${jaDate(leg.arrivalAt)}`,
    `Flight lands: ${jaTime(leg.arrivalAt)} Jamaica time${leg.arrivalFlight ? ` (flight ${leg.arrivalFlight})` : ''}`,
  ]
  if (leg.tripType === 'round_trip' && leg.departureAt) {
    lines.push(
      '',
      'DEPARTURE',
      `Pick up: ${leg.hotel}`,
      `Drop-off: ${AIRPORT}`,
      `Date: ${jaDate(leg.departureAt)}`,
      `Hotel pickup: ${jaTime(leg.departureAt)} Jamaica time (time requested by the guest)`,
      ...(leg.departureFlight ? [`Departure flight: ${leg.departureFlight}`] : []),
    )
  }
  lines.push(
    '',
    'Please confirm availability and reply with:',
    'Driver name / Driver WhatsApp / Vehicle make + model / Colour / License plate',
  )
  return lines.join('\n')
}

export function msgCustomerConfirmation(b: Bk): string {
  const leg = firstLeg(b)!
  const d = [
    'Your MAPL Tours airport transfer is confirmed.',
    '',
    `Transfer type: ${leg.tripType === 'round_trip' ? 'Round trip' : 'One-way'}`,
    `Passengers: ${leg.passengers}`,
    '',
    'ARRIVAL',
    `Pick up: ${AIRPORT}`,
    `Drop-off: ${leg.hotel}`,
    `Date: ${jaDate(leg.arrivalAt)}`,
    `Flight lands: ${jaTime(leg.arrivalAt)} Jamaica time`,
  ]
  if (leg.tripType === 'round_trip' && leg.departureAt) {
    d.push('', 'DEPARTURE', `Pick up: ${leg.hotel}`, `Drop-off: ${AIRPORT}`, `Date: ${jaDate(leg.departureAt)}`, `Hotel pickup: ${jaTime(leg.departureAt)} Jamaica time`)
  }
  d.push(
    '',
    'Your driver will meet you in the airport arrivals area holding a MAPL Tours Jamaica sign.',
    `Driver: ${b.driver_name ?? '(to be confirmed)'}`,
    `Vehicle: ${b.driver_vehicle ?? '(to be confirmed)'}`,
    `Plate: ${b.driver_plate ?? '(to be confirmed)'}`,
    `Driver WhatsApp: ${b.driver_phone ?? '(to be confirmed)'}`,
    '',
    'If you have any difficulty locating your driver after clearing customs, contact MAPL Tours at contact@mapltours.com right away.',
  )
  return d.join('\n')
}

export function msgFlightDetailsRequest(b: Bk): string {
  return [
    `Hi ${b.first_name ?? 'there'},`,
    '',
    'Quick reminder to please send your flight details for your upcoming trip to Jamaica (airline + flight number). Once we have them we can track your flight and keep your transfer on time.',
    '',
    'Thank you!',
  ].join('\n')
}

export function msgDriverReminder(b: Bk, leg: 'arrival' | 'departure'): string {
  const l = firstLeg(b)!
  const isArr = leg === 'arrival'
  const at = isArr ? l.arrivalAt : l.departureAt
  return [
    'MAPL TOURS JAMAICA - TRANSFER REMINDER',
    '',
    `Booking #: ${bookingRef(b.id)}`,
    `Customer: ${`${b.first_name ?? ''} ${b.last_name ?? ''}`.trim()}`,
    `Passengers: ${l.passengers}`,
    `Pick up: ${isArr ? AIRPORT : l.hotel}`,
    `Drop-off: ${isArr ? l.hotel : AIRPORT}`,
    `Date: ${jaDate(at)}`,
    `Time: ${jaTime(at)} Jamaica time`,
    '',
    'Please confirm you are still good for this transfer.',
  ].join('\n')
}

export function msgFlightLanded(b: Bk): string {
  return `${bookingRef(b.id)} - FLIGHT LANDED\n\n${b.first_name ?? 'The customer'}'s flight has landed. Please proceed with the pickup and confirm once the customer has been met.`
}

export function msgCustomerFollowup(b: Bk): string {
  return `Hi ${b.first_name ?? 'there'}. We hope you arrived safely and are enjoying Jamaica. Thank you for choosing MAPL Tours Jamaica.`
}

export function msgReviewRequest(b: Bk): string {
  return `Thank you for choosing MAPL Tours Jamaica, ${b.first_name ?? ''}. We hope you had a great experience. If you have a moment, we would really appreciate a quick review.`.replace(' ,', ',')
}

/* ── The step model ── */

export type StepGroup = 'setup' | 'arrival' | 'departure' | 'close'
export interface Step {
  key: string
  num: number
  title: string
  group: StepGroup
  /** show only for round-trip bookings */
  roundTripOnly?: boolean
  hint?: string
}

export const STEPS: Step[] = [
  { key: 'verified', num: 1, title: 'Verify the booking', group: 'setup', hint: 'Flight, date, airport, hotel, passenger phone all present.' },
  { key: 'sent_to_driver', num: 2, title: 'Send booking to your Jamaica driver', group: 'setup' },
  { key: 'driver_confirmed', num: 3, title: 'Record driver + vehicle details', group: 'setup' },
  { key: 'customer_confirmed', num: 4, title: 'Send confirmation to the customer', group: 'setup' },
  { key: 'flight_requested', num: 5, title: 'Request flight details (24 to 48h before arrival)', group: 'arrival' },
  { key: 'driver_reconfirmed', num: 6, title: 'Remind + reconfirm the driver', group: 'arrival' },
  { key: 'paid_first', num: 7, title: 'Pay driver (first half, before the pickup)', group: 'arrival' },
  { key: 'landed', num: 8, title: 'Flight landed - notify the driver', group: 'arrival' },
  { key: 'arrival_complete', num: 9, title: 'Customer picked up + dropped at hotel', group: 'arrival' },
  { key: 'arrival_followup', num: 10, title: 'Send arrival follow-up to customer', group: 'arrival' },
  { key: 'departure_reminded', num: 11, title: 'Remind the driver (24 to 48h before departure)', group: 'departure', roundTripOnly: true },
  { key: 'paid_second', num: 12, title: 'Pay driver (second half, before the pickup)', group: 'departure', roundTripOnly: true },
  { key: 'departure_complete', num: 13, title: 'Customer picked up + dropped at airport', group: 'departure', roundTripOnly: true },
  { key: 'review_requested', num: 14, title: 'Send review request', group: 'close' },
]

export function visibleSteps(isRoundTrip: boolean): Step[] {
  return STEPS.filter((s) => isRoundTrip || !s.roundTripOnly)
}

export function progress(b: Bk): { done: number; total: number } {
  const leg = firstLeg(b)
  const steps = visibleSteps(leg?.tripType === 'round_trip')
  const dispatch = (b.dispatch ?? {}) as Record<string, string>
  return { done: steps.filter((s) => dispatch[s.key]).length, total: steps.length }
}
