import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render } from '@react-email/render'

/**
 * The abandoned-cart sweep's Stripe verification gate (audit 2026-08-22).
 *
 * The gate's promise is "never nudge someone who actually completed payment".
 * Deferred settlement methods (ACH debit, Cash App Pay) make that harder than
 * succeeded-or-not: the guest has paid, the intent sits in 'processing' for
 * hours-to-days, and the booking row stays 'pending' until the webhook lands.
 * A nudge in that window tells a paying guest their trip was never booked and
 * invites a second booking — two charges for one trip, on two different rows,
 * where the per-booking double-charge alarm never fires.
 *
 * So the sweep must treat 'processing' and 'requires_capture' as in-flight:
 * skip the row, and — because the money is not provably captured either —
 * leave recovery_email_sent_at NULL so a later sweep re-evaluates once Stripe
 * resolves the intent. These tests drive the real route handler over
 * synthetic rows, with Stripe scripted per intent and every bookings UPDATE
 * recorded, so both halves (no email, no claim) are asserted.
 */

const state = vi.hoisted(() => ({
  /** Rows the candidate query returns. */
  rows: [] as Record<string, unknown>[],
  /** Scripted Stripe: intent id → status. Missing id = retrieve throws. */
  piStatuses: {} as Record<string, string>,
  /** Every bookings UPDATE the route issued, with its filters. */
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, string, unknown]> }>,
  /** Every email handed to sendEmail. */
  emails: [] as Array<{ to: string; subject: string }>,
  /** The rendered template of every email, in the same order. */
  reacts: [] as unknown[],
  /** Rows carrying the paid-but-pending flag, for the flagged query. */
  flagged: [] as Record<string, unknown>[],
  /** Every RPC the route issued. */
  rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}))

vi.mock('stripe', () => ({
  default: class StripeStub {
    paymentIntents = {
      retrieve: async (id: string) => {
        const status = state.piStatuses[id]
        if (!status) throw new Error(`no such intent: ${id}`)
        return { id, status }
      },
    }
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcs.push({ fn, args })
      return { data: [{ id: args.p_booking_id }], error: null }
    },
    from: (table: string) => {
      if (table !== 'bookings') throw new Error(`unexpected table ${table}`)
      let record: { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> } | null = null
      // A read's filters, applied to the synthetic rows like PostgREST would.
      const where: Array<[string, string, unknown]> = []
      let flaggedQuery = false
      const chain: Record<string, unknown> = {}
      const self = () => chain
      const filter = (op: string) => (col: string, val: unknown) => {
        ;(record ? record.filters : where).push([op, col, val])
        return chain
      }
      Object.assign(chain, {
        select: self,
        order: self,
        limit: self,
        eq: filter('eq'),
        is: filter('is'),
        gte: filter('gte'),
        not: (col: string, op: string, val: unknown) => {
          if (col.startsWith('dispatch->') && op === 'is' && val === null) flaggedQuery = true
          return chain
        },
        update: (patch: Record<string, unknown>) => {
          record = { patch, filters: [] }
          state.updates.push(record)
          return chain
        },
        // The claim's NULL → now() transition always "wins" in this synthetic
        // store; the tests assert whether a claim was ATTEMPTED at all.
        maybeSingle: () => {
          const id = record?.filters.find(([, col]) => col === 'id')?.[2]
          return Promise.resolve({ data: id ? { id } : null, error: null })
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (record) return Promise.resolve({ data: null, error: null }).then(resolve)
          const source = flaggedQuery ? state.flagged : state.rows
          const hits = source.filter((r) =>
            where.every(([op, col, val]) =>
              op === 'is' ? r[col] == null
                : op === 'gte' ? r[col] != null && String(r[col]) >= String(val)
                  : r[col] === val))
          return Promise.resolve({ data: hits, error: null }).then(resolve)
        },
      })
      return chain
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: { to: string; subject: string; react?: unknown }) => {
    state.emails.push({ to: args.to, subject: args.subject })
    state.reacts.push(args.react)
    return { ok: true }
  },
  // Pass-through: the route feeds it resolveOpsRecipients(), and the spec
  // only cares that a non-empty list reaches sendEmail.
  operatorAlertRecipients: (ops: string[]) => ops,
}))

const SECRET = 'test-cron-secret'
const HOUR = 60 * 60 * 1000

