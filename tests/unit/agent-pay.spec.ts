/**
 * book_and_pay_transfer with fake Stripe and a fake checkout route. Every
 * refusal must happen before the step it guards: no checkout call without a
 * valid token, no confirm without a matching intent, never a retry.
 */
import { describe, expect, test, vi } from 'vitest'
import { bookAndPayTransfer, type AgentPayDeps, type ConfirmOutcome, type GrantedToken, type IntentLike, type RideState } from '@/lib/agent/agent-pay'
import { getTransferPrice } from '@/lib/airport-transfers'
import { hashTransferCart } from '@/lib/transfer-cart-hash'
import { CANCELLATION_SUMMARY } from '@/lib/refund-pricing'

const NOW = new Date('2026-10-01T12:00:00Z')
const ORIGIN = 'https://mapltours.com'
const PRICE = getTransferPrice('riu-negril', 'round_trip', 2)!
const CENTS = Math.round(PRICE * 100)
const BOOKING = '1ed1b572-f243-49bc-b0e1-c8b3aaf22947'
const SPT = 'spt_1TestToken123'

const input = (over: Record<string, unknown> = {}) => ({
  destination: 'Riu Negril',
  trip_type: 'round_trip',
  passengers: 2,
  arrival_at: '2027-03-05T14:30',
  arrival_flight: 'AA 1234',
  departure_flight_at: '2027-03-12T16:05',
  departure_flight: 'AA1235',
  guest: { first_name: 'Alex', last_name: 'Rivera', email: 'Alex@Example.com', phone: '+1 305 555 0142' },
  approved_total_usd: PRICE,
  shared_payment_token: SPT,
  ...over,
})

const token = (over: Partial<GrantedToken> = {}): GrantedToken => ({
  id: SPT,
  deactivated_at: null,
  usage_limits: { currency: 'usd', max_amount: CENTS, expires_at: NOW.getTime() / 1000 + 900 },
  ...over,
})

const intent = (over: Partial<IntentLike> = {}): IntentLike => ({
  id: 'pi_ABC123',
  amount: CENTS,
  currency: 'usd',
  status: 'requires_payment_method',
  metadata: { booking_id: BOOKING },
  ...over,
})

function deps(over: Partial<{ limited: boolean; ride: RideState | Error; token: GrantedToken | null | Error; checkout: { status: number; json: Record<string, unknown> } | Error; pi: IntentLike | Error; confirm: ConfirmOutcome }> = {}) {
  const d = {
    tooManyAttempts: vi.fn<(ip: string, email: string) => boolean>(() => over.limited ?? false),
    findRideState: vi.fn<(hash: string) => Promise<RideState>>(async () => {
      const r = over.ride ?? { kind: 'none' }
      if (r instanceof Error) throw r
      return r
    }),
    retrieveGrantedToken: vi.fn(async () => {
      const t = 'token' in over ? over.token : token()
      if (t instanceof Error) throw t
      return t ?? null
    }),
    createCheckout: vi.fn(async () => {
      const c = over.checkout ?? { status: 200, json: { clientSecret: 'pi_ABC123_secret_xyz', bookingId: BOOKING, amountDue: PRICE } }
      if (c instanceof Error) throw c
      return c
    }),
    retrievePaymentIntent: vi.fn<(id: string, quick?: boolean) => Promise<IntentLike>>(async () => {
      const p = over.pi ?? intent()
      if (p instanceof Error) throw p
      return p
    }),
    confirmPaymentIntent: vi.fn(async (): Promise<ConfirmOutcome> => over.confirm ?? { intent: intent({ status: 'succeeded' }) }),
  } satisfies AgentPayDeps
  return d
}

const run = (d: AgentPayDeps, over: Record<string, unknown> = {}, timing: { clock?: () => number; startedAt?: number } = {}) =>
  bookAndPayTransfer(input(over), { deps: d, origin: ORIGIN, via: 'muse', ip: '203.0.113.9', now: () => NOW, ...timing })

