import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { priceTourCart } from '@/lib/checkout-pricing'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/checkout/route'

/**
 * Drives the real tour checkout handler over a small STATEFUL fake of
 * PostgREST and Stripe (adapted from the batch review's reward-conflict
 * probe), so the branches that only matter across two requests actually run:
 * the waiver refusal and stamp, the reward reservation against an edited
 * cart, supersede of a pending / declined / already-canceled row, and the
 * verified attach losing its row while the intent was being minted.
 *
 * The fake keeps real row state: the pending (cart_hash, booking_type)
 * unique index answers 23505, conditional updates only touch matching rows,
 * and Stripe refuses to cancel an intent that is canceled, processing or
 * succeeded, exactly the cases the route has to route on.
 */

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  seq: 0,
  intents: new Map<string, { id: string; client_secret: string; status: string; amount: number; metadata: Record<string, string> }>(),
  idem: new Map<string, string>(),
  /** Every intent the route asked Stripe to cancel (and Stripe accepted). */
  canceled: [] as string[],
  /** Booking ids releaseGiftClaim was called for. */
  released: [] as string[],
  user: null as { id: string } | null,
  hasWaiver: true,
  giftBalanceCents: 0,
  /** Booking ids the ops calendar sync was asked to add. */
  calendar: [] as string[],
  /** How the calendar answers: fine, a failure, a throw, or never. */
  calendarMode: 'ok' as 'ok' | 'fail' | 'throw' | 'hang',
  /** Runs right after Stripe mints an intent: the window the verified attach guards. */
  onCreate: null as ((pi: { metadata: Record<string, string> }) => void) | null,
  /** Makes a matching UPDATE fail with a database error. */
  failUpdate: null as ((table: string, patch: Record<string, unknown>) => boolean) | null,
}))

vi.mock('stripe', () => {
  class StripeError extends Error {
    code?: string
  }
  const missing = (id: string) => {
    const e = new StripeError(`No such payment_intent: '${id}'`)
    e.code = 'resource_missing'
    return e
  }
  const PAYABLE = ['requires_payment_method', 'requires_confirmation', 'requires_action']
  class Stripe {
    static errors = { StripeError }
    paymentIntents = {
      create: async (params: Record<string, unknown>, opts?: { idempotencyKey?: string }) => {
        const key = opts?.idempotencyKey
        if (key && db.idem.has(key)) return db.intents.get(db.idem.get(key)!)!
        const id = `pi_${++db.seq}`
        const pi = {
          id,
          client_secret: `${id}_secret`,
          status: 'requires_payment_method',
          amount: Number(params.amount),
          metadata: { ...(params.metadata as Record<string, string>) },
        }
        db.intents.set(id, pi)
        if (key) db.idem.set(key, id)
        db.onCreate?.(pi)
        return pi
      },
      retrieve: async (id: string) => {
        const pi = db.intents.get(id)
        if (!pi) throw missing(id)
        return pi
      },
      update: async (id: string, p: { amount?: number; metadata?: Record<string, string> }) => {
        const pi = db.intents.get(id)
        if (!pi) throw missing(id)
        if (!PAYABLE.includes(pi.status)) throw new StripeError(`cannot update a PaymentIntent in status ${pi.status}`)
        if (p.amount != null) pi.amount = p.amount
        for (const [k, v] of Object.entries(p.metadata ?? {})) {
          if (v === '') delete pi.metadata[k]
          else pi.metadata[k] = v
        }
        return pi
      },
      cancel: async (id: string) => {
        const pi = db.intents.get(id)
        if (!pi) throw missing(id)
        if (['succeeded', 'processing', 'canceled'].includes(pi.status)) {
          throw new StripeError(`You cannot cancel this PaymentIntent because it has a status of ${pi.status}.`)
        }
        pi.status = 'canceled'
        db.canceled.push(id)
        return pi
      },
    }
  }
  return { default: Stripe }
})

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
vi.mock('@/lib/checkout-schema', () => ({
  assertCheckoutSchema: async () => ({ hasAttribution: false, hasPickupTime: false, hasCoupon: true, hasWaiver: db.hasWaiver }),
  SchemaNotReadyError: class extends Error {},
}))
vi.mock('@/lib/gift-redemption', () => ({
  claimGiftCard: async (_s: unknown, _code: string, capCents: number, bookingId: string) => {
    if (!db.giftBalanceCents) return { ok: false, message: 'That gift card has no balance left.' }
    const amountCents = Math.min(db.giftBalanceCents, capCents)
    ;(db.tables.gift_card_redemptions ??= []).push({
      id: `gr_${++db.seq}`, booking_id: bookingId, gift_card_id: 'gc_1', status: 'reserved', amount: amountCents / 100,
    })
    return { ok: true, claim: { amountCents, amount: amountCents / 100, giftCardId: 'gc_1' } }
  },
  releaseGiftClaim: async (_s: unknown, bookingId: string) => {
    db.released.push(bookingId)
    for (const r of db.tables.gift_card_redemptions ?? []) {
      if (r.booking_id === bookingId && r.status === 'reserved') r.status = 'released'
    }
  },
  settleGiftClaim: async () => {},
}))
vi.mock('@/lib/email/booking', () => ({
  maybeSendTravelerConfirmation: async () => ({ ok: true }),
  maybeSendOperatorAlert: async () => ({ ok: true }),
  resolveOpsRecipients: () => [],
}))
vi.mock('@/lib/booking-items', () => ({ replaceBookingItems: async () => ({ error: null }) }))
vi.mock('@/lib/email/send', () => ({ sendEmail: async () => ({ ok: true }), operatorAlertRecipients: () => [] }))
vi.mock('@/lib/coupon-redemption', () => ({ consumeCoupon: async () => ({ ok: true }) }))
vi.mock('@/lib/google-calendar', () => ({
  syncBookingToCalendar: (b: { id: string; status?: string }) => {
    db.calendar.push(b.id)
    if (db.calendarMode === 'throw') throw new Error('google exploded')
    if (db.calendarMode === 'hang') return new Promise(() => {})
    return Promise.resolve(db.calendarMode === 'fail' ? { ok: false, reason: 'insert 500' } : { ok: true })
  },
}))

