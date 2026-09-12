import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { buildPurchaseEvent, reportMetaPurchase } from '../../lib/meta-capi'
import { reportServerPurchase } from '../../lib/ga4-server'

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

const booking = {
  id: '9a93bc39-d254-463c-9eb5-26d911b4ef51',
  booking_type: 'transfer',
  total_paid: '199.00',
  currency: 'usd',
  email: 'Guest@Example.com',
  pickup: 'Sangster International Airport (MBJ)',
  dropoff: 'Sandals Negril Beach Resort',
  paid_at: '2026-09-07T15:00:00.000Z',
  attribution: { source: 'facebook', fbclid: 'IwAR123', ts: '2026-09-05T10:00:00.000Z', fbp: 'fb.1.1725000000000.987654321' },
}
const NOW = Date.parse('2026-09-07T15:00:30Z')

describe('server-side Meta purchase (Conversions API)', () => {
  beforeEach(() => {
    process.env.META_PIXEL_ID = '1607953960710055'
    process.env.META_CAPI_TOKEN = 'test-token'
  })
  afterEach(() => {
    delete process.env.META_PIXEL_ID
    delete process.env.META_CAPI_TOKEN
    vi.restoreAllMocks()
  })

  test('sends Purchase with the booking ref as event_id, hashed email, fbp, and fbc derived from fbclid', () => {
    const p = buildPurchaseEvent(booking, NOW)
    expect('skipped' in p).toBe(false)
    if ('skipped' in p) return
    expect(p.url).toBe('https://graph.facebook.com/v21.0/1607953960710055/events?access_token=test-token')
    const ev = (p.body.data as Record<string, unknown>[])[0]
    expect(ev.event_name).toBe('Purchase')
    // Same string the pixel sends as eventID → Meta dedupes.
    expect(ev.event_id).toBe('MAPL-9A93BC39')
    expect(ev.event_time).toBe(Math.floor(Date.parse('2026-09-07T15:00:00.000Z') / 1000))
    expect(ev.action_source).toBe('website')
    const ud = ev.user_data as Record<string, unknown>
    expect(ud.em).toEqual([sha256('guest@example.com')])
    expect(ud.fbp).toBe('fb.1.1725000000000.987654321')
    // fbc rebuilt as fb.1.<landing ts ms>.<fbclid>
    expect(ud.fbc).toBe(`fb.1.${Date.parse('2026-09-05T10:00:00.000Z')}.IwAR123`)
    const cd = ev.custom_data as Record<string, unknown>
    expect(cd).toMatchObject({ currency: 'USD', value: 199, order_id: 'MAPL-9A93BC39', content_type: 'product' })
    expect(cd.contents).toEqual([{ id: 'airport-transfer', quantity: 1, item_price: 199 }])
  })

  test('prefers a real _fbc cookie over the fbclid reconstruction', () => {
    const p = buildPurchaseEvent({ ...booking, attribution: { fbc: 'fb.1.1699999999999.realclick', fbclid: 'IwAR123', ts: '2026-09-05T10:00:00.000Z' } }, NOW)
    if ('skipped' in p) throw new Error('unexpected skip')
    const ud = (p.body.data as Record<string, unknown>[])[0].user_data as Record<string, unknown>
    expect(ud.fbc).toBe('fb.1.1699999999999.realclick')
  })

  test('tour bookings carry the tour content id', () => {
    const p = buildPurchaseEvent({ ...booking, booking_type: 'tour', pickup: null, dropoff: null }, NOW)
    if ('skipped' in p) throw new Error('unexpected skip')
    const ev = (p.body.data as Record<string, unknown>[])[0]
    expect(ev.event_source_url).toBe('https://mapltours.com/checkout/confirm')
    expect((ev.custom_data as { contents: unknown }).contents).toEqual([{ id: 'tour', quantity: 1, item_price: 199 }])
  })

  test('skips rather than guesses: no token, no amount, and no identifiers at all', () => {
    delete process.env.META_CAPI_TOKEN
    expect(buildPurchaseEvent(booking, NOW)).toEqual({ skipped: 'META_PIXEL_ID/META_CAPI_TOKEN not set' })
    process.env.META_CAPI_TOKEN = 't'
    expect(buildPurchaseEvent({ ...booking, total_paid: null }, NOW)).toMatchObject({ skipped: expect.stringMatching(/total_paid/) })
    // No email and no Meta cookies → nothing to match on.
    expect(buildPurchaseEvent({ ...booking, email: null, attribution: { source: 'facebook' } }, NOW))
      .toMatchObject({ skipped: expect.stringMatching(/identifiers/) })
  })

  test('email alone is enough to match', () => {
    const p = buildPurchaseEvent({ ...booking, attribution: null }, NOW)
    if ('skipped' in p) throw new Error('unexpected skip')
    const ud = (p.body.data as Record<string, unknown>[])[0].user_data as Record<string, unknown>
    expect(ud.em).toEqual([sha256('guest@example.com')])
    expect(ud.fbp).toBeUndefined()
    expect(ud.fbc).toBeUndefined()
  })

  test('reportMetaPurchase posts the event and reports sent/skipped without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    expect(await reportMetaPurchase(booking, fetchMock as unknown as typeof fetch)).toBe('sent')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/events?access_token=test-token')
    expect(JSON.parse((init as { body: string }).body).data[0].event_name).toBe('Purchase')

    delete process.env.META_CAPI_TOKEN
    expect(await reportMetaPurchase(booking, fetchMock as unknown as typeof fetch)).toBe('skipped')
  })

  /**
   * The money-safety contract the Stripe webhook depends on.
   *
   * handlePaymentSucceeded awaits Promise.all([reportServerPurchase,
   * reportMetaPurchase]) INSIDE the paid transition, with the traveller
   * email, the operator email, the driver assign and the calendar sync still
   * to happen below it. If either reporter could reject, Promise.all would
   * reject, the webhook would throw, Stripe would see a 500 and redeliver,
   * and a guest who has already been charged could be fulfilled twice or not
   * at all. So "neither of these throws" is not a nicety, it is the thing
   * that keeps a Meta outage from breaking a paid booking.
   */
  describe('never breaks the webhook, whatever Meta does', () => {
    test('a network failure resolves to failed rather than throwing', async () => {
      const boom = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
      await expect(reportMetaPurchase(booking, boom as unknown as typeof fetch)).resolves.toBe('failed')
    })

    test('an HTTP error from Meta resolves to failed rather than throwing', async () => {
      const rejected = vi.fn().mockResolvedValue({ ok: false, status: 400 })
      await expect(reportMetaPurchase(booking, rejected as unknown as typeof fetch)).resolves.toBe('failed')
    })

    test('an aborted/timed-out request resolves to failed rather than throwing', async () => {
      const aborted = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      })
      await expect(reportMetaPurchase(booking, aborted as unknown as typeof fetch)).resolves.toBe('failed')
    })

    test('a malformed booking resolves rather than throwing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      const junk = { id: '', total_paid: 'not-a-number', email: 12345 } as never
      await expect(reportMetaPurchase(junk, fetchMock as unknown as typeof fetch)).resolves.toMatch(/skipped|failed/)
    })

    test('the exact webhook pattern survives BOTH reporters failing on the network', async () => {
      process.env.GA4_API_SECRET = 'test-secret'
      const boom = vi.fn().mockRejectedValue(new Error('both platforms down'))
      // A booking carrying BOTH a GA client id and Meta cookies, so neither
      // reporter short-circuits and both genuinely attempt the network.
      const reportable = {
        ...booking,
        attribution: { ...booking.attribution, ga_client_id: '1234567890.1725000000', ga_session_id: '1747323152' },
      }
      // Mirrors handlePaymentSucceeded line for line.
      const results = await Promise.all([
        reportServerPurchase(reportable as never, boom as unknown as typeof fetch),
        reportMetaPurchase(reportable, boom as unknown as typeof fetch),
      ])
      expect(results).toEqual(['failed', 'failed'])
      expect(boom).toHaveBeenCalledTimes(2)
      delete process.env.GA4_API_SECRET
    })

    test('resolves (never rejects) even when a reporter short-circuits', async () => {
      // GA4 skips a booking with no GA client id; Meta fails on the network.
      // Mixed outcomes must still RESOLVE, because a rejection here would
      // throw the webhook and make Stripe redeliver a charged booking.
      process.env.GA4_API_SECRET = 'test-secret'
      const boom = vi.fn().mockRejectedValue(new Error('down'))
      const results = await Promise.all([
        reportServerPurchase(booking as never, boom as unknown as typeof fetch),
        reportMetaPurchase(booking, boom as unknown as typeof fetch),
      ])
      expect(results).toEqual(['skipped', 'failed'])
      for (const r of results) expect(['sent', 'skipped', 'failed']).toContain(r)
      delete process.env.GA4_API_SECRET
    })
  })

  test('honours the visitor tracking opt-out recorded at checkout', async () => {
    // components/Trackers withholds the browser pixel from a Do Not Track /
    // GPC visitor. The Conversions API matches on the hashed email, not a
    // cookie, so without this gate it would report their purchase regardless.
    const optedOut = { ...booking, attribution: { ...booking.attribution, dnt: '1' } }
    expect(buildPurchaseEvent(optedOut, NOW)).toMatchObject({ skipped: expect.stringMatching(/opted out/) })

    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    expect(await reportMetaPurchase(optedOut, fetchMock as unknown as typeof fetch)).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