// The route types its param as NextRequest; the spec builds plain Requests,
// so hold the handler loosely and cast once at the import boundary.
let GET: (req: unknown) => Promise<Response>

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET
  const route = await import('../../app/api/abandoned-cart/route')
  GET = route.GET as unknown as (req: unknown) => Promise<Response>
})

beforeEach(() => {
  state.rows = []
  state.piStatuses = {}
  state.updates = []
  state.emails = []
  state.flagged = []
  state.rpcs = []
  state.reacts = []
})

const request = () =>
  ({ url: `http://test.local/api/abandoned-cart?secret=${SECRET}`, headers: new Headers() })

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    status: 'pending',
    email: 'guest@example.com',
    first_name: 'Ann',
    booking_type: 'tour',
    currency: 'usd',
    total_paid: 170,
    stripe_payment_id: 'pi_1',
    // 1 hour old: past the 30-minute grace, well inside the 7-day max age.
    created_at: new Date(Date.now() - HOUR).toISOString(),
    recovery_email_sent_at: null,
    recovery_email_count: 0,
    booking_items: [
      {
        item_type: 'experience',
        title: "Rick's Cafe Cliff Diving & Sunset",
        destination: 'Negril',
        date: '2026-09-10',
        travelers: 2,
        price_per_person: 85,
      },
    ],
    ...over,
  }
}

async function sweep(): Promise<{ ok: boolean; emailed: number; skipped: string[]; paidButPending: string[] }> {
  const res = await GET(request())
  return res.json()
}

/** Did any bookings UPDATE target this row id? */
const touched = (id: unknown) =>
  state.updates.filter((u) => u.filters.some(([op, col, val]) => op === 'eq' && col === 'id' && val === id))

describe('a payment in flight is neither abandoned nor paid', () => {
  test("'processing' (Cash App Pay / ACH settling) is skipped without email or claim", async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'processing' }

    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:payment_in_flight')
    expect(state.emails).toHaveLength(0)
    // The half that matters as much as the missing email: recovery_email_sent_at
    // was never stamped, so the next sweep re-evaluates this row.
    expect(state.updates).toHaveLength(0)
  })

  test("'requires_capture' (authorized, awaiting capture) is treated the same", async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'requires_capture' }

    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:payment_in_flight')
    expect(state.emails).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  test('once Stripe resolves the intent as failed, the same row IS nudged', async () => {
    state.rows = [row()]

    // First sweep: mid-flight, untouched.
    state.piStatuses = { pi_1: 'processing' }
    await sweep()
    expect(state.updates).toHaveLength(0)

    // The payment fails; Stripe hands the intent back for a new method.
    // Because the earlier skip left the claim column NULL, this run may act.
    state.piStatuses = { pi_1: 'requires_payment_method' }
    const body = await sweep()
    expect(body.emailed).toBe(1)
    expect(state.emails).toHaveLength(1)
  })
})

describe('the existing gates still hold', () => {
  test('a genuinely abandoned intent is claimed atomically and emailed', async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'requires_payment_method' }

    const body = await sweep()
    expect(body.emailed).toBe(1)
    expect(state.emails).toEqual([
      { to: 'guest@example.com', subject: 'Your Jamaica trip is still saved (MAPL-AAAAAAAA)' },
    ])

    // The claim is the NULL → now() transition, filtered on both id and the
    // still-unclaimed column, exactly as before the audit fix.
    const claims = touched(state.rows[0].id)
    expect(claims).toHaveLength(1)
    expect(claims[0].patch.recovery_email_sent_at).toBeTruthy()
    expect(claims[0].filters).toContainEqual(['is', 'recovery_email_sent_at', null])
  })

  test("'succeeded' is still skipped as already paid", async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'succeeded' }

    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:already_paid')
    expect(state.updates).toHaveLength(0)
    // Paid-but-pending is a missed webhook: the sweep must page ops (one
    // digest, not a recovery email) and report the ref in its summary.
    expect(body.paidButPending).toContain('MAPL-AAAAAAAA')
    expect(state.emails.some((e) => e.subject.includes('stuck in pending'))).toBe(true)
  })

  test("'canceled' is still skipped", async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'canceled' }

    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:canceled')
    expect(state.updates).toHaveLength(0)
  })

  test('an in-flight row does not shield the abandoned row beside it', async () => {
    const inFlight = row({ id: 'bbbbbbbb-1111-2222-3333-444444444444', stripe_payment_id: 'pi_flight' })
    const abandoned = row({ id: 'cccccccc-1111-2222-3333-444444444444', stripe_payment_id: 'pi_dead' })
    state.rows = [inFlight, abandoned]
    state.piStatuses = { pi_flight: 'processing', pi_dead: 'requires_payment_method' }

    const body = await sweep()
    expect(body.emailed).toBe(1)
    expect(body.skipped).toContain('MAPL-BBBBBBBB:payment_in_flight')
    expect(touched(inFlight.id)).toHaveLength(0)
    expect(touched(abandoned.id)).toHaveLength(1)
  })
})