// ── a small stateful PostgREST fake ──
type Pred = (r: Row) => boolean
function atom(expr: string): Pred {
  const [col, op, ...rest] = expr.split('.')
  const raw = rest.join('.')
  const val = raw === 'null' ? null : raw
  if (op === 'eq') return (r) => String(r[col]) === String(val)
  if (op === 'is') return (r) => (r[col] ?? null) === val
  throw new Error(`fake PostgREST: unsupported op ${op}`)
}
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}
function orExpr(s: string): Pred {
  const parts = splitTop(s).map((p) => (p.startsWith('and(') ? andExpr(p.slice(4, -1)) : atom(p)))
  return (r) => parts.some((p) => p(r))
}
function andExpr(s: string): Pred {
  const parts = splitTop(s).map((p) => (p.startsWith('or(') ? orExpr(p.slice(3, -1)) : atom(p)))
  return (r) => parts.every((p) => p(r))
}
function builder(table: string) {
  const rows = (db.tables[table] ??= [])
  const preds: Pred[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
  let cols = ''
  let lim = Infinity
  const run = (): { data: Row[] | null; error: { code?: string; message: string } | null } => {
    if (op === 'insert') {
      const r: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }
      if (
        table === 'bookings' && r.status === 'pending' &&
        rows.some((x) => x.status === 'pending' && x.cart_hash === r.cart_hash && x.booking_type === r.booking_type)
      ) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
      }
      rows.push(r)
      return { data: [r], error: null }
    }
    if (op === 'update' && db.failUpdate?.(table, payload)) {
      return { data: null, error: { code: '08006', message: 'connection failure' } }
    }
    const hit = rows.filter((r) => preds.every((p) => p(r))).slice(0, lim)
    if (op === 'update') {
      hit.forEach((r) => Object.assign(r, payload))
      return { data: hit, error: null }
    }
    if (op === 'delete') {
      hit.forEach((r) => rows.splice(rows.indexOf(r), 1))
      return { data: hit, error: null }
    }
    const withEmbed = cols.includes('bookings!')
      ? hit.map((r) => ({ ...r, bookings: (db.tables.bookings ?? []).find((b) => b.id === r.used_on_booking_id) ?? null }))
      : hit
    return { data: withEmbed, error: null }
  }
  const b: Record<string, unknown> = {}
  const ch = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    fn(...a)
    return b
  }
  Object.assign(b, {
    select: ch((c?: string) => { if (op === 'select') cols = String(c ?? '') }),
    insert: ch((r: Row) => { op = 'insert'; payload = r }),
    update: ch((r: Row) => { op = 'update'; payload = r }),
    delete: ch(() => { op = 'delete' }),
    eq: ch((c: string, v: unknown) => { preds.push((r) => String(r[c]) === String(v)) }),
    neq: ch((c: string, v: unknown) => { preds.push((r) => String(r[c]) !== String(v)) }),
    in: ch((c: string, v: unknown[]) => { preds.push((r) => v.map(String).includes(String(r[c]))) }),
    is: ch((c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v) }),
    not: ch(() => {}),
    or: ch((s: string) => { preds.push(orExpr(s)) }),
    order: ch(() => {}),
    limit: ch((n: number) => { lim = n }),
    maybeSingle: async () => {
      const r = run()
      return { data: r.data?.[0] ?? null, error: r.error }
    },
    single: async () => {
      const r = run()
      const d = r.data?.[0] ?? null
      return { data: d, error: r.error ?? (d ? null : { message: 'no row' }) }
    },
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, err),
  })
  return b
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (t: string) => builder(t),
  }),
}))

