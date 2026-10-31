import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Who may see a booking's full confirmation page (lib/confirm-proof).
 *
 * Oct 31 2026: the confirmation link carries the PaymentIntent id, every
 * analytics tag reports the page address, and four guests' links sat in GA4.
 * Whoever held one saw the guest's name, hotel, flights and pickup times. The
 * page now shows the trip only to the browser that booked it and to the
 * signed-in owner.
 */

const env = vi.hoisted(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  return {
    jar: '' as string | undefined,
    user: null as null | { id: string; email?: string; email_confirmed_at?: string | null },
    getUserThrows: false,
  }
})

vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'mapl_trip' && env.jar ? { name, value: env.jar } : undefined) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => {
        if (env.getUserThrows) throw new Error('auth down')
        return { data: { user: env.user } }
      },
    },
  }),
}))

import { PROOF_COOKIE, PROOF_MAX_ENTRIES, addProof, clientSecretFor, isConfirmPath, readProofs } from '@/lib/confirm-proof'
import { bookingProof, canSeeConfirmation, withConfirmProof } from '@/lib/confirm-proof-server'
import { middleware } from '@/middleware'

const BOOKING = '9a93bc39-d254-463c-9eb5-26d911b4ef51'
const OTHER = '29a59968-82af-4587-94cc-269dac9e4bbc'
const SECRET = 'pi_3U6DqsAbc_secret_XyZ123abc'

beforeEach(() => {
  env.jar = ''
  env.user = null
  env.getUserThrows = false
})

describe('the proof cookie', () => {
  test('keeps the newest proofs first, once each, and caps the list', () => {
    let v = ''
    for (let i = 0; i < PROOF_MAX_ENTRIES + 5; i++) v = addProof(v, `pi_${i}abcdefgh_secret_x`)
    const list = readProofs(v)
    expect(list).toHaveLength(PROOF_MAX_ENTRIES)
    expect(list[0]).toBe(`pi_${PROOF_MAX_ENTRIES + 4}abcdefgh_secret_x`)
    expect(readProofs(addProof(v, list[3]))[0]).toBe(list[3])
    expect(readProofs(addProof(v, list[3]))).toHaveLength(PROOF_MAX_ENTRIES)
  })

  test('junk in the cookie is dropped, never thrown on', () => {
    expect(readProofs(undefined)).toEqual([])
    expect(readProofs('a;b=c~<script>~' + SECRET)).toEqual([SECRET])
    expect(readProofs(addProof('~~~', 'x'))).toEqual([])
  })

  test('only a secret that belongs to the intent is kept', () => {
    expect(clientSecretFor(SECRET, 'pi_3U6DqsAbc')).toBe(SECRET)
    expect(clientSecretFor(SECRET, 'pi_other')).toBeNull()
    expect(clientSecretFor('pi_3U6DqsAbc_secret_', 'pi_3U6DqsAbc')).toBeNull()
    expect(clientSecretFor('pi_3U6DqsAbc_secret_a;b', 'pi_3U6DqsAbc')).toBeNull()
    expect(clientSecretFor(null, 'pi_3U6DqsAbc')).toBeNull()
    expect(clientSecretFor(SECRET, null)).toBeNull()
  })

  test('only the two confirmation pages count', () => {
    expect(isConfirmPath('/transfers/confirm')).toBe(true)
    expect(isConfirmPath('/Checkout/Confirm/')).toBe(true)
    expect(isConfirmPath('/gifts')).toBe(false)
    expect(isConfirmPath('/transfers/confirmation')).toBe(false)
  })
})

describe('a booking proof', () => {
  test('is bound to its booking and cannot be forged by editing it', () => {
    const p = bookingProof(BOOKING)!
    expect(p).toMatch(/^b_[0-9a-f]{32}_[A-Za-z0-9_-]{32}$/)
    expect(bookingProof(BOOKING.toUpperCase())).toBe(p)
    expect(bookingProof(OTHER)).not.toBe(p)
    expect(bookingProof('not-a-uuid')).toBeNull()
  })

  test('opens the page for its own booking only', async () => {
    env.jar = addProof('', bookingProof(BOOKING)!)
    expect(await canSeeConfirmation({ id: BOOKING, email: 'a@example.com', user_id: null })).toBe(true)
    expect(await canSeeConfirmation({ id: OTHER, email: 'a@example.com', user_id: null })).toBe(false)
  })

  test('a tampered signature opens nothing', async () => {
    const p = bookingProof(BOOKING)!
    env.jar = p.slice(0, -1) + (p.endsWith('A') ? 'B' : 'A')
    expect(await canSeeConfirmation({ id: BOOKING, email: null, user_id: null })).toBe(false)
  })
})

describe('the intent client secret', () => {
  test('opens the page for that intent, even with no booking row found', async () => {
    env.jar = addProof('', SECRET)
    expect(await canSeeConfirmation({ id: null, email: null, user_id: null }, SECRET)).toBe(true)
    expect(await canSeeConfirmation({ id: BOOKING, email: null, user_id: null }, 'pi_x_secret_other')).toBe(false)
  })

  test('a secret that is only in the address opens nothing', async () => {
    expect(await canSeeConfirmation({ id: BOOKING, email: null, user_id: null }, SECRET)).toBe(false)
  })
})

