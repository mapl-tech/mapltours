import { describe, test, expect } from 'vitest'
import { moneyBlock, msgCustomerConfirmation, msgDriverRequest, type Bk } from '../../lib/dispatch'

/**
 * The messages the operator pastes into WhatsApp must describe the ride the
 * guest actually booked.
 *
 * Both builders printed an ARRIVAL block for every transfer ("Pick up: the
 * airport") and only added the DEPARTURE block for a round trip. For a
 * one-way hotel-to-airport ride the driver was told to collect the guest at
 * the airport on a date of "-", the departure never appeared, and the guest's
 * own copy promised a driver "in the airport arrivals area".
 */

const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay, Jamaica'

const booking = (item: Record<string, unknown>): Bk => ({
  id: '1a2b3c4d-0000-0000-0000-000000000000',
  first_name: 'Ada',
  last_name: 'Lovelace',
  phone: '+1 555 0100',
  country: 'US',
  subtotal: 100,
  booking_fee: 26,
  total_paid: 126,
  driver_name: 'Collin',
  driver_phone: '+1 876 919-7534',
  driver_vehicle: 'Toyota Noah minivan, black',
  driver_plate: 'PM 9482',
  booking_items: [{ hotel: 'Riu Negril', passengers: 2, price_per_person: 126, ...item }],
})

const departureOnly = booking({
  trip_type: 'one_way', departure_at: '2026-09-20T14:30:00+00:00', departure_flight: 'VS0166',
})
const arrivalOnly = booking({
  trip_type: 'one_way', arrival_at: '2026-09-20T21:05:00+00:00', arrival_flight: 'VS0165',
})
const roundTrip = booking({
  trip_type: 'round_trip',
  arrival_at: '2026-09-20T21:05:00+00:00', arrival_flight: 'VS0165',
  departure_at: '2026-09-27T14:30:00+00:00', departure_flight: 'VS0166',
})

// Recent ICU puts a narrow no-break space before "PM"; read it as a plain space.
const norm = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')
const driverMsg = (b: Bk) => norm(msgDriverRequest(b, moneyBlock(b, null)))
const customerMsg = (b: Bk) => norm(msgCustomerConfirmation(b))

describe('the driver request', () => {
  test('a hotel-to-airport one-way sends the driver to the hotel, not the airport', () => {
    const m = driverMsg(departureOnly)
    expect(m).toContain('DEPARTURE')
    expect(m).toContain('Pick up: Riu Negril')
    expect(m).toContain(`Drop-off: ${AIRPORT}`)
    expect(m).toContain('Date: Sunday, September 20, 2026')
    expect(m).toContain('Hotel pickup: 2:30 PM Jamaica time')
    expect(m).toContain('Departure flight: VS0166')
    expect(m).not.toContain('ARRIVAL')
    expect(m).not.toContain('Flight lands')
    expect(m).not.toContain(`Pick up: ${AIRPORT}`)
    expect(m).not.toContain('Date: -')
  })

  test('an airport-to-hotel one-way is unchanged', () => {
    const m = driverMsg(arrivalOnly)
    expect(m).toContain('ARRIVAL')
    expect(m).toContain(`Pick up: ${AIRPORT}`)
    expect(m).toContain('Drop-off: Riu Negril')
    expect(m).toContain('Flight lands: 9:05 PM Jamaica time (flight VS0165)')
    expect(m).not.toContain('DEPARTURE')
  })

  test('a round trip carries both legs, paid per leg', () => {
    const m = driverMsg(roundTrip)
    expect(m).toContain('ARRIVAL')
    expect(m).toContain('DEPARTURE')
    expect(m).toContain('Hotel pickup: 2:30 PM Jamaica time')
    expect(m).toContain('per leg')
  })
})

describe('the customer confirmation message', () => {
  test('a hotel-to-airport one-way promises a pickup at the hotel, not a driver in arrivals', () => {
    const m = customerMsg(departureOnly)
    expect(m).toContain('DEPARTURE')
    expect(m).toContain('Pick up: Riu Negril')
    expect(m).toContain(`Drop-off: ${AIRPORT}`)
    expect(m).toContain('Hotel pickup: 2:30 PM Jamaica time')
    expect(m).toContain('Your driver will pick you up at your hotel and take you to Sangster International Airport (MBJ).')
    expect(m).toContain('If you have any difficulty finding your driver, contact MAPL Tours Jamaica at contact@mapltours.com right away.')
    expect(m).toContain('Driver: Collin')
    expect(m).not.toContain('ARRIVAL')
    expect(m).not.toContain('arrivals area')
    expect(m).not.toContain('clearing customs')
    expect(m).not.toContain('Flight lands')
  })

  test('an airport-to-hotel one-way is unchanged', () => {
    const m = customerMsg(arrivalOnly)
    expect(m).toContain('ARRIVAL')
    expect(m).toContain('Your driver will meet you in the airport arrivals area holding a MAPL Tours Jamaica sign.')
    expect(m).toContain('after clearing customs')
    expect(m).not.toContain('DEPARTURE')
  })

  test('a round trip keeps the arrival promise and lists the departure', () => {
    const m = customerMsg(roundTrip)
    expect(m).toContain('ARRIVAL')
    expect(m).toContain('DEPARTURE')
    expect(m).toContain('Your driver will meet you in the airport arrivals area')
    expect(m).not.toContain('pick you up at your hotel')
  })
})
