import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  FOLLOW_UPS, FOLLOW_UP_WINDOW_HOURS, cartReminderSecret, cartStopUrl, couponBasis, followUpDue,
  followUpLink, handoffFromBooking, signCartStop, stillBookable, verifyCartStop,
} from '@/lib/cart-reminders'
import { parseHandoff } from '@/lib/agent/booking-link'
import { followUpPreheader, followUpSubject } from '@/emails/AbandonedCartFollowUp'

/**
 * The follow-up's pure rules and the stop route. Synthetic rows only.
 */

const state = vi.hoisted(() => ({
  booking: null as Record<string, unknown> | null,
  upserts: [] as Array<{ row: Record<string, unknown>; opts: Record<string, unknown> }>,
  upsertError: false,
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'bookings') {
        const c: Record<string, unknown> = {}
        Object.assign(c, { select: () => c, eq: () => c, maybeSingle: async () => ({ data: state.booking, error: null }) })
        return c
      }
      if (table === 'cart_reminder_stops') {
        return {
          upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
            state.upserts.push({ row, opts })
            return { error: state.upsertError ? { message: 'boom' } : null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))
import * as stopRoute from '@/app/api/cart-reminders/stop/route'

const HOUR = 3_600_000
const KEY = 'unit-test-cart-key-0123456789'
const ID = 'bbbbbbbb-1111-2222-3333-444444444444'

describe('the steps', () => {
  test('day 3 without the code, day 7 with it, both counted from the first reminder (owner, Nov 15 2026)', () => {
    expect(FOLLOW_UPS).toEqual([{ step: 2, afterHours: 72, coupon: false }, { step: 3, afterHours: 168, coupon: true }])
  })
  const now = Date.parse('2026-11-20T12:00:00Z')
  const at = (h: number) => new Date(now - h * HOUR).toISOString()
  test.each(FOLLOW_UPS.map((s) => [s.step, s.afterHours]))('step %i: from %i hours after the first, for 48 hours', (_step, after) => {
    expect(followUpDue(at(after - 0.01), now, after)).toBe(false)
    expect(followUpDue(at(after), now, after)).toBe(true)
    expect(followUpDue(at(after + FOLLOW_UP_WINDOW_HOURS - 0.01), now, after)).toBe(true)
    expect(followUpDue(at(after + FOLLOW_UP_WINDOW_HOURS), now, after)).toBe(false)
    expect(followUpDue(null, now, after)).toBe(false)
    expect(followUpDue('nonsense', now, after)).toBe(false)
  })
})

describe('handoffFromBooking', () => {
  const ride = {
    hotel: 'Samsara Cliff Resort, Negril', trip_type: 'round_trip', passengers: 3,
    arrival_at: '2027-01-10T14:30:00+00:00', arrival_flight: 'AA 1234', departure_at: '2027-01-17T09:00:00+00:00', departure_flight: 'AA 4321',
  }
  test('a ride: hotel by its exact name, wall-clock legs, flights; nothing personal', () => {
    const h = handoffFromBooking({ booking_type: 'transfer', email: 'x@example.com', first_name: 'X', booking_items: [ride] })
    expect(h).toEqual({ kind: 'ride', destinationId: 'samsara-cliff-negril', tripType: 'round_trip', passengers: 3, fromAirport: true, arrivalAt: '2027-01-10T14:30', arrivalFlight: 'AA 1234', departureAt: '2027-01-17T09:00', departureFlight: 'AA 4321' })
    const link = followUpLink('https://mapltours.com', h!, 2)
    expect(link).not.toMatch(/example\.com|first_name/)
    // /book reads it back as the same ride (flight numbers in their compact form).
    expect(parseHandoff(new URL(link).searchParams, new Date('2026-11-20T12:00:00Z'))).toEqual({ ok: true, handoff: { ...h, arrivalFlight: 'AA1234', departureFlight: 'AA4321' } })
  })
  test('a one-way home has only its pickup and goes to the airport', () => {
    const h = handoffFromBooking({ booking_type: 'transfer', booking_items: [{ ...ride, trip_type: 'one_way', arrival_at: null, arrival_flight: null }] })
    expect(h).toMatchObject({ tripType: 'one_way', fromAirport: false, departureAt: '2027-01-17T09:00' })
    expect(h).not.toHaveProperty('arrivalAt')
  })
  test('nothing a link cannot carry exactly: an unknown hotel, two items, no items', () => {
    expect(handoffFromBooking({ booking_type: 'transfer', booking_items: [{ ...ride, hotel: 'Somewhere Else' }] })).toBeNull()
    expect(handoffFromBooking({ booking_type: 'tour', booking_items: [{ experience_id: 3, date: '2027-01-10', travelers: 2 }, { experience_id: 1, date: '2027-01-11', travelers: 2 }] })).toBeNull()
    expect(handoffFromBooking({ booking_type: 'tour', booking_items: [] })).toBeNull()
    expect(handoffFromBooking({ booking_type: 'tour', booking_items: [{ experience_id: 99999, date: '2027-01-10', travelers: 2 }] })).toBeNull()
  })
  test('a tour: its slug, party, date and pickup', () => {
    expect(handoffFromBooking({ booking_type: 'tour', pickup: 'Iberostar Waves Rose Hall', booking_items: [{ experience_id: 3, date: '2027-01-10', travelers: 2 }] }))
      .toEqual({ kind: 'tour', slug: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-01-10', pickupHotel: 'Iberostar Waves Rose Hall' })
  })
})

describe('stillBookable', () => {
  const now = Date.parse('2026-11-20T12:00:00Z')
  test('a day of room past the 12-hour rule', () => {
    const tour = (date: string) => ({ booking_type: 'tour', booking_items: [{ experience_id: 3, date, travelers: 2 }] })
    expect(stillBookable(tour('2026-11-23'), followUpLink('https://mapltours.com', handoffFromBooking(tour('2026-11-23'))!, 2), now)).toBe(true)
    expect(stillBookable(tour('2026-11-21'), followUpLink('https://mapltours.com', handoffFromBooking(tour('2026-11-21'))!, 3), now)).toBe(false)
    expect(stillBookable({ booking_type: 'tour', booking_items: [{ date: '2026-11-25' }, { date: '2026-11-21' }] }, null, now)).toBe(false)
    expect(stillBookable({ booking_type: 'transfer', booking_items: [{ arrival_at: '2026-11-21T08:00:00+00:00' }] }, null, now)).toBe(false)
    expect(stillBookable({ booking_type: 'transfer', booking_items: [{ arrival_at: '2026-11-25T08:00:00+00:00' }] }, null, now)).toBe(true)
  })
})

describe('couponBasis', () => {
  test('the base and margin the checkout routes use', () => {
    expect(couponBasis({ booking_type: 'transfer', total_paid: 199, booking_fee: 29 })).toEqual({ baseCents: 19900, marginCents: 2900, bookingType: 'transfer' })
    // A tour's margin is the fee less the clip reward already taken from it.
    expect(couponBasis({ booking_type: 'tour', total_paid: 218.5, booking_fee: 30, reward_discount: 11.5 })).toEqual({ baseCents: 21850, marginCents: 1850, bookingType: 'tour' })
  })
  test('none with a code or a gift card already on the cart', () => {
    expect(couponBasis({ booking_type: 'tour', total_paid: 100, booking_fee: 20, coupon_code: 'JAMAICA5' })).toBeNull()
    expect(couponBasis({ booking_type: 'tour', total_paid: 100, booking_fee: 20, gift_card_amount: '25' })).toBeNull()
    expect(couponBasis({ booking_type: 'tour', total_paid: 0, booking_fee: 0 })).toBeNull()
  })
})

describe('the subject and preview', () => {
  const base = { currency: 'USD', anyDevice: true }
  const code = { code: 'JAMAICA5', discount: 9.95, totalWithCode: 189.05 }
  test('day 7 leads with the saving; day 3 with the trip, and never shows a code even if handed one', () => {
    expect(followUpSubject({ ...base, step: 3, kind: 'transfer', coupon: code })).toBe('$9.95 off your airport ride')
    expect(followUpSubject({ ...base, step: 2, kind: 'transfer', coupon: code })).toBe('Your airport ride is still saved')
    expect(followUpSubject({ ...base, step: 2, kind: 'tour', tourTitle: 'Bamboo Rafting on the Martha Brae', coupon: null })).toBe('Bamboo Rafting on the Martha Brae is still saved')
    expect(followUpSubject({ ...base, step: 2, kind: 'tour', tourTitle: null, coupon: null })).toBe('Your Jamaica trip is still saved')
    expect(followUpPreheader({ ...base, step: 3, kind: 'transfer', coupon: code }))
      .toBe('JAMAICA5 takes $9.95 off. Your airport ride is saved, ready to finish on any phone or computer.')
    expect(followUpPreheader({ ...base, step: 2, kind: 'transfer', coupon: code }))
      .toBe('Your airport ride is saved, ready to finish on any phone or computer.')
  })
})

describe('the stop link', () => {
  test('signed per cart; the key needs 16 characters; CART_REMINDER_SECRET first', () => {
    const t = signCartStop(ID, KEY)
    expect(verifyCartStop(ID, t, KEY)).toBe(true)
    expect(verifyCartStop(ID.toUpperCase(), signCartStop(ID.toUpperCase(), KEY), KEY)).toBe(true)
    expect(verifyCartStop('cccccccc-1111-2222-3333-444444444444', t, KEY)).toBe(false)
    expect(verifyCartStop(ID, t, `${KEY}x`)).toBe(false)
    expect(verifyCartStop('not-a-uuid', t, KEY)).toBe(false)
    expect(verifyCartStop(ID, 'x'.repeat(101), KEY)).toBe(false)
    expect(cartReminderSecret({ TRIP_TIPS_SECRET: 'short' } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(cartReminderSecret({ TRIP_TIPS_SECRET: KEY, CART_REMINDER_SECRET: `${KEY}c` } as unknown as NodeJS.ProcessEnv)).toBe(`${KEY}c`)
    expect(cartStopUrl('https://mapltours.com/', ID, KEY)).toBe(`https://mapltours.com/api/cart-reminders/stop?b=${ID}&t=${t}`)
  })
})

describe('/api/cart-reminders/stop', () => {
  beforeEach(() => {
    process.env.CART_REMINDER_SECRET = KEY
    state.booking = { id: ID, email: 'Vanessa.Grant+trip@GMAIL.com' }
    state.upserts = []
    state.upsertError = false
  })
  const url = (b: string, t: string) => `https://mapltours.com/api/cart-reminders/stop?b=${b}&t=${t}`

  test('GET is a page with one button and records nothing', async () => {
    const res = await stopRoute.GET(new NextRequest(url(ID, signCartStop(ID, KEY))))
    const body = await res.text()
    expect(res.status).toBe(200)
    expect(body).toContain('<form method="post"')
    expect(body).toContain('MAPL Tours Jamaica')
    expect(body).not.toContain('—')
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(state.upserts).toHaveLength(0)
  })
  test('the button records the inbox the way the sweep reads it', async () => {
    const res = await stopRoute.POST(new NextRequest(url(ID, signCartStop(ID, KEY)), { method: 'POST', body: '' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('No more reminders')
    expect(state.upserts).toEqual([{ row: { inbox: 'vanessagrant@gmail.com', booking_id: ID }, opts: { onConflict: 'inbox', ignoreDuplicates: true } }])
  })
  test('one-click answers 200 with no body', async () => {
    const res = await stopRoute.POST(new NextRequest(url(ID, signCartStop(ID, KEY)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
    expect(state.upserts).toHaveLength(1)
  })
  test("a token for one cart cannot stop another's reminders", async () => {
    const other = 'cccccccc-1111-2222-3333-444444444444'
    const res = await stopRoute.POST(new NextRequest(url(other, signCartStop(ID, KEY)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(res.status).toBe(400)
    expect(state.upserts).toHaveLength(0)
  })
  test('a write that fails says so (500), so a mail app tries again', async () => {
    state.upsertError = true
    const res = await stopRoute.POST(new NextRequest(url(ID, signCartStop(ID, KEY)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(res.status).toBe(500)
  })
  test('a cart already purged has nothing left to remind about', async () => {
    state.booking = null
    const res = await stopRoute.POST(new NextRequest(url(ID, signCartStop(ID, KEY)), { method: 'POST', body: '' }))
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(0)
  })
})
