import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { issuedBookingId, supersedeBookingIdFor, orderKey, readCheckoutAnswer, type CheckoutIntentResult } from '@/lib/checkout-form'
import { createIntentSession, payableIntent, STALE_INTENT_MESSAGE, type PostOutcome, type IntentRead } from '@/components/checkout/one-page/intent-session'
import { priceTourCart } from '@/lib/checkout-pricing'
// vi.mock calls are hoisted above this import, so the handler loads over the fakes below.
import { POST } from '@/app/api/checkout/route'

/**
 * The one-page checkouts' side of supersede (batch review, money blocker 1).
 *
 * Every distinct order hashes to its own pending row, so an order changed
 * after the quiet save used to leave the first row pending with a live
 * PaymentIntent, and a signed-in reward holder was refused with
 * rewardConflict and paid full price. The pages now name the booking they
 * were last issued as `supersedeBookingId` on every POST for a different
 * order, one POST at a time, and never hand back an intent that POST may
 * have canceled.
 */

const ID_A = '0a0a0a0a-0000-4000-8000-00000000000a'
const ID_B = '0b0b0b0b-0000-4000-8000-00000000000b'
const ID_C = '0c0c0c0c-0000-4000-8000-00000000000c'

describe('issuedBookingId', () => {
  it('reads the id from a success and from a refusal made after the row exists', () => {
    expect(issuedBookingId({ clientSecret: 'pi_1_secret', bookingId: ID_A, amountDue: 255 })).toBe(ID_A)
    expect(issuedBookingId({ error: 'Your reward is already in use on another checkout, so this booking is priced without it.', rewardConflict: true, bookingId: ID_B })).toBe(ID_B)
  })
  it('is null for a refusal made before any row exists, or anything that is not a booking id', () => {
    expect(issuedBookingId({ error: 'That code could not be used.', couponCode: true })).toBeNull()
    expect(issuedBookingId({ bookingId: 'abc' })).toBeNull()
    expect(issuedBookingId({ bookingId: 42 })).toBeNull()
    expect(issuedBookingId(null)).toBeNull()
    expect(issuedBookingId('oops')).toBeNull()
  })
})

describe('supersedeBookingIdFor', () => {
  it('names the newest booking for a POST about a different order', () => {
    expect(supersedeBookingIdFor('k2', { cachedKey: 'k1', lastBookingId: ID_A })).toBe(ID_A)
    expect(supersedeBookingIdFor('k2', { cachedKey: null, lastBookingId: ID_A })).toBe(ID_A)
  })
  it('names nothing on the first POST, for the order already held, or for a malformed id', () => {
    expect(supersedeBookingIdFor('k1', { cachedKey: null, lastBookingId: null })).toBeUndefined()
    expect(supersedeBookingIdFor('k1', { cachedKey: 'k1', lastBookingId: ID_A })).toBeUndefined()
    expect(supersedeBookingIdFor('k2', { cachedKey: 'k1', lastBookingId: 'not-a-uuid' })).toBeUndefined()
  })
})

// ── The session, over a recording fake of the page's own POST ──

type R = { ok: boolean; id?: string }
const ok = (id: string): PostOutcome<R> => ({ result: { ok: true, id }, bookingId: id, reusable: true })
const refused = (id: string | null): PostOutcome<R> => ({ result: { ok: false }, bookingId: id, reusable: false })

function recorder(respond: (body: Record<string, unknown>, n: number) => PostOutcome<R> | Promise<PostOutcome<R>>) {
  const bodies: Record<string, unknown>[] = []
  const post = async (body: Record<string, unknown>) => { bodies.push(body); return respond(body, bodies.length) }
  return { bodies, post }
}

const quiet = { amount: 242.25, items: [{ id: 14, travelers: 2, date: '2026-10-08' }], customer: { email: 'guest@example.com' }, applyReward: true }
const edited = { ...quiet, items: [{ id: 14, travelers: 3, date: '2026-10-08' }], couponCode: 'JAMAICA5' }

