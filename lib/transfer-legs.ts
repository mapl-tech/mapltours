import type { TransferTripType } from '@/lib/airport-transfers'

/**
 * Which legs a transfer actually has, derived from the trip the guest STATED.
 *
 * Extracted from /api/transfers/checkout so the direction model is testable
 * on its own (audit 2026-08-22): the route both requires the legs a booking
 * has and rejects the legs it does not, and every downstream consumer
 * (dispatch, the day-of email, the confirmation) treats "timestamp column
 * set" as "leg exists", so this derivation is the single source of truth for
 * what may reach the booking_items row.
 */

export interface TransferLegFields {
  tripType: TransferTripType
  /** True when the ride starts at Sangster. Absent on pre-existing carts. */
  fromAirport?: boolean
  arrivalAt?: string
  arrivalFlight?: string
  departureAt?: string
  departureFlight?: string
}

export interface TransferLegPlan {
  hasArrivalLeg: boolean
  hasDepartureLeg: boolean
  /**
   * A leg the stated direction forbids, but whose fields the payload carries
   * anyway. Persisting it used to book a phantom second ride: priced and paid
   * one-way, dispatched and day-of-emailed as two legs (audit 2026-08-22).
   * Callers must refuse the payload, never silently strip the fields.
   */
  strayLeg: 'arrival' | 'departure' | null
}

/** A leg field is on the wire when it is non-empty after trimming. */
const present = (v: string | null | undefined) => (v ?? '').trim().length > 0

export function planTransferLegs(item: TransferLegFields): TransferLegPlan {
  // Which legs this booking actually has. A round-trip has both. A one-way
  // has exactly one, decided by the direction the guest stated — this used
  // to be inferred from whether arrivalAt happened to be filled in, which
  // asked for a departure flight on an arrival-only ride.
  const oneWayToAirport = item.tripType === 'one_way' && item.fromAirport === false
  // Derived from the STATED direction alone, never from whether a timestamp
  // happens to be present. Conditioning the arrival leg on arrivalAt existing
  // meant a POST that simply omitted the timestamp had no legs at all: no
  // flight required, no lead-time check (the bookable gate passes vacuously
  // on absent legs), and a payable transfer was created with no date or time
  // anywhere on it, dispatched to nobody. Legacy carts persisted before the
  // direction field keep the old inference so they can still check out.
  const hasArrivalLeg =
    item.tripType === 'round_trip' ||
    (item.fromAirport === undefined ? !!item.arrivalAt : !oneWayToAirport)
  const hasDepartureLeg =
    item.tripType === 'round_trip' ||
    (item.fromAirport === undefined ? !item.arrivalAt : oneWayToAirport)

  const strayLeg: TransferLegPlan['strayLeg'] =
    !hasArrivalLeg && (present(item.arrivalAt) || present(item.arrivalFlight))
      ? 'arrival'
      : !hasDepartureLeg && (present(item.departureAt) || present(item.departureFlight))
        ? 'departure'
        : null

  return { hasArrivalLeg, hasDepartureLeg, strayLeg }
}
