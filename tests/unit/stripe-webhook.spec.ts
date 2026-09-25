import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import Stripe from 'stripe'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/webhooks/stripe/route'

/**
 * Drives the real Stripe webhook handler with events signed exactly the way
 * Stripe signs them (stripe.webhooks.generateTestHeaderString with a fake
 * secret, verified by the route's own constructEvent), over a STATEFUL fake of
 * PostgREST. Email, calendar, analytics and gift-ledger calls are fakes that
 * record what they were asked to do. The route never calls the Stripe API, so
 * nothing here can reach Stripe, Resend, Google or Meta.
 *
 * What it pins, because each one moves money or tells a guest something:
 *   - the paid flip happens exactly once when Stripe delivers twice at once;
 *   - the GA4 and Meta reporters run side by side, not one after the other;
 *   - a replaced intent's decline or cancellation never touches the booking;
 *   - a second charge on one booking pages ops, and a failed page is harmless;
 *   - a refund on the booking's own intent cancels it, a stale one does not;
 *   - a Dashboard refund whose cancellation emails fail pages ops.
 */

type Row = Record<string, unknown>
type Pred = (r: Row) => boolean
type SentEmail = { to: string | string[]; subject: string; react: { template: string; props: Record<string, unknown> }; tags?: { name: string; value: string }[] }

const SECRET = 'whsec_webhook_spec'

const env = vi.hoisted(() => {
  const keys = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'OPERATIONS_EMAIL', 'RESEND_API_KEY'] as const
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  // Read at module load by the route. A fake key: the handler only verifies
  // signatures, which is local crypto, never an API call.
  process.env.STRIPE_SECRET_KEY = 'sk_test_webhook_spec_not_a_key'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_webhook_spec'
  process.env.OPERATIONS_EMAIL = 'ops@example.com'
  delete process.env.RESEND_API_KEY
  return { keys, saved }
})

const state = vi.hoisted(() => ({
  emails: [] as SentEmail[],
  /** What the fake Resend answers. Tests swap it to fail, throw or hang. */
  sendEmail: (() => Promise.resolve({ ok: true, id: 'em_test' })) as (input: SentEmail) => Promise<{ ok: boolean; id?: string; error?: string }>,
  timeline: [] as string[],
  reporterDelayMs: 15,
  settled: [] as string[],
  released: [] as string[],
  cancellations: [] as { id: string; source?: string }[],
  cancellationResult: { customer: 'sent', ops: 'sent' } as { customer: string; ops: string },
  calendarSynced: [] as string[],
  calendarRemoved: [] as string[],
}))

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** Every update, with the ids it actually matched. */
  writes: [] as { table: string; patch: Record<string, unknown>; matched: string[] }[],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  /** Awaited before an update runs, so a test can line two deliveries up on the same write. */
  beforeUpdate: null as null | ((table: string, patch: Record<string, unknown>) => Promise<void>),
}))