describe('intent session', () => {
  it('an order changed after the quiet save names the saved booking; the same order is never sent twice', async () => {
    const s = createIntentSession<R>()
    const { bodies, post } = recorder((_b, n) => ok(n === 1 ? ID_A : ID_B))
    expect(await s.send(quiet, post)).toEqual({ ok: true, id: ID_A })
    expect(await s.send(quiet, post)).toEqual({ ok: true, id: ID_A })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toHaveProperty('supersedeBookingId')

    expect(await s.send(edited, post)).toEqual({ ok: true, id: ID_B })
    expect(bodies[1]).toEqual({ ...edited, supersedeBookingId: ID_A })
    // The supersede id is not part of the order: the edited order is now held.
    expect(await s.send(edited, post)).toEqual({ ok: true, id: ID_B })
    expect(bodies).toHaveLength(2)
  })

  it('the tour Pay, which adds only the waiver, names the quiet-save row (the server skips its own row)', async () => {
    const s = createIntentSession<R>()
    const { bodies, post } = recorder(() => ok(ID_A))
    await s.send(quiet, post)
    await s.send({ ...quiet, waiverAccepted: true }, post)
    expect(bodies[1]).toEqual({ ...quiet, waiverAccepted: true, supersedeBookingId: ID_A })
  })

  it('a Pay for an edited order waits for the quiet save in flight, then names it', async () => {
    const s = createIntentSession<R>()
    let release!: (o: PostOutcome<R>) => void
    const { bodies, post } = recorder((_b, n) => (n === 1 ? new Promise<PostOutcome<R>>((r) => { release = r }) : ok(ID_B)))
    const saving = s.send(quiet, post)
    const paying = s.send(edited, post)
    await new Promise((r) => setTimeout(r, 0))
    expect(bodies).toHaveLength(1) // the Pay has not gone out alongside the save
    release(ok(ID_A))
    expect(await saving).toEqual({ ok: true, id: ID_A })
    expect(await paying).toEqual({ ok: true, id: ID_B })
    expect(bodies[1]).toEqual({ ...edited, supersedeBookingId: ID_A })
  })

  it('the same order already on the wire is shared, not sent again', async () => {
    const s = createIntentSession<R>()
    let release!: (o: PostOutcome<R>) => void
    const { bodies, post } = recorder(() => new Promise<PostOutcome<R>>((r) => { release = r }))
    const first = s.send(quiet, post)
    const second = s.send({ ...quiet }, post)
    await new Promise((r) => setTimeout(r, 0))
    release(ok(ID_A))
    expect(await first).toBe(await second)
    expect(bodies).toHaveLength(1)
  })

  it('a refusal that issued a booking makes it the next to supersede; one that did not keeps the previous', async () => {
    const s = createIntentSession<R>()
    const answers = [ok(ID_A), refused(ID_B), refused(null), ok(ID_C)]
    const { bodies, post } = recorder((_b, n) => answers[n - 1])
    await s.send(quiet, post) // quiet save: A with an intent
    await s.send(edited, post) // Pay: rewardConflict, the server made B without an intent
    await s.send({ ...edited, applyReward: false }, post) // coupon refused before any row
    await s.send({ ...edited, applyReward: false }, post) // tapped again: refusals are not cached
    expect(bodies.map((b) => b.supersedeBookingId)).toEqual([undefined, ID_A, ID_B, ID_B])
  })

  it('never hands back an intent a later POST may have canceled', async () => {
    const s = createIntentSession<R>()
    const answers = [ok(ID_A), refused(null), ok(ID_C)]
    const { bodies, post } = recorder((_b, n) => answers[n - 1])
    await s.send(quiet, post) // A cached
    await s.send(edited, post) // names A, then fails (the server may already have canceled A)
    // Back to the first order: must go to the server, not reuse A's intent.
    expect(await s.send(quiet, post)).toEqual({ ok: true, id: ID_C })
    expect(bodies).toHaveLength(3)
    expect(bodies[2]).toEqual({ ...quiet, supersedeBookingId: ID_A })
  })

  it('a malformed booking id is never sent back, and a thrown POST does not wedge the next one', async () => {
    const s = createIntentSession<R>()
    let n = 0
    const post = async (): Promise<PostOutcome<R>> => {
      n++
      if (n === 1) return { result: { ok: true }, bookingId: 'not-a-uuid', reusable: true }
      if (n === 2) throw new Error('boom')
      return ok(ID_B)
    }
    const seen: Record<string, unknown>[] = []
    const spy = async (b: Record<string, unknown>) => { seen.push(b); return post() }
    await s.send(quiet, spy)
    await expect(s.send(edited, spy)).rejects.toThrow('boom')
    await s.send({ ...edited, applyReward: false }, spy)
    expect(seen.map((b) => b.supersedeBookingId)).toEqual([undefined, undefined, undefined])
    expect(orderKey(seen[2])).toBe(orderKey({ ...edited, applyReward: false }))
  })
})

