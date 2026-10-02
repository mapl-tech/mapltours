import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { priceTourCart } from '@/lib/checkout-pricing'
import { getTransferPrice } from '@/lib/airport-transfers'
// vi.mock calls are hoisted above these imports by vitest, so both handlers load over the fakes.
import { POST as tourPOST } from '@/app/api/checkout/route'
import { POST as transferPOST } from '@/app/api/transfers/checkout/route'

/**
 * First-touch attribution adds ten first_* keys to the checkout payload's
 * `attribution`. This drives both REAL checkout handlers (over the same
 * stateful PostgREST and Stripe fakes as checkout-paths.spec.ts, with the
 * attribution column present) to prove the keys are stored and change
 * nothing else: the same cart hash (pinned to the formula both routes use
 * today), the same booking row apart from `attribution`, the same
 * PaymentIntent, and a second POST that differs only by first_* keys reuses
 * the row and the intent instead of minting new ones.
 */

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  seq: 0,
  intents: new Map<string, { id: string; client_secret: string; status: string; amount: number; metadata: Record<string, string>; params: Record<string, unknown> }>(),
  idem: new Map<string, string>(),
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
          params: JSON.parse(JSON.stringify(params)) as Record<string, unknown>,
        }
        db.intents.set(id, pi)
        if (key) db.idem.set(key, id)
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
        pi.status = 'canceled'
        return pi
      },
    }
  }
  return { default: Stripe }
})

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
// The attribution column exists here (it does in production), so the routes store it.
vi.mock('@/lib/checkout-schema', () => ({
  assertCheckoutSchema: async () => ({ hasAttribution: true, hasPickupTime: false, hasCoupon: true, hasWaiver: true }),
  SchemaNotReadyError: class extends Error {},
}))
vi.mock('@/lib/gift-redemption', () => ({
  claimGiftCard: async () => ({ ok: false, message: 'That gift card has no balance left.' }),
  releaseGiftClaim: async () => {},
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
vi.mock('@/lib/google-calendar', () => ({ syncBookingToCalendar: async () => ({ ok: true }) }))

// ── a small stateful PostgREST fake (same shape as checkout-paths.spec.ts) ──
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
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (t: string) => builder(t),
  }),
}))

// ── fixtures ──
const LAST_ONLY = { source: 'bio', medium: 'email', landing: '/transfers', ts: '2026-09-21T14:00:00.000Z', ga_client_id: '111.222' }
const FIRST = {
  first_source: 'chatgpt.com', first_medium: 'ai', first_campaign: 'c', first_term: 't', first_content: 'x',
  first_referrer: 'https://chatgpt.com/', first_gclid: 'g1', first_fbclid: 'IwAR1', first_landing: '/', first_ts: '2026-09-20T15:00:00.000Z',
}
const WITH_FIRST = { ...LAST_ONLY, ...FIRST }

const customer = { email: 'guest@example.com', firstName: 'Guest', lastName: 'Example', phone: '+1 555 0100', pickup: 'Hotel' }
const DATE = '2027-06-15'
const tourTotal = priceTourCart([{ id: 1, travelers: 2, date: DATE }], {}, { rewardPercent: 0 }).total
const tourOrder = (attribution: unknown) => ({
  amount: tourTotal,
  items: [{ id: 1, title: 'x', destination: 'x', travelers: 2, date: DATE, price: 0 }],
  customer,
  waiverAccepted: true,
  attribution,
})

const DEST = 'iberostar-rose-hall'
const ARRIVAL = '2027-06-15T14:30'
const fare = getTransferPrice(DEST, 'one_way', 2)!
const rideOrder = (attribution: unknown) => ({
  amount: fare,
  items: [{ destinationId: DEST, tripType: 'one_way', passengers: 2, fromAirport: true, arrivalAt: ARRIVAL, arrivalFlight: 'AA1234' }],
  customer: { email: customer.email, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone },
  attribution,
})

// The cart-hash formulas exactly as both routes compute them today (hashCart
// in each route). Attribution is not an input, and this pins that it stays so.
const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 32)
const tourHash = sha({ items: [`1:2:${DATE}`], cents: Math.round(tourTotal * 100), email: customer.email, gift: '', coupon: '' })
const rideHash = sha({ items: [`${DEST}:one_way:from-mbj:2:${ARRIVAL}:`], cents: Math.round(fare * 100), email: customer.email, gift: '', coupon: '' })

type Handler = (req: NextRequest) => Promise<Response>
const routes: Array<{ name: string; POST: Handler; url: string; order: (a: unknown) => Record<string, unknown>; hash: string; type: string }> = [
  { name: 'POST /api/checkout (tours)', POST: tourPOST, url: 'http://localhost/api/checkout', order: tourOrder, hash: tourHash, type: 'tour' },
  { name: 'POST /api/transfers/checkout', POST: transferPOST, url: 'http://localhost/api/transfers/checkout', order: rideOrder, hash: rideHash, type: 'transfer' },
]

function reset() {
  db.tables = {}
  db.seq = 0
  db.intents.clear()
  db.idem.clear()
}
beforeEach(reset)

// Fields that differ between two otherwise identical requests by nature:
// the row id, its creation time, and the waiver stamp's time.
const VOLATILE = new Set(['id', 'created_at', 'waiver_accepted_at'])
const stable = (row: Row) => Object.fromEntries(Object.entries(row).filter(([k]) => !VOLATILE.has(k) && k !== 'attribution'))
const omit = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))

