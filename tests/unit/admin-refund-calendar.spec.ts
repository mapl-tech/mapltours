import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

/**
 * An approved refund takes the booking off the shared ops calendar
 * (batch review, Sept 2026).
 *
 * The admin refund route sets status 'refunded' BEFORE it calls Stripe, so
 * the charge.refunded webhook that follows matches no row it can flip, and
 * its calendar removal never runs. Ops were emailed "CANCELLED · stand down"
 * while the calendar still showed the pickup with the guest's name, phone
 * and hotel. The route now removes the events itself, after the cancellation
 * emails, on every exit that leaves the booking refunded, and never lets a
 * calendar failure touch the refund's outcome.
 *
 * Drives the real POST handler over a scripted Stripe, a fake service
 * client and a faked calendar, and records the order of the side effects.
 */

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  /** Side effects in the order they happened. */
  events: [] as string[],
  /** The options each sendCancellationEmails call carried. */
  emailOpts: [] as Array<Record<string, unknown> | undefined>,
  bookingUpdates: [] as Array<Record<string, unknown>>,
  refundCreate: (async () => ({ id: 're_1' })) as () => Promise<unknown>,
  refundList: (async () => ({ data: [] })) as () => Promise<unknown>,
  giftCredited: true,
  calendar: (async () => ({ ok: true })) as (id: string) => Promise<{ ok: boolean; reason?: string }>,
}))

vi.mock('stripe', () => ({
  default: class StripeStub {
    paymentIntents = {
      retrieve: async () => ({ latest_charge: { amount_captured: 15000, amount_refunded: 0 } }),
    }
    refunds = {
      create: () => state.refundCreate(),
      list: () => state.refundList(),
    }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      let patch: Record<string, unknown> | null = null
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        update: (p: Record<string, unknown>) => {
          patch = p
          if (table === 'bookings') state.bookingUpdates.push(p)
          return chain
        },
        maybeSingle: async () =>
          table === 'admins' ? { data: { user_id: 'admin-1' }, error: null } : { data: state.row, error: null },
        // Every conditional update wins in this store.
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: patch ? [{ id: state.row.id }] : null, error: null }).then(resolve),
      })
      return chain
    },
  }),
}))

vi.mock('@/lib/email/cancellation', () => ({
  sendCancellationEmails: async (_id: string, opts?: Record<string, unknown>) => {
    state.events.push('emails')
    state.emailOpts.push(opts)
    return { customer: 'sent', ops: 'sent' }
  },
  sendRefundDeclinedEmail: async () => ({ customer: 'sent', ops: 'skipped' }),
}))

vi.mock('@/lib/gift-redemption', () => ({
  refundToGiftCard: async () => state.giftCredited,
}))

vi.mock('@/lib/google-calendar', () => ({
  removeBookingFromCalendar: (id: string) => {
    state.events.push(`calendar:${id}`)
    return state.calendar(id)
  },
}))

const ID = 'd00dfeed-1111-4222-8333-444444444444'

let POST: (req: Request, ctx: { params: { id: string } }) => Promise<Response>

beforeAll(async () => {
  POST = (await import('../../app/api/admin/refunds/[id]/route')).POST as never
})