// ── fixtures ──
const DATE = '2027-06-15'
const cart = (travelers: number) => [{ id: 1, title: 'x', destination: 'x', travelers, date: DATE, price: 0 }]
const total = (travelers: number, pct = 0) =>
  priceTourCart([{ id: 1, travelers, date: DATE }], {}, { rewardPercent: pct }).total
const cents = (usd: number) => Math.round(usd * 100)
const customer = { email: 'guest@example.com', firstName: 'Guest', lastName: 'Example', phone: '+1 555 0100', pickup: 'Hotel' }

const bookingRow = (id: string) => (db.tables.bookings ?? []).find((b) => b.id === id)!
const intentOf = (bookingId: string) => db.intents.get(String(bookingRow(bookingId).stripe_payment_id))!
const reward = () => db.tables.user_rewards[0]
const redemption = (bookingId: string) => (db.tables.gift_card_redemptions ?? []).find((r) => r.booking_id === bookingId)

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  db.tables = {
    user_rewards: [{ id: 'r1', user_id: 'u1', percent: 5, status: 'available', used_on_booking_id: null, created_at: '2026-09-01T00:00:00Z' }],
  }
  db.seq = 0
  db.intents.clear()
  db.idem.clear()
  db.canceled = []
  db.released = []
  db.user = null
  db.hasWaiver = true
  db.giftBalanceCents = 0
  db.calendar = []
  db.calendarMode = 'ok'
  db.onCreate = null
  db.failUpdate = null
})

describe('POST /api/checkout: the liability waiver', () => {
  it('refuses a request that carries the waiver unticked, before any row or intent exists', async () => {
    for (const waiverAccepted of [false, 'true', null]) {
      const res = await post({ amount: total(2), items: cart(2), customer, waiverAccepted })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/participation waiver/)
    }
    expect(db.tables.bookings ?? []).toHaveLength(0)
    expect(db.intents.size).toBe(0)
  })

  it('stamps waiver_accepted_at on the booking when the guest ticked it', async () => {
    const before = Date.now()
    const res = await post({ amount: total(2), items: cart(2), customer, waiverAccepted: true })
    const data = await res.json()
    expect(res.status).toBe(200)
    const stamp = bookingRow(data.bookingId).waiver_accepted_at as string
    expect(typeof stamp).toBe('string')
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before - 1000)
  })

  it('lets the quiet save through unstamped, then stamps the same row when Pay sends the tick', async () => {
    const save = await post({ amount: total(2), items: cart(2), customer })
    const saved = await save.json()
    expect(save.status).toBe(200)
    expect(bookingRow(saved.bookingId).waiver_accepted_at).toBeUndefined()

    const pay = await post({ amount: total(2), items: cart(2), customer, waiverAccepted: true })
    const paid = await pay.json()
    expect(pay.status).toBe(200)
    expect(paid.bookingId).toBe(saved.bookingId) // same cart, same pending row
    expect(paid.clientSecret).toBe(saved.clientSecret) // and the same intent
    expect(typeof bookingRow(saved.bookingId).waiver_accepted_at).toBe('string')
    expect(db.tables.bookings).toHaveLength(1)
    expect(db.intents.size).toBe(1)
  })

  it('skips the stamp, rather than failing, when the column is not deployed yet', async () => {
    db.hasWaiver = false
    const res = await post({ amount: total(2), items: cart(2), customer, waiverAccepted: true })
    expect(res.status).toBe(200)
    expect(bookingRow((await res.json()).bookingId).waiver_accepted_at).toBeUndefined()
  })
})

