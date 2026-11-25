import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The travel party's routes, against the real handlers and the real proof
 * check (lib/confirm-proof-server canSeeConfirmation) over a fake database:
 * who may change a booking's party, what each answer says, that nothing here
 * ever writes to a booking, the stop link, and the middleware that turns the
 * booker's email link into the proof cookie.
 */

const env = vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  return {
    jar: '' as string | undefined,
    user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc: null as any,
    limited: false,
  }
})

vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'mapl_trip' && env.jar ? { name, value: env.jar } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => env.svc }))
vi.mock('@/lib/rate-limit', () => ({ getIp: () => '203.0.113.9', rateLimit: () => env.limited }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })) }))

import { sendEmail } from '@/lib/email/send'
import { POST, DELETE } from '@/app/api/travel-party/route'
import { GET as STOP_GET, POST as STOP_POST } from '@/app/api/travel-party/stop/route'
import { middleware } from '@/middleware'
import { PROOF_COOKIE, addProof, readProofs } from '@/lib/confirm-proof'
import { bookingProof } from '@/lib/confirm-proof-server'
import { partyStopUrl } from '@/lib/travel-party-server'
import { PARTY_COPY } from '@/lib/travel-party'
import { BOOKING_ID, fakeDb, member, rideBooking } from './travel-party-fakes'

const sendEmailMock = vi.mocked(sendEmail)
const SECRET = 'test-secret-for-travel-party-0123456789'