const nothingCalledAfterToken = (d: ReturnType<typeof deps>) => {
  expect(d.createCheckout).not.toHaveBeenCalled()
  expect(d.retrievePaymentIntent).not.toHaveBeenCalled()
  expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
}

describe('the happy path', () => {
  test('books through the real checkout body, confirms the intent once with the token, and reports the booking', async () => {
    const d = deps()
    const r = await run(d)
    expect(r).toMatchObject({ status: 'paid', bookingRef: 'MAPL-1ED1B572', amountPaidUsd: PRICE })
    expect(String(r.confirmationUrl)).toBe(`${ORIGIN}/transfers/confirm?payment_intent=pi_ABC123&redirect_status=succeeded`)
    expect(String(r.nextStep)).toContain('alex@example.com')

    expect(d.retrieveGrantedToken).toHaveBeenCalledWith(SPT)
    expect(d.createCheckout).toHaveBeenCalledTimes(1)
    const [body, ip] = d.createCheckout.mock.calls[0] as unknown as [Record<string, unknown>, string]
    expect(ip).toBe('203.0.113.9')
    expect(body).toEqual({
      amount: PRICE,
      items: [{ destinationId: 'riu-negril', tripType: 'round_trip', passengers: 2, fromAirport: true, arrivalAt: '2027-03-05T14:30', arrivalFlight: 'AA1234', departureAt: '2027-03-12T12:35', departureFlight: 'AA1235' }],
      customer: { email: 'alex@example.com', firstName: 'Alex', lastName: 'Rivera', phone: '+1 305 555 0142' },
      attribution: { source: 'muse', medium: 'ai_agent', campaign: 'connector', content: 'book_and_pay_transfer', landing: '/mcp', ts: NOW.toISOString(), dnt: '1' },
    })
    expect(r.cancellation).toBe(CANCELLATION_SUMMARY.short)
    // The paid-booking check keys on exactly what the checkout route hashes.
    expect(d.findRideState).toHaveBeenCalledWith(hashTransferCart([(body.items as unknown[])[0] as never], CENTS, 'alex@example.com'))
    expect(d.tooManyAttempts).toHaveBeenCalledWith('203.0.113.9', 'alex@example.com')
    expect(d.retrievePaymentIntent).toHaveBeenCalledWith('pi_ABC123')
    expect(d.confirmPaymentIntent).toHaveBeenCalledTimes(1)
    expect(d.confirmPaymentIntent).toHaveBeenCalledWith('pi_ABC123', SPT, `agentpay2:pi_ABC123:${SPT}`)
  })

  test('a one-way from the airport sends only the arrival leg', async () => {
    const d = deps()
    const one = getTransferPrice('riu-negril', 'one_way', 3)!
    d.retrievePaymentIntent.mockResolvedValue(intent({ amount: Math.round(one * 100) }))
    d.createCheckout.mockResolvedValue({ status: 200, json: { clientSecret: 'pi_ABC123_secret_xyz', bookingId: BOOKING, amountDue: one } })
    d.retrieveGrantedToken.mockResolvedValue(token({ usage_limits: { currency: 'usd', max_amount: Math.round(one * 100), expires_at: NOW.getTime() / 1000 + 900 } }))
    const r = await run(d, { trip_type: 'one_way', direction: 'airport_to_hotel', passengers: 3, departure_flight_at: undefined, departure_flight: undefined, approved_total_usd: one })
    expect(r.status).toBe('paid')
    const [body] = d.createCheckout.mock.calls[0] as unknown as [{ items: Record<string, unknown>[] }]
    expect(body.items[0]).toEqual({ destinationId: 'riu-negril', tripType: 'one_way', passengers: 3, fromAirport: true, arrivalAt: '2027-03-05T14:30', arrivalFlight: 'AA1234' })
  })

  test('special requests reach the driver note, trimmed and clipped', async () => {
    const d = deps()
    await run(d, { special_requests: `  car seat   for a toddler ${'x'.repeat(600)}` })
    const [body] = d.createCheckout.mock.calls[0] as unknown as [{ customer: { specialRequests: string } }]
    expect(body.customer.specialRequests.startsWith('car seat for a toddler')).toBe(true)
    expect(body.customer.specialRequests.length).toBe(500)
  })
})

