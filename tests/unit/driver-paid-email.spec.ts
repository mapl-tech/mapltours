import { describe, test, expect, vi, beforeEach } from 'vitest'
import { moneyBlock, money, round2, type Bk } from '../../lib/dispatch'
import { notifyDriverPaid } from '../../lib/email/driver-paid'

/**
 * The driver's "payment sent" email (lib/email/driver-paid.ts), shared by the
 * dispatch console's pay tick and the Wise payout job. One once-only claim in
 * the dispatch map means a ride half is announced once, whichever paid it.
 * The job passes a time limit and an idempotency key; the console passes none.
 */

const { sent } = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }))
vi.mock('@/lib/email/send', () => ({
  driverNotifyEmail: () => process.env.DRIVER_NOTIFY_EMAIL || null,
  opsBcc: () => ['ops@example.com'],
  sendEmail: vi.fn(async (input: Record<string, unknown>) => { sent.push(input); return { ok: true } }),
}))


const booking = (item: Record<string, unknown>, subtotal = 162): Bk => ({
  id: '8a1b01c5-0000-4000-8000-000000000000',
  first_name: 'Ada',
  last_name: 'Lovelace',
  subtotal,
  booking_fee: 40,
  total_paid: subtotal + 40,
  driver_name: 'Devon Brown',
  booking_items: [{ hotel: 'Riu Negril', passengers: 2, price_per_person: 101, ...item }],
})
const roundTrip = booking({ trip_type: 'round_trip', arrival_at: '2026-11-21T15:00:00', departure_at: '2026-11-28T11:00:00' })
const departureOnly = booking({ trip_type: 'one_way', departure_at: '2026-11-22T09:00:00' }, 81)

/** merge_dispatch with p_only_if_absent, as the database does it: one claim per key. */
function fakeSvc() {
  const claims = new Set<string>()
  return {
    claims,
    rpc: vi.fn(async (_fn: string, args: { p_booking_id: string; p_patch: Record<string, string>; p_only_if_absent: string }) => {
      const k = `${args.p_booking_id}:${args.p_only_if_absent}`
      if (claims.has(k)) return { data: [] }
      claims.add(k)
      return { data: [{ dispatch: args.p_patch }] }
    }),
  }
}

beforeEach(() => {
  sent.length = 0
  process.env.DRIVER_NOTIFY_EMAIL = 'driver@example.com'
})

describe('the payment email', () => {
  test('a round trip half: the console figures, the right leg, the subject', async () => {
    const svc = fakeSvc()
    const m = moneyBlock(roundTrip, null)
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(true)
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_second', 'second')).toBe(true)
    expect(String(sent[0].subject)).toBe(`${money(m.driverPerLeg)} sent · first half · MAPL-8A1B01C5`)
    expect(String(sent[1].subject)).toBe(`${money(round2(m.driverTotal - m.driverPerLeg))} sent · second half · MAPL-8A1B01C5`)
    expect(String(sent[0].subject)).toMatch(/first half · MAPL-8A1B01C5$/)
    expect(String(sent[1].subject)).toMatch(/second half · MAPL-8A1B01C5$/)
    expect(sent.every((s) => s.to === 'driver@example.com')).toBe(true)
  })

  test('a one-way to the airport is a payment in full', async () => {
    const svc = fakeSvc()
    expect(await notifyDriverPaid(svc, departureOnly, 'paid_first', 'first')).toBe(true)
    expect(String(sent[0].subject)).toMatch(/payment in full · MAPL-8A1B01C5$/)
  })

  test('once only: the console tick and the job share the claim', async () => {
    const svc = fakeSvc()
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(true) // the job
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(false) // a tick afterwards
    expect(sent).toHaveLength(1)
  })

  test("the job's time limit and idempotency key reach the send; the console sends neither", async () => {
    const svc = fakeSvc()
    await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first', { timeoutMs: 2500, idempotencyKey: 'driver-paid/x/paid_first' })
    await notifyDriverPaid(svc, roundTrip, 'paid_second', 'second')
    expect(sent[0]).toMatchObject({ timeoutMs: 2500, idempotencyKey: 'driver-paid/x/paid_first' })
    expect(sent[1]).not.toHaveProperty('timeoutMs')
    expect(sent[1]).not.toHaveProperty('idempotencyKey')
  })

  test('no driver inbox, or nothing owed: no claim, no email', async () => {
    const svc = fakeSvc()
    delete process.env.DRIVER_NOTIFY_EMAIL
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(false)
    process.env.DRIVER_NOTIFY_EMAIL = 'driver@example.com'
    expect(await notifyDriverPaid(svc, booking({ trip_type: 'round_trip', arrival_at: '2026-11-21T15:00:00' }, 0), 'paid_first', 'first')).toBe(false)
    expect(svc.claims.size).toBe(0)
    expect(sent).toHaveLength(0)
  })
})