vi.mock('@/lib/ga4-server', () => ({
  reportServerPurchase: async () => {
    state.timeline.push('ga4:start')
    await new Promise((r) => setTimeout(r, state.reporterDelayMs))
    state.timeline.push('ga4:end')
    return 'sent'
  },
}))
vi.mock('@/lib/meta-capi', () => ({
  reportMetaPurchase: async () => {
    state.timeline.push('meta:start')
    await new Promise((r) => setTimeout(r, state.reporterDelayMs))
    state.timeline.push('meta:end')
    return 'sent'
  },
}))
vi.mock('@/lib/google-calendar', () => ({
  syncBookingToCalendar: async (b: { id: string }) => { state.calendarSynced.push(b.id); return { ok: true } },
  removeBookingFromCalendar: async (id: string) => { state.calendarRemoved.push(id); return { ok: true } },
}))
vi.mock('@/lib/gift-activation', () => ({ activateGiftCard: async () => ({ delivered: true }) }))
vi.mock('@/lib/gift-redemption', () => ({
  settleGiftClaim: async (_s: unknown, id: string) => { state.settled.push(id) },
  releaseGiftClaim: async (_s: unknown, id: string) => { state.released.push(id) },
  refundToGiftCard: async () => true,
}))
vi.mock('@/lib/coupon-redemption', () => ({ consumeCoupon: async () => ({ ok: true, overRedeemed: false }) }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (input: SentEmail) => { state.emails.push(input); return state.sendEmail(input) },
  operatorAlertRecipients: (ops: string[]) => ops,
  confirmationBcc: () => [],
}))
vi.mock('@/lib/email/cancellation', () => ({
  sendCancellationEmails: async (id: string, opts: { source?: string } = {}) => {
    state.cancellations.push({ id, source: opts.source })
    return state.cancellationResult
  },
}))
// Templates are replaced by markers so the tests read WHICH email went out
// and with what props; rendering them is covered by their own specs.
vi.mock('@/emails/BookingConfirmed', () => ({ default: (props: Record<string, unknown>) => ({ template: 'BookingConfirmed', props }) }))
vi.mock('@/emails/OperatorBookingAlert', () => ({ default: (props: Record<string, unknown>) => ({ template: 'OperatorBookingAlert', props }) }))
vi.mock('@/emails/TransferConfirmed', () => ({ default: (props: Record<string, unknown>) => ({ template: 'TransferConfirmed', props }) }))
vi.mock('@/emails/TransferOperatorAlert', () => ({ default: (props: Record<string, unknown>) => ({ template: 'TransferOperatorAlert', props }) }))
vi.mock('@/emails/OpsAlert', () => ({ default: (props: Record<string, unknown>) => ({ template: 'OpsAlert', props }) }))

// ── A small stateful PostgREST fake. lib/email/claim.ts runs for real over it,
//    so the per-channel email claims are exercised, not assumed. ──
function atom(expr: string): Pred {
  const [col, op, ...rest] = expr.split('.')
  const raw = rest.join('.')
  const val = raw === 'null' ? null : raw
  if (op === 'eq') return (r) => String(r[col]) === String(val)
  if (op === 'is') return (r) => (r[col] ?? null) === val
  throw new Error(`fake PostgREST: unsupported or() operator ${op}`)
}
function builder(table: string) {
  const rows = (db.tables[table] ??= [])
  const preds: Pred[] = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let patch: Row = {}
  const run = async () => {
    if (op === 'update' && db.beforeUpdate) await db.beforeUpdate(table, patch)
    // Matched at run time, not build time: a concurrent write that landed
    // while this query was queued is visible, exactly as in Postgres.
    const hit = rows.filter((r) => preds.every((p) => p(r)))
    if (op === 'update') {
      hit.forEach((r) => Object.assign(r, patch))
      db.writes.push({ table, patch, matched: hit.map((r) => String(r.id)) })
    }
    if (op === 'delete') hit.forEach((r) => rows.splice(rows.indexOf(r), 1))
    return { data: hit.map((r) => ({ ...r })), error: null }
  }
  const b: Record<string, unknown> = {}
  const ch = (fn: (...a: never[]) => void) => (...a: never[]) => { fn(...a); return b }
  Object.assign(b, {
    select: ch(() => {}),
    update: ch((p: never) => { op = 'update'; patch = { ...(p as Row) } }),
    delete: ch(() => { op = 'delete' }),
    eq: ch((c: never, v: never) => preds.push((r) => String(r[c]) === String(v))),
    neq: ch((c: never, v: never) => preds.push((r) => String(r[c]) !== String(v))),
    in: ch((c: never, v: never) => preds.push((r) => (v as unknown[]).map(String).includes(String(r[c])))),
    is: ch((c: never, v: never) => preds.push((r) => (r[c] ?? null) === v)),
    not: ch((c: never, o: never, v: never) => {
      if (o !== 'in') throw new Error(`fake PostgREST: unsupported not() operator ${o}`)
      const list = String(v).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, ''))
      preds.push((r) => !list.includes(String(r[c])))
    }),
    or: ch((s: never) => {
      const parts = String(s).split(',').map(atom)
      preds.push((r) => parts.some((p) => p(r)))
    }),
    order: ch(() => {}),
    limit: ch(() => {}),
    maybeSingle: async () => { const r = await run(); return { data: r.data[0] ?? null, error: null } },
    single: async () => { const r = await run(); return { data: r.data[0] ?? null, error: r.data[0] ? null : { message: 'no row' } } },
    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => run().then(ok, err),
  })
  return b
}
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => { db.rpcs.push({ fn, args }); return { data: null, error: null } },
  }),
}))

