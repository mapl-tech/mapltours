import { describe, test, expect, vi } from 'vitest'

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'u1', email: 'ada@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } },
      }),
    },
  }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self, in: self, order: self, limit: self, or: self, eq: self, update: self, is: self,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: state.rows, error: null }).then(resolve),
      })
      return chain
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({ sendEmail: async () => ({ ok: true }) }))

import { transferTitle } from '../../lib/transfer-legs'
import { shapeItems } from '../../lib/email/cancellation'
import { GET } from '../../app/api/profile/bookings/route'

/**
 * A booked ride is titled in the direction it runs.
 *
 * The cancellation and refund emails, and the guest's own Profile, titled
 * every transfer "MBJ to {hotel}". A guest who booked a hotel-to-airport
 * one-way read that they had been picked up at the airport, and the
 * cancellation email left the date blank because it read arrival_at alone.
 */

const arrival = { hotel: 'Riu Negril', trip_type: 'one_way', arrival_at: '2026-10-18T21:05:00+00:00', departure_at: null }
const departure = { hotel: 'Riu Negril', trip_type: 'one_way', arrival_at: null, departure_at: '2026-10-18T14:30:00+00:00' }
const round = {
  hotel: 'Riu Negril', trip_type: 'round_trip',
  arrival_at: '2026-10-18T21:05:00+00:00', departure_at: '2026-10-25T14:30:00+00:00',
}

describe('transferTitle', () => {
  test('an airport-to-hotel ride reads MBJ to the hotel, as it always did', () => {
    expect(transferTitle(arrival)).toBe('Airport transfer: MBJ to Riu Negril')
  })

  test('a hotel-to-airport one-way reads the hotel to MBJ', () => {
    expect(transferTitle(departure)).toBe('Airport transfer: Riu Negril to MBJ')
  })

  test('a round trip keeps its label and starts at the airport', () => {
    expect(transferTitle(round)).toBe('Airport transfer (round trip): MBJ to Riu Negril')
  })

  test('falls back to the destination, then to "your hotel"', () => {
    expect(transferTitle({ destination: 'Negril', arrival_at: arrival.arrival_at })).toBe('Airport transfer: MBJ to Negril')
    expect(transferTitle({ departure_at: departure.departure_at })).toBe('Airport transfer: your hotel to MBJ')
  })

  test('a ride with no timestamps at all keeps the old reading', () => {
    expect(transferTitle({ hotel: 'Riu Negril', trip_type: 'one_way' })).toBe('Airport transfer: MBJ to Riu Negril')
  })
})

describe('the cancellation and refund emails', () => {
  const transferBooking = { booking_type: 'transfer' }

  test('a hotel-to-airport one-way carries its direction and its pickup date', () => {
    const [item] = shapeItems(transferBooking, [{ ...departure, passengers: 2 }])
    expect(item.title).toBe('Airport transfer: Riu Negril to MBJ')
    expect(item.date).toBe('2026-10-18')
    expect(item.travelers).toBe(2)
  })

  test('an airport-to-hotel one-way is unchanged', () => {
    const [item] = shapeItems(transferBooking, [{ ...arrival, passengers: 3 }])
    expect(item.title).toBe('Airport transfer: MBJ to Riu Negril')
    expect(item.date).toBe('2026-10-18')
  })

  test('a round trip is dated by its arrival, as before', () => {
    const [item] = shapeItems(transferBooking, [{ ...round, passengers: 2 }])
    expect(item.title).toBe('Airport transfer (round trip): MBJ to Riu Negril')
    expect(item.date).toBe('2026-10-18')
  })

  test('tours are untouched', () => {
    const [item] = shapeItems({ booking_type: 'tour' }, [
      { title: "Dunn's River Falls Climb", destination: 'Ocho Rios', date: '2026-10-20', travelers: 2 },
    ])
    expect(item).toEqual({ title: "Dunn's River Falls Climb", destination: 'Ocho Rios', date: '2026-10-20', travelers: 2 })
  })
})

describe("the guest's Profile", () => {
  const paid = (id: string, item: Record<string, unknown>) => ({
    id, created_at: '2026-10-01T12:00:00Z', paid_at: '2026-10-01T12:01:00Z', total_paid: 126, status: 'paid',
    booking_type: 'transfer', email: 'ada@example.com', user_id: 'u1', dispatch: {},
    booking_items: [{ passengers: 2, ...item }],
  })

  test('titles each ride in the direction it runs', async () => {
    state.rows = [
      paid('11111111-0000-0000-0000-000000000000', departure),
      paid('22222222-0000-0000-0000-000000000000', arrival),
    ]
    const res = await GET()
    const { data } = (await res.json()) as { data: Array<{ booking_items: Array<{ title: string; date: string }> }> }
    expect(data[0].booking_items[0].title).toBe('Airport transfer: Riu Negril to MBJ')
    expect(data[0].booking_items[0].date).toBe('2026-10-18')
    expect(data[1].booking_items[0].title).toBe('Airport transfer: MBJ to Riu Negril')
  })
})
