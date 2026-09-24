import { describe, test, expect, vi, beforeEach } from 'vitest'
import { releaseStaleGiftClaims } from '../../lib/gift-redemption'

/**
 * The stale-claim sweep: handing back gift value reserved against bookings
 * that never got paid for.
 *
 * The dangerous branch is a stale 'pending'/'failed' booking that still
 * carries a PaymentIntent. The sweep cancels the intent first (Stripe is the
 * arbiter), but between that cancel and the booking flip a concurrent
 * re-POST of the same cart can find the dead intent and attach a fresh,
 * discounted one to the very same row. The flip is therefore a CAS on the
 * intent the sweep READ (audit finding, 2026-08-22): zero rows means someone
 * else owns the transition, and the sweep must not release the claim or
 * credit the balance — that value now backs the new intent's discount, and
 * crediting it anyway made it spendable twice.
 */

const stripeState = vi.hoisted(() => ({
  cancelCalls: [] as string[],
  /** Fired mid-cancel — the window a concurrent re-POST lands in. */
  onCancel: () => {},
}))

vi.mock('stripe', () => ({
  default: class {
    paymentIntents = {
      retrieve: async () => ({ status: 'requires_payment_method' }),
      cancel: async (id: string) => {
        stripeState.cancelCalls.push(id)
        stripeState.onCancel()
        return {}
      },
    }
  },
}))

interface Row { [k: string]: unknown }

type Filter = { op: 'eq' | 'in' | 'is' | 'lt'; col: string; val: unknown }

/**
 * Minimal stand-in for the Supabase client, supporting exactly the chains
 * the sweep uses. Rows are mutated in place so a "concurrent" write injected
 * mid-run is observed by the sweep's later statements, which is the whole
 * point of the test.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const calls = { creditAttempts: 0 }
  const match = (row: Row, filters: Filter[]) =>
    filters.every((f) => {
      const v = row[f.col]
      if (f.op === 'eq' || f.op === 'is') return v === f.val
      if (f.op === 'in') return (f.val as unknown[]).includes(v)
      return typeof v === 'string' && typeof f.val === 'string' && v < f.val
    })

  const builder = (table: string, mode: 'select' | 'update', patch?: Row) => {
    const filters: Filter[] = []
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) { filters.push({ op: 'eq', col, val }); return api },
      in(col: string, val: unknown[]) { filters.push({ op: 'in', col, val }); return api },
      is(col: string, val: unknown) { filters.push({ op: 'is', col, val }); return api },
      lt(col: string, val: unknown) { filters.push({ op: 'lt', col, val }); return api },
      select() { return api },
      maybeSingle() {
        const rows = tables[table] ?? []
        const hit = rows.find((r) => match(r, filters))
        if (mode === 'select') return Promise.resolve({ data: hit ? { ...hit } : null, error: null })
        if (!hit) return Promise.resolve({ data: null, error: null })
        if (table === 'gift_cards') calls.creditAttempts++
        Object.assign(hit, patch)
        return Promise.resolve({ data: { ...hit }, error: null })
      },
      then(res: (v: unknown) => unknown) {
        // Bare awaits (no .maybeSingle) — the stale scan and the bulk
        // bookings read.
        const rows = tables[table] ?? []
        const hits = rows.filter((r) => match(r, filters))
        if (mode === 'update') hits.forEach((h) => Object.assign(h, patch))
        return Promise.resolve({ data: hits.map((h) => ({ ...h })), error: null }).then(res)
      },
    }
    return api
  }

  return {
    calls,
    client: {
      from(table: string) {
        return {
          select: () => builder(table, 'select'),
          update: (patch: Row) => builder(table, 'update', patch),
        }
      },
    },
  }
}

const CARD = 'card-1'
const BOOKING = 'booking-1'
// Comfortably beyond the 30-minute staleness cutoff.
const STALE = new Date(Date.now() - 60 * 60_000).toISOString()

function seed(bookingStatus = 'pending', paymentIntent: string | null = 'pi_1') {
  return {
    gift_cards: [{ id: CARD, balance: 10, status: 'active' }],
    gift_card_redemptions: [
      { id: 'r1', gift_card_id: CARD, booking_id: BOOKING, amount: 50, status: 'reserved', created_at: STALE, settled_at: null } as Row,
    ],
    bookings: [
      { id: BOOKING, status: bookingStatus, stripe_payment_id: paymentIntent } as Row,
    ],
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  stripeState.cancelCalls.length = 0
  stripeState.onCancel = () => {}
})

describe('releasing stale gift claims', () => {
  test('a dead pending booking with an intent is killed, released, credited', async () => {
    const tables = seed('pending', 'pi_1')
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await releaseStaleGiftClaims(client as any, CARD)

    expect(stripeState.cancelCalls).toEqual(['pi_1'])
    expect(tables.bookings[0].status).toBe('canceled')
    expect(tables.gift_card_redemptions[0].status).toBe('released')
    expect(tables.gift_cards[0].balance).toBe(60)
  })

  test('a lost CAS on the booking flip skips the release and the credit', async () => {
    const tables = seed('pending', 'pi_1')
    const { client, calls } = fakeDb(tables)
    // The race: while the sweep is cancelling pi_1, a concurrent re-POST of
    // the same cart finds the dead intent and attaches a fresh, discounted
    // pi_2 to the still-pending row. The reservation now backs pi_2.
    stripeState.onCancel = () => { tables.bookings[0].stripe_payment_id = 'pi_2' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await releaseStaleGiftClaims(client as any, CARD)

    // Someone else owns the transition: the booking stays live, the claim
    // stays reserved, and nothing touches the balance — crediting it here
    // would let the same gift value discount two bookings.
    expect(tables.bookings[0].status).toBe('pending')
    expect(tables.gift_card_redemptions[0].status).toBe('reserved')
    expect(tables.gift_cards[0].balance).toBe(10)
    expect(calls.creditAttempts).toBe(0)
  })

  test('a paid booking keeps its reservation untouched', async () => {
    const tables = seed('paid', 'pi_1')
    const { client, calls } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await releaseStaleGiftClaims(client as any, CARD)

    expect(stripeState.cancelCalls).toEqual([])
    expect(tables.gift_card_redemptions[0].status).toBe('reserved')
    expect(calls.creditAttempts).toBe(0)
  })
})
