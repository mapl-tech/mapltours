import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const db = vi.hoisted(() => ({ item: {} as Record<string, unknown>, owner: true }))

// The page reads the booking and its items from Supabase. The gift-covered
// path (`booking_id`, no PaymentIntent) needs no Stripe, so a fake client that
// answers both queries is enough to render the confirmation for any ride.
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const result =
        table === 'bookings'
          ? {
              data: {
                id: '1a2b3c4d-0000-0000-0000-000000000000', first_name: 'Ada', subtotal: 100, booking_fee: 26,
                coupon_code: null, coupon_discount: null, total_paid: 126, currency: 'usd',
                paid_at: '2026-09-01T12:00:00Z', status: 'paid', booking_type: 'transfer',
              },
            }
          : { data: [{ hotel: 'Riu Negril', destination: 'Negril', zone: 'D', passengers: 2, price_per_person: 126, ...db.item }] }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => result
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return chain
    },
  }),
}))
vi.mock('../../app/transfers/confirm/ConfirmClient', () => ({ default: () => null }))
// Whether this browser booked the ride (lib/confirm-proof). Tested on its own
// in confirm-proof.spec.ts; here it is the switch between the two views.
vi.mock('@/lib/confirm-proof-server', () => ({ canSeeConfirmation: async () => db.owner }))
vi.mock('@/components/ClaimAccountCard', () => ({ default: () => null }))

import TransferConfirmPage from '../../app/transfers/confirm/page'

/**
 * The page a guest lands on after paying says the same thing as the
 * confirmation email: where they are picked up and what to do next.
 *
 * Two faults for a ONE-WAY hotel-to-airport ride: the departure leg was gated
 * on `tripType === 'round_trip'`, so the page showed no date, time or flight
 * at all, and the closing card told the guest to clear immigration and look
 * for a driver at arrivals.
 */

const page = async (item: Record<string, unknown>, owner = true) => {
  db.item = item
  db.owner = owner
  const el = await TransferConfirmPage({
    searchParams: { booking_id: '1a2b3c4d-0000-0000-0000-000000000000' },
  })
  return renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')
}

const arrivalsCopy = ['On arrival at MBJ', 'Clear immigration', 'Exit the terminal at arrivals']

describe('a one-way hotel to airport ride', () => {
  const ride = { trip_type: 'one_way', departure_at: '2026-09-20T14:30:00+00:00', departure_flight: 'VS0166' }

  test('shows its only leg: the hotel pickup, time and flight', async () => {
    const text = await page(ride)
    expect(text).toContain('Departure · hotel → MBJ')
    expect(text).toContain('Hotel pickup')
    expect(text).toMatch(/2:30\s?PM/)
    expect(text).toContain('VS0166')
    expect(text).not.toContain('Arrival · MBJ → hotel')
  })

  test('tells the guest about the pickup, not about arrivals', async () => {
    const text = await page(ride)
    expect(text).toContain('Before you go')
    expect(text).toContain('Your driver will be waiting outside your hotel')
    expect(text).toContain('reply to your confirmation email and we will adjust your pickup')
    expect(text).toContain('Reach us any time')
    expect(text).toContain('Flexible cancellation within 48 hours of booking')
    for (const line of arrivalsCopy) expect(text, line).not.toContain(line)
  })
})

describe('a one-way airport to hotel ride', () => {
  const ride = { trip_type: 'one_way', arrival_at: '2026-09-20T21:05:00+00:00', arrival_flight: 'VS0165' }

  test('keeps the arrival card and shows no departure leg', async () => {
    const text = await page(ride)
    expect(text).toContain('Arrival · MBJ → hotel')
    for (const line of arrivalsCopy) expect(text, line).toContain(line)
    expect(text).not.toContain('Before you go')
    expect(text).not.toContain('Departure · hotel → MBJ')
  })

  test('names the brand in full on the sign the driver holds', async () => {
    // Owner rule: "MAPL Tours Jamaica", never "MAPL Tours" alone.
    const text = await page(ride)
    expect(text).toContain('holding a MAPL Tours Jamaica sign with your name')
    expect(text).not.toMatch(/MAPL Tours(?! Jamaica)/)
  })
})

