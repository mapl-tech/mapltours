import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildPurchasePayload, reportServerPurchase } from '../../lib/ga4-server'

const booking = {
  id: '9a93bc39-d254-463c-9eb5-26d911b4ef51',
  booking_type: 'transfer',
  total_paid: '199.00',
  currency: 'usd',
  pickup: 'Sangster International Airport (MBJ)',
  dropoff: 'Sandals Negril Beach Resort',
  paid_at: '2026-09-07T15:00:00.000Z',
  attribution: { source: 'google', medium: 'cpc', gclid: 'abc', ga_client_id: '1234567890.1725000000', ga_session_id: '1747323152' },
}
const NOW = Date.parse('2026-09-07T15:00:30Z')

describe('server-side GA4 purchase', () => {
  beforeEach(() => { process.env.GA4_API_SECRET = 'test-secret' })
  afterEach(() => { delete process.env.GA4_API_SECRET; vi.restoreAllMocks() })

  test('builds the same transaction id the confirm page fires, on the same client and session', () => {
    const p = buildPurchasePayload(booking, NOW)
    expect('skipped' in p).toBe(false)
    if ('skipped' in p) return
    expect(p.url).toBe('https://www.google-analytics.com/mp/collect?measurement_id=G-2JVWPL4GBE&api_secret=test-secret')
    expect(p.body.client_id).toBe('1234567890.1725000000')
    expect(p.body.timestamp_micros).toBe(Date.parse('2026-09-07T15:00:00.000Z') * 1000)
    const ev = (p.body.events as { name: string; params: Record<string, unknown> }[])[0]
    expect(ev.name).toBe('purchase')
    expect(ev.params).toMatchObject({ transaction_id: 'MAPL-9A93BC39', value: 199, currency: 'USD', session_id: '1747323152', engagement_time_msec: 1 })
    expect(ev.params.items).toEqual([{ item_id: 'airport-transfer', item_name: 'Airport transfer: Sangster International Airport (MBJ) to Sandals Negril Beach Resort', item_category: 'transfer', price: 199, quantity: 1 }])
  })

  test('skips rather than guesses: no secret, no client id, no amount, stale timestamp', () => {
    delete process.env.GA4_API_SECRET
    expect(buildPurchasePayload(booking, NOW)).toEqual({ skipped: 'GA4_API_SECRET not set' })
    process.env.GA4_API_SECRET = 's'
    expect(buildPurchasePayload({ ...booking, attribution: { source: 'google' } }, NOW)).toMatchObject({ skipped: expect.stringMatching(/client id/) })
    expect(buildPurchasePayload({ ...booking, attribution: null }, NOW)).toMatchObject({ skipped: expect.stringMatching(/client id/) })
    expect(buildPurchasePayload({ ...booking, total_paid: null }, NOW)).toMatchObject({ skipped: expect.stringMatching(/total_paid/) })
    const old = buildPurchasePayload({ ...booking, paid_at: '2026-09-01T00:00:00Z' }, NOW)
    expect('skipped' in old ? null : old.body.timestamp_micros).toBeUndefined()
  })

  test('tours are reported as a tour line', () => {
    const p = buildPurchasePayload({ ...booking, booking_type: 'tour', total_paid: 306 }, NOW)
    if ('skipped' in p) throw new Error(p.skipped)
    expect((p.body.events as { params: { items: unknown[] } }[])[0].params.items).toEqual([{ item_id: 'tour', item_name: 'Tour booking', item_category: 'tour', price: 306, quantity: 1 }])
  })

  test('sends once and never throws, whatever the network does', async () => {
    const ok = vi.fn(async () => ({ ok: true, status: 204 })) as unknown as typeof fetch
    expect(await reportServerPurchase(booking, ok)).toBe('sent')
    expect(ok).toHaveBeenCalledTimes(1)
    const body = JSON.parse((ok as unknown as { mock: { calls: [string, { body: string }][] } }).mock.calls[0][1].body)
    expect(body.events[0].params.transaction_id).toBe('MAPL-9A93BC39')
    const rejected = vi.fn(async () => ({ ok: false, status: 400 })) as unknown as typeof fetch
    expect(await reportServerPurchase(booking, rejected)).toBe('failed')
    const boom = vi.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect(await reportServerPurchase(booking, boom)).toBe('failed')
    delete process.env.GA4_API_SECRET
    const never = vi.fn() as unknown as typeof fetch
    expect(await reportServerPurchase(booking, never)).toBe('skipped')
    expect(never).not.toHaveBeenCalled()
  })
})
