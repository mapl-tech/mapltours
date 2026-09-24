import { describe, test, expect } from 'vitest'
import { abortPendingBooking, type IntentControls } from '../../lib/booking-abort'

/**
 * Compensation for a reused pending booking whose items write failed.
 *
 * Like gift-card-delivery.spec.ts, these assert the WIRING, not markup:
 * that the row flip is CAS'd on the intent that was read, that the gift
 * release lands between the flip and the delete (the redemptions FK is
 * ON DELETE SET NULL, so releasing after the delete matches nothing), and
 * that every path that cannot PROVE the intent dead keeps the row — the
 * fail-closed rule this codebase's money paths share (audit 2026-08-22).
 */

interface Call {
  table: string
  op: 'update' | 'delete'
  values?: unknown
  filters: [string, string, unknown][]
}

/** Chainable fake PostgREST client that records every write and its guards. */
function fakeDb(script: { flip?: { data?: unknown; error?: { message: string } | null }; del?: { error?: { message: string } | null } } = {}) {
  const calls: Call[] = []
  const db = {
    from(table: string) {
      const make = (op: Call['op'], values?: unknown) => {
        const call: Call = { table, op, values, filters: [] }
        calls.push(call)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q: any = {
          eq(col: string, v: unknown) { call.filters.push(['eq', col, v]); return q },
          is(col: string, v: unknown) { call.filters.push(['is', col, v]); return q },
          in(col: string, v: unknown) { call.filters.push(['in', col, v]); return q },
          select() { return q },
          maybeSingle: async () => ({ data: script.flip?.data ?? null, error: script.flip?.error ?? null }),
          // Awaiting the bare delete chain resolves like supabase-js does.
          then(resolve: (v: unknown) => void) { resolve({ data: null, error: script.del?.error ?? null }) },
        }
        return q
      }
      return {
        update: (values: unknown) => make('update', values),
        delete: () => make('delete'),
      }
    },
  }
  return { db, calls }
}

const payableIntents = (events?: string[]): IntentControls => ({
  retrieve: async () => {
    events?.push('retrieve')
    return { status: 'requires_payment_method' }
  },
  cancel: async () => {
    events?.push('cancel')
    return {}
  },
})

describe('the happy abort: payable intent, uncontested row', () => {
  test('cancels the intent, CAS-flips, releases the gift, then deletes', async () => {
    const events: string[] = []
    const { db, calls } = fakeDb({ flip: { data: { id: 'b1' } } })
    const release = async (id: string) => {
      events.push(`release:${id}`)
      // The release must land while the row still exists: after the delete,
      // the FK has nulled redemptions.booking_id and nothing matches.
      expect(calls.filter((c) => c.op === 'delete')).toHaveLength(0)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, payableIntents(events), 'b1', 'pi_1', release)

    expect(outcome).toBe('aborted')
    expect(events).toEqual(['retrieve', 'cancel', 'release:b1'])

    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual(['bookings.update', 'bookings.delete'])

    const flip = calls[0]
    expect(flip.values).toEqual({ status: 'canceled' })
    // The CAS: only the row still pending/failed AND still carrying the
    // intent that was read may die. A concurrent request that attached a
    // fresh, payable intent must keep its row.
    expect(flip.filters).toContainEqual(['eq', 'id', 'b1'])
    expect(flip.filters).toContainEqual(['in', 'status', ['pending', 'failed']])
    expect(flip.filters).toContainEqual(['eq', 'stripe_payment_id', 'pi_1'])

    const del = calls[1]
    // Only the row this call just claimed: never a bare delete-by-id.
    expect(del.filters).toContainEqual(['eq', 'id', 'b1'])
    expect(del.filters).toContainEqual(['eq', 'status', 'canceled'])
  })

  test('a row with no intent yet is CAS-guarded on stripe_payment_id IS NULL', async () => {
    const { db, calls } = fakeDb({ flip: { data: { id: 'b1' } } })
    const released: string[] = []

    const intents: IntentControls = {
      retrieve: async () => { throw new Error('must not be called') },
      cancel: async () => { throw new Error('must not be called') },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, intents, 'b1', null, async (id) => { released.push(id) })

    expect(outcome).toBe('aborted')
    expect(released).toEqual(['b1'])
    expect(calls[0].filters).toContainEqual(['is', 'stripe_payment_id', null])
  })
})