describe('a signed-in guest', () => {
  const booking = { id: BOOKING, email: 'Guest@Example.com ', user_id: null }

  test('sees their booking by its verified email, in any case', async () => {
    env.user = { id: 'u1', email: 'guest@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }
    expect(await canSeeConfirmation(booking)).toBe(true)
  })

  test('an unverified email is not enough', async () => {
    env.user = { id: 'u1', email: 'guest@example.com', email_confirmed_at: null }
    expect(await canSeeConfirmation(booking)).toBe(false)
  })

  test('sees a booking already linked to their account', async () => {
    env.user = { id: 'u1', email: 'new@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }
    expect(await canSeeConfirmation({ ...booking, user_id: 'u1' })).toBe(true)
  })

  test('someone else signed in sees nothing', async () => {
    env.user = { id: 'u2', email: 'other@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }
    expect(await canSeeConfirmation({ ...booking, user_id: 'u1' })).toBe(false)
  })

  test('an auth outage is a no, never an error page', async () => {
    env.getUserThrows = true
    expect(await canSeeConfirmation(booking)).toBe(false)
  })

  test('no session and no proof is a no', async () => {
    expect(await canSeeConfirmation(booking)).toBe(false)
  })
})

describe('the checkout routes hand the proof to the browser that asked', () => {
  const req = (cookie?: string) =>
    new NextRequest('https://mapltours.com/api/transfers/checkout', {
      method: 'POST',
      headers: cookie ? { cookie: `${PROOF_COOKIE}=${cookie}` } : {},
    })
  const proofIn = (res: Response) => {
    const set = res.headers.get('set-cookie') ?? ''
    const m = set.match(new RegExp(`${PROOF_COOKIE}=([^;]*)`))
    return { set, list: m ? readProofs(decodeURIComponent(m[1])) : [] }
  }

  test.each([
    ['a new or reused intent', { clientSecret: 'pi_1_secret_a', bookingId: BOOKING, amountDue: 92 }],
    ['an already-paid twin', { alreadyPaid: true, bookingId: BOOKING, requestId: 'r' }],
    ['a booking a gift card paid in full', { fullyCoveredByGift: true, alreadyPaid: true, bookingId: BOOKING }],
  ])('%s', async (_label, body) => {
    const original = NextResponse.json(body)
    const res = await withConfirmProof(req(), original)
    const { set, list } = proofIn(res)
    expect(list).toEqual([bookingProof(BOOKING)])
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/Secure/i)
    expect(set).toMatch(/SameSite=lax/i)
    expect(set).toMatch(/Path=\//)
    // The answer itself is untouched.
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(body)
  })

  test('keeps the proofs the browser already holds', async () => {
    const held = addProof('', bookingProof(OTHER)!)
    const res = await withConfirmProof(req(encodeURIComponent(held)), NextResponse.json({ alreadyPaid: true, bookingId: BOOKING }))
    expect(proofIn(res).list).toEqual([bookingProof(BOOKING), bookingProof(OTHER)])
  })

  test.each([
    ['a refusal', NextResponse.json({ error: 'Too soon', bookingId: BOOKING }, { status: 409 })],
    ['an error body on 200', NextResponse.json({ error: 'x', bookingId: BOOKING })],
    ['no booking named', NextResponse.json({ clientSecret: 'pi_1_secret_a' })],
    ['a malformed booking id', NextResponse.json({ alreadyPaid: true, bookingId: 'nope' })],
    ['not JSON', new NextResponse('ok', { status: 200 })],
  ])('gives nothing for %s, and changes nothing', async (_label, original) => {
    const status = original.status
    const text = await original.clone().text()
    const res = await withConfirmProof(req(), original)
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.status).toBe(status)
    expect(await res.text()).toBe(text)
  })

  test('a plain Response passes through untouched', async () => {
    const original = new Response(JSON.stringify({ alreadyPaid: true, bookingId: BOOKING }), { headers: { 'content-type': 'application/json' } })
    expect(await withConfirmProof(req(), original)).toBe(original)
  })
})

describe('the middleware keeps the secret as proof on a confirmation page', () => {
  const cookieOf = (res: Response) => {
    const m = (res.headers.get('set-cookie') ?? '').match(new RegExp(`${PROOF_COOKIE}=([^;]*)`))
    return m ? readProofs(decodeURIComponent(m[1])) : null
  }

  test.each(['/transfers/confirm', '/checkout/confirm'])('%s: the secret leaves the address and lands in the cookie', async (path) => {
    const res = await middleware(new NextRequest(`https://mapltours.com${path}?payment_intent=pi_3U6DqsAbc&payment_intent_client_secret=${SECRET}&redirect_status=succeeded`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`https://mapltours.com${path}?payment_intent=pi_3U6DqsAbc&redirect_status=succeeded`)
    expect(cookieOf(res)).toEqual([SECRET])
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i)
  })

  test('adds to the proofs already held', async () => {
    const held = addProof('', bookingProof(OTHER)!)
    const res = await middleware(new NextRequest(`https://mapltours.com/transfers/confirm?payment_intent=pi_3U6DqsAbc&payment_intent_client_secret=${SECRET}&redirect_status=succeeded`, {
      headers: { cookie: `${PROOF_COOKIE}=${encodeURIComponent(held)}` },
    }))
    expect(cookieOf(res)).toEqual([SECRET, bookingProof(OTHER)])
  })

  test.each([
    ['a secret for another intent', `/transfers/confirm?payment_intent=pi_other&payment_intent_client_secret=${SECRET}`],
    ['the gift page', `/gifts?payment_intent=pi_3U6DqsAbc&payment_intent_client_secret=${SECRET}`],
    ['no intent named', `/transfers/confirm?payment_intent_client_secret=${SECRET}`],
  ])('%s: the secret is still dropped, and nothing is kept', async (_label, path) => {
    const res = await middleware(new NextRequest(`https://mapltours.com${path}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).not.toContain('client_secret')
    expect(cookieOf(res)).toBeNull()
  })
})
