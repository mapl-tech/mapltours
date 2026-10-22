import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import TransferConfirmed from '../../emails/TransferConfirmed'
import TransferOperatorAlert from '../../emails/TransferOperatorAlert'

/**
 * A transfer email must say when the guest is collected.
 *
 * The departure block used to be gated on `tripType === 'round_trip'`, so a
 * ONE-WAY hotel-to-airport ride rendered neither leg: the guest got a
 * confirmation with a price and a destination and no date, no time and no
 * flight number, and the operator alert dropped it the same way. Each leg is
 * now gated on its own timestamp, which is the only thing that decides
 * whether the leg exists.
 */

const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')

const leg = {
  destination: 'Riu Negril',
  zone: 'D',
  passengers: 2,
  priceUsd: 111,
}

const guest = {
  bookingRef: 'MAPL-TEST', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
  customerPhone: null, country: 'US', subtotal: null, bookingFee: null,
  totalPaid: 111, currency: 'USD', paidAt: null, specialRequests: null,
}

const ops = {
  bookingRef: 'MAPL-TEST', customerName: 'Ada Lovelace', customerEmail: 'ada@example.com',
  customerPhone: null, customerCountry: 'US', specialRequests: null,
  totalPaid: 111, currency: 'USD',
}

describe('a one-way hotel to airport transfer', () => {
  const oneWay = {
    ...leg,
    tripType: 'one_way' as const,
    arrivalFlight: null,
    arrivalAt: null,
    departureFlight: 'VS0166',
    departureAt: '2026-09-20T14:30:00+00:00',
  }

  test('the guest is told when they are collected', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [oneWay] } as never)))
    expect(text).toContain('Hotel pickup')
    expect(text).toContain('VS0166')
    // Stored as Jamaica wall-clock, so it must read back as 2:30 PM.
    expect(text).toMatch(/2:30\s?PM/)
  })

  test('the driver is told the same thing', async () => {
    const text = strip(await render(TransferOperatorAlert({ ...ops, transfers: [oneWay] } as never)))
    expect(text).toContain('VS0166')
    expect(text).toMatch(/2:30\s?PM/)
  })
})

describe('a coupon on a transfer', () => {
  const ride = { ...leg, tripType: 'one_way' as const, arrivalFlight: 'VS0165', arrivalAt: '2026-09-20T21:05:00+00:00', departureFlight: null, departureAt: null }

  test('the guest sees the fare, the code and the total, never the driver split', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, totalPaid: 119.7, subtotal: 100, bookingFee: 26, couponCode: 'JAMAICA5', couponDiscount: 6.3, transfers: [ride] } as never)))
    expect(text).toContain('Code JAMAICA5')
    expect(text).toContain('6.30')
    expect(text).toContain('126.00')
    expect(text).not.toContain('Subtotal')
    expect(text).not.toContain('Service fee')
    expect(text).not.toContain('100.00')
  })

  test('without a code the summary is the total alone', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, totalPaid: 126, subtotal: 100, bookingFee: 26, transfers: [ride] } as never)))
    expect(text).not.toContain('Code ')
    expect(text).not.toContain('Subtotal')
    expect(text).not.toContain('100.00')
  })
})

describe('a one-way airport to hotel transfer', () => {
  const arrival = {
    ...leg,
    tripType: 'one_way' as const,
    arrivalFlight: 'VS0165',
    arrivalAt: '2026-09-20T21:05:00+00:00',
    departureFlight: null,
    departureAt: null,
  }

  test('still renders its own leg and nothing else', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [arrival] } as never)))
    expect(text).toContain('VS0165')
    expect(text).toMatch(/9:05\s?PM/)
    expect(text).not.toContain('Hotel pickup')
  })
})

describe('a round trip', () => {
  const round = {
    ...leg,
    tripType: 'round_trip' as const,
    arrivalFlight: 'VS0165',
    arrivalAt: '2026-09-20T21:05:00+00:00',
    departureFlight: 'VS0166',
    departureAt: '2026-09-27T14:30:00+00:00',
  }

  test('renders both legs', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [round] } as never)))
    expect(text).toContain('VS0165')
    expect(text).toContain('VS0166')
    expect(text).toContain('Hotel pickup')
  })
})