describe('fail closed: the intent cannot be proven dead', () => {
  const settling: Array<'processing' | 'succeeded' | 'requires_capture'> = [
    'processing',
    'succeeded',
    'requires_capture',
  ]
  for (const status of settling) {
    test(`a ${status} intent keeps the row — money may be moving`, async () => {
      const { db, calls } = fakeDb()
      const released: string[] = []
      const intents: IntentControls = {
        retrieve: async () => ({ status }),
        cancel: async () => { throw new Error('must not be called') },
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const outcome = await abortPendingBooking(db as any, intents, 'b1', 'pi_1', async (id) => { released.push(id) })

      expect(outcome).toBe('kept')
      expect(calls).toHaveLength(0)
      expect(released).toHaveLength(0)
    })
  }

  test('a retrieve failure keeps the row — could not prove the payment is dead', async () => {
    const { db, calls } = fakeDb()
    const intents: IntentControls = {
      retrieve: async () => { throw new Error('stripe 503') },
      cancel: async () => ({}),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, intents, 'b1', 'pi_1', async () => {})
    expect(outcome).toBe('kept')
    expect(calls).toHaveLength(0)
  })

  test('a cancel failure keeps the row — the intent is still payable', async () => {
    const { db, calls } = fakeDb()
    const intents: IntentControls = {
      retrieve: async () => ({ status: 'requires_payment_method' }),
      cancel: async () => { throw new Error('stripe 503') },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, intents, 'b1', 'pi_1', async () => {})
    expect(outcome).toBe('kept')
    expect(calls).toHaveLength(0)
  })

  test('an already-canceled intent is proof enough, without a second cancel', async () => {
    const events: string[] = []
    const { db, calls } = fakeDb({ flip: { data: { id: 'b1' } } })
    const intents: IntentControls = {
      retrieve: async () => { events.push('retrieve'); return { status: 'canceled' } },
      cancel: async () => { events.push('cancel'); return {} },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, intents, 'b1', 'pi_1', async () => {})
    expect(outcome).toBe('aborted')
    expect(events).toEqual(['retrieve'])
    expect(calls.map((c) => c.op)).toEqual(['update', 'delete'])
  })
})

describe('fail closed: the row is no longer ours', () => {
  test('zero rows from the CAS flip means a concurrent request owns it: no release, no delete', async () => {
    const { db, calls } = fakeDb({ flip: { data: null } })
    const released: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, payableIntents(), 'b1', 'pi_1', async (id) => { released.push(id) })

    expect(outcome).toBe('kept')
    expect(released).toHaveLength(0)
    expect(calls.map((c) => c.op)).toEqual(['update'])
  })

  test('an errored flip is treated as contested, never as claimed', async () => {
    const { db, calls } = fakeDb({ flip: { data: null, error: { message: 'statement timeout' } } })
    const released: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, payableIntents(), 'b1', 'pi_1', async (id) => { released.push(id) })

    expect(outcome).toBe('kept')
    expect(released).toHaveLength(0)
    expect(calls.map((c) => c.op)).toEqual(['update'])
  })

  test('a failed delete after a claimed flip still reports aborted: the row is canceled and coherent', async () => {
    const { db, calls } = fakeDb({ flip: { data: { id: 'b1' } }, del: { error: { message: 'network' } } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await abortPendingBooking(db as any, payableIntents(), 'b1', 'pi_1', async () => {})
    expect(outcome).toBe('aborted')
    expect(calls.map((c) => c.op)).toEqual(['update', 'delete'])
  })
})