describe('POST /api/checkout: a signed-in guest edits the cart after the quiet save', () => {
  beforeEach(() => { db.user = { id: 'u1' } })

  it('without supersedeBookingId answers 409 rewardConflict and takes the reward from nobody', async () => {
    const a = await post({ amount: total(2, 5), items: cart(2), customer, applyReward: true })
    const aj = await a.json()
    expect(a.status).toBe(200)
    expect(reward()).toMatchObject({ status: 'reserved', used_on_booking_id: aj.bookingId })

    const b = await post({ amount: total(3, 5), items: cart(3), customer, applyReward: true, waiverAccepted: true })
    const bj = await b.json()
    expect(b.status).toBe(409)
    expect(bj.rewardConflict).toBe(true)
    expect(bj.bookingId).toBeTruthy()
    expect(bj.bookingId).not.toBe(aj.bookingId)
    // The quiet-save row keeps its reservation and its live intent; the new
    // row got no intent and no hold; nothing was handed back from anyone.
    expect(reward()).toMatchObject({ status: 'reserved', used_on_booking_id: aj.bookingId })
    expect(bookingRow(aj.bookingId).status).toBe('pending')
    expect(intentOf(aj.bookingId).status).toBe('requires_payment_method')
    expect(bookingRow(bj.bookingId).stripe_payment_id).toBeUndefined()
    expect(db.intents.size).toBe(1)
    expect(db.canceled).toEqual([])
    expect(db.released).toEqual([])
  })

  it('with supersedeBookingId moves the reward to the new booking and charges the discounted amount', async () => {
    const a = await post({ amount: total(2, 5), items: cart(2), customer, applyReward: true })
    const aj = await a.json()
    const b = await post({
      amount: total(3, 5), items: cart(3), customer, applyReward: true, waiverAccepted: true, supersedeBookingId: aj.bookingId,
    })
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(total(3, 5)).toBeLessThan(total(3))
    expect(bj.amountDue).toBeCloseTo(total(3, 5), 2)
    expect(intentOf(bj.bookingId).amount).toBe(cents(total(3, 5)))
    expect(intentOf(bj.bookingId).metadata.reward_id).toBe('r1')
    expect(reward()).toMatchObject({ status: 'reserved', used_on_booking_id: bj.bookingId })
    // The abandoned row and its intent are dead, and its gift claim was handed back.
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(db.released).toContain(aj.bookingId)
  })

  it('treats a superseded intent that is ALREADY canceled as dead: the row dies and the reward moves', async () => {
    const a = await post({ amount: total(2, 5), items: cart(2), customer, applyReward: true })
    const aj = await a.json()
    // Canceled out of band (another tab, the stale sweep); its webhook has not landed.
    intentOf(aj.bookingId).status = 'canceled'

    const b = await post({
      amount: total(3, 5), items: cart(3), customer, applyReward: true, waiverAccepted: true, supersedeBookingId: aj.bookingId,
    })
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bj.rewardConflict).toBeUndefined()
    expect(bj.amountDue).toBeCloseTo(total(3, 5), 2)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(db.released).toContain(aj.bookingId)
    expect(reward()).toMatchObject({ status: 'reserved', used_on_booking_id: bj.bookingId })
  })
})

