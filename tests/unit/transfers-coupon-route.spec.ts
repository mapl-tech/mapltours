import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { driverCost, getTransferPrice } from '@/lib/airport-transfers'
import { couponDiscountCents } from '@/lib/coupons'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/transfers/checkout/route'

/**
 * Drives the real transfers checkout handler over a fake Supabase and a fake
 * Stripe. The one thing that costs money if it is wrong: the PaymentIntent is
 * sized to the fare net of the code, the driver's payout (subtotal) is exactly
 * what it was without a code, the gross margin is still on the row, and a
 * code the rules refuse never reaches an intent.
 */

const state = vi.hoisted(() => ({
  coupon: null as Record<string, unknown> | null,
  emailUses: 0,
  /** When set, the fake gift ledger claims exactly this many cents (capped at what is owed). */
  giftBalanceCents: 0,
  consumed: [] as Record<string, unknown>[],
  inserts: [] as { table: string; row: Record<string, unknown> }[],
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
vi.mock('@/lib/gift-redemption', () => ({
  claimGiftCard: async (_db: unknown, _code: string, capCents: number, _bookingId: string) => {
    if (!state.giftBalanceCents) return { ok: false, message: 'no' }
    const amountCents = Math.min(state.giftBalanceCents, capCents)
    return { ok: true, claim: { amountCents, amount: amountCents / 100, giftCardId: 'gc_test' } }
  },
  releaseGiftClaim: async () => {},
}))
vi.mock('@/lib/email/booking', () => ({ maybeSendTravelerConfirmation: async () => ({ ok: true }), maybeSendOperatorAlert: async () => ({ ok: true }) }))
vi.mock('@/lib/coupon-redemption', () => ({ consumeCoupon: async (_db: unknown, input: Record<string, unknown>) => { state.consumed.push(input); return { ok: true, alreadyCounted: false, overRedeemed: false } } }))

function builder(table: string) {
  const ctx: { op: string; row?: Record<string, unknown> } = { op: 'select' }
  const resolve = () => {
    if (table === 'coupons' && ctx.op === 'select') return { data: state.coupon, error: null }
    if (table === 'coupon_redemptions' && ctx.op === 'select') return { data: null, error: null, count: state.emailUses }
    if (table === 'bookings' && ctx.op === 'insert') { state.inserts.push({ table, row: ctx.row! }); return { data: { id: 'b_test' }, error: null } }
    if (table === 'booking_items' && ctx.op === 'insert') { state.inserts.push({ table, row: ctx.row! }); return { data: null, error: null } }
    if (table === 'bookings' && ctx.op === 'select') return { data: { gift_card_id: null, gift_card_amount: null, stripe_payment_id: null, status: 'pending' }, error: null }
    if (table === 'bookings' && ctx.op === 'update') return { data: { id: 'b_test' }, error: null }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => { fn?.(...a); return b }
  Object.assign(b, {
    select: chain(),
    insert: chain((row) => { ctx.op = 'insert'; ctx.row = Array.isArray(row) ? (row as Record<string, unknown>[])[0] : (row as Record<string, unknown>) }),
    update: chain((row) => { ctx.op = 'update'; ctx.row = row as Record<string, unknown> }),
    delete: chain(() => { ctx.op = 'delete' }),
    eq: chain(), neq: chain(), in: chain(), is: chain(), not: chain(), order: chain(), limit: chain(), gte: chain(),
    maybeSingle: async () => resolve(),
    single: async () => resolve(),
    then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(onOk, onErr),
  })
  return b
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => builder(t) }) }))

// A one-way ride from the airport, next year, with the flight the route insists on.
const DEST = 'iberostar-rose-hall'
const item = { destinationId: DEST, tripType: 'one_way' as const, passengers: 2, fromAirport: true, arrivalAt: '2027-06-15T14:30', arrivalFlight: 'AA1234' }
const gross = getTransferPrice(DEST, 'one_way', 2)!
const cost = driverCost(DEST, 'one_way', 2)!
const grossCents = Math.round(gross * 100)
const marginCents = Math.round((gross - cost) * 100)
const customer = { email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', phone: '+1 555 0100' }

const shared = () => ({ id: 'c_shared', code: 'JAMAICA5', kind: 'percent', value: 5, applies_to: 'both', email: null, max_uses: null, uses: 12, uses_per_email: 1, min_total: null, starts_at: '2026-01-01T00:00:00Z', expires_at: null, status: 'active' })

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/transfers/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}

beforeEach(() => { state.coupon = null; state.emailUses = 0; state.giftBalanceCents = 0; state.consumed.length = 0; state.inserts.length = 0; state.intents.length = 0 })

