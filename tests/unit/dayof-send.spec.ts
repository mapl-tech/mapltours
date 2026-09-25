import { describe, test, expect, vi, beforeEach } from 'vitest'
import { sendDayOf, stampKey, withheldKey, blockedReason, RELEASE_RETRY_MS } from '../../lib/dayof'
import { autoStepDone } from '../../lib/dispatch'
import { sendEmail } from '../../lib/email/send'

/**
 * Sending the day-of email exactly once, only to a booking that is STILL
 * paid at the moment of the send, and never recording a send that did not
 * happen.
 *
 * The cron run reads its bookings once and then works through the sends one
 * awaited Resend call at a time, so the row a send acts on can be minutes
 * stale. A guest cancelling in that window has already put 'refunded' on the
 * row and 'stand down' in the ops inbox; mailing them the driver's name and
 * number afterwards is the bug (audit 2026-08-22). The rule under test: after
 * winning the claim, re-read the status and send only on a fresh 'paid'.
 *
 * What happens to the claim when the answer is not 'paid' (batch review,
 * Sept 2026):
 *   • unreadable or missing: RELEASE it, so the next hourly run retries. A
 *     kept claim turned one database blip into a paid guest never getting
 *     their driver details, while the console said "✓ Day-of email sent".
 *   • definitely not paid: remove the sent stamp too, and record the
 *     withheld attempt under its own key, which nothing reads as "sent".
 */

vi.mock('../../lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })),
  opsBcc: () => [],
}))
const sendEmailMock = vi.mocked(sendEmail)

const HOUR = 3_600_000

/** A leg h hours from now, as Jamaica wall-clock carrying a Z (the stored
 *  text is the real instant minus five hours, the lib/dispatch convention).
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
 * uses: the merge_dispatch RPC (mutating `row.dispatch` in place with the
 * SQL function's semantics: the whole merge applies only when
 * p_only_if_absent is unset or absent, and p_remove applies before p_patch)
 * and the pre-send status re-read. The re-read answers from `db.status`, NOT
 * from the row handed to sendDayOf; that split is the stale-snapshot race.
 */
function fakeSvc(
  db: { status: string | null; readError?: string; failRelease?: number; throwRelease?: boolean; rpcCalls?: number },
  row: Row,
) {
  const dispatch = (row.dispatch ?? {}) as Record<string, unknown>
  row.dispatch = dispatch
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (fn: string, args: any) => {
      if (fn !== 'merge_dispatch') throw new Error(`unexpected rpc ${fn}`)
      db.rpcCalls = (db.rpcCalls ?? 0) + 1
      // Every call after the claim is a release. `failRelease` of them fail
      // the way supabase-js fails: an { error } answer, not a throw.
      const isRelease = !args.p_only_if_absent && db.rpcCalls > 1
      if (isRelease && db.failRelease && db.failRelease > 0) {
        db.failRelease--
        if (db.throwRelease) throw new Error('fetch failed')
        return { data: null, error: { message: 'connection reset' } }
      }
      if (args.p_only_if_absent && dispatch[args.p_only_if_absent] !== undefined) {
        return { data: [], error: null }
      }
      for (const k of (args.p_remove ?? []) as string[]) delete dispatch[k]
      Object.assign(dispatch, args.p_patch ?? {})
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const send = (svc: unknown, row: Row, opts?: { force?: boolean }) => sendDayOf(svc as any, row as any, 'arrival', opts)
const stamps = (row: Row) => row.dispatch as Row

beforeEach(() => {
  sendEmailMock.mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {}).mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {}).mockClear()
})

describe('a booking that is still paid', () => {
  test('is mailed, and the stamp holds the claim', async () => {
    const row = booking()
    const res = await send(fakeSvc({ status: 'paid' }, row), row)

    expect(res.ok).toBe(true)
    expect(res.sentTo).toBe('guest@example.com')
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(stamps(row)[stampKey('arrival')]).toBeTruthy()
    expect(stamps(row)[withheldKey('arrival')]).toBeUndefined()
  })

  test('a failed send still releases the claim so the next run retries', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const row = booking()
    const res = await send(fakeSvc({ status: 'paid' }, row), row)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('resend 500')
    expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
  })

  test('a failed forced resend puts the earlier real send back instead of erasing it', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const earlier = '2026-08-21T12:00:00.000Z'
    const row = booking({ dispatch: { [stampKey('arrival')]: earlier } })
    const res = await send(fakeSvc({ status: 'paid' }, row), row, { force: true })

    expect(res.ok).toBe(false)
    expect(stamps(row)[stampKey('arrival')]).toBe(earlier)
  })
})