describe('an intent another tab canceled (fresh)', () => {
  it('fresh drops only this order\'s cached intent and asks again, naming the booking it held', async () => {
    const s = createIntentSession<R>()
    const { bodies, post } = recorder((_b, n) => ok(n === 1 ? ID_A : ID_B))
    await s.send(quiet, post)
    expect(await s.send(quiet, post)).toEqual({ ok: true, id: ID_A }) // cached, no POST
    expect(bodies).toHaveLength(1)
    expect(await s.send(quiet, post, { fresh: true })).toEqual({ ok: true, id: ID_B })
    expect(bodies).toHaveLength(2)
    // The server skips a supersede of the row it answers with, and cancels
    // the row only if it is still pending or declined with a live intent.
    expect(bodies[1]).toEqual({ ...quiet, supersedeBookingId: ID_A })
    // The new answer is the one held now.
    expect(await s.send(quiet, post)).toEqual({ ok: true, id: ID_B })
    expect(bodies).toHaveLength(2)
  })

  it('fresh for an order nothing is cached for is an ordinary send', async () => {
    const s = createIntentSession<R>()
    const { bodies, post } = recorder(() => ok(ID_A))
    await s.send(quiet, post, { fresh: true })
    expect(bodies).toEqual([quiet])
  })
})

describe('payableIntent', () => {
  const intent = (secret: string, bookingId = ID_A): CheckoutIntentResult => ({ clientSecret: secret, bookingId, amountDue: 99 })
  function creator(answers: CheckoutIntentResult[]) {
    const calls: ({ fresh?: boolean } | undefined)[] = []
    const create = async (opts?: { fresh?: boolean }) => { calls.push(opts); return answers[calls.length - 1] }
    return { calls, create }
  }
  const reader = (statuses: Record<string, string | null>) => {
    const asked: string[] = []
    const read = async (secret: string): Promise<IntentRead | null> => {
      asked.push(secret)
      const status = statuses[secret]
      return status ? { status, amount: 9900 } : null
    }
    return { asked, read }
  }

  it('confirms a live intent without asking the server again', async () => {
    for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
      const { calls, create } = creator([intent('a')])
      const { read } = reader({ a: status })
      const out = await payableIntent(create, read)
      expect(out.res).toEqual(intent('a'))
      expect(out.intent).toEqual({ status, amount: 9900 })
      expect(calls).toEqual([undefined])
    }
  })

  it('asks once more, past the cache, when Stripe will not confirm the intent', async () => {
    for (const dead of ['canceled', 'processing', 'succeeded', 'requires_capture']) {
      const { calls, create } = creator([intent('a'), intent('b', ID_B)])
      const { asked, read } = reader({ a: dead, b: 'requires_payment_method' })
      const out = await payableIntent(create, read)
      expect(out.res).toEqual(intent('b', ID_B))
      expect(calls).toEqual([undefined, { fresh: true }])
      expect(asked).toEqual(['a', 'b'])
    }
  })

  it('hands on whatever the second answer is: a page to go to, or a refusal', async () => {
    const paid = creator([intent('a'), { navigate: `/checkout/confirm?booking_id=${ID_A}` }])
    expect((await payableIntent(paid.create, reader({ a: 'succeeded' }).read)).res).toEqual({ navigate: `/checkout/confirm?booking_id=${ID_A}` })
    const busy = creator([intent('a'), { error: 'Your payment is still being confirmed.' }])
    expect((await payableIntent(busy.create, reader({ a: 'processing' }).read)).res).toEqual({ error: 'Your payment is still being confirmed.' })
  })

  it('never loops: a second dead intent is a refusal', async () => {
    const { calls, create } = creator([intent('a'), intent('a'), intent('c')])
    const out = await payableIntent(create, reader({ a: 'canceled' }).read)
    expect(out).toEqual({ res: { error: STALE_INTENT_MESSAGE }, intent: null })
    expect(calls).toHaveLength(2)
  })

  it('passes a page to go to or a refusal straight through, and confirms as before when Stripe cannot be asked', async () => {
    const nav = creator([{ navigate: '/checkout/confirm?booking_id=x' }])
    const { asked, read } = reader({})
    expect((await payableIntent(nav.create, read)).res).toEqual({ navigate: '/checkout/confirm?booking_id=x' })
    const refused = creator([{ error: 'nope', shownOnPage: true }])
    expect((await payableIntent(refused.create, read)).res).toEqual({ error: 'nope', shownOnPage: true })
    expect(asked).toEqual([])
    const blind = creator([intent('a')])
    expect(await payableIntent(blind.create, reader({ a: null }).read)).toEqual({ res: intent('a'), intent: null })
    expect(blind.calls).toHaveLength(1)
  })

  it('with the session: the cached intent a fresh tab canceled is replaced, not confirmed again', async () => {
    const s = createIntentSession<CheckoutIntentResult>()
    const bodies: Record<string, unknown>[] = []
    const post = async (b: Record<string, unknown>): Promise<PostOutcome<CheckoutIntentResult>> => {
      bodies.push(b)
      const n = bodies.length
      return { result: intent(n === 1 ? 'a' : 'b', n === 1 ? ID_A : ID_B), bookingId: n === 1 ? ID_A : ID_B, reusable: true }
    }
    const create = (opts?: { fresh?: boolean }) => s.send(quiet, post, opts)
    await create() // the quiet save caches intent a
    const statuses: Record<string, string> = { a: 'canceled', b: 'requires_payment_method' } // another tab killed a
    const out = await payableIntent(create, async (secret) => ({ status: statuses[secret], amount: 9900 }))
    expect(out.res).toEqual(intent('b', ID_B))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toEqual({ ...quiet, supersedeBookingId: ID_A })
  })
})