/**
 * The paid-but-pending digest says it "repeats hourly until the rows are
 * healed" (batch review, Sept 2026). It used to stop after 7 days (the age
 * skip ran before the Stripe check) or as soon as 12 newer pending rows
 * pushed the row out of the candidate window. A caught row is now flagged,
 * and flagged rows are re-read by their own query, with no age limit, every
 * run until their status leaves pending.
 */
describe('a paid-but-pending row keeps alerting until it is healed', () => {
  const DAY = 24 * HOUR
  const STUCK_ID = 'eeeeeeee-1111-2222-3333-444444444444'

  const digestIndex = () => state.emails.findIndex((e) => e.subject.includes('stuck in pending'))
  const digestText = async () => {
    const i = digestIndex()
    if (i < 0) return ''
    return (await render(state.reacts[i] as ReactElement)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  }

  test('the sweep that catches it flags the row, atomically and only once', async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'succeeded' }
    await sweep()

    expect(state.rpcs).toEqual([{
      fn: 'merge_dispatch',
      args: {
        p_booking_id: state.rows[0].id,
        p_patch: { paid_but_pending_at: expect.any(String) },
        p_only_if_absent: 'paid_but_pending_at',
      },
    }])
  })

  test('a flagged row long out of the candidate window still pages ops, run after run', async () => {
    // A month old, and not among the candidates at all.
    state.flagged = [row({
      id: STUCK_ID, stripe_payment_id: 'pi_stuck',
      created_at: new Date(Date.now() - 30 * DAY).toISOString(),
      dispatch: { paid_but_pending_at: new Date(Date.now() - 29 * DAY).toISOString() },
    })]

    for (let run = 0; run < 2; run++) {
      state.emails = []
      state.reacts = []
      const body = await sweep()
      expect(body.paidButPending).toEqual(['MAPL-EEEEEEEE'])
      expect(digestIndex()).toBeGreaterThanOrEqual(0)
      const t = await digestText()
      expect(t).toContain(STUCK_ID)
      expect(t).toContain('pi_stuck')
    }
  })

  test('once the row is healed it drops out of the digest', async () => {
    const stuck = row({ id: STUCK_ID, stripe_payment_id: 'pi_stuck', dispatch: { paid_but_pending_at: 'x' } })
    state.flagged = [stuck]
    await sweep()
    expect(digestIndex()).toBeGreaterThanOrEqual(0)

    // The webhook event is re-sent from Stripe and flips the row.
    stuck.status = 'paid'
    state.emails = []
    const body = await sweep()
    expect(body.paidButPending).toEqual([])
    expect(digestIndex()).toBe(-1)
  })

  test('a row older than 7 days in the window is still checked with Stripe, and caught', async () => {
    state.rows = [row({ created_at: new Date(Date.now() - 10 * DAY).toISOString() })]
    state.piStatuses = { pi_1: 'succeeded' }

    const body = await sweep()
    expect(body.paidButPending).toEqual(['MAPL-AAAAAAAA'])
    expect(body.skipped).not.toContain('MAPL-AAAAAAAA:too_old')
  })

  test('an old abandoned cart is still never nudged', async () => {
    state.rows = [row({ created_at: new Date(Date.now() - 10 * DAY).toISOString() })]
    state.piStatuses = { pi_1: 'requires_payment_method' }

    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:too_old')
    expect(state.updates).toHaveLength(0)
    expect(state.emails).toHaveLength(0)
  })

  test('a row caught in the window AND already flagged is listed once', async () => {
    const r = row({ dispatch: { paid_but_pending_at: 'x' } })
    state.rows = [r]
    state.flagged = [r]
    state.piStatuses = { pi_1: 'succeeded' }

    const body = await sweep()
    expect(body.paidButPending).toEqual(['MAPL-AAAAAAAA'])
    expect(state.emails.filter((e) => e.subject.includes('stuck in pending'))).toHaveLength(1)
    expect(state.emails[digestIndex()].subject).toContain('1 paid booking stuck')
  })
})

