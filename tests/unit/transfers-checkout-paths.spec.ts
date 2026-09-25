import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getTransferPrice } from '@/lib/airport-transfers'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/transfers/checkout/route'

/**
 * Drives the real transfers checkout handler over a small STATEFUL fake of
 * PostgREST and Stripe, sibling of checkout-paths.spec.ts for the tour
 * route. Covers the branches that only matter across two requests: supersede
 * of a pending / declined / already-canceled row, the declined-twin sweep a
 * fresh tab relies on, and the verified attach losing its row while the
 * intent was being minted. Transfers carry no waiver and no video reward, so
 * those paths are the tour spec's alone.
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
      update: async (id: string, p: { amount?: number }) => {
        const pi = db.intents.get(id)
        if (!pi) throw missing(id)
        if (!PAYABLE.includes(pi.status)) throw new StripeError(`cannot update a PaymentIntent in status ${pi.status}`)
        if (p.amount != null) pi.amount = p.amount
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
  assertCheckoutSchema: async () => ({ hasAttribution: false, hasPickupTime: false, hasCoupon: true, hasWaiver: true }),
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

// ── a small stateful PostgREST fake (same shape as checkout-paths.spec.ts) ──
type Pred = (r: Row) => boolean
function builder(table: string) {
  const rows = (db.tables[table] ??= [])
  const preds: Pred[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
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
    return { data: hit, error: null }
  }
  const b: Record<string, unknown> = {}
  const ch = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
    fn(...a)
    return b
  }
  Object.assign(b, {
    select: ch(() => {}),
    insert: ch((r: Row) => { op = 'insert'; payload = r }),
    update: ch((r: Row) => { op = 'update'; payload = r }),
    delete: ch(() => { op = 'delete' }),
    eq: ch((c: string, v: unknown) => { preds.push((r) => String(r[c]) === String(v)) }),
    neq: ch((c: string, v: unknown) => { preds.push((r) => String(r[c]) !== String(v)) }),
    in: ch((c: string, v: unknown[]) => { preds.push((r) => v.map(String).includes(String(r[c]))) }),
    is: ch((c: string, v: unknown) => { preds.push((r) => (r[c] ?? null) === v) }),
    not: ch(() => {}),
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

// ── fixtures: a one-way ride from the airport, next year ──
const DEST = 'iberostar-rose-hall'
const ride = (passengers: number) => ({
  destinationId: DEST, tripType: 'one_way' as const, passengers, fromAirport: true, arrivalAt: '2027-06-15T14:30', arrivalFlight: 'AA1234',
})
const fare = (passengers: number) => getTransferPrice(DEST, 'one_way', passengers)!
const customer = { email: 'guest@example.com', firstName: 'Guest', lastName: 'Example', phone: '+1 555 0100' }
const order = (passengers: number, extra: Record<string, unknown> = {}) => ({ amount: fare(passengers), items: [ride(passengers)], customer, ...extra })

const bookingRow = (id: string) => (db.tables.bookings ?? []).find((b) => b.id === id)!
const intentOf = (bookingId: string) => db.intents.get(String(bookingRow(bookingId).stripe_payment_id))!
const redemption = (bookingId: string) => (db.tables.gift_card_redemptions ?? []).find((r) => r.booking_id === bookingId)

function post(body: Record<string, unknown>) {
  return POST(new NextRequest('http://localhost/api/transfers/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeEach(() => {
  db.tables = {}
  db.seq = 0
  db.intents.clear()
  db.idem.clear()
  db.canceled = []
  db.released = []
  db.giftBalanceCents = 0
  db.calendar = []
  db.calendarMode = 'ok'
  db.onCreate = null
  db.failUpdate = null
})

describe('POST /api/transfers/checkout: supersedeBookingId', () => {
  it('cancels a superseded PENDING row and its intent, and hands its gift claim back', async () => {
    db.giftBalanceCents = 1000
    const a = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
    const aj = await a.json()
    expect(a.status).toBe(200)
    expect(redemption(aj.bookingId)?.status).toBe('reserved')

    const b = await post(order(3, { giftCode: 'MAPL-GIFT-0001', supersedeBookingId: aj.bookingId }))
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(redemption(aj.bookingId)?.status).toBe('released')
    expect(redemption(bj.bookingId)?.status).toBe('reserved')
    expect(intentOf(bj.bookingId).amount).toBe(Math.round(fare(3) * 100) - 1000)
  })

  it('cancels a superseded FAILED (declined) row too: its intent was still payable', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed' // the payment_failed webhook

    const b = await post(order(3, { supersedeBookingId: aj.bookingId }))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(db.released).toContain(aj.bookingId)
  })

  it('treats an already-canceled intent as dead and returns the gift claim', async () => {
    db.giftBalanceCents = 1000
    const a = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
    const aj = await a.json()
    intentOf(aj.bookingId).status = 'canceled' // canceled out of band; its webhook has not landed

    const b = await post(order(3, { supersedeBookingId: aj.bookingId }))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(redemption(aj.bookingId)?.status).toBe('released')
  })

  it('refuses a second intent when the superseded one has already succeeded', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    intentOf(aj.bookingId).status = 'succeeded'

    const b = await post(order(3, { supersedeBookingId: aj.bookingId }))
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bj).toMatchObject({ alreadyPaid: true, bookingId: aj.bookingId })
    expect(db.intents.size).toBe(1)
    expect(bookingRow(aj.bookingId).status).toBe('pending')
    const fresh = (db.tables.bookings ?? []).find((r) => r.id !== aj.bookingId)!
    expect(fresh.status).toBe('canceled')
  })

  it('never touches a row that belongs to a different guest', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    const b = await post(order(3, { customer: { ...customer, email: 'someone.else@example.com' }, supersedeBookingId: aj.bookingId }))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('pending')
    expect(intentOf(aj.bookingId).status).toBe('requires_payment_method')
  })
})

describe('POST /api/transfers/checkout: declined twins of the same ride', () => {
  it('a fresh tab re-POSTing a declined ride cancels the old row and its still-payable intent', async () => {
    db.giftBalanceCents = 1000
    const a = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed' // declined; Stripe leaves the intent payable

    // Same ride, no supersedeBookingId (a fresh tab never has one).
    const b = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
    const bj = await b.json()
    expect(b.status).toBe(200)
    expect(bj.bookingId).not.toBe(aj.bookingId)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(intentOf(aj.bookingId).status).toBe('canceled')
    expect(redemption(aj.bookingId)?.status).toBe('released')
    // Exactly one payable intent is left for the ride.
    const payable = Array.from(db.intents.values()).filter((p) => p.status === 'requires_payment_method')
    expect(payable.map((p) => p.id)).toEqual([bookingRow(bj.bookingId).stripe_payment_id])
  })

  it('treats a twin whose intent is already canceled as dead', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed'
    intentOf(aj.bookingId).status = 'canceled'

    const b = await post(order(2))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('canceled')
    expect(db.released).toContain(aj.bookingId)
  })

  it('leaves a twin whose intent has settled to its webhook', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed'
    intentOf(aj.bookingId).status = 'succeeded' // a retry on the old form went through

    const b = await post(order(2))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('failed')
    expect(db.released).not.toContain(aj.bookingId)
  })

  it('leaves a twin for a different ride alone', async () => {
    const a = await post(order(2))
    const aj = await a.json()
    bookingRow(aj.bookingId).status = 'failed'

    const b = await post(order(3))
    expect(b.status).toBe(200)
    expect(bookingRow(aj.bookingId).status).toBe('failed')
    expect(intentOf(aj.bookingId).status).toBe('requires_payment_method')
  })
})

describe('POST /api/transfers/checkout: the verified attach', () => {
  beforeEach(() => { db.giftBalanceCents = 1000 })
  const body = () => order(2, { giftCode: 'MAPL-GIFT-0001' })

  it('booking canceled while the intent was minted: 409, the intent dies, the gift goes back', async () => {
    db.onCreate = (pi) => { bookingRow(pi.metadata.booking_id).status = 'canceled' }
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(409)
    expect(data.error).toBe('This booking can no longer be paid for. Please start a new one.')
    expect(data.bookingId).toBeTruthy()
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(redemption(data.bookingId)?.status).toBe('released')
  })

  it('booking paid while the intent was minted: alreadyPaid, the new intent dies, the gift stays spent', async () => {
    db.onCreate = (pi) => { bookingRow(pi.metadata.booking_id).status = 'paid' }
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.alreadyPaid).toBe(true)
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(db.released).toEqual([])
    expect(redemption(data.bookingId)?.status).toBe('reserved')
  })

  it('attach write errors: 500, the intent dies, the gift goes back', async () => {
    db.failUpdate = (table, patch) => table === 'bookings' && 'stripe_payment_id' in patch
    const res = await post(body())
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toBe('Could not attach payment intent')
    expect(data.bookingId).toBeTruthy()
    expect(Array.from(db.intents.values()).map((p) => p.status)).toEqual(['canceled'])
    expect(redemption(data.bookingId)?.status).toBe('released')
  })
})

describe('POST /api/transfers/checkout: guest-facing refusals', () => {
  it('asks for a valid email without an em dash', async () => {
    const res = await post(order(2, { customer: { ...customer, email: 'not-an-email' } }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toBe('A valid email address is required, your confirmation is sent there.')
    expect(db.tables.bookings ?? []).toHaveLength(0)
  })
})

/**
 * A ride the gift card settles has no PaymentIntent, so the Stripe webhook
 * never syncs it to the ops calendar (recheck N3, Sept 2026). The route does.
 */
describe('POST /api/transfers/checkout: a ride the gift card settles reaches the ops calendar', () => {
  it('in full, and with a remainder under 50 cents absorbed', async () => {
    for (const shortBy of [0, 30]) {
      db.tables.bookings = []
      db.calendar = []
      db.giftBalanceCents = Math.round(fare(2) * 100) - shortBy
      const res = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
      const data = await res.json()
      expect(data.fullyCoveredByGift).toBe(true)
      expect(bookingRow(data.bookingId).status).toBe('paid')
      expect(db.calendar).toEqual([data.bookingId])
    }
    expect(db.intents.size).toBe(0)
  })

  it('a card payment is left to the webhook', async () => {
    const res = await post(order(2))
    expect((await res.json()).clientSecret).toBeTruthy()
    expect(db.calendar).toEqual([])
  })

  it('a calendar that throws never fails the settle', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.calendarMode = 'throw'
    db.giftBalanceCents = Math.round(fare(2) * 100)
    const res = await post(order(2, { giftCode: 'MAPL-GIFT-0001' }))
    expect(res.status).toBe(200)
    expect((await res.json()).fullyCoveredByGift).toBe(true)
    errors.mockRestore()
  })
})