describe('a refund racing the cron run', () => {
  test.each(['refunded', 'canceled', 'failed'])(
    'a booking now %s is withheld the email, and the claim does not stay behind as "sent"',
    async (status) => {
      // The row sendDayOf holds still says 'paid': the run's opening
      // snapshot, gone stale while earlier sends were awaited.
      const row = booking()
      const res = await send(fakeSvc({ status }, row), row)

      expect(res.ok).toBe(false)
      expect(res.skipped).toContain(status)
      expect(sendEmailMock).not.toHaveBeenCalled()
      // Nothing was sent, so nothing may say it was.
      expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
      // The attempt is recorded under its own key instead.
      expect(stamps(row)[withheldKey('arrival')]).toBeTruthy()
    },
  )

  test('withheld never reads as sent: not on the console button, not in the auto-ticked steps', async () => {
    const row = booking()
    await send(fakeSvc({ status: 'refunded' }, row), row)

    // DispatchConsole's DayOfBtn starts in "✓ Day-of email sent" exactly
    // when dispatch.dayof_arrival_sent is set.
    expect(stamps(row).dayof_arrival_sent).toBeUndefined()
    // autoStepDone ticks these off the sent keys alone.
    expect(autoStepDone(row, 'driver_reconfirmed', Date.now())).toBeNull()
    expect(autoStepDone(row, 'arrival_followup', Date.now() + 24 * HOUR)).toBeNull()
  })

  test('the next run reads the refunded status and refuses before claiming anything', async () => {
    const row = booking()
    await send(fakeSvc({ status: 'refunded' }, row), row)

    // Next hourly run: a fresh read of the row. (The real cron query only
    // selects paid rows, so it would not even reach this call.)
    const fresh = { ...row, status: 'refunded' }
    const again = await send(fakeSvc({ status: 'refunded' }, fresh), fresh)
    expect(again.skipped).toBe('booking is not paid')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test('even a later run on the same stale snapshot re-reads and never mails the guest', async () => {
    const row = booking()
    const svc = fakeSvc({ status: 'refunded' }, row)
    await send(svc, row)
    const again = await send(svc, row)

    expect(again.ok).toBe(false)
    expect(again.skipped).toContain('refunded')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
  })

  test('a booking that becomes paid again (a failed payment retried) still gets its email', async () => {
    const row = booking()
    const db = { status: 'failed' as string | null }
    const svc = fakeSvc(db, row)
    await send(svc, row)
    expect(sendEmailMock).not.toHaveBeenCalled()

    db.status = 'paid'
    const later = await send(svc, row)
    expect(later.ok).toBe(true)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(stamps(row)[stampKey('arrival')]).toBeTruthy()
  })

  test('an operator force resend re-checks too: a stale console row cannot mail a refunded guest', async () => {
    const earlier = '2026-08-21T12:00:00.000Z'
    const row = booking({ dispatch: { [stampKey('arrival')]: earlier } })
    const res = await send(fakeSvc({ status: 'refunded' }, row), row, { force: true })

    expect(res.ok).toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
    // The earlier send really happened, so its stamp is put back as it was;
    // this attempt is recorded as withheld.
    expect(stamps(row)[stampKey('arrival')]).toBe(earlier)
    expect(stamps(row)[withheldKey('arrival')]).toBeTruthy()
  })
})

describe('an unreadable status releases the claim for the next run', () => {
  test('an errored read withholds the send AND frees the stamp, so the next run retries', async () => {
    const row = booking()
    const db: { status: string | null; readError?: string } = { status: 'paid', readError: 'statement timeout' }
    const svc = fakeSvc(db, row)
    const res = await send(svc, row)

    expect(res.ok).toBe(false)
    expect(res.skipped).toContain('errored')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
    expect(stamps(row)[withheldKey('arrival')]).toBeUndefined()
    expect(console.error).toHaveBeenCalled()

    // Nothing now blocks the paid guest: the next hourly run sends.
    expect(blockedReason(row, 'arrival')).toBeNull()
    delete db.readError
    const retry = await send(svc, row)
    expect(retry.ok).toBe(true)
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
  })

  test('a vanished row reads as not paid, never as paid, and leaves no stamp', async () => {
    const row = booking()
    const res = await send(fakeSvc({ status: null }, row), row)

    expect(res.ok).toBe(false)
    expect(res.skipped).toContain('missing')
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
  })

  test('an errored read during a forced resend keeps the earlier real send on record', async () => {
    const earlier = '2026-08-21T12:00:00.000Z'
    const row = booking({ dispatch: { [stampKey('arrival')]: earlier } })
    const res = await send(fakeSvc({ status: 'paid', readError: 'statement timeout' }, row), row, { force: true })

    expect(res.ok).toBe(false)
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(stamps(row)[stampKey('arrival')]).toBe(earlier)
  })
})

/**
 * The release itself failing (recheck, Sept 2026). supabase-js RETURNS its
 * errors, and the release fires milliseconds after the re-read that failed,
 * so a blip usually takes both. The stamp then stays, the next run says
 * 'already sent', and a paid guest never gets their driver's details while
 * the console shows "✓ Day-of email sent". The release is retried once, and
 * a release that still fails is an error, never a quiet 'claim released'.
 */
describe('a release that fails', () => {
  async function run(svc: unknown, row: Row, opts?: { force?: boolean }) {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const pending = send(svc, row, opts)
      await vi.advanceTimersByTimeAsync(RELEASE_RETRY_MS + 10)
      return await pending
    } finally {
      vi.useRealTimers()
    }
  }
  const critical = () =>
    vi.mocked(console.error).mock.calls.some((c) => String(c[0]).includes('CRITICAL: day-of stamp NOT released for b1/arrival'))

  test('an errored re-read whose release also fails is an error, not "claim released"', async () => {
    const row = booking()
    const db = { status: 'paid', readError: 'connection reset', failRelease: 2 }
    const res = await run(fakeSvc(db, row), row)

    expect(res.ok).toBe(false)
    expect(res.skipped).toBeUndefined()
    expect(res.error).toMatch(/status re-check errored \(connection reset\); claim NOT released, resend from the dispatch console/)
    expect(res.error).not.toMatch(/claim released/)
    // Truthfully reported: the stamp is still there and blocks the next run.
    expect(stamps(row)[stampKey('arrival')]).toBeTruthy()
    expect(blockedReason(row, 'arrival')).toBe('already sent')
    expect(critical()).toBe(true)
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test('one failed release is retried after the pause, and then the next run can send', async () => {
    const row = booking()
    const db: { status: string; readError?: string; failRelease: number; rpcCalls?: number } = { status: 'paid', readError: 'connection reset', failRelease: 1 }
    const svc = fakeSvc(db, row)
    const res = await run(svc, row)

    expect(res.skipped).toMatch(/claim released, the next run retries/)
    expect(res.error).toBeUndefined()
    expect(db.rpcCalls).toBe(3) // claim, failed release, released
    expect(stamps(row)[stampKey('arrival')]).toBeUndefined()
    expect(critical()).toBe(false)

    delete db.readError
    const retry = await send(svc, row)
    expect(retry.ok).toBe(true)
  })

  test('a release that throws is retried and reported the same way', async () => {
    const row = booking()
    const res = await run(fakeSvc({ status: 'paid', readError: 'connection reset', failRelease: 2, throwRelease: true }, row), row)
    expect(res.error).toMatch(/claim NOT released/)
    expect(critical()).toBe(true)
  })

  test('a failed send whose release also fails says so', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const row = booking()
    const res = await run(fakeSvc({ status: 'paid', failRelease: 2 }, row), row)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('resend 500; claim NOT released, resend from the dispatch console')
    expect(stamps(row)[stampKey('arrival')]).toBeTruthy()
    expect(critical()).toBe(true)
  })

  test('a withheld send whose release fails is an error too, since the stamp reads as sent', async () => {
    const row = booking()
    const res = await run(fakeSvc({ status: 'refunded', failRelease: 2 }, row), row)

    expect(res.ok).toBe(false)
    expect(res.skipped).toBeUndefined()
    expect(res.error).toMatch(/'refunded' at send time.*claim was NOT released/)
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(critical()).toBe(true)
  })

  test('a forced resend whose release fails is reported, not passed off as "released"', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const earlier = '2026-08-21T12:00:00.000Z'
    const row = booking({ dispatch: { [stampKey('arrival')]: earlier } })
    const res = await run(fakeSvc({ status: 'paid', failRelease: 2 }, row), row, { force: true })
    expect(res.error).toMatch(/NOT released/)
  })
})
