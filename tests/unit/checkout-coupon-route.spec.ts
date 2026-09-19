import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { priceTourCart } from '@/lib/checkout-pricing'
import { couponDiscountCents } from '@/lib/coupons'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/checkout/route'

/**
 * Drives the real tours checkout handler over a fake Supabase and a fake
 * Stripe, and checks the one thing that costs money if it is wrong: the
 * PaymentIntent is sized to the server's net total, the booking row records
 * the same figures, and a code that fails a rule is refused before any
 * intent exists.
 */

const state = vi.hoisted(() => ({
  coupon: null as Record<string, unknown> | null,
  inserts: [] as { table: string; row: Record<string, unknown> }[],
  updates: [] as { table: string; patch: Record<string, unknown> }[],
  intents: [] as Record<string, unknown>[],
}))

vi.mock('stripe', () => {
  class Stripe {
    paymentIntents = {
      create: async (params: Record<string, unknown>) => {
        state.intents.push(params)
        return { id: 'pi_test', client_secret: 'cs_test', status: 'requires_payment_method', amount: params.amount }
      },
      retrieve: async () => { throw new Error('not used') },
      update: async () => ({}),
      cancel: async () => ({}),
    }
  }
  return { default: Stripe }
})

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
vi.mock('@/lib/checkout-schema', () => ({
  assertCheckoutSchema: async () => ({ hasAttribution: false, hasPickupTime: false, hasCoupon: true }),
  SchemaNotReadyError: class extends Error {},
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))
vi.mock('@/lib/gift-redemption', () => ({ claimGiftCard: async () => ({ ok: false, message: 'no' }), releaseGiftClaim: async () => {} }))
vi.mock('@/lib/email/booking', () => ({ maybeSendTravelerConfirmation: async () => ({ ok: true }), maybeSendOperatorAlert: async () => ({ ok: true }) }))
vi.mock('@/lib/coupon-redemption', () => ({ consumeCoupon: async () => ({ ok: true, alreadyCounted: false, overRedeemed: false }) }))

/** A chainable fake of the PostgREST builder: records writes, answers reads. */
function builder(table: string) {
  const ctx: { op: string; row?: Record<string, unknown>; cols?: string } = { op: 'select' }
  const resolve = () => {
    if (table === 'coupons' && ctx.op === 'select') return { data: state.coupon, error: null }
    if (table === 'bookings' && ctx.op === 'insert') { state.inserts.push({ table, row: ctx.row! }); return { data: { id: 'b_test' }, error: null } }
    if (table === 'booking_items' && ctx.op === 'insert') { state.inserts.push({ table, row: ctx.row! }); return { data: null, error: null } }
    if (table === 'bookings' && ctx.op === 'select') return { data: { gift_card_id: null, gift_card_amount: null, stripe_payment_id: null, status: 'pending' }, error: null }
    if (table === 'bookings' && ctx.op === 'update') { state.updates.push({ table, patch: ctx.row! }); return { data: { id: 'b_test' }, error: null } }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => { fn?.(...a); return b }
  Object.assign(b, {
    select: chain((c) => { if (ctx.op === 'select') ctx.cols = String(c) }),
    insert: chain((row) => { ctx.op = 'insert'; ctx.row = Array.isArray(row) ? (row as Record<string, unknown>[])[0] : (row as Record<string, unknown>) }),
    update: chain((row) => { ctx.op = 'update'; ctx.row = row as Record<string, unknown> }),
    delete: chain(() => { ctx.op = 'delete' }),
    eq: chain(), neq: chain(), in: chain(), is: chain(), not: chain(), order: chain(), limit: chain(),
    maybeSingle: async () => resolve(),
    single: async () => resolve(),
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onOk, onErr),
  })
  return b
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => builder(t) }) }))

