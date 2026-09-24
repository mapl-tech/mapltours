import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest'

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
    from: (_table: string) => {
      let record: { patch: Record<string, unknown>; filters: Array<[string, string, unknown]> } | null = null
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        order: self,
        limit: self,
        eq: (col: string, val: unknown) => {
          record?.filters.push(['eq', col, val])
          return chain
        },
        is: (col: string, val: unknown) => {
          record?.filters.push(['is', col, val])
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
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(
            record ? { data: null, error: null } : { data: state.rows, error: null }
          ).then(resolve),
      })
      return chain
    },
  }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: { to: string; subject: string }) => {
    state.emails.push({ to: args.to, subject: args.subject })
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