/**
 * What the confirmation PROMISES has to match which way the ride runs. It used
 * to say "your driver will be waiting in the arrivals area" and print an "On
 * arrival at MBJ" card for every transfer, including a hotel-to-airport
 * one-way, where the guest is picked up at the hotel and dropped at the
 * airport and nobody is waiting in arrivals.
 */
describe('the confirmation copy follows the direction of the ride', () => {
  const departureOnly = {
    ...leg,
    tripType: 'one_way' as const,
    arrivalFlight: null,
    arrivalAt: null,
    departureFlight: 'VS0166',
    departureAt: '2026-09-20T14:30:00+00:00',
  }
  const arrivalOnly = {
    ...leg,
    tripType: 'one_way' as const,
    arrivalFlight: 'VS0165',
    arrivalAt: '2026-09-20T21:05:00+00:00',
    departureFlight: null,
    departureAt: null,
  }
  const roundTrip = {
    ...leg,
    tripType: 'round_trip' as const,
    arrivalFlight: 'VS0165',
    arrivalAt: '2026-09-20T21:05:00+00:00',
    departureFlight: 'VS0166',
    departureAt: '2026-09-27T14:30:00+00:00',
  }
  const arrivalsCopy = ['waiting in the arrivals area', 'On arrival at MBJ', 'Clear immigration', 'collect your bags', 'Exit the terminal at arrivals']

  test('a hotel-to-airport one-way is picked up at the hotel, not met in arrivals', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [departureOnly] } as never)))
    expect(text).toContain('Your driver will pick you up at your hotel and take you to Sangster International Airport (MBJ)')
    expect(text).toContain('Before you go')
    expect(text).toContain('Your driver will be waiting outside your hotel')
    expect(text).toContain('If your flight time changes, reply to this email and we will adjust your pickup')
    // The shared last step and the cancellation note are still there.
    expect(text).toContain('Reach us any time at contact@mapltours.com')
    expect(text).toContain('Flexible cancellation within 48 hours of booking')
    for (const line of arrivalsCopy) expect(text, line).not.toContain(line)
    // House rule: no em dashes in guest copy.
    expect(text).not.toContain('—')
  })

  test('an airport-to-hotel one-way keeps the arrival copy', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [arrivalOnly] } as never)))
    for (const line of arrivalsCopy) expect(text, line).toContain(line)
    expect(text).not.toContain('Before you go')
    expect(text).not.toContain('pick you up at your hotel')
  })

  test('a round trip keeps the arrival copy, since the guest lands first', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [roundTrip] } as never)))
    for (const line of arrivalsCopy) expect(text, line).toContain(line)
    expect(text).not.toContain('Before you go')
  })

  test('a booking with an arrival leg anywhere in it keeps the arrival copy', async () => {
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [departureOnly, arrivalOnly] } as never)))
    expect(text).toContain('On arrival at MBJ')
    expect(text).not.toContain('Before you go')
  })

  test('a ride with no timestamps at all keeps the arrival copy', async () => {
    const bare = { ...leg, tripType: 'one_way' as const, arrivalFlight: null, arrivalAt: null, departureFlight: null, departureAt: null }
    const text = strip(await render(TransferConfirmed({ ...guest, transfers: [bare] } as never)))
    expect(text).toContain('On arrival at MBJ')
    expect(text).not.toContain('Before you go')
  })

  test('the operator alert asks for the pickup to be checked against the flight, not for an arrival to be tracked', async () => {
    const text = strip(await render(TransferOperatorAlert({ ...ops, transfers: [departureOnly] } as never)))
    expect(text).toContain('check the pickup time against the flight')
    expect(text).not.toContain('flight-track arrival')
  })

  test('the operator alert still flight-tracks any ride with an arrival', async () => {
    for (const ride of [arrivalOnly, roundTrip]) {
      const text = strip(await render(TransferOperatorAlert({ ...ops, transfers: [ride] } as never)))
      expect(text).toContain('flight-track arrival')
      expect(text).not.toContain('check the pickup time against the flight')
    }
  })
})
