import { firstLeg, bookingRef, supplierPayout, round2, legInstantMs, type Bk } from '@/lib/dispatch'

/**
 * Driver-portal data model. The single job of this module is the PRIVACY
 * BOUNDARY: it converts a full booking row into the strict subset a driver may
 * see. A driver sees the guest, the ride, the flight, and HIS OWN pay - never
 * the customer's total, the transfer fee, the Stripe fee, or MAPL's margin.
 * Server components build DriverTrip on the server and pass it down, so the
 * withheld fields never reach the driver's browser at all.
 */

/** Emails allowed into the driver portal (comma-separated env, lowercase). */
export function driverAllowlist(): string[] {
  return (process.env.DRIVER_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedDriver(email: string | null | undefined): boolean {
  if (!email) return false
  return driverAllowlist().includes(email.toLowerCase())
}

/**
 * The driver's working window over transfer legs: backDays ago (default one,
 * a late-running pickup) through 90 days out, in the Jamaica wall-clock convention
 * the leg columns are stored in (real instant minus five hours, see
 * lib/dispatch.ts legInstantMs).
 *
 * The portal used to select the 100 NEWEST paid transfers by created_at with
 * no date bound at all. Completed trips never leave status 'paid', so history
 * consumed the cap from the top: with a hundred-and-first booking on the
 * books, whichever upcoming pickup had been BOOKED earliest silently fell off
 * the driver's list, and nothing anywhere logged that a trip existed that he
 * could not see.
 *
 * Callers apply this with an inner-join filter on booking_items rather than a
 * two-step id list: a first draft collected ids across every booking status
 * and fed them to .in(), which both dragged canceled history along and, past
 * a few hundred ids, overflowed the request URL and silently blanked the
 * portal. One filtered join has neither failure mode. Both legs of a transfer
 * live on a single booking_items row, so a row matches when EITHER leg is in
 * the window and no leg is ever dropped from a matched booking.
 */
export function transferLegWindow(
  nowMs: number = Date.now(),
  // How far back the window reaches. The flight tracker keeps the tight
  // 1-day default (it only cares about legs it can still act on), but the
  // PORTALS look back 45 days: a leg is also a PAYOUT line, and a 24-hour
  // bound erased any trip the operator had not marked paid within a day of
  // the ride, silently zeroing money still owed to the driver.
  opts: { backDays?: number; forwardDays?: number } = {},
): { from: string; to: string; orFilter: string } {
  const { backDays = 1, forwardDays = 90 } = opts
  const wall = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString()
  const from = wall(nowMs - backDays * 24 * 3_600_000)
  const to = wall(nowMs + forwardDays * 24 * 3_600_000)
  return {
    from,
    to,
    orFilter: `and(arrival_at.gte.${from},arrival_at.lte.${to}),and(departure_at.gte.${from},departure_at.lte.${to})`,
  }
}

export interface DriverPayoutLeg {
  /** 'arrival' | 'departure' */
  leg: 'arrival' | 'departure'
  amount: number
  paid: boolean
  /** ISO timestamp of when the operator marked it paid. */
  paidAt: string | null
}

export interface DriverTrip {
  id: string
  ref: string
  guestName: string
  guestPhone: string | null
  passengers: number
  tripType: 'one_way' | 'round_trip'
  hotel: string
  airport: string
  specialRequests: string | null
  arrivalFlight: string | null
  arrivalAt: string | null
  departureFlight: string | null
  departureAt: string | null
  /** total the driver earns on this booking: the full fare. */
  payoutTotal: number
  payoutLegs: DriverPayoutLeg[]
  /** true once every payout leg is paid. */
  fullyPaid: boolean
}

/** Build the driver-safe view of one paid transfer booking. */
export function driverTrip(b: Bk): DriverTrip | null {
  const leg = firstLeg(b)
  if (!leg) return null
  const dispatch = (b.dispatch ?? {}) as Record<string, string>
  const total = supplierPayout(Number(b.subtotal ?? 0))
  const isRT = leg.tripType === 'round_trip'
  const perLeg = isRT ? round2(total / 2) : total
  const payoutLegs: DriverPayoutLeg[] = [
    { leg: 'arrival', amount: perLeg, paid: !!dispatch.paid_first, paidAt: dispatch.paid_first ?? null },
  ]
  if (isRT) {
    payoutLegs.push({ leg: 'departure', amount: round2(total - perLeg), paid: !!dispatch.paid_second, paidAt: dispatch.paid_second ?? null })
  }
  return {
    id: b.id,
    ref: bookingRef(b.id),
    guestName: `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || 'Guest',
    guestPhone: b.phone ?? null,
    passengers: leg.passengers,
    tripType: leg.tripType,
    hotel: leg.hotel,
    airport: leg.airport,
    specialRequests: b.special_requests ?? null,
    arrivalFlight: leg.arrivalFlight,
    arrivalAt: leg.arrivalAt,
    departureFlight: leg.departureFlight,
    departureAt: leg.departureAt,
    payoutTotal: total,
    payoutLegs,
    fullyPaid: payoutLegs.every((p) => p.paid),
  }
}

/* ── Tours (driver-safe): itinerary only, NO money of any kind ── */

export interface DriverTourItem {
  title: string
  destination: string | null
  date: string | null // YYYY-MM-DD
  travelers: number
}

export interface DriverTour {
  id: string
  ref: string
  guestName: string
  guestPhone: string | null
  specialRequests: string | null
  items: DriverTourItem[]
  /** earliest tour date, for sorting */
  firstDate: string | null
}

/** Build the driver-safe view of one paid tour booking. Tours have no driver
 *  payout model, so this deliberately carries ZERO price fields. */
export function driverTour(b: Bk): DriverTour | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: DriverTourItem[] = ((b.booking_items ?? []) as any[]).map((i) => ({
    title: i.title ?? 'Experience',
    destination: i.destination ?? null,
    date: i.date ?? null,
    travelers: i.travelers ?? 1,
  }))
  if (!items.length) return null
  const dates = items.map((i) => i.date).filter(Boolean).sort() as string[]
  return {
    id: b.id,
    ref: bookingRef(b.id),
    guestName: `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || 'Guest',
    guestPhone: b.phone ?? null,
    specialRequests: b.special_requests ?? null,
    items,
    firstDate: dates[0] ?? null,
  }
}

/** Sort key: the next thing the driver has to do (soonest upcoming leg first).
 *
 * Leg stamps are Jamaica wall-clock, so they must go through legInstantMs to
 * become real instants before any comparison with Date.now(). Comparing raw
 * put every leg 5 hours early: a trip dropped out of the driver's upcoming
 * list, and off the top of his sort, 5 hours before it was actually due. */
export function nextActionAt(t: DriverTrip): number {
  const now = Date.now()
  const times = [t.arrivalAt, t.departureAt]
    .filter(Boolean)
    .map((iso) => legInstantMs(iso as string))
  const upcoming = times.filter((ms) => ms >= now - 12 * 3600_000) // still active within 12h
  if (upcoming.length) return Math.min(...upcoming)
  // everything in the past: sort those after upcoming trips, most recent first
  return times.length ? Math.max(...times) + 1e15 : Number.MAX_SAFE_INTEGER
}