// ── Fixtures ──
const BOOKING_ID = '8c1f2d3e-4a5b-4c6d-8e7f-901234567890'
const REF = 'MAPL-8C1F2D3E'

function seedBooking(over: Row = {}) {
  const booking: Row = {
    id: BOOKING_ID, status: 'pending', booking_type: 'tour',
    driver_name: null, driver_phone: null,
    first_name: 'Test', last_name: 'Guest', email: 'guest@example.com', phone: null, country: null,
    pickup: 'Hotel', dropoff: null, pickup_time: null, special_requests: null,
    total_paid: 255, subtotal: 200, booking_fee: 55, transport_cost: null, reward_discount: null,
    currency: 'usd', stripe_payment_id: 'pi_current',
    gift_card_amount: null, gift_card_id: null, refund_quoted_gift: null,
    confirmation_email_sent_at: null, operator_email_sent_at: null, dispatch: {},
    ...over,
  }
  db.tables.bookings = [booking]
  db.tables.booking_items = [
    booking.booking_type === 'transfer'
      ? {
          booking_id: BOOKING_ID, item_type: 'transfer', experience_id: null, title: 'Airport transfer', destination: 'Negril',
          travelers: 2, passengers: 2, date: '2026-10-08', price_per_person: 199, line_total: 199,
          airport: 'MBJ', hotel: 'Test Hotel, Negril', zone: 'Negril', trip_type: 'round_trip',
          arrival_flight: 'AA1234', arrival_at: '2026-10-08T14:30:00+00:00', departure_flight: 'AA4321', departure_at: '2026-10-15T16:00:00+00:00',
        }
      : {
          booking_id: BOOKING_ID, item_type: 'experience', experience_id: 14, title: 'Cliff Diving & Sunset', destination: 'Negril',
          travelers: 1, passengers: null, date: '2026-10-08', price_per_person: 200, line_total: 200,
          airport: null, hotel: null, zone: null, trip_type: null,
          arrival_flight: null, arrival_at: null, departure_flight: null, departure_at: null,
        },
  ]
  return booking
}
const booking = () => db.tables.bookings[0]

function intent(id: string, over: Row = {}): Row {
  return {
    id, object: 'payment_intent', amount: 25500, amount_received: 25500, currency: 'usd', status: 'succeeded',
    metadata: { booking_id: BOOKING_ID, booking_type: 'tour' }, last_payment_error: null, cancellation_reason: null,
    ...over,
  }
}

const signer = new Stripe('sk_test_webhook_spec_not_a_key')
type HeaderOpts = Parameters<typeof signer.webhooks.generateTestHeaderString>[0]
/** Stripe's own signing. Its typings list every option as required; the runtime defaults all but these two. */
const sign = (payload: string, secret: string) => signer.webhooks.generateTestHeaderString({ payload, secret } as HeaderOpts)

let evtSeq = 0
const eventPayload = (type: string, object: Row) =>
  JSON.stringify({ id: `evt_spec_${++evtSeq}`, object: 'event', api_version: '2024-06-20', created: Math.floor(Date.now() / 1000), type, data: { object } })
const request = (payload: string, secret: string) =>
  new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload, secret) }, body: payload,
  })
function delivery(type: string, object: Row, secret = SECRET) {
  return request(eventPayload(type, object), secret)
}
/** The same event, delivered as many times as asked (Stripe is at-least-once). */
function deliveries(n: number, type: string, object: Row) {
  const payload = eventPayload(type, object)
  return Array.from({ length: n }, () => request(payload, SECRET))
}

/** Resolves every caller once `n` of them have arrived. */
function barrier(n: number) {
  let arrived = 0
  let open!: () => void
  const all = new Promise<void>((r) => { open = r })
  return async () => { if (++arrived >= n) open(); await all }
}

