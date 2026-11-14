import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * /api/gifts/validate: what a checkout page asks before it lets a gift card
 * be applied.
 *
 * The money bug this pins (Nov 13 2026): a card smaller than the cart is
 * debited in full on the Pay tap and reads 'depleted' from then on. When that
 * payment was never finished, the only code that gave the value back was the
 * stale sweep inside claimGiftCard, which the page never reached, because this
 * endpoint said "not valid" first. The card stayed at $0 for good. The sweep
 * now runs here, before the balance is judged.
 */

const db = vi.hoisted(() => ({
  card: null as null | Record<string, unknown>,
  afterSweep: null as null | Record<string, unknown>,
  swept: [] as string[],
  lookupError: null as null | { message: string; code?: string },
}))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
vi.mock('@/lib/gift-redemption', () => ({
  STALE_RESERVATION_MINUTES: 30,
  releaseStaleGiftClaims: async (_db: unknown, id: string) => { db.swept.push(id); if (db.afterSweep) db.card = db.afterSweep },
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => (db.lookupError ? { data: null, error: db.lookupError } : { data: db.card, error: null })
      return chain
    },
  }),
}))

import { POST } from '@/app/api/gifts/validate/route'

const ask = async (code: unknown) => {
  const res = await POST(new Request('https://mapltours.com/api/gifts/validate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }))
  return { status: res.status, body: await res.json() }
}
const card = (over: Record<string, unknown> = {}) => ({ id: 'g1', code: 'MAPL-ACDE-FHJK', status: 'active', balance: 100, currency: 'usd', expires_at: null, ...over })

beforeEach(() => { db.card = null; db.afterSweep = null; db.swept = []; db.lookupError = null })

describe('the gift code check', () => {
  test('a spendable card: its code and balance in cents', async () => {
    db.card = card()
    const r = await ask('mapl acde fhjk')
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ valid: true, code: 'MAPL-ACDE-FHJK', balanceCents: 10000, currency: 'USD' })
  })

  test('a card emptied by a checkout that was never paid gets its value back BEFORE it is judged', async () => {
    db.card = card({ status: 'depleted', balance: 0 })
    db.afterSweep = card({ status: 'active', balance: 100 })
    const r = await ask('MAPL-ACDE-FHJK')
    expect(db.swept).toEqual(['g1'])
    expect(r.body).toMatchObject({ valid: true, balanceCents: 10000 })
  })

  test('a card that is genuinely used up stays refused, with one message that confirms nothing about the code', async () => {
    db.card = card({ status: 'depleted', balance: 0 })
    const used = await ask('MAPL-ACDE-FHJK')
    db.card = null
    const unknown = await ask('MAPL-ZZZZ-ZZZZ')
    const malformed = await ask('hello')
    expect(used.body.valid).toBe(false)
    // Same words whether the code exists or not: no hit-detector for someone guessing codes.
    expect(used.body.message).toBe(unknown.body.message)
    expect(used.body.message).toBe(malformed.body.message)
    expect(used.body.message).toMatch(/frees up again 30 minutes later/)
    expect(used.body.message).toMatch(/contact@mapltours\.com/)
    expect(used.body.message).not.toMatch(/—/)
  })

  test('no sweep for a code that names no card, or one that is not shaped like a gift code', async () => {
    await ask('MAPL-ZZZZ-ZZZZ')
    await ask('JAMAICA5')
    expect(db.swept).toEqual([])
  })

  test('a database fault is a retryable answer, never "valid"', async () => {
    db.lookupError = { message: 'connection reset' }
    const r = await ask('MAPL-ACDE-FHJK')
    expect(r.status).toBeGreaterThanOrEqual(500)
    expect(r.body.valid).toBe(false)
    expect(db.swept).toEqual([])
  })

  test('an expired card is refused even after the sweep', async () => {
    db.card = card({ expires_at: '2001-01-01T00:00:00Z' })
    expect((await ask('MAPL-ACDE-FHJK')).body.valid).toBe(false)
  })
})
