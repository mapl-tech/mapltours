import { firstLeg, bookingRef, driverOwed, round2, type Bk } from '@/lib/dispatch'

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
  /** total the driver earns on this booking (fare / 1.20). */
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
  const total = driverOwed(Number(b.subtotal ?? 0))
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

/** Sort key: the next thing the driver has to do (soonest upcoming leg first). */
export function nextActionAt(t: DriverTrip): number {
  const now = Date.now()
  const times = [t.arrivalAt, t.departureAt]
    .filter(Boolean)
    .map((iso) => new Date(iso as string).getTime())
  const upcoming = times.filter((ms) => ms >= now - 12 * 3600_000) // still active within 12h
  if (upcoming.length) return Math.min(...upcoming)
  // everything in the past: sort those after upcoming trips, most recent first
  return times.length ? Math.max(...times) + 1e15 : Number.MAX_SAFE_INTEGER
}