// ── The same session against the real tour route ──
//
// A small STATEFUL fake of PostgREST and Stripe, adapted from the batch
// review's reward-conflict probe: the pending (cart_hash, booking_type)
// unique index answers 23505, conditional updates touch only matching rows,
// and Stripe refuses to cancel an intent that is canceled, processing or
// succeeded.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  seq: 0,
  intents: new Map<string, Record<string, unknown>>(),
}))

vi.mock('stripe', () => {
  class StripeError extends Error { code?: string }
  class Stripe {
    static errors = { StripeError }
    paymentIntents = {
      create: async (params: Record<string, unknown>) => {
        const id = `pi_${++db.seq}`
        const pi = { id, client_secret: `${id}_secret`, status: 'requires_payment_method', amount: params.amount, metadata: params.metadata }
        db.intents.set(id, pi)
        return pi
      },
      retrieve: async (id: string) => {
        const pi = db.intents.get(id)
        if (!pi) { const e = new StripeError('missing'); e.code = 'resource_missing'; throw e }
        return pi
      },
      update: async (id: string, p: Record<string, unknown>) => { const pi = db.intents.get(id)!; Object.assign(pi, p); return pi },
      cancel: async (id: string) => {
        const pi = db.intents.get(id)!
        if (['succeeded', 'processing', 'canceled'].includes(String(pi.status))) throw new Error('cannot cancel')
        pi.status = 'canceled'
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
vi.mock('@/lib/gift-redemption', () => ({ claimGiftCard: async () => ({ ok: false, message: 'no' }), releaseGiftClaim: async () => {}, settleGiftClaim: async () => {} }))
vi.mock('@/lib/email/booking', () => ({ maybeSendTravelerConfirmation: async () => ({ ok: true }), maybeSendOperatorAlert: async () => ({ ok: true }), resolveOpsRecipients: () => [] }))
vi.mock('@/lib/booking-items', () => ({ replaceBookingItems: async () => ({ error: null }) }))
vi.mock('@/lib/email/send', () => ({ sendEmail: async () => ({ ok: true }), operatorAlertRecipients: () => [] }))
vi.mock('@/lib/coupon-redemption', () => ({ consumeCoupon: async () => ({ ok: true }) }))

type Pred = (r: Row) => boolean
function atom(expr: string): Pred {
  const [col, op, ...rest] = expr.split('.')
  const raw = rest.join('.')
  const val = raw === 'null' ? null : raw
  if (op === 'eq') return (r) => String(r[col]) === String(val)
  if (op === 'is') return (r) => (r[col] ?? null) === val
  throw new Error('unsupported filter ' + op)
}
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
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
  let payload: Row | null = null
  let cols = ''
  let lim = Infinity
  const run = () => {
    if (op === 'insert') {
      const r: Row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...payload }
      if (table === 'bookings' && r.status === 'pending' && rows.some((x) => x.status === 'pending' && x.cart_hash === r.cart_hash && x.booking_type === r.booking_type)) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      rows.push(r)
      return { data: [r], error: null }
    }
    const hit = rows.filter((r) => preds.every((p) => p(r))).slice(0, lim)
    if (op === 'update') { hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null } }
    if (op === 'delete') { hit.forEach((r) => rows.splice(rows.indexOf(r), 1)); return { data: hit, error: null } }
    const withEmbed = cols.includes('bookings!')
      ? hit.map((r) => ({ ...r, bookings: (db.tables.bookings ?? []).find((b) => b.id === r.used_on_booking_id) ?? null }))
      : hit
    return { data: withEmbed, error: null }
  }
  const b: Record<string, unknown> = {}
  const ch = (fn: (...a: never[]) => void) => (...a: never[]) => { fn(...a); return b }
  Object.assign(b, {
    select: ch((c: never) => { if (op === 'select') cols = String(c ?? '') }),
    insert: ch((r: never) => { op = 'insert'; payload = r }),
    update: ch((r: never) => { op = 'update'; payload = r }),
    delete: ch(() => { op = 'delete' }),
    eq: ch((c: never, v: never) => preds.push((r) => String(r[c]) === String(v))),
    neq: ch((c: never, v: never) => preds.push((r) => String(r[c]) !== String(v))),
    in: ch((c: never, v: never) => preds.push((r) => (v as unknown[]).map(String).includes(String(r[c])))),
    is: ch((c: never, v: never) => preds.push((r) => (r[c] ?? null) === v)),
    not: ch(() => {}),
    or: ch((s: never) => preds.push(orExpr(String(s)))),
    order: ch(() => {}),
    limit: ch((n: never) => { lim = Number(n) }),
    maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error } },
    single: async () => {
      const r = run()
      const d = (r.data as Row[] | null)?.[0] ?? null
      return { data: d, error: r.error ?? (d ? null : { message: 'no row' }) }
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  })
  return b
}
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: (t: string) => builder(t) }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from: (t: string) => builder(t) }),
}))