const paidFlips = () => db.writes.filter((w) => w.table === 'bookings' && w.patch.status === 'paid' && w.matched.length > 0)
const sentWith = (template: string) => state.emails.filter((e) => e.react?.template === template)
const opsAlerts = () => sentWith('OpsAlert')
const guestConfirmations = () => [...sentWith('BookingConfirmed'), ...sentWith('TransferConfirmed')]
const operatorAlerts = () => [...sentWith('OperatorBookingAlert'), ...sentWith('TransferOperatorAlert')]

beforeEach(() => {
  db.tables = {}
  db.writes.length = 0
  db.rpcs.length = 0
  db.beforeUpdate = null
  state.emails.length = 0
  state.sendEmail = () => Promise.resolve({ ok: true, id: 'em_test' })
  state.timeline.length = 0
  state.settled.length = 0
  state.released.length = 0
  state.cancellations.length = 0
  state.cancellationResult = { customer: 'sent', ops: 'sent' }
  state.calendarSynced.length = 0
  state.calendarRemoved.length = 0
})
afterEach(() => { vi.useRealTimers() })
afterAll(() => {
  for (const k of env.keys) {
    if (env.saved[k] === undefined) delete process.env[k]
    else process.env[k] = env.saved[k] as string
  }
})

describe('stripe webhook: signature', () => {
  it('refuses an event signed with another secret and touches nothing', async () => {
    seedBooking()
    const res = await POST(delivery('payment_intent.succeeded', intent('pi_current'), 'whsec_someone_else'))
    expect(res.status).toBe(400)
    expect(booking().status).toBe('pending')
    expect(db.writes).toHaveLength(0)
    expect(state.emails).toHaveLength(0)
  })
})

