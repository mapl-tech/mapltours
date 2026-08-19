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