const DATE = '2027-06-15'
const cart = (travelers: number) => [{ id: 1, title: 'x', destination: 'x', travelers, date: DATE, price: 0 }]
const priced = (travelers: number, pct: number) => priceTourCart([{ id: 1, travelers, date: DATE }], {}, { rewardPercent: pct })
const customer = { email: 'supersede@example.com', firstName: 'Sam', lastName: 'Page', phone: '+1 555 0100', pickup: 'Hotel' }

type Answer = { status: number; data: Record<string, unknown> }
/** The page's POST, reduced to what the session needs: the wire call and its reading of the answer. */
const routePost = async (body: Record<string, unknown>): Promise<PostOutcome<Answer>> => {
  const res = await POST(new NextRequest('http://localhost/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  const data = (await res.json()) as Record<string, unknown>
  return { result: { status: res.status, data }, bookingId: issuedBookingId(data), reusable: typeof data.clientSecret === 'string' }
}
const booking = (id: unknown) => (db.tables.bookings ?? []).find((b) => b.id === id)

beforeEach(() => {
  db.tables = { user_rewards: [{ id: 'r1', user_id: 'u1', percent: 5, status: 'available', used_on_booking_id: null, created_at: '2026-09-01T00:00:00Z' }] }
  db.intents.clear()
})

describe('the tour route, driven by the session', () => {
  it('a reward holder who edits after the quiet save keeps the discount, and the saved booking and intent are canceled', async () => {
    const s = createIntentSession<Answer>()
    // Quiet save: details complete, waiver left out, reward kept (the default).
    const saved = await s.send({ amount: priced(2, 5).total, items: cart(2), customer, applyReward: true }, routePost)
    expect(saved.status).toBe(200)
    const a = booking(saved.data.bookingId)!

    // The guest takes a third seat, ticks the waiver and taps Pay.
    const paid = await s.send({ amount: priced(3, 5).total, items: cart(3), customer, applyReward: true, waiverAccepted: true }, routePost)
    expect(paid.status).toBe(200)
    expect(paid.data.amountDue).toBeCloseTo(priced(3, 5).total, 2)
    expect(a.status).toBe('canceled')
    expect(db.intents.get(String(a.stripe_payment_id))?.status).toBe('canceled')
    expect(db.tables.user_rewards[0]).toMatchObject({ status: 'reserved', used_on_booking_id: paid.data.bookingId })
    expect((db.tables.bookings ?? []).filter((b) => b.status === 'pending')).toHaveLength(1)
  })

  it('a genuine conflict leaves no stranded row: the row it made is superseded when the guest pays without the reward', async () => {
    // Another live checkout of the same guest holds the reward (a second tab, minutes old).
    const other = { id: crypto.randomUUID(), booking_type: 'tour', status: 'pending', email: customer.email, cart_hash: 'other-tab', stripe_payment_id: 'pi_other', created_at: new Date().toISOString() }
    db.tables.bookings = [other]
    db.intents.set('pi_other', { id: 'pi_other', status: 'requires_payment_method', amount: 1 })
    db.tables.user_rewards[0] = { ...db.tables.user_rewards[0], status: 'reserved', used_on_booking_id: other.id }

    const s = createIntentSession<Answer>()
    const conflict = await s.send({ amount: priced(2, 5).total, items: cart(2), customer, applyReward: true }, routePost)
    expect(conflict.status).toBe(409)
    expect(conflict.data.rewardConflict).toBe(true)
    const stray = booking(conflict.data.bookingId)!
    expect(stray.status).toBe('pending')

    // The page unticks the reward and shows the full price; the guest taps Pay.
    const paid = await s.send({ amount: priced(2, 0).total, items: cart(2), customer, applyReward: false, waiverAccepted: true }, routePost)
    expect(paid.status).toBe(200)
    expect(paid.data.amountDue).toBeCloseTo(priced(2, 0).total, 2)
    expect(stray.status).toBe('canceled')
    // The other tab is untouched: its row, its intent and its hold on the reward.
    expect(other.status).toBe('pending')
    expect(db.intents.get('pi_other')?.status).toBe('requires_payment_method')
    expect(db.tables.user_rewards[0]).toMatchObject({ status: 'reserved', used_on_booking_id: other.id })
  })
})

/** The page's own POST: the wire call, then readCheckoutAnswer exactly as OnePageCheckout applies it. */
const pagePost = (shown: { cents: number; total: number }) => async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('http://localhost/api/checkout', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  return readCheckoutAnswer(await res.json(), { confirmPath: '/checkout/confirm', shownCents: shown.cents, shownTotal: shown.total, rewardOnPage: true })
}
const readIntent = async (secret: string): Promise<IntentRead | null> => {
  const pi = Array.from(db.intents.values()).find((p) => p.client_secret === secret)
  return pi ? { status: String(pi.status), amount: Number(pi.amount) } : null
}

describe('the tour route, read the way the page reads it', () => {
  it('a real rewardConflict unticks the reward on the page and is never reused', async () => {
    const other = { id: crypto.randomUUID(), booking_type: 'tour', status: 'pending', email: customer.email, cart_hash: 'other-tab', stripe_payment_id: 'pi_other', created_at: new Date().toISOString() }
    db.tables.bookings = [other]
    db.intents.set('pi_other', { id: 'pi_other', status: 'requires_payment_method', amount: 1 })
    db.tables.user_rewards[0] = { ...db.tables.user_rewards[0], status: 'reserved', used_on_booking_id: other.id }

    const total = priced(2, 5).total
    const answer = await pagePost({ cents: Math.round(total * 100), total })({ amount: total, items: cart(2), customer, applyReward: true, waiverAccepted: true })
    expect(answer.untickReward).toBe(true)
    expect(answer.result).toMatchObject({ shownOnPage: true })
    expect(answer.reusable).toBe(false)
    expect(booking(answer.bookingId)?.status).toBe('pending') // the no-intent row the next POST supersedes
  })

  it('a tab whose declined intent a fresh tab swept re-asks once and pays the one live intent', async () => {
    const total = priced(2, 0).total
    const shown = { cents: Math.round(total * 100), total }
    const order = { amount: total, items: cart(2), customer, applyReward: false, waiverAccepted: true }

    // Tab 1 taps Pay: row A and its intent, cached by tab 1's session.
    const tab1 = createIntentSession<CheckoutIntentResult>()
    const post1 = vi.fn(pagePost(shown))
    const first = await tab1.send(order, post1)
    expect(first).toHaveProperty('clientSecret')
    const a = booking((first as { bookingId: string }).bookingId)!
    // The card is declined: the webhook marks A failed, Stripe leaves the intent payable.
    a.status = 'failed'

    // A fresh tab POSTs the same order. The route's declined-twin sweep
    // cancels A's intent and row, and the new row B gets its own intent.
    const tab2 = await createIntentSession<CheckoutIntentResult>().send(order, pagePost(shown))
    expect(a.status).toBe('canceled')
    expect(db.intents.get(String(a.stripe_payment_id))?.status).toBe('canceled')
    const b = booking((tab2 as { bookingId: string }).bookingId)!

    // Back in tab 1, Pay again with another card: the cached intent is dead.
    const out = await payableIntent((opts) => tab1.send(order, post1, opts), readIntent)
    expect(out.intent?.status).toBe('requires_payment_method')
    expect(out.res).toMatchObject({ bookingId: b.id, clientSecret: db.intents.get(String(b.stripe_payment_id))?.client_secret })
    expect(post1).toHaveBeenCalledTimes(2)
    expect(post1.mock.calls[1][0]).toMatchObject({ supersedeBookingId: a.id })
    // One payable intent for the trip, not two.
    const payable = Array.from(db.intents.values()).filter((p) => ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(String(p.status)))
    expect(payable.map((p) => p.id)).toEqual([b.stripe_payment_id])
  })
})