const DATE = '2027-06-15'
const items = [{ id: 1, title: 'x', destination: 'x', travelers: 2, date: DATE, price: 0 }]
const pricing = priceTourCart(items.map((i) => ({ id: i.id, travelers: i.travelers, date: i.date })), {}, {})
const baseCents = Math.round(pricing.total * 100)
const customer = { email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe' }

const liveCoupon = () => ({ id: 'c_test', code: 'MAPL-AAAA-AAAA', kind: 'percent', value: 5, applies_to: 'tour', email: null, max_uses: 1, uses: 0, min_total: null, starts_at: '2026-01-01T00:00:00Z', expires_at: '2030-01-01T00:00:00Z', status: 'active' })

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}

beforeEach(() => { state.coupon = null; state.inserts.length = 0; state.updates.length = 0; state.intents.length = 0 })

describe('POST /api/checkout with a coupon', () => {
  it('sizes the intent to the net total and records the discount on the booking', async () => {
    state.coupon = liveCoupon()
    const res = await post({ amount: pricing.total, items, customer, couponCode: 'mapl-aaaa-aaaa' })
    const data = await res.json()
    expect(res.status).toBe(200)
    const discount = couponDiscountCents('percent', 5, baseCents)
    expect(state.intents).toHaveLength(1)
    expect(state.intents[0].amount).toBe(baseCents - discount)
    expect((state.intents[0].metadata as Record<string, string>).coupon_id).toBe('c_test')
    expect((state.intents[0].metadata as Record<string, string>).coupon_code).toBe('MAPL-AAAA-AAAA')
    expect(data.couponDiscount).toBeCloseTo(discount / 100, 2)
    expect(data.amountDue).toBeCloseTo((baseCents - discount) / 100, 2)
    const booking = state.inserts.find((i) => i.table === 'bookings')!.row
    expect(booking.coupon_code).toBe('MAPL-AAAA-AAAA')
    expect(Number(booking.coupon_discount)).toBeCloseTo(discount / 100, 2)
    expect(Number(booking.total_paid)).toBeCloseTo((baseCents - discount) / 100, 2)
  })

  it('refuses a used code before any intent exists, with the flag the page reads', async () => {
    state.coupon = { ...liveCoupon(), uses: 1 }
    const res = await post({ amount: pricing.total, items, customer, couponCode: 'MAPL-AAAA-AAAA' })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.couponCode).toBe(true)
    expect(data.error).toMatch(/already been used/)
    expect(state.intents).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('refuses a code bound to another address', async () => {
    state.coupon = { ...liveCoupon(), email: 'someone.else@example.com' }
    const res = await post({ amount: pricing.total, items, customer, couponCode: 'MAPL-AAAA-AAAA' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/different email/)
    expect(state.intents).toHaveLength(0)
  })

  it('refuses an unknown code the same way', async () => {
    state.coupon = null
    const res = await post({ amount: pricing.total, items, customer, couponCode: 'NOPE99' })
    expect(res.status).toBe(400)
    expect((await res.json()).couponCode).toBe(true)
  })

  it('keeps the amount contract: the client claims the pre-coupon total', async () => {
    state.coupon = liveCoupon()
    const discount = couponDiscountCents('percent', 5, baseCents)
    // A client that (wrongly) claimed the net total is outside the $1 tolerance on any real cart.
    const res = await post({ amount: (baseCents - discount) / 100, items, customer, couponCode: 'MAPL-AAAA-AAAA' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/mismatch/)
    expect(state.intents).toHaveLength(0)
  })

  it('leaves a cart without a code exactly as before', async () => {
    const res = await post({ amount: pricing.total, items, customer })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(state.intents[0].amount).toBe(baseCents)
    expect((state.intents[0].metadata as Record<string, string>).coupon_id).toBeUndefined()
    expect(data.couponDiscount).toBe(0)
    const booking = state.inserts.find((i) => i.table === 'bookings')!.row
    expect(booking.coupon_code).toBeNull()
    expect(Number(booking.coupon_discount)).toBe(0)
  })
})