beforeEach(() => {
  state.row = {
    id: ID, status: 'paid', refund_state: 'requested', stripe_payment_id: 'pi_1',
    total_paid: 150, gift_card_id: null, gift_card_amount: null,
    refund_quoted_amount: 120, refund_quoted_admin_charge: 30,
    refund_quoted_cash: 120, refund_quoted_gift: 0, currency: 'usd',
  }
  state.events = []
  state.emailOpts = []
  state.bookingUpdates = []
  state.refundCreate = async () => ({ id: 're_1' })
  state.refundList = async () => ({ data: [] })
  state.giftCredited = true
  state.calendar = async () => ({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const decide = (action: 'approve' | 'decline') =>
  POST(new Request(`http://test.local/api/admin/refunds/${ID}`, { method: 'POST', body: JSON.stringify({ action }) }), { params: { id: ID } })

describe('every exit that leaves the booking refunded clears the calendar, after the emails', () => {
  test('a clean approval', async () => {
    const res = await decide('approve')
    expect(res.status).toBe(200)
    expect(state.events).toEqual(['emails', `calendar:${ID}`])
  })

  test('cash refunded but the gift credit failed: the booking stays refunded', async () => {
    Object.assign(state.row, { gift_card_id: 'gc_1', gift_card_amount: 30, refund_quoted_cash: 90, refund_quoted_gift: 30 })
    state.giftCredited = false

    const res = await decide('approve')
    expect((await res.json()).error).toBe('gift_credit_failed')
    expect(state.events).toEqual(['emails', `calendar:${ID}`])
    // The guest's receipt says the credit is being added, not that it landed.
    expect(state.emailOpts).toEqual([{ source: 'self-serve', giftCreditPending: true }])
  })

  test('a gift credit that landed is never described as pending', async () => {
    Object.assign(state.row, { gift_card_id: 'gc_1', gift_card_amount: 30, refund_quoted_cash: 90, refund_quoted_gift: 30 })
    const res = await decide('approve')
    expect(res.status).toBe(200)
    expect(state.emailOpts).toEqual([{ source: 'self-serve' }])
  })

  test('Stripe threw but the refund landed', async () => {
    state.refundCreate = async () => { throw new Error('socket hang up') }
    state.refundList = async () => ({ data: [{ status: 'succeeded', metadata: { booking_id: ID } }] })

    const res = await decide('approve')
    expect((await res.json()).error).toBe('refund_uncertain_but_landed')
    expect(state.events).toEqual(['emails', `calendar:${ID}`])
  })

  test('refund state unprovable: the booking is left refunded, so the calendar follows it', async () => {
    state.refundCreate = async () => { throw new Error('socket hang up') }
    state.refundList = async () => { throw new Error('stripe down') }

    const res = await decide('approve')
    expect((await res.json()).error).toBe('refund_state_unknown')
    expect(state.events).toEqual([`calendar:${ID}`])
  })
})

describe('the calendar never gates the refund', () => {
  test('an exit that puts the booking back to paid leaves the calendar alone', async () => {
    state.refundCreate = async () => { throw new Error('card_declined') }
    state.refundList = async () => ({ data: [] })

    const res = await decide('approve')
    expect((await res.json()).error).toBe('refund_failed')
    expect(state.bookingUpdates.at(-1)).toMatchObject({ status: 'paid', refund_state: 'requested' })
    expect(state.events).toEqual([])
  })

  test('a decline leaves it alone too', async () => {
    const res = await decide('decline')
    expect(res.status).toBe(200)
    expect(state.events).toEqual([])
  })

  test('a failed removal is logged for a human, and the approval still succeeds', async () => {
    state.calendar = async () => ({ ok: false, reason: 'delete 500' })

    const res = await decide('approve')
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('calendar event NOT removed'),
      expect.objectContaining({ booking: ID, reason: 'delete 500' }),
    )
  })

  test('a throwing calendar module cannot fail the approval', async () => {
    state.calendar = async () => { throw new Error('boom') }

    const res = await decide('approve')
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  test('an unconfigured calendar is not an error', async () => {
    state.calendar = async () => ({ ok: false, reason: 'not configured' })

    const res = await decide('approve')
    expect(res.status).toBe(200)
    expect(console.error).not.toHaveBeenCalled()
  })

  test('a hung calendar cannot hold the response past its budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    state.calendar = () => new Promise(() => {})

    let settled = false
    const pending = decide('approve').then((r) => { settled = true; return r })
    // Step the clock so every awaited mock in front of the calendar settles.
    for (let ms = 0; ms < 2_900 && !settled; ms += 100) await vi.advanceTimersByTimeAsync(100)
    expect(settled).toBe(false)
    for (let ms = 0; ms < 500 && !settled; ms += 100) await vi.advanceTimersByTimeAsync(100)

    expect(settled).toBe(true)
    const res = await pending
    expect(res.status).toBe(200)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('calendar event NOT removed'),
      expect.objectContaining({ booking: ID }),
    )
  })
})
