import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The gift code reveal (/api/gifts/reveal) hands back a spendable code and the
 * recipient's email. Until Oct 31 2026 a PaymentIntent id was enough, and those
 * ids travel in addresses, history and analytics. Now only the browser holding
 * the intent's client secret in its proof cookie (lib/confirm-proof) sees it.
 */

const SECRET = 'pi_gift123_secret_abcDEF456'
const state = vi.hoisted(() => ({ created: 0, status: 'succeeded' as string, kind: 'gift_card', fail: null as null | { type: string } }))

vi.mock('stripe', () => ({
  default: class {
    paymentIntents = {
      retrieve: async (id: string) => {
        if (state.fail) throw Object.assign(new Error('stripe'), state.fail)
        return {
          id, status: state.status, created: state.created, client_secret: SECRET,
          metadata: { kind: state.kind, gift_card_id: 'g1' },
        }
      },
    }
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.7' }))
vi.mock('@/lib/gift-activation', () => ({ activateGiftCard: async () => undefined }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({
        data: { code: 'MAPL-ACDE-FHJK', initial_amount: 100, balance: 100, currency: 'usd', status: 'active', recipient_email: 'friend@example.com', expires_at: null, delivered_at: null },
      })
      return chain
    },
  }),
}))

import { POST } from '@/app/api/gifts/reveal/route'
import { PROOF_COOKIE, addProof } from '@/lib/confirm-proof'

const reveal = (cookie?: string) =>
  POST(new NextRequest('https://mapltours.com/api/gifts/reveal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie: `${PROOF_COOKIE}=${encodeURIComponent(cookie)}` } : {}) },
    body: JSON.stringify({ paymentIntentId: 'pi_gift123' }),
  }))

beforeEach(() => {
  state.created = Math.floor(Date.now() / 1000) - 60
  state.status = 'succeeded'
  state.kind = 'gift_card'
  state.fail = null
})

describe('the gift code reveal', () => {
  test('the browser that paid sees its code', async () => {
    const res = await reveal(addProof('', SECRET))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ready: true, code: 'MAPL-ACDE-FHJK' })
  })

  test('a payment id alone reveals nothing: no code, no recipient', async () => {
    const res = await reveal()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('friend@example.com')
    expect(body.error).toMatch(/browser that paid/)
  })

  test('another payment’s secret reveals nothing', async () => {
    const res = await reveal(addProof('', 'pi_other999_secret_zzz111'))
    expect(res.status).toBe(403)
  })

  test('even the paying browser is refused after the 30-minute window', async () => {
    state.created = Math.floor(Date.now() / 1000) - 31 * 60
    const res = await reveal(addProof('', SECRET))
    expect(res.status).toBe(410)
  })

  // A leaked id used to get 404 for "no such payment" and 400 for "not a gift
  // card" before the proof was asked for, which confirmed what it was.
  test('without proof, a gift, a tour payment and an id Stripe never issued all get the same answer', async () => {
    const answer = async () => { const r = await reveal(); return { status: r.status, body: await r.json() } }
    const gift = await answer()
    state.kind = 'tour'
    const tour = await answer()
    state.kind = 'gift_card'
    state.fail = { type: 'StripeInvalidRequestError' }
    const missing = await answer()
    expect(gift.status).toBe(403)
    expect(tour).toEqual(gift)
    expect(missing).toEqual(gift)
  })

  test('Stripe out of reach is a try-again, not a refusal', async () => {
    state.fail = { type: 'StripeConnectionError' }
    expect((await reveal(addProof('', SECRET))).status).toBe(503)
  })

  test('without proof, not even the payment status is reported', async () => {
    state.status = 'processing'
    const body = await (await reveal()).json()
    expect(body.status).toBeUndefined()
    expect(body.ready).toBeUndefined()
  })
})
