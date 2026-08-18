import { describe, test, expect, vi, beforeEach } from 'vitest'
import { refundToGiftCard } from '../../lib/gift-redemption'

/**
 * Returning gift value when a booking is refunded.
 *
 * Two callers can reach refundToGiftCard for the same booking: the admin
 * approval route, and the charge.refunded webhook racing it. The bug these
 * guard against is crediting first and closing the ledger row afterwards,
 * which let both callers credit before either closed the row and minted the
 * refund twice. The row is now CLAIMED first, so it is the mutual exclusion.
 *
 * The other half is the failure path: if the balance write does not land, the
 * row must go back to 'spent', because a 'spent' row on a refunded booking is
 * the only durable marker that credit is still owed.
 */

interface Row { [k: string]: unknown }

/**
 * Minimal stand-in for the Supabase client, supporting exactly the chains
 * this function uses. Rows are mutated in place so a second call observes
 * what the first one did, which is the whole point of the test.
 */
function fakeDb(tables: Record<string, Row[]>) {
  const calls = { creditAttempts: 0 }
  const match = (row: Row, filters: [string, unknown][]) =>
    filters.every(([col, val]) => row[col] === val)

  const builder = (table: string, mode: 'select' | 'update', patch?: Row) => {
    const filters: [string, unknown][] = []
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) { filters.push([col, val]); return api },
      select() { return api },
      maybeSingle() {
        const rows = tables[table] ?? []
        const hit = rows.find((r) => match(r, filters))
        if (mode === 'select') return Promise.resolve({ data: hit ?? null, error: null })
        if (!hit) return Promise.resolve({ data: null, error: null })
        if (table === 'gift_cards') calls.creditAttempts++
        Object.assign(hit, patch)
        return Promise.resolve({ data: { id: hit.id }, error: null })
      },
      then(res: (v: unknown) => unknown) {
        // Bare awaits (no .maybeSingle) — used by the revert path.
        const rows = tables[table] ?? []
        const hits = rows.filter((r) => match(r, filters))
        if (mode === 'update') hits.forEach((h) => Object.assign(h, patch))
        return Promise.resolve({ data: hits, error: null }).then(res)
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

function seed(spentAmount = 60, balance = 40) {
  return {
    gift_cards: [{ id: CARD, balance, status: 'active' }],
    gift_card_redemptions: [
      { id: 'r1', gift_card_id: CARD, booking_id: BOOKING, amount: spentAmount, status: 'spent', settled_at: 't' },
    ],
  }
}

beforeEach(() => vi.restoreAllMocks())

describe('returning gift value on a refund', () => {
  test('credits the balance once and closes the ledger row', async () => {
    const tables = seed(60, 40)
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await refundToGiftCard(client as any, CARD, BOOKING, 60)

    expect(ok).toBe(true)
    expect(tables.gift_cards[0].balance).toBe(100)
    expect(tables.gift_card_redemptions[0].status).toBe('released')
  })

  test('a racing second call credits nothing and still reports success', async () => {
    const tables = seed(60, 40)
    const { client, calls } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refundToGiftCard(client as any, CARD, BOOKING, 60)
    const balanceAfterFirst = tables.gift_cards[0].balance
    const creditsAfterFirst = calls.creditAttempts

    // The webhook arriving behind the admin route, same booking.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second = await refundToGiftCard(client as any, CARD, BOOKING, 60)

    expect(second).toBe(true)
    expect(tables.gift_cards[0].balance).toBe(balanceAfterFirst)
    expect(calls.creditAttempts).toBe(creditsAfterFirst)
  })

  test('never credits more than the booking actually debited', async () => {
    const tables = seed(60, 40)
    const { client } = fakeDb(tables)
    // A caller asking for more than was spent (bad quote, rounding drift).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refundToGiftCard(client as any, CARD, BOOKING, 500)

    expect(tables.gift_cards[0].balance).toBe(100) // 40 + 60, not 40 + 500
  })

  test('a partial return leaves the row spent for the remainder', async () => {
    const tables = seed(60, 40)
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await refundToGiftCard(client as any, CARD, BOOKING, 25)

    expect(ok).toBe(true)
    expect(tables.gift_cards[0].balance).toBe(65)
    // Still 'spent', reduced — so the ledger keeps reconciling against the
    // value still held against bookings.
    expect(tables.gift_card_redemptions[0].status).toBe('spent')
    expect(tables.gift_card_redemptions[0].amount).toBe(35)
  })

  test('a zero or negative amount is a no-op, not a credit', async () => {
    const tables = seed(60, 40)
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await refundToGiftCard(client as any, CARD, BOOKING, 0)).toBe(true)
    expect(tables.gift_cards[0].balance).toBe(40)
    expect(tables.gift_card_redemptions[0].status).toBe('spent')
  })

  test('a booking with nothing spent against it is a safe no-op', async () => {
    const tables = { gift_cards: [{ id: CARD, balance: 40, status: 'active' }], gift_card_redemptions: [] as Row[] }
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ok = await refundToGiftCard(client as any, CARD, 'no-such-booking', 60)

    expect(ok).toBe(true)
    expect(tables.gift_cards[0].balance).toBe(40)
  })

  test('a depleted card is revived when value comes back', async () => {
    const tables = {
      gift_cards: [{ id: CARD, balance: 0, status: 'depleted' }],
      gift_card_redemptions: [
        { id: 'r1', gift_card_id: CARD, booking_id: BOOKING, amount: 60, status: 'spent', settled_at: 't' },
      ],
    }
    const { client } = fakeDb(tables)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await refundToGiftCard(client as any, CARD, BOOKING, 60)

    expect(tables.gift_cards[0].balance).toBe(60)
    expect(tables.gift_cards[0].status).toBe('active')
  })
})