const call = (method: 'POST' | 'DELETE', body: unknown) =>
  (method === 'POST' ? POST : DELETE)(new NextRequest('https://mapltours.com/api/travel-party', {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))

const owner = () => { env.jar = addProof('', bookingProof(BOOKING_ID)!) }

beforeEach(() => {
  env.jar = ''
  env.user = null
  env.limited = false
  sendEmailMock.mockClear()
  vi.stubEnv('CART_REMINDER_SECRET', SECRET)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('who may change a party', () => {
  test('nobody without the proof or the owner signed in, and they learn nothing, not even whether the booking exists', async () => {
    const f = fakeDb({ bookings: [rideBooking()] })
    env.svc = f.svc
    for (const body of [{ bookingId: BOOKING_ID, email: 'friend@example.com' }, { bookingId: '29a59968-82af-4587-94cc-269dac9e4bbc', email: 'x@y.co' }, { bookingId: 'nope', email: 'x@y.co' }, null]) {
      const res = await call('POST', body)
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ ok: false, message: PARTY_COPY.notAllowed })
    }
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(f.db.rpc).toEqual([])
    expect(f.db.updates).toEqual([])
  })

  test('a proof for another booking opens nothing', async () => {
    env.svc = fakeDb({ bookings: [rideBooking()] }).svc
    env.jar = addProof('', bookingProof('29a59968-82af-4587-94cc-269dac9e4bbc')!)
    expect((await call('POST', { bookingId: BOOKING_ID, email: 'friend@example.com' })).status).toBe(403)
  })

  test('the browser that paid, or the owner signed in with a confirmed email, may', async () => {
    env.svc = fakeDb({ bookings: [rideBooking()] }).svc
    owner()
    expect((await call('POST', { bookingId: BOOKING_ID, email: 'friend1@example.com' })).status).toBe(200)
    env.jar = ''
    env.user = { id: 'u1', email: 'Ana@Example.com', email_confirmed_at: '2026-11-01T00:00:00Z' }
    expect((await call('POST', { bookingId: BOOKING_ID, email: 'friend2@example.com' })).status).toBe(200)
    env.user = { id: 'u1', email: 'ana@example.com', email_confirmed_at: null }
    expect((await call('POST', { bookingId: BOOKING_ID, email: 'friend3@example.com' })).status).toBe(403)
  })

  test('only while the booking is paid: refused before anything is written (the database refuses too)', async () => {
    const f = fakeDb({ bookings: [rideBooking({ status: 'refunded' })] })
    env.svc = f.svc
    owner()
    const res = await call('POST', { bookingId: BOOKING_ID, email: 'friend@example.com' })
    expect(res.status).toBe(409)
    expect((await res.json()).message).toBe(PARTY_COPY.notPaid)
    expect(f.db.rpc).toEqual([])
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test('too many tries from one address are slowed down', async () => {
    env.svc = fakeDb({ bookings: [rideBooking()] }).svc
    owner()
    env.limited = true
    const res = await call('POST', { bookingId: BOOKING_ID, email: 'friend@example.com' })
    expect(res.status).toBe(429)
    expect((await res.json()).message).toBe(PARTY_COPY.busy)
  })
})

describe('adding people', () => {
  test('each gets their own copy at once, and the list says so', async () => {
    const f = fakeDb({ bookings: [rideBooking()] })
    env.svc = f.svc
    owner()
    const res = await call('POST', { bookingId: BOOKING_ID, email: '  Friend1@Example.com ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true, message: PARTY_COPY.added('friend1@example.com'), cap: 3,
      members: [{ email: 'friend1@example.com', sent: true, stopped: false }],
    })
    expect(f.db.rpc).toEqual([{ fn: 'booking_party_add', args: { p_booking_id: BOOKING_ID, p_email: 'friend1@example.com', p_cap: 3 } }])
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect((sendEmailMock.mock.calls[0][0] as { to: string }).to).toBe('friend1@example.com')
    // Nothing here ever writes to a booking.
    expect(f.db.updates.filter((u) => u.table === 'bookings')).toEqual([])
  })

  test('every refusal in words the booker can act on', async () => {
    const f = fakeDb({ bookings: [rideBooking()], party: [member(9, { email: 'gone@example.com', stopped_at: '2026-11-24T00:00:00Z' })] })
    env.svc = f.svc
    owner()
    const say = async (email: unknown) => { const r = await call('POST', { bookingId: BOOKING_ID, email }); return [r.status, (await r.json()).message] }
    expect(await say('not an address')).toEqual([400, PARTY_COPY.invalid])
    expect(await say('ANA@example.com')).toEqual([409, PARTY_COPY.own])
    expect(await say('gone@example.com')).toEqual([409, PARTY_COPY.stopped])
    expect(await say('a1@example.com')).toEqual([200, PARTY_COPY.added('a1@example.com')])
    expect(await say('a1@example.com')).toEqual([200, PARTY_COPY.exists])
    expect(await say('a2@example.com')).toEqual([200, PARTY_COPY.added('a2@example.com')])
    expect(await say('a3@example.com')).toEqual([200, PARTY_COPY.added('a3@example.com')])
    // Three passengers: three people, then the party is full.
    expect(await say('a4@example.com')).toEqual([409, PARTY_COPY.full(3)])
    expect(sendEmailMock).toHaveBeenCalledTimes(3)
  })

  test('a copy that did not go is sent again by adding the same address; then never again', async () => {
    const f = fakeDb({ bookings: [rideBooking()] })
    env.svc = f.svc
    owner()
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    let r = await (await call('POST', { bookingId: BOOKING_ID, email: 'friend1@example.com' })).json()
    expect(r.message).toBe(PARTY_COPY.addedNotSent('friend1@example.com'))
    expect(r.members).toEqual([{ email: 'friend1@example.com', sent: false, stopped: false }])
    r = await (await call('POST', { bookingId: BOOKING_ID, email: 'friend1@example.com' })).json()
    expect(r.message).toBe(PARTY_COPY.added('friend1@example.com'))
    r = await (await call('POST', { bookingId: BOOKING_ID, email: 'friend1@example.com' })).json()
    expect(r.message).toBe(PARTY_COPY.exists)
    expect(sendEmailMock).toHaveBeenCalledTimes(2)
  })

  test('removing someone: off the list, and they get nothing more', async () => {
    const f = fakeDb({ bookings: [rideBooking()], party: [member(1, { confirmation_sent_at: 'x' })] })
    env.svc = f.svc
    owner()
    const res = await call('DELETE', { bookingId: BOOKING_ID, email: 'FRIEND1@example.com' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, message: PARTY_COPY.removed('friend1@example.com'), cap: 3, members: [] })
    expect(f.db.party[0].removed_at).toBeTruthy()
    expect((await call('DELETE', { bookingId: BOOKING_ID, email: 'x' })).status).toBe(400)
    env.jar = ''
    expect((await call('DELETE', { bookingId: BOOKING_ID, email: 'friend1@example.com' })).status).toBe(403)
  })
})

describe('the stop link', () => {
  test('opening it changes nothing; the button stops the emails for good', async () => {
    const f = fakeDb({ party: [member(1)] })
    env.svc = f.svc
    const url = partyStopUrl(member(1).id, SECRET)
    const page = await STOP_GET(new NextRequest(url))
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Stop these emails')
    expect(f.db.updates).toEqual([])
    const done = await STOP_POST(new NextRequest(url, { method: 'POST' }))
    expect(done.status).toBe(200)
    expect(await done.text()).toContain('No more emails about this trip')
    expect(f.db.party[0].stopped_at).toBeTruthy()
  })

  test("a mail app's one-click, and a broken link", async () => {
    const f = fakeDb({ party: [member(1)] })
    env.svc = f.svc
    const url = partyStopUrl(member(1).id, SECRET)
    const one = await STOP_POST(new NextRequest(url, { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(one.status).toBe(200)
    expect(await one.text()).toBe('')
    expect(f.db.party[0].stopped_at).toBeTruthy()
    const bad = url.replace(/t=[^&]+/, 't=forged')
    expect((await STOP_GET(new NextRequest(bad))).status).toBe(400)
    expect((await STOP_POST(new NextRequest(bad, { method: 'POST' }))).status).toBe(400)
  })
})

describe("the middleware and the booker's email link", () => {
  const cookieOf = (res: Response) => {
    const m = (res.headers.get('set-cookie') ?? '').match(new RegExp(`${PROOF_COOKIE}=([^;]*)`))
    return m ? readProofs(decodeURIComponent(m[1])) : null
  }
  const proof = () => bookingProof(BOOKING_ID)!

  test('the proof leaves the address before the page exists and lands in the HttpOnly cookie', async () => {
    const res = await middleware(new NextRequest(`https://mapltours.com/travel-party?b=${BOOKING_ID}&trip_proof=${proof()}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`https://mapltours.com/travel-party?b=${BOOKING_ID}`)
    expect(cookieOf(res)).toEqual([proof()])
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
  })

  test('on any other page it is dropped from the address and never kept', async () => {
    for (const path of ['/explore', '/transfers/confirm', '/checkout/confirm', '/']) {
      const res = await middleware(new NextRequest(`https://mapltours.com${path}?trip_proof=${proof()}`))
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).not.toContain('trip_proof')
      expect(cookieOf(res)).toBeNull()
    }
  })

  test('something not shaped like a proof is dropped and not kept', async () => {
    const res = await middleware(new NextRequest(`https://mapltours.com/travel-party?b=${BOOKING_ID}&trip_proof=pi_3U6DqsAbc_secret_XyZ`))
    expect(res.headers.get('location')).toBe(`https://mapltours.com/travel-party?b=${BOOKING_ID}`)
    expect(cookieOf(res)).toBeNull()
  })
})
