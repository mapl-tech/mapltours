import { describe, test, expect, vi, beforeEach } from 'vitest'
import { sendDayOf, stampKey } from '../../lib/dayof'
import { sendEmail } from '../../lib/email/send'

/**
 * Sending the day-of email exactly once, and only to a booking that is STILL
 * paid at the moment of the send.
 *
 * The cron run reads its bookings once and then works through the sends one
 * awaited Resend call at a time, so the row a send acts on can be minutes
 * stale. A guest cancelling in that window has already put 'refunded' on the
 * row and 'stand down' in the ops inbox; mailing them the driver's name and
 * number afterwards is the bug (audit 2026-08-22). The rule under test: after
 * winning the claim, re-read the status and send only on a fresh 'paid' —
 * and on ANY other answer, refunded or unreadable, keep the stamp, because a
 * booking that stopped being paid must never get this email from a later run
 * either.
 */

vi.mock('../../lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })),
  opsBcc: () => [],
}))
const sendEmailMock = vi.mocked(sendEmail)

const HOUR = 3_600_000

/** A leg h hours from now, as Jamaica wall-clock carrying a Z (the stored
 *  text is the real instant minus five hours — the lib/dispatch convention).
 *  Six hours ahead is inside the 13-hour due window and never 'passed'. */
const legIso = (hoursAhead: number) =>
  new Date(Date.now() + hoursAhead * HOUR - 5 * HOUR).toISOString()

interface Row { [k: string]: unknown }

function booking(over: Row = {}): Row {
  return {
    id: 'b1',
    status: 'paid',
    email: 'guest@example.com',
    first_name: 'Andre',
    driver_name: 'Collins',
    driver_phone: '+1 876 555 0100',
    driver_vehicle: 'Toyota Coaster',
    driver_plate: 'PP1234',
    dispatch: {},
    booking_items: [{
      item_type: 'transfer',
      hotel: 'Azul Beach Resort Negril',
      trip_type: 'one_way',
      passengers: 2,
      arrival_at: legIso(6),
      arrival_flight: 'AA123',
    }],
    ...over,
  }
}

/**
 * Minimal stand-in for the service client, supporting exactly what sendDayOf
 * uses: the merge_dispatch claim/release RPC (mutating `row.dispatch` in
 * place, honouring p_only_if_absent) and the pre-send status re-read. The
 * re-read answers from `db.status`, NOT from the row handed to sendDayOf —
 * that split is the stale-snapshot race itself.
 */
function fakeSvc(db: { status: string | null; readError?: string }, row: Row) {
  const dispatch = (row.dispatch ?? {}) as Record<string, unknown>
  row.dispatch = dispatch
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (fn: string, args: any) => {
      if (fn !== 'merge_dispatch') throw new Error(`unexpected rpc ${fn}`)
      if (args.p_remove) {
        for (const k of args.p_remove as string[]) delete dispatch[k]
        return { data: [{ id: row.id }], error: null }
      }
      if (args.p_only_if_absent && dispatch[args.p_only_if_absent] !== undefined) {
        return { data: [], error: null }
      }
      Object.assign(dispatch, args.p_patch)
      return { data: [{ id: row.id }], error: null }
    },
    from: (table: string) => {
      if (table !== 'bookings') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              db.readError
                ? { data: null, error: { message: db.readError } }
                : { data: db.status === null ? null : { status: db.status }, error: null },
          }),
        }),
      }
    },
  }
}

beforeEach(() => {
  sendEmailMock.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {}).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('a booking that is still paid', () => {
  test('is mailed, and the stamp holds the claim', async () => {
    const row = booking()
    const svc = fakeSvc({ status: 'paid' }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendDayOf(svc as any, row as any, 'arrival')

    expect(res.ok).toBe(true)
    expect(res.sentTo).toBe('guest@example.com')
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect((row.dispatch as Row)[stampKey('arrival')]).toBeTruthy()
  })

  test('a failed send still releases the claim so the next run retries', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const row = booking()
    const svc = fakeSvc({ status: 'paid' }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendDayOf(svc as any, row as any, 'arrival')

    expect(res.ok).toBe(false)
    expect(res.error).toBe('resend 500')
    expect((row.dispatch as Row)[stampKey('arrival')]).toBeUndefined()
  })
})

describe('a refund racing the cron run', () => {
  test.each(['refunded', 'canceled', 'failed'])(
    'a booking now %s is withheld the email, and the stamp stays so no later run retries',
    async (status) => {
      // The row sendDayOf holds still says 'paid': the run's opening
      // snapshot, gone stale while earlier sends were awaited.
      const row = booking()
      const svc = fakeSvc({ status }, row)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await sendDayOf(svc as any, row as any, 'arrival')

      expect(res.ok).toBe(false)
      expect(res.skipped).toContain(status)
      expect(sendEmailMock).not.toHaveBeenCalled()
      // The stamp is KEPT: a refunded booking must never get driver details,
      // so the claim standing is what blocks every future attempt.
      expect((row.dispatch as Row)[stampKey('arrival')]).toBeTruthy()
    },
  )

  test('the next run sees the held stamp and never re-claims', async () => {
    const row = booking()
    const svc = fakeSvc({ status: 'refunded' }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sendDayOf(svc as any, row as any, 'arrival')

    // Next hourly run: fresh read of the row, stamp now visible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const again = await sendDayOf(svc as any, row as any, 'arrival')
    expect(again.skipped).toBe('already sent')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test('an operator force resend re-checks too: a stale console row cannot mail a refunded guest', async () => {
    const row = booking({ dispatch: { [stampKey('arrival')]: '2026-08-21T12:00:00Z' } })
    const svc = fakeSvc({ status: 'refunded' }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendDayOf(svc as any, row as any, 'arrival', { force: true })

    expect(res.ok).toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})

describe('the re-read fails closed', () => {
  test('an errored read withholds the send rather than trusting the stale snapshot', async () => {
    const row = booking()
    const svc = fakeSvc({ status: 'paid', readError: 'statement timeout' }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendDayOf(svc as any, row as any, 'arrival')

    expect(res.ok).toBe(false)
    expect(res.skipped).toContain('errored')
    expect(sendEmailMock).not.toHaveBeenCalled()
    // Stamp kept; the operator force resend is the recovery path.
    expect((row.dispatch as Row)[stampKey('arrival')]).toBeTruthy()
    expect(console.error).toHaveBeenCalled()
  })

  test('a vanished row reads as not paid, never as paid', async () => {
    const row = booking()
    const svc = fakeSvc({ status: null }, row)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await sendDayOf(svc as any, row as any, 'arrival')

    expect(res.ok).toBe(false)
    expect(res.skipped).toContain('missing')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })
})