// Anyone can start a checkout with any address and any first name, so the
// nudge was aimed by whoever typed them: every cart a new email, greeting and all.
describe('the nudge cannot be aimed at a stranger', () => {
  const id = (n: number) => `${String(n).repeat(8)}-1111-2222-3333-444444444444`

  test('one inbox gets one nudge a week, counting Gmail dot and +tag variants as one', async () => {
    state.rows = [
      row({ id: id(1), email: 'jane.doe@gmail.com', stripe_payment_id: 'pi_a' }),
      row({ id: id(2), email: 'janedoe+x@gmail.com', stripe_payment_id: 'pi_b' }),
      row({ id: id(3), email: 'j.a.n.e.doe@googlemail.com', stripe_payment_id: 'pi_c' }),
      row({ id: id(4), email: 'other@example.com', stripe_payment_id: 'pi_d' }),
    ]
    state.piStatuses = { pi_a: 'requires_payment_method', pi_b: 'requires_payment_method', pi_c: 'requires_payment_method', pi_d: 'requires_payment_method' }
    const body = await sweep()
    expect(state.emails.map((e) => e.to)).toEqual(['jane.doe@gmail.com', 'other@example.com'])
    expect(body.skipped).toEqual(['MAPL-22222222:inbox_nudged_this_week', 'MAPL-33333333:inbox_nudged_this_week'])
    // Skipped rows are not claimed, so they are not counted as recovered.
    expect(touched(id(2))).toHaveLength(0)
    expect(touched(id(3))).toHaveLength(0)
  })

  test('an inbox nudged earlier this week is not nudged again; one nudged eight days ago is', async () => {
    const DAY = 24 * HOUR
    state.rows = [
      row({ id: id(5), email: 'ann@example.com', recovery_email_sent_at: new Date(Date.now() - 2 * DAY).toISOString() }),
      row({ id: id(6), email: 'bob@example.com', recovery_email_sent_at: new Date(Date.now() - 8 * DAY).toISOString() }),
      row({ id: id(1), email: 'Ann@Example.com', stripe_payment_id: 'pi_a' }),
      row({ id: id(2), email: 'bob@example.com', stripe_payment_id: 'pi_b' }),
    ]
    state.piStatuses = { pi_a: 'requires_payment_method', pi_b: 'requires_payment_method' }
    const body = await sweep()
    expect(state.emails.map((e) => e.to)).toEqual(['bob@example.com'])
    expect(body.skipped).toContain('MAPL-11111111:inbox_nudged_this_week')
  })

  test('a paid row from a nudged inbox is still caught as paid-but-pending', async () => {
    state.rows = [
      row({ id: id(5), email: 'ann@example.com', recovery_email_sent_at: new Date(Date.now() - HOUR).toISOString() }),
      row({ id: id(1), email: 'ann@example.com', stripe_payment_id: 'pi_a' }),
    ]
    state.piStatuses = { pi_a: 'succeeded' }
    const body = await sweep()
    expect(body.paidButPending).toEqual(['MAPL-11111111'])
  })

  test('the greeting uses the first name only when it is a name', async () => {
    const greeting = async (first_name: unknown) => {
      state.emails = []
      state.reacts = []
      state.updates = []
      state.rows = [row({ first_name })]
      state.piStatuses = { pi_1: 'requires_payment_method' }
      await sweep()
      return render(state.reacts[0] as ReactElement, { plainText: true })
    }
    expect(await greeting('Zoë')).toMatch(/Still thinking it over, Zoë\?/i)
    for (const bad of ['bit.ly/win', '8765550100', 'help@example.com', 'www.example.org', 'Win! Visit example.org']) {
      const text = await greeting(bad)
      expect(text).not.toMatch(/bit\.ly|8765550100|help@example|example\.org/)
      expect(text).toMatch(/Still thinking it over, there\?/i)
    }
    // Only the first word is ever used, and only when it is a name.
    expect(await greeting('Call 8765550100')).not.toMatch(/8765550100/)
  })
})

/**
 * Nov 13 2026. A guest who reloads checkout and changes the order gets a NEW
 * booking row; nothing supersedes the first (the page that knew it is gone),
 * so it stays pending with a live intent of its own. The sweep only ever
 * asked Stripe about that intent, and wrote "Still thinking it over?" to a
 * guest who had paid an hour earlier under the second row.
 */