describe('refused before any token lookup', () => {
  test.each([
    ['no first name', { guest: { last_name: 'R', email: 'a@b.co', phone: '+1 305 555 0142' } }, 'first_name'],
    ['bad email', { guest: { first_name: 'A', last_name: 'R', email: 'nope', phone: '+1 305 555 0142' } }, 'guest.email'],
    ['short phone', { guest: { first_name: 'A', last_name: 'R', email: 'a@b.co', phone: '555' } }, 'guest.phone'],
    ['unknown hotel', { destination: 'Atlantis Resort Bahamas' }, 'No hotel matches'],
    ['inside 24 hours', { arrival_at: '2026-10-02T06:00' }, 'booking window'],
    ['missing arrival flight', { arrival_flight: undefined }, 'arrival_flight'],
    ['missing departure flight', { departure_flight: undefined }, 'departure_flight'],
    ['price not what was approved', { approved_total_usd: PRICE - 1 }, 'price_not_approved'],
    ['price missing', { approved_total_usd: undefined }, 'price_not_approved'],
    ['token not an spt', { shared_payment_token: 'pm_card_visa' }, 'spt_'],
  ])('%s', async (_label, over, msg) => {
    const d = deps()
    const r = await run(d, over as Record<string, unknown>)
    expect(JSON.stringify(r)).toContain(msg)
    expect(d.retrieveGrantedToken).not.toHaveBeenCalled()
    nothingCalledAfterToken(d)
  })

  test('a changed price comes back with the real price for the traveller to approve', async () => {
    const r = await run(deps(), { approved_total_usd: 1 })
    expect(r).toMatchObject({ error: 'price_not_approved', priceUsd: PRICE })
  })
})

describe('refused at the token, before a booking exists', () => {
  test.each([
    ['not found', null, 'not found'],
    ['deactivated', token({ deactivated_at: 1790000000 }), 'no longer active'],
    ['wrong currency', token({ usage_limits: { currency: 'eur', max_amount: CENTS * 2, expires_at: NOW.getTime() / 1000 + 900 } }), 'USD'],
    ['too small', token({ usage_limits: { currency: 'usd', max_amount: CENTS - 1, expires_at: NOW.getTime() / 1000 + 900 } }), 'allows less'],
    ['no limit', token({ usage_limits: { currency: 'usd', max_amount: null, expires_at: NOW.getTime() / 1000 + 900 } }), 'allows less'],
    ['expiring', token({ usage_limits: { currency: 'usd', max_amount: CENTS, expires_at: NOW.getTime() / 1000 + 30 } }), 'expires within a minute'],
    ['lookup failed', new Error('network'), 'could not be checked'],
  ])('%s', async (_label, t, msg) => {
    const d = deps({ token: t as GrantedToken | null | Error })
    const r = await run(d)
    expect(JSON.stringify(r)).toContain(msg)
    expect(JSON.stringify(r)).toContain('Nothing was booked or charged')
    nothingCalledAfterToken(d)
  })
})