describe('a one-way that carries both timestamps (an old phantom second leg)', () => {
  const ride = {
    trip_type: 'one_way',
    arrival_at: '2026-09-20T21:05:00+00:00', arrival_flight: 'VS0165',
    departure_at: '2026-09-27T14:30:00+00:00', departure_flight: 'VS0166',
  }

  test('shows only its arrival, exactly as before, and keeps the arrival card', async () => {
    const text = await page(ride)
    expect(text).toContain('Arrival · MBJ → hotel')
    expect(text).not.toContain('Departure · hotel → MBJ')
    expect(text).not.toContain('VS0166')
    for (const line of arrivalsCopy) expect(text, line).toContain(line)
    expect(text).not.toContain('Before you go')
  })
})

describe('a round trip', () => {
  const ride = {
    trip_type: 'round_trip',
    arrival_at: '2026-09-20T21:05:00+00:00', arrival_flight: 'VS0165',
    departure_at: '2026-09-27T14:30:00+00:00', departure_flight: 'VS0166',
  }

  test('shows both legs and keeps the arrival card', async () => {
    const text = await page(ride)
    expect(text).toContain('Arrival · MBJ → hotel')
    expect(text).toContain('Departure · hotel → MBJ')
    for (const line of arrivalsCopy) expect(text, line).toContain(line)
    expect(text).not.toContain('Before you go')
  })
})

// Oct 31 2026: anyone holding a confirmation link saw the guest's name, hotel,
// flights and pickup times, and the links sat in GA4, the Meta pixel and
// Hotjar. A browser that did not book the ride now sees that it is booked and
// how to sign in, and nothing about the guest or the trip.
describe('a browser that did not book the ride', () => {
  const ride = {
    trip_type: 'round_trip', arrival_at: '2026-11-17T12:22:00+00:00', arrival_flight: 'AA1131',
    departure_at: '2026-11-24T08:00:00+00:00', departure_flight: 'AA1651',
  }

  test('learns nothing about the guest or the trip', async () => {
    const text = await page(ride, false)
    for (const secret of ['Ada', 'Riu Negril', 'AA1131', 'AA1651', '12:22', '8:00', '126', 'passenger', 'Zone']) {
      expect(text, secret).not.toContain(secret)
    }
  })

  test('is told the ride is booked and how the guest sees it', async () => {
    const text = await page(ride, false)
    expect(text).toContain('Your ride is booked.')
    expect(text).toContain('MAPL-1A2B3C4D')
    expect(text).toContain('Use the email you booked with')
    expect(text).toContain('Sign in to see my trip')
    expect(text).toContain('Create my account')
    expect(text).toContain('contact@mapltours.com')
    expect(text).not.toContain('\u2014')
  })

  test('has one action, the sign-in, and it leads to the account', async () => {
    db.item = ride
    db.owner = false
    const html = renderToStaticMarkup(await TransferConfirmPage({ searchParams: { booking_id: '1a2b3c4d-0000-0000-0000-000000000000' } }))
    expect(html).toContain('href="/login?redirect=%2Fprofile"')
    // A guest who booked without an account goes straight to the sign-up form.
    expect(html).toContain('href="/login?mode=signup&amp;redirect=%2Fprofile"')
    expect(html).not.toContain('Add tours to your trip')
    expect(html).not.toContain('Book another transfer')
  })

  test('the browser that booked it still sees everything', async () => {
    const text = await page(ride, true)
    expect(text).toContain('Riu Negril')
    expect(text).toContain('AA1131')
    expect(text).not.toContain('Sign in to see my trip')
  })
})