describe('POST /api/checkout: supersedeBookingId', () => {
  it('cancels a superseded PENDING row and its intent, and hands its gift claim back', async () => {
    db.giftBalanceCents = 5000
    const a = await post({ amount: total(2), items: cart(2), customer, giftCode: 'MAPL-GIFT-0001' })
    const aj = await a.json()
    expect(a.status).toBe(200)
    expect(redemption(aj.bookingId)?.status).toBe('reserved')

    const b = await post({ amount: total(3), items: cart(3), customer, giftCode: 'MAPL-GIFT-0001', waiverAccepted: true, supersedeBookingId: aj.bookingId })
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(redemption(aj.bookingId)?.status).toBe('released')
    // The same card is then drawn afresh for the edited cart.
    expect(redemption(bj.bookingId)?.status).toBe('reserved')
    expect(intentOf(bj.bookingId).amount).toBe(cents(total(3)) - 5000)
  })

  it('cancels a superseded FAILED (declined) row too: its intent was still payable', async () => {
    const a = await post({ amount: total(2), items: cart(2), customer })
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed' // the payment_failed webhook

    const b = await post({ amount: total(3), items: cart(3), customer, waiverAccepted: true, supersedeBookingId: aj.bookingId })
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(db.released).toContain(aj.bookingId)
  })

  it('treats an already-canceled intent as dead and returns the gift claim', async () => {
    db.giftBalanceCents = 5000
    const a = await post({ amount: total(2), items: cart(2), customer, giftCode: 'MAPL-GIFT-0001' })
    const aj = await a.json()
    intentOf(aj.bookingId).status = 'canceled'

    const b = await post({ amount: total(3), items: cart(3), customer, waiverAccepted: true, supersedeBookingId: aj.bookingId })
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(redemption(aj.bookingId)?.status).toBe('released')
  })

  it('refuses a second intent when the superseded one has already succeeded', async () => {
    const a = await post({ amount: total(2), items: cart(2), customer })
    const aj = await a.json()
    intentOf(aj.bookingId).status = 'succeeded' // paid, webhook not landed yet

    const b = await post({ amount: total(3), items: cart(3), customer, waiverAccepted: true, supersedeBookingId: aj.bookingId })
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bj).toMatchObject({ alreadyPaid: true, bookingId: aj.bookingId })
    expect(db.intents.size).toBe(1) // no second intent
    expect(bookingRow(aj.bookingId).status).toBe('pending') // left for its own webhook
    const fresh = (db.tables.bookings ?? []).find((r) => r.id !== aj.bookingId)!
    expect(fresh.status).toBe('canceled')
    expect(db.released).toEqual([])
  })

  it('never touches a row that belongs to a different guest', async () => {
    const a = await post({ amount: total(2), items: cart(2), customer })
    const aj = await a.json()
    const b = await post({
      amount: total(3), items: cart(3), customer: { ...customer, email: 'someone.else@example.com' }, waiverAccepted: true, supersedeBookingId: aj.bookingId,
    })
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('pending')
    expect(intentOf(aj.bookingId).status).toBe('requires_payment_method')
    expect(db.released).not.toContain(aj.bookingId)
  })
})

describe('POST /api/checkout: the verified attach', () => {
  beforeEach(() => {
    db.user = { id: 'u1' }
    db.giftBalanceCents = 5000
  })
  const body = () => ({ amount: total(2, 5), items: cart(2), customer, applyReward: true, giftCode: 'MAPL-GIFT-0001', waiverAccepted: true })

  it('booking canceled while the intent was minted: 409, the intent dies, gift and reward go back', async () => {
    db.onCreate = (pi) => { bookingRow(pi.metadata.booking_id).status = 'canceled' }
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('This booking can no longer be paid for. Please start a new one.')
    expect(data.bookingId).toBeTruthy()
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(bookingRow(data.bookingId).stripe_payment_id).toBeUndefined()
    expect(redemption(data.bookingId)?.status).toBe('released')
    expect(reward()).toMatchObject({ status: 'available', used_on_booking_id: null })
  })

  it('booking paid while the intent was minted: alreadyPaid, the new intent dies, nothing is handed back', async () => {
    db.onCreate = (pi) => { bookingRow(pi.metadata.booking_id).status = 'paid' }
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.alreadyPaid).toBe(true)
    expect(data.clientSecret).toBeUndefined()
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(db.released).toEqual([])
    expect(redemption(data.bookingId)?.status).toBe('reserved')
    expect(reward()).toMatchObject({ status: 'reserved', used_on_booking_id: data.bookingId })
  })

  it('attach write errors: 500, the intent dies, gift and reward go back', async () => {
    db.failUpdate = (table, patch) => table === 'bookings' && 'stripe_payment_id' in patch
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('Could not attach payment intent')
    expect(data.bookingId).toBeTruthy()
    expect(data.clientSecret).toBeUndefined()
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(redemption(data.bookingId)?.status).toBe('released')
    expect(reward()).toMatchObject({ status: 'available', used_on_booking_id: null })
  })
})