for (const r of routes) {
  const post = (body: Record<string, unknown>) =>
    r.POST(new NextRequest(r.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

  const once = async (attribution: unknown) => {
    reset()
    const res = await post(r.order(attribution))
    const data = await res.json()
    expect(res.status, JSON.stringify(data)).toBe(200)
    const rows = db.tables.bookings ?? []
    expect(rows).toHaveLength(1)
    expect(db.intents.size).toBe(1)
    return { data, row: { ...rows[0] }, pi: Array.from(db.intents.values())[0] }
  }

  describe(`${r.name}: first_* attribution keys`, () => {
    it('store on the booking and change nothing else: hash, row, intent', async () => {
      const a = await once(LAST_ONLY)
      const b = await once(WITH_FIRST)

      expect(a.row.cart_hash).toBe(r.hash)
      expect(b.row.cart_hash).toBe(r.hash)
      expect(a.row.booking_type).toBe(r.type)

      expect(a.row.attribution).toEqual(LAST_ONLY)
      expect(b.row.attribution).toEqual(WITH_FIRST)
      expect(stable(b.row)).toEqual(stable(a.row))

      expect(a.pi.metadata.booking_id).toBe(a.row.id)
      expect(b.pi.metadata.booking_id).toBe(b.row.id)
      const metaA = omit(a.pi.metadata, ['booking_id'])
      const metaB = omit(b.pi.metadata, ['booking_id'])
      expect(metaB).toEqual(metaA)
      expect(b.pi.amount).toBe(a.pi.amount)
      expect({ ...b.pi.params, metadata: metaB }).toEqual({ ...a.pi.params, metadata: metaA })
      expect(JSON.stringify(b.pi.params)).not.toContain('chatgpt')
      expect(JSON.stringify(b.pi.params)).not.toContain('IwAR1')

      // The answer the page reads: the same, apart from the ids and the log's request id.
      const restA = omit(a.data, ['bookingId', 'clientSecret', 'requestId'])
      const restB = omit(b.data, ['bookingId', 'clientSecret', 'requestId'])
      expect(restA.amountDue).toBeGreaterThan(0)
      expect(restB).toEqual(restA)
    })

    it('a second POST that differs only by first_* keys reuses the row and the intent', async () => {
      const first = await (await post(r.order(LAST_ONLY))).json()
      const second = await (await post(r.order(WITH_FIRST))).json()
      expect(second.bookingId).toBe(first.bookingId)
      expect(second.clientSecret).toBe(first.clientSecret)
      expect(db.tables.bookings).toHaveLength(1)
      expect(db.intents.size).toBe(1)
      expect(db.tables.bookings[0].cart_hash).toBe(r.hash)
      // The reuse path refreshes attribution as it always has, now with the first touch.
      expect(db.tables.bookings[0].attribution).toEqual(WITH_FIRST)
    })

    it('are sanitized at the boundary like every other key', async () => {
      const { row } = await once({ ...LAST_ONLY, first_source: 42, first_referrer: 'r'.repeat(500), first_medium: 'a\u0000i', first_gclid: 'g\u00001', first_fbp: 'nope' })
      expect(row.cart_hash).toBe(r.hash)
      expect(row.attribution).toEqual({ ...LAST_ONLY, first_referrer: 'r'.repeat(300), first_medium: 'ai', first_gclid: 'g1' })
    })
  })

  describe(`${r.name}: a Muse source and the ua browser family`, () => {
    // A booking Muse started: tagged utm_source=muse (as /llms.txt asks), in Chrome on Linux.
    const MUSE = {
      source: 'muse', landing: '/transfers', ts: '2026-09-27T14:00:00.000Z',
      first_source: 'muse', first_landing: '/transfers', first_ts: '2026-09-27T14:00:00.000Z', ua: 'chrome-linux',
    }

    it('store on the booking and change nothing else: hash, row, intent', async () => {
      const a = await once(LAST_ONLY)
      const b = await once(MUSE)
      expect(b.row.cart_hash).toBe(r.hash)
      expect(b.row.attribution).toEqual(MUSE)
      expect(stable(b.row)).toEqual(stable(a.row))
      const metaA = omit(a.pi.metadata, ['booking_id'])
      const metaB = omit(b.pi.metadata, ['booking_id'])
      expect(metaB).toEqual(metaA)
      expect(b.pi.amount).toBe(a.pi.amount)
      expect({ ...b.pi.params, metadata: metaB }).toEqual({ ...a.pi.params, metadata: metaA })
      expect(JSON.stringify(b.pi.params)).not.toContain('muse')
      expect(JSON.stringify(b.pi.params)).not.toContain('chrome-linux')
      expect(omit(b.data, ['bookingId', 'clientSecret', 'requestId'])).toEqual(omit(a.data, ['bookingId', 'clientSecret', 'requestId']))
    })

    it('a second POST that adds only ua reuses the row and the intent', async () => {
      const first = await (await post(r.order(LAST_ONLY))).json()
      const second = await (await post(r.order({ ...LAST_ONLY, ua: 'chrome-linux' }))).json()
      expect(second.bookingId).toBe(first.bookingId)
      expect(second.clientSecret).toBe(first.clientSecret)
      expect(db.tables.bookings).toHaveLength(1)
      expect(db.intents.size).toBe(1)
      expect(db.tables.bookings[0].cart_hash).toBe(r.hash)
      expect(db.tables.bookings[0].attribution).toEqual({ ...LAST_ONLY, ua: 'chrome-linux' })
    })

    it('a full user-agent string never reaches the booking', async () => {
      const { row } = await once({ ...LAST_ONLY, ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' })
      expect(row.cart_hash).toBe(r.hash)
      expect(row.attribution).toEqual(LAST_ONLY)
    })
  })
}