describe('refused at checkout or at the intent, never confirmed', () => {
  test('checkout refuses (e.g. the 24-hour rule moved): its message is relayed', async () => {
    const d = deps({ checkout: { status: 400, json: { error: 'Bookings close 24 hours before.' } } })
    const r = await run(d)
    expect(r.error).toBe('Bookings close 24 hours before. Nothing was charged.')
    expect(d.retrievePaymentIntent).not.toHaveBeenCalled()
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('checkout throws', async () => {
    const d = deps({ checkout: new Error('boom') })
    expect(String((await run(d)).error)).toContain('Nothing was charged')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('already paid: reported, not charged again', async () => {
    const d = deps({ checkout: { status: 200, json: { alreadyPaid: true, bookingId: BOOKING } } })
    expect(await run(d)).toMatchObject({ status: 'already_paid', bookingRef: 'MAPL-1ED1B572' })
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test.each([
    ['amount due differs', { status: 200, json: { clientSecret: 'pi_ABC123_secret_xyz', bookingId: BOOKING, amountDue: PRICE + 5 } }],
    ['malformed secret', { status: 200, json: { clientSecret: 'nonsense', bookingId: BOOKING, amountDue: PRICE } }],
  ])('%s', async (_label, checkout) => {
    const d = deps({ checkout })
    expect(String((await run(d)).error)).toContain('nothing was charged')
    expect(d.retrievePaymentIntent).not.toHaveBeenCalled()
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test.each([
    ['another amount', intent({ amount: CENTS + 100 })],
    ['another currency', intent({ currency: 'cad' })],
    ['another booking', intent({ metadata: { booking_id: 'someone-else' } })],
    ['no metadata', intent({ metadata: null })],
  ])('the intent belongs to %s', async (_label, pi) => {
    const d = deps({ pi })
    expect(String((await run(d)).error)).toContain('nothing was charged')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('intent lookup fails', async () => {
    const d = deps({ pi: new Error('timeout') })
    expect(String((await run(d)).error)).toContain('Nothing was charged')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('already succeeded: paid, no second confirm', async () => {
    const d = deps({ pi: intent({ status: 'succeeded' }) })
    expect((await run(d)).status).toBe('paid')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('processing: reported, no confirm', async () => {
    const d = deps({ pi: intent({ status: 'processing' }) })
    expect((await run(d)).status).toBe('processing')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test.each(['requires_action', 'requires_capture', 'canceled'])('intent waiting on %s: not confirmed', async (status) => {
    const d = deps({ pi: intent({ status }) })
    expect(String((await run(d)).error)).toContain(status)
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })
})

describe('after the confirm', () => {
  test.each([
    ['declined', { error: { kind: 'declined', message: 'Your card has insufficient funds.' } }, 'payment_declined'],
    ['refused token', { error: { kind: 'invalid', message: 'This token was already used.' } }, 'payment_refused'],
    ['unknown', { error: { kind: 'unknown', message: 'no answer' } }, 'payment_unknown'],
    ['failed with reason', { intent: intent({ status: 'requires_payment_method', last_payment_error: { message: 'Card expired.' } }) }, 'payment_declined'],
  ])('%s', async (_label, confirm, code) => {
    const d = deps({ confirm: confirm as ConfirmOutcome })
    const r = await run(d)
    expect(r.error).toBe(code)
    expect(r.bookingRef).toBe('MAPL-1ED1B572')
    expect(d.confirmPaymentIntent).toHaveBeenCalledTimes(1)
  })

  test('needs the bank: the authentication link goes back to the agent', async () => {
    const d = deps({ confirm: { intent: intent({ status: 'requires_action', next_action: { type: 'redirect_to_url', redirect_to_url: { url: 'https://hooks.stripe.com/3d_secure/abc' } } }) } })
    expect(await run(d)).toMatchObject({ status: 'needs_authentication', authenticateUrl: 'https://hooks.stripe.com/3d_secure/abc' })
  })

  test('needs the bank in an app: no link, still a clear next step', async () => {
    const d = deps({ confirm: { intent: intent({ status: 'requires_action', next_action: { type: 'use_stripe_sdk' } }) } })
    const r = await run(d)
    expect(r.status).toBe('needs_authentication')
    expect(r.authenticateUrl).toBeUndefined()
  })

  test('processing after confirm', async () => {
    const d = deps({ confirm: { intent: intent({ status: 'processing' }) } })
    expect((await run(d)).status).toBe('processing')
  })
})

describe('never books or charges the same ride twice', () => {
  test('a paid booking of the same ride is reported, after the token is shown to exist, and nothing is created', async () => {
    const d = deps({ ride: { kind: 'paid', bookingId: BOOKING } })
    const r = await run(d)
    expect(r).toMatchObject({ status: 'already_paid', bookingRef: 'MAPL-1ED1B572' })
    expect(String(r.message)).toContain('keeps the details it was booked with')
    expect(d.retrieveGrantedToken).toHaveBeenCalledTimes(1)
    nothingCalledAfterToken(d)
  })

  test('an unknown token learns nothing about bookings', async () => {
    const d = deps({ token: null, ride: { kind: 'paid', bookingId: BOOKING } })
    const r = await run(d)
    expect(String(r.error)).toContain('not found')
    expect(JSON.stringify(r)).not.toContain('MAPL-')
    expect(d.findRideState).not.toHaveBeenCalled()
  })

  test('a spent token on a ride that is paid answers already_paid, not "nothing charged"', async () => {
    const d = deps({ token: token({ deactivated_at: 1790000000 }), ride: { kind: 'paid', bookingId: BOOKING } })
    const r = await run(d)
    expect(r.status).toBe('already_paid')
    expect(JSON.stringify(r)).not.toContain('Nothing was booked or charged')
  })

  test('a ride whose payment is processing, or waits on the bank, is reported, never paid again', async () => {
    const p = deps({ ride: { kind: 'processing', bookingId: BOOKING } })
    expect(await run(p)).toMatchObject({ status: 'processing', bookingRef: 'MAPL-1ED1B572' })
    nothingCalledAfterToken(p)
    const a = deps({ ride: { kind: 'needs_authentication', bookingId: BOOKING, url: 'https://hooks.stripe.com/3ds/x' } })
    expect(await run(a)).toMatchObject({ status: 'needs_authentication', authenticateUrl: 'https://hooks.stripe.com/3ds/x' })
    nothingCalledAfterToken(a)
  })

  test('the review\'s repro: pay, retry with the spent token, retry with a fresh token: one charge', async () => {
    // A tiny model of the real system: the pending index only de-duplicates
    // PENDING rows, a token pays once, and the webhook marks the row paid.
    const paid = new Set<string>()
    const spent = new Set<string>()
    let rows = 0
    let charges = 0
    const d: AgentPayDeps = {
      tooManyAttempts: () => false,
      findRideState: async (hash) => (paid.has(hash) ? { kind: 'paid', bookingId: BOOKING } : { kind: 'none' }),
      retrieveGrantedToken: async (spt) => token({ id: spt, deactivated_at: spent.has(spt) ? 1 : null }),
      createCheckout: async (body) => {
        rows++
        const item = (body.items as never[])[0]
        const hash = hashTransferCart([item], CENTS, String((body.customer as { email: string }).email))
        return { status: 200, json: { clientSecret: `pi_R${rows}_secret_x`, bookingId: BOOKING, amountDue: PRICE, hash } }
      },
      retrievePaymentIntent: async (id) => intent({ id }),
      confirmPaymentIntent: async (id, spt) => {
        spent.add(spt)
        charges++
        return { intent: intent({ id, status: 'succeeded' }) }
      },
    }
    const markPaidByWebhook = () => paid.add(hashTransferCart([{ destinationId: 'riu-negril', tripType: 'round_trip', passengers: 2, fromAirport: true, arrivalAt: '2027-03-05T14:30', departureAt: '2027-03-12T12:35' }], CENTS, 'alex@example.com'))

    expect((await run(d)).status).toBe('paid')
    markPaidByWebhook()
    expect((await run(d)).status).toBe('already_paid')
    expect((await run(d, { shared_payment_token: 'spt_1FreshToken999' })).status).toBe('already_paid')
    expect(charges).toBe(1)
    expect(rows).toBe(1)
  })

  test('a different email is a different booking (not blocked)', async () => {
    const d = deps()
    d.findRideState.mockImplementation(async (hash: string) => (hash === hashTransferCart([{ destinationId: 'riu-negril', tripType: 'round_trip', passengers: 2, fromAirport: true, arrivalAt: '2027-03-05T14:30', departureAt: '2027-03-12T12:35' }], CENTS, 'someone@else.com') ? { kind: 'paid', bookingId: BOOKING } : { kind: 'none' }))
    expect((await run(d)).status).toBe('paid')
  })

  test('the ride lookup failing refuses, before anything is created', async () => {
    const d = deps({ ride: new Error('db down') })
    expect(String((await run(d)).error)).toContain('Nothing was booked or charged')
    nothingCalledAfterToken(d)
  })

  test('too many attempts from one address: refused before anything costs a call', async () => {
    const d = deps({ limited: true })
    expect(String((await run(d)).error)).toContain('Too many payment attempts')
    expect(d.findRideState).not.toHaveBeenCalled()
    expect(d.retrieveGrantedToken).not.toHaveBeenCalled()
    nothingCalledAfterToken(d)
  })
})

describe('answers about an earlier attempt are never called "nothing charged"', () => {
  test('payment still processing (409): processing, with the reference, no confirm', async () => {
    const d = deps({ checkout: { status: 409, json: { paymentProcessing: true, bookingId: BOOKING, error: 'Your payment is still being confirmed.' } } })
    const r = await run(d)
    expect(r).toMatchObject({ status: 'processing', bookingRef: 'MAPL-1ED1B572' })
    expect(JSON.stringify(r)).not.toContain('Nothing was charged')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test('payment state unknown (503): payment_unknown, no confirm', async () => {
    const d = deps({ checkout: { status: 503, json: { error: 'Could not confirm your payment state just now.', bookingId: BOOKING } } })
    const r = await run(d)
    expect(r).toMatchObject({ error: 'payment_unknown', bookingRef: 'MAPL-1ED1B572' })
    expect(JSON.stringify(r)).not.toContain('Nothing was charged')
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })

  test.each([
    ['succeeded', 'paid'],
    ['processing', 'processing'],
  ])('an unclear confirm is re-read: %s reads as %s', async (status, want) => {
    for (const kind of ['invalid', 'unknown'] as const) {
      const d = deps({ confirm: { error: { kind, message: 'already succeeded' } } })
      d.retrievePaymentIntent.mockResolvedValueOnce(intent()).mockResolvedValueOnce(intent({ status }))
      expect((await run(d)).status, kind).toBe(want)
      expect(d.retrievePaymentIntent).toHaveBeenLastCalledWith('pi_ABC123', true)
    }
  })

  test('an unclear confirm that Stripe cannot re-read is payment_unknown, not refused', async () => {
    const d = deps({ confirm: { error: { kind: 'invalid', message: 'odd' } } })
    d.retrievePaymentIntent.mockResolvedValueOnce(intent()).mockRejectedValueOnce(new Error('timeout'))
    expect((await run(d)).error).toBe('payment_unknown')
  })
})

describe('time budget', () => {
  test('late in the call the confirm is not started: nothing charged, safe to call again', async () => {
    const d = deps()
    // The request arrived 4.5 s before the intent was verified (a slow cold start counts).
    const r = await run(d, {}, { startedAt: 1_000, clock: () => 5_500 })
    expect(r).toMatchObject({ status: 'not_completed', bookingRef: 'MAPL-1ED1B572' })
    expect(d.confirmPaymentIntent).not.toHaveBeenCalled()
  })
})

describe('the time budget runs from the request, not the tool', () => {
  test('inside the budget: paid', async () => {
    const d = deps()
    expect((await run(d, {}, { startedAt: 1_000, clock: () => 4_900 })).status).toBe('paid')
  })
})