describe('POST /api/checkout: guest-facing refusals', () => {
  it('asks for a valid email without an em dash', async () => {
    const res = await post({ amount: total(2), items: cart(2), customer: { ...customer, email: 'not-an-email' }, waiverAccepted: true })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('A valid email address is required, your confirmation is sent there.')
    expect(db.tables.bookings ?? []).toHaveLength(0)
  })

  it('refuses a day over the hour cap in two plain sentences', async () => {
    // 2 + 2 + 1.5 + 3 hours on one date.
    const lines = [1, 2, 3, 5].map((id) => ({ id, travelers: 2, date: DATE }))
    const amount = priceTourCart(lines, {}, {}).total
    const res = await post({
      amount, items: lines.map((l) => ({ ...l, title: 'x', destination: 'x', price: 0 })), customer, waiverAccepted: true,
    })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('That is more than 8 hours of tours in one day. Please split the trip across separate days.')
    expect(data.error).not.toMatch(/—/)
  })
})

/**
 * A booking the gift card settles has no PaymentIntent, so the Stripe
 * webhook, the only other place paid bookings reach the ops calendar, never
 * runs for it (recheck N3, Sept 2026). The route adds it itself, time-boxed
 * and never fatal.
 */
describe('POST /api/checkout: a booking the gift card settles reaches the ops calendar', () => {
  const settle = () => post({ amount: total(2), items: cart(2), customer, giftCode: 'MAPL-GIFT-0001', waiverAccepted: true })

  it('in full: paid, emailed and added to the calendar, with no intent', async () => {
    db.giftBalanceCents = cents(total(2))
    const res = await settle()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.fullyCoveredByGift).toBe(true)
    expect(bookingRow(data.bookingId).status).toBe('paid')
    expect(db.intents.size).toBe(0)
    expect(db.calendar).toEqual([data.bookingId])
  })

  it('with a remainder under 50 cents absorbed: the same', async () => {
    db.giftBalanceCents = cents(total(2)) - 30
    const res = await settle()
    const data = await res.json()
    expect(data.fullyCoveredByGift).toBe(true)
    expect(db.intents.size).toBe(0)
    expect(db.calendar).toEqual([data.bookingId])
  })

  it('a card payment is left to the webhook, not synced here', async () => {
    const res = await post({ amount: total(2), items: cart(2), customer, waiverAccepted: true })
    expect((await res.json()).clientSecret).toBeTruthy()
    expect(db.calendar).toEqual([])
  })

  it('a calendar that fails or throws never fails the settle', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const mode of ['fail', 'throw'] as const) {
      db.tables.bookings = []
      db.calendar = []
      db.calendarMode = mode
      db.giftBalanceCents = cents(total(2))
      const res = await settle()
      const data = await res.json()
      expect(res.status).toBe(200)
      expect(data.fullyCoveredByGift).toBe(true)
      expect(db.calendar).toEqual([data.bookingId])
    }
    expect(errors.mock.calls.some((c) => String(c[1]).includes('ops calendar event NOT added'))).toBe(true)
    errors.mockRestore()
  })

  it('a calendar that hangs is cut off at the time box, and the guest still gets the answer', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.calendarMode = 'hang'
    db.giftBalanceCents = cents(total(2))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = settle()
      await vi.advanceTimersByTimeAsync(3_100)
      const res = await pending
      expect(res.status).toBe(200)
      expect((await res.json()).fullyCoveredByGift).toBe(true)
    } finally {
      vi.useRealTimers()
      errors.mockRestore()
    }
  })
})