describe('stripe webhook: payment_intent.succeeded', () => {
  it('flips a booking to paid exactly once when Stripe delivers the same event twice at the same moment', async () => {
    seedBooking({ booking_type: 'transfer', total_paid: 199, subtotal: 162, booking_fee: 37 })
    // Hold every paid-flip until BOTH deliveries have read the row as pending,
    // the exact interleaving the conditional update exists for.
    const bothRead = barrier(2)
    db.beforeUpdate = async (table, patch) => { if (table === 'bookings' && patch.status === 'paid') await bothRead() }

    const [a, b] = deliveries(2, 'payment_intent.succeeded', intent('pi_current', { amount: 19900, amount_received: 19900 }))
    const [ra, rb] = await Promise.all([POST(a), POST(b)])

    expect(ra.status).toBe(200)
    expect(rb.status).toBe(200)
    expect(booking()).toMatchObject({ status: 'paid', stripe_payment_id: 'pi_current' })
    // Two writes attempted, one matched: the loser's neq('status','paid') saw the winner's commit.
    expect(db.writes.filter((w) => w.table === 'bookings' && w.patch.status === 'paid')).toHaveLength(2)
    expect(paidFlips()).toHaveLength(1)
    // Everything that must happen once, happened once.
    expect(state.timeline.filter((t) => t.endsWith(':start'))).toEqual(expect.arrayContaining(['ga4:start', 'meta:start']))
    expect(state.timeline.filter((t) => t.endsWith(':start'))).toHaveLength(2)
    expect(db.writes.filter((w) => w.table === 'bookings' && 'driver_name' in w.patch && w.matched.length > 0)).toHaveLength(1)
    expect(booking().driver_name).toBeTruthy()
    expect(guestConfirmations()).toHaveLength(1)
    expect(operatorAlerts()).toHaveLength(1)
    expect(opsAlerts()).toHaveLength(0)
  })

  it('runs the GA4 and Meta purchase reporters side by side, not one after the other', async () => {
    seedBooking()
    const res = await POST(delivery('payment_intent.succeeded', intent('pi_current')))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('paid')
    const t = state.timeline
    expect(t).toHaveLength(4)
    // Both started before either finished. Awaited in sequence, Meta would
    // not start until GA4 ended, putting up to 8 s of analytics in front of
    // the driver assignment and the emails.
    expect(t.indexOf('meta:start')).toBeLessThan(t.indexOf('ga4:end'))
    expect(t.indexOf('ga4:start')).toBeLessThan(t.indexOf('meta:end'))
    expect(guestConfirmations()).toHaveLength(1)
  })

  it('when two different intents on one booking both succeed at once, one wins and ops is paged about the other', async () => {
    // The row carries the later mint; the earlier intent was still payable in another tab.
    seedBooking({ stripe_payment_id: 'pi_second' })
    const bothRead = barrier(2)
    db.beforeUpdate = async (table, patch) => { if (table === 'bookings' && patch.status === 'paid') await bothRead() }

    const [ra, rb] = await Promise.all([
      POST(delivery('payment_intent.succeeded', intent('pi_first'))),
      POST(delivery('payment_intent.succeeded', intent('pi_second'))),
    ])

    expect(ra.status).toBe(200)
    expect(rb.status).toBe(200)
    expect(paidFlips()).toHaveLength(1)
    const kept = String(booking().stripe_payment_id)
    const duplicate = kept === 'pi_first' ? 'pi_second' : 'pi_first'
    expect(booking().status).toBe('paid')
    // The winner fulfils; the loser settles nothing and sends the guest nothing.
    expect(state.settled).toEqual([BOOKING_ID])
    expect(guestConfirmations()).toHaveLength(1)
    const alerts = opsAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].to).toEqual(['ops@example.com'])
    expect(alerts[0].subject).toContain(REF)
    const lines = (alerts[0].react.props.lines as string[]).join('\n')
    expect(lines).toContain(`Kept payment: ${kept}`)
    expect(lines).toContain(`Duplicate payment: ${duplicate}, 255.00 USD`)
    expect(alerts[0].tags).toEqual(expect.arrayContaining([{ name: 'booking_id', value: BOOKING_ID }]))
  })

  it('pages ops when a second intent succeeds on a booking that is already paid, and changes nothing else', async () => {
    const stamped = '2026-09-20T12:00:00.000Z'
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_first', confirmation_email_sent_at: stamped, operator_email_sent_at: stamped })
    const res = await POST(delivery('payment_intent.succeeded', intent('pi_second', { amount: 12000, amount_received: 12000 })))

    expect(res.status).toBe(200)
    expect(booking()).toMatchObject({ status: 'paid', stripe_payment_id: 'pi_first' })
    expect(db.writes).toHaveLength(0)
    expect(state.timeline).toHaveLength(0)
    expect(state.settled).toHaveLength(0)
    expect(guestConfirmations()).toHaveLength(0)
    const alerts = opsAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].subject).toBe(`ACTION NEEDED: ${REF} was paid twice, refund the duplicate charge`)
    const lines = (alerts[0].react.props.lines as string[]).join('\n')
    expect(lines).toContain('Kept payment: pi_first')
    expect(lines).toContain('Duplicate payment: pi_second, 120.00 USD')
    // Ops-facing copy follows the same no-em-dash rule as guest copy.
    expect(JSON.stringify(alerts[0].react.props)).not.toContain('—')
  })

  it.each([
    ['answers ok:false', () => Promise.resolve({ ok: false, error: 'resend down' })],
    ['throws', () => Promise.reject(new Error('resend exploded'))],
  ])('still answers Stripe 200 when the double-charge alert send %s', async (_label, failure) => {
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_first' })
    state.sendEmail = failure as typeof state.sendEmail
    const res = await POST(delivery('payment_intent.succeeded', intent('pi_second')))
    expect(res.status).toBe(200)
    expect(opsAlerts()).toHaveLength(1)
    expect(booking().status).toBe('paid')
  })

  it('does not let a hung alert send hold the webhook past its time box', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_first' })
    state.sendEmail = () => new Promise(() => {}) // Resend never answers
    let settled = false
    const pending = POST(delivery('payment_intent.succeeded', intent('pi_second'))).then((r) => { settled = true; return r })
    await vi.advanceTimersByTimeAsync(3_900)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    const res = await pending
    expect(res.status).toBe(200)
  })
})

