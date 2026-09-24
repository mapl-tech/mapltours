import { describe, test, expect } from 'vitest'
import { planTransferLegs } from '../../lib/transfer-legs'

/**
 * The transfer direction model: which legs a booking HAS, and which leg
 * fields a payload must not carry.
 *
 * These exist because of audit finding 2026-08-22: the checkout route used
 * hasArrivalLeg/hasDepartureLeg only to REQUIRE legs, then persisted all four
 * leg columns verbatim. A one_way payload smuggling the other leg's timestamp
 * and flight number was priced and paid one-way but dispatched, day-of-emailed,
 * and driver-boarded as TWO rides — every downstream consumer treats
 * "timestamp column set" as "leg exists". strayLeg is the rejection signal;
 * the route must 400 on it, never silently strip.
 */

describe('leg derivation from the stated direction', () => {
  test('round trip has both legs', () => {
    const plan = planTransferLegs({ tripType: 'round_trip', fromAirport: true })
    expect(plan.hasArrivalLeg).toBe(true)
    expect(plan.hasDepartureLeg).toBe(true)
  })

  test('one-way from the airport is arrival only', () => {
    const plan = planTransferLegs({ tripType: 'one_way', fromAirport: true })
    expect(plan.hasArrivalLeg).toBe(true)
    expect(plan.hasDepartureLeg).toBe(false)
  })

  test('one-way to the airport is departure only', () => {
    const plan = planTransferLegs({ tripType: 'one_way', fromAirport: false })
    expect(plan.hasArrivalLeg).toBe(false)
    expect(plan.hasDepartureLeg).toBe(true)
  })

  test('derives from the stated direction, never from which timestamps are present', () => {
    // The pre-fix inference keyed on arrivalAt: omitting it produced a
    // booking with NO legs at all — no flight required, no lead time, a
    // payable transfer dispatched to nobody.
    const plan = planTransferLegs({ tripType: 'one_way', fromAirport: true })
    expect(plan.hasArrivalLeg).toBe(true)
  })

  test('legacy carts (no direction field) keep the old arrivalAt inference', () => {
    const arrival = planTransferLegs({ tripType: 'one_way', arrivalAt: '2026-09-01T14:00:00Z' })
    expect(arrival.hasArrivalLeg).toBe(true)
    expect(arrival.hasDepartureLeg).toBe(false)

    const departure = planTransferLegs({ tripType: 'one_way' })
    expect(departure.hasArrivalLeg).toBe(false)
    expect(departure.hasDepartureLeg).toBe(true)
  })
})

describe('stray-leg detection', () => {
  test('the audit scenario: one-way airport pickup smuggling a departure leg', () => {
    const plan = planTransferLegs({
      tripType: 'one_way',
      fromAirport: true,
      arrivalAt: '2026-09-01T14:00:00Z',
      arrivalFlight: 'AA123',
      departureAt: '2026-09-05T09:00:00Z',
      departureFlight: 'AA321',
    })
    expect(plan.strayLeg).toBe('departure')
  })

  test('one-way ride to the airport smuggling an arrival leg', () => {
    const plan = planTransferLegs({
      tripType: 'one_way',
      fromAirport: false,
      departureAt: '2026-09-05T09:00:00Z',
      departureFlight: 'AA321',
      arrivalAt: '2026-09-01T14:00:00Z',
    })
    expect(plan.strayLeg).toBe('arrival')
  })

  test('a stray flight number alone is enough — dispatch renders it', () => {
    const plan = planTransferLegs({
      tripType: 'one_way',
      fromAirport: true,
      arrivalAt: '2026-09-01T14:00:00Z',
      departureFlight: 'AA321',
    })
    expect(plan.strayLeg).toBe('departure')
  })

  test('legacy departure-only cart carrying arrival fields is stray', () => {
    const plan = planTransferLegs({
      tripType: 'one_way',
      departureAt: '2026-09-05T09:00:00Z',
      arrivalFlight: 'AA123',
    })
    expect(plan.strayLeg).toBe('arrival')
  })

  test('a round trip can never have a stray leg', () => {
    const plan = planTransferLegs({
      tripType: 'round_trip',
      fromAirport: true,
      arrivalAt: '2026-09-01T14:00:00Z',
      arrivalFlight: 'AA123',
      departureAt: '2026-09-05T09:00:00Z',
      departureFlight: 'AA321',
    })
    expect(plan.strayLeg).toBeNull()
  })

  test('clean one-way payloads are not stray', () => {
    expect(
      planTransferLegs({
        tripType: 'one_way',
        fromAirport: true,
        arrivalAt: '2026-09-01T14:00:00Z',
        arrivalFlight: 'AA123',
      }).strayLeg,
    ).toBeNull()
    expect(
      planTransferLegs({
        tripType: 'one_way',
        fromAirport: false,
        departureAt: '2026-09-05T09:00:00Z',
        departureFlight: 'AA321',
      }).strayLeg,
    ).toBeNull()
  })

  test('empty and whitespace-only fields do not count as a stray leg', () => {
    const plan = planTransferLegs({
      tripType: 'one_way',
      fromAirport: true,
      arrivalAt: '2026-09-01T14:00:00Z',
      arrivalFlight: 'AA123',
      departureAt: '',
      departureFlight: '   ',
    })
    expect(plan.strayLeg).toBeNull()
  })
})