describe('a guest who has since paid is not nudged', () => {
  const PAID = 'cccccccc-1111-2222-3333-444444444444'
  const paid = (over: Record<string, unknown> = {}) =>
    row({ id: PAID, status: 'paid', stripe_payment_id: 'pi_paid', paid_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), ...over })

  test('paid for a tour after this tour cart was started: no email, and no claim', async () => {
    state.rows = [row(), paid()]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    const body = await sweep()
    expect(body.emailed).toBe(0)
    expect(body.skipped).toContain('MAPL-AAAAAAAA:booked_since')
    expect(state.emails).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
  })

  test('the same inbox written differently still counts', async () => {
    state.rows = [row({ email: 'Guest@Example.com ' }), paid({ email: 'guest@example.com' })]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    expect((await sweep()).skipped).toContain('MAPL-AAAAAAAA:booked_since')
  })

  test('paid BEFORE the cart was started (an earlier trip): the cart is still theirs to finish', async () => {
    state.rows = [row(), paid({ paid_at: new Date(Date.now() - 5 * HOUR).toISOString() })]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    const body = await sweep()
    expect(body.emailed).toBe(1)
  })

  test('paid for a RIDE since, and the cart is a tour: still nudged about the tour', async () => {
    state.rows = [row(), paid({ booking_type: 'transfer' })]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    expect((await sweep()).emailed).toBe(1)
  })

  test('somebody else paying changes nothing', async () => {
    state.rows = [row(), paid({ email: 'other@example.com' })]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    expect((await sweep()).emailed).toBe(1)
  })

  test('the claim only wins on a row that is still pending', async () => {
    state.rows = [row()]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    await sweep()
    const claim = touched('aaaaaaaa-1111-2222-3333-444444444444')[0]
    expect(claim.filters).toContainEqual(['eq', 'status', 'pending'])
    expect(claim.filters).toContainEqual(['is', 'recovery_email_sent_at', null])
  })
})

describe('what the recovery email says', () => {
  const send = async (over: Record<string, unknown>) => {
    state.rows = [row(over)]
    state.piStatuses = { pi_1: 'requires_payment_method' }
    await sweep()
    return {
      text: (await render(state.reacts[0] as ReactElement, { plainText: true })).replace(/\s+/g, ' '),
      html: await render(state.reacts[0] as ReactElement),
    }
  }

  test('a tour line is the amount checkout recorded, not a rounded per-head price multiplied back', async () => {
    const { text } = await send({ total_paid: 382, booking_items: [{ item_type: 'experience', title: "Dunn's River Falls Climb", destination: 'Ocho Rios', date: '2026-12-05', travelers: 3, price_per_person: 127.33, line_total: 382 }] })
    expect(text).toContain('$382.00')
    expect(text).not.toContain('$381.99')
  })

  test('a ride home says which way it goes, and the reasons are about a ride', async () => {
    const { text } = await send({ booking_type: 'transfer', total_paid: 111, booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', zone: 'D', trip_type: 'one_way', passengers: 2, price_per_person: 111, line_total: 111, arrival_at: null, departure_at: '2026-12-10T09:00:00+00:00' }] })
    expect(text).toContain('Riu Negril to MBJ')
    expect(text).not.toContain('Airport transfer to Riu Negril')
    expect(text).toMatch(/tracks your flight/)
    expect(text).not.toMatch(/Local guides|full itinerary/)
  })

  test('a tour cart keeps the tour reasons', async () => {
    const { text } = await send({})
    expect(text).toMatch(/Private transport from your hotel and back is in the price/)
    expect(text).not.toMatch(/tracks your flight/)
  })

  test('it promises nothing that is not so: no "spot is held", and the button opens the checkout over https', async () => {
    const tour = await send({})
    expect(tour.text).not.toMatch(/spot is still held|locked in/i)
    expect(tour.html).toContain('https://mapltours.com/checkout')
    expect(tour.html).not.toMatch(/href="http:\/\/mapltours/)
    state.emails = []; state.reacts = []; state.updates = []
    const ride = await send({ booking_type: 'transfer', booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', trip_type: 'round_trip', passengers: 2, price_per_person: 199, arrival_at: '2026-12-03T16:06:00+00:00', departure_at: '2026-12-10T09:00:00+00:00' }] })
    expect(ride.html).toContain('https://mapltours.com/transfers/checkout')
  })

  test('no em dash anywhere in it', async () => {
    const { text } = await send({})
    expect(text).not.toMatch(/—/)
  })
})