describe('stripe webhook: a replaced intent never speaks for the booking', () => {
  it('ignores payment_failed on an intent the booking no longer holds', async () => {
    seedBooking({ stripe_payment_id: 'pi_new' })
    const res = await POST(delivery('payment_intent.payment_failed', intent('pi_old', { status: 'requires_payment_method', last_payment_error: { message: 'Your card was declined.' } })))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('pending')
    expect(booking().failed_at).toBeUndefined()
    expect(db.writes).toHaveLength(0)
  })

  it('marks the booking failed when its CURRENT intent is declined', async () => {
    seedBooking({ stripe_payment_id: 'pi_new' })
    const res = await POST(delivery('payment_intent.payment_failed', intent('pi_new', { status: 'requires_payment_method' })))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('failed')
    // A decline is not terminal: the gift value stays with the still-payable intent.
    expect(state.released).toHaveLength(0)
  })

  // Found by the live drill: checkout supersedes a row by canceling its
  // intent first and only then flipping it 'canceled', so the dead row still
  // names that intent and the superseded-intent guard cannot catch a late
  // decline for it. Reviving it to 'failed' showed a superseded checkout as a
  // declined one and put it back in reach of the supersede and twin sweeps.
  it('leaves a canceled booking canceled when a late decline for its own dead intent arrives', async () => {
    seedBooking({ status: 'canceled', stripe_payment_id: 'pi_superseded' })
    const res = await POST(delivery('payment_intent.payment_failed', intent('pi_superseded', { status: 'canceled', cancellation_reason: 'duplicate', last_payment_error: { message: 'Your card was declined.' } })))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('canceled')
    expect(booking().failed_at).toBeUndefined()
    expect(db.writes).toHaveLength(0)
    expect(state.released).toHaveLength(0)
  })

  it('does not revive a row that checkout cancels between the decline read and its write', async () => {
    seedBooking({ stripe_payment_id: 'pi_current' })
    // The supersede's checked flip lands after the handler read 'pending'.
    db.beforeUpdate = async (table, patch) => {
      if (table === 'bookings' && patch.status === 'failed') booking().status = 'canceled'
    }
    const res = await POST(delivery('payment_intent.payment_failed', intent('pi_current', { status: 'requires_payment_method' })))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('canceled')
    expect(booking().failed_at).toBeUndefined()
    const failedWrite = db.writes.find((w) => w.patch.status === 'failed')
    expect(failedWrite?.matched).toEqual([])
  })

  it('ignores payment_intent.canceled on an intent the booking no longer holds', async () => {
    seedBooking({ stripe_payment_id: 'pi_new', gift_card_id: 'g1', gift_card_amount: 50 })
    db.tables.user_rewards = [{ id: 'r1', status: 'reserved', used_on_booking_id: BOOKING_ID }]
    const res = await POST(delivery('payment_intent.canceled', intent('pi_old', { status: 'canceled', cancellation_reason: 'duplicate' })))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('pending')
    expect(state.released).toHaveLength(0)
    expect(db.tables.user_rewards[0]).toMatchObject({ status: 'reserved', used_on_booking_id: BOOKING_ID })
    expect(db.writes).toHaveLength(0)
  })

  // 'duplicate' is included on purpose. The checkout also cancels the
  // booking's CURRENT intent with that reason (a failed resize, a supersede)
  // before a replacement is attached, and it does not always attach one: a
  // mint or attach failure leaves the row pending on the dead intent. This
  // event is then the only thing that frees the reward, because the reward
  // takeover cannot prove an already-canceled holder intent dead (its cancel
  // throws). So the webhook must act on it; see the notes on finding 6.
  it.each(['abandoned', 'duplicate'])(
    'cancels the booking and hands back its gift value and reward when its CURRENT intent is canceled (%s)',
    async (reason) => {
      seedBooking({ stripe_payment_id: 'pi_current', gift_card_id: 'g1', gift_card_amount: 50 })
      db.tables.user_rewards = [{ id: 'r1', status: 'reserved', used_on_booking_id: BOOKING_ID }]
      const res = await POST(delivery('payment_intent.canceled', intent('pi_current', { status: 'canceled', cancellation_reason: reason })))
      expect(res.status).toBe(200)
      expect(booking().status).toBe('canceled')
      expect(state.released).toEqual([BOOKING_ID])
      expect(db.tables.user_rewards[0]).toMatchObject({ status: 'available', used_on_booking_id: null })
    },
  )
})