describe('POST /api/transfers/checkout with a coupon', () => {
  it('charges the fare net of the code and leaves the driver\'s payout untouched', async () => {
    state.coupon = shared()
    const res = await post({ amount: gross, items: [item], customer, couponCode: 'jamaica5' })
    const data = await res.json()
    expect(res.status).toBe(200)
    const discount = couponDiscountCents('percent', 5, grossCents)
    expect(discount).toBeLessThan(marginCents)
    expect(state.intents).toHaveLength(1)
    expect(state.intents[0].amount).toBe(grossCents - discount)
    const meta = state.intents[0].metadata as Record<string, string>
    expect(meta.coupon_id).toBe('c_shared')
    expect(meta.coupon_code).toBe('JAMAICA5')
    expect(meta.booking_type).toBe('transfer')
    expect(data.couponDiscount).toBeCloseTo(discount / 100, 2)
    expect(data.amountDue).toBeCloseTo((grossCents - discount) / 100, 2)
    const booking = state.inserts.find((i) => i.table === 'bookings')!.row
    expect(Number(booking.subtotal)).toBeCloseTo(cost, 2)                 // the driver's rate, exactly as without a code
    expect(Number(booking.booking_fee)).toBeCloseTo(gross - cost, 2)      // the gross margin stays on the row
    expect(booking.coupon_code).toBe('JAMAICA5')
    expect(Number(booking.coupon_discount)).toBeCloseTo(discount / 100, 2)
    expect(Number(booking.total_paid)).toBeCloseTo((grossCents - discount) / 100, 2)
  })

  it('keeps the amount contract: the client claims the pre-coupon fare', async () => {
    state.coupon = shared()
    const discount = couponDiscountCents('percent', 5, grossCents)
    const res = await post({ amount: (grossCents - discount) / 100, items: [item], customer, couponCode: 'JAMAICA5' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/mismatch/)
    expect(state.intents).toHaveLength(0)
  })

  it('refuses a tours-only code on a ride, before any intent or row exists', async () => {
    state.coupon = { ...shared(), applies_to: 'tour' }
    const res = await post({ amount: gross, items: [item], customer, couponCode: 'JAMAICA5' })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.couponCode).toBe(true)
    expect(data.error).toMatch(/works on tours, not on airport rides/)
    expect(state.intents).toHaveLength(0)
    expect(state.inserts).toHaveLength(0)
  })

  it('refuses the shared code once this address has used it', async () => {
    state.coupon = shared()
    state.emailUses = 1
    const res = await post({ amount: gross, items: [item], customer, couponCode: 'JAMAICA5' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/already been used with this email/)
    expect(state.intents).toHaveLength(0)
  })

  it('caps a large code at MAPL\'s margin so the fare never drops below the driver\'s rate', async () => {
    state.coupon = { ...shared(), kind: 'fixed', value: 500 }
    const res = await post({ amount: gross, items: [item], customer, couponCode: 'JAMAICA5' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Math.round(data.couponDiscount * 100)).toBe(marginCents)
    expect(state.intents[0].amount).toBe(grossCents - marginCents)
    expect(state.intents[0].amount).toBe(Math.round(cost * 100))
  })

  it('draws a gift card against the fare AFTER the code, and a fully covered ride counts the code inline', async () => {
    state.coupon = shared()
    state.giftBalanceCents = 100000 // a card bigger than any fare
    const res = await post({ amount: gross, items: [item], customer, couponCode: 'JAMAICA5', giftCode: 'MAPL-GIFT-CARD' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.fullyCoveredByGift).toBe(true)
    const discount = couponDiscountCents('percent', 5, grossCents)
    // The card was asked for the net fare, not the gross.
    expect(Math.round(data.giftAmount * 100)).toBe(grossCents - discount)
    expect(state.intents).toHaveLength(0)
    // No webhook will ever run for this booking, so the code is counted here.
    expect(state.consumed).toHaveLength(1)
    expect(state.consumed[0].couponId).toBe('c_shared')
    expect(state.consumed[0].email).toBe('jane@example.com')
    expect(Number(state.consumed[0].amount)).toBeCloseTo(discount / 100, 2)
  })

  it('leaves a ride without a code exactly as before', async () => {
    const res = await post({ amount: gross, items: [item], customer })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(state.intents[0].amount).toBe(grossCents)
    expect((state.intents[0].metadata as Record<string, string>).coupon_id).toBeUndefined()
    expect(data.couponDiscount).toBe(0)
    expect(data.amountDue).toBeCloseTo(gross, 2)
    const booking = state.inserts.find((i) => i.table === 'bookings')!.row
    expect(booking.coupon_code).toBeNull()
    expect(Number(booking.coupon_discount)).toBe(0)
  })
})