describe('stripe webhook: charge.refunded', () => {
  const charge = (pi: string, over: Row = {}): Row => ({
    id: `ch_${pi}`, object: 'charge', refunded: true, amount: 25500, amount_refunded: 25500,
    payment_intent: pi, metadata: { booking_id: BOOKING_ID }, ...over,
  })

  it('a full refund on the booking\'s own intent cancels it, tells the guest, stands ops down and clears the calendar', async () => {
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_current' })
    const res = await POST(delivery('charge.refunded', charge('pi_current')))
    expect(res.status).toBe(200)
    expect(booking()).toMatchObject({ status: 'refunded', refund_amount: 255, admin_charge: 0 })
    expect(db.rpcs).toEqual([{ fn: 'merge_dispatch', args: { p_booking_id: BOOKING_ID, p_patch: { refunded_at: expect.any(String) } } }])
    expect(state.cancellations).toEqual([{ id: BOOKING_ID, source: 'dashboard' }])
    expect(state.calendarRemoved).toEqual([BOOKING_ID])
    expect(opsAlerts()).toHaveLength(0)
  })

  it('a refund of a stale intent leaves the paid booking alone', async () => {
    // The duplicate-charge cleanup the ops alert asks for: refund the OTHER intent.
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_current' })
    const res = await POST(delivery('charge.refunded', charge('pi_stale')))
    expect(res.status).toBe(200)
    expect(booking()).toMatchObject({ status: 'paid', stripe_payment_id: 'pi_current' })
    expect(booking().refund_amount).toBeUndefined()
    expect(db.rpcs).toHaveLength(0)
    expect(state.cancellations).toHaveLength(0)
    expect(state.calendarRemoved).toHaveLength(0)
  })

  it.each([
    [{ customer: 'failed', ops: 'sent' }, 'guest email failed, ops stand-down email sent'],
    [{ customer: 'sent', ops: 'failed' }, 'guest email sent, ops stand-down email failed'],
  ])('pages ops when a Dashboard refund\'s cancellation emails fail (%o)', async (result, expected) => {
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_current' })
    state.cancellationResult = result
    const res = await POST(delivery('charge.refunded', charge('pi_current')))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('refunded')
    const alerts = opsAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].subject).toBe(`ACTION NEEDED: refund emails undelivered for ${REF}`)
    expect(alerts[0].react.props.lines).toEqual([`${REF} (${BOOKING_ID}): ${expected}`])
    expect(JSON.stringify(alerts[0].react.props)).not.toContain('—')
    // The calendar still clears after the alert.
    expect(state.calendarRemoved).toEqual([BOOKING_ID])
  })

  it('still clears the calendar and answers 200 when that ops alert cannot be sent either', async () => {
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_current' })
    state.cancellationResult = { customer: 'failed', ops: 'failed' }
    state.sendEmail = () => Promise.reject(new Error('resend exploded'))
    const res = await POST(delivery('charge.refunded', charge('pi_current')))
    expect(res.status).toBe(200)
    expect(booking().status).toBe('refunded')
    expect(opsAlerts()).toHaveLength(1)
    expect(state.calendarRemoved).toEqual([BOOKING_ID])
  })

  it('a redelivered refund does nothing twice', async () => {
    seedBooking({ status: 'paid', stripe_payment_id: 'pi_current' })
    state.cancellationResult = { customer: 'failed', ops: 'sent' }
    const evt = deliveries(2, 'charge.refunded', charge('pi_current'))
    expect((await POST(evt[0])).status).toBe(200)
    expect((await POST(evt[1])).status).toBe(200)
    expect(state.cancellations).toHaveLength(1)
    expect(opsAlerts()).toHaveLength(1)
    expect(state.calendarRemoved).toEqual([BOOKING_ID])
  })
})
