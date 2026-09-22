import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { aggregateBookings, parseWindow, type ReportBookingRow } from '../../lib/weekly-report'

const SINCE = '2026-09-14T05:00:00.000Z'
const UNTIL = '2026-09-21T05:00:00.000Z'
const MID = '2026-09-17T15:00:00.000Z'
const BEFORE = '2026-09-10T15:00:00.000Z'

let n = 0
function row(over: Partial<ReportBookingRow> = {}): ReportBookingRow {
  n++
  return {
    id: `b-${n}`,
    email: `guest${n}@gmail.com`,
    booking_type: 'tour',
    status: 'paid',
    total_paid: 100,
    paid_at: MID,
    created_at: MID,
    refunded_at: null,
    refund_amount: null,
    coupon_code: null,
    coupon_discount: null,
    attribution: null,
    ...over,
  }
}

describe('aggregateBookings', () => {
  test('test addresses are dropped, whatever their case', () => {
    const rows = [
      row({ email: 'walk@example.com' }),
      row({ email: 'x@RESEND.dev' }),
      row({ email: 'tech@mapltech.com' }),
      row({ email: 'leshanpatterson@gmail.com' }),
      row({ email: 'leshan_patterson@yahoo.com' }),
      row({ email: 'real@gmail.com' }),
      row({ email: null }),
    ]
    const r = aggregateBookings(rows, SINCE, UNTIL)
    expect(r.paid.count).toBe(2)
    expect(r.started.count).toBe(2)
  })

  test('window is [since, until): the start instant counts, the end instant does not', () => {
    const r = aggregateBookings(
      [
        row({ paid_at: SINCE, created_at: BEFORE, total_paid: 10 }),
        row({ paid_at: UNTIL, created_at: BEFORE, total_paid: 1000 }),
        row({ paid_at: '2026-09-14T04:59:59.999Z', created_at: BEFORE, total_paid: 1000 }),
      ],
      SINCE,
      UNTIL
    )
    expect(r.paid.count).toBe(1)
    expect(r.paid.revenueUsd).toBe(10)
    expect(r.started.count).toBe(0)
  })

  test('paid splits by type, revenue sums total_paid (numeric strings too) without float drift', () => {
    const r = aggregateBookings(
      [
        row({ booking_type: 'tour', total_paid: '120.10' }),
        row({ booking_type: 'tour', total_paid: 0.2 }),
        row({ booking_type: 'transfer', total_paid: 95.5 }),
      ],
      SINCE,
      UNTIL
    )
    expect(r.paid.count).toBe(3)
    expect(r.paid.revenueUsd).toBe(215.8)
    expect(r.paid.byType.tour).toEqual({ count: 2, revenueUsd: 120.3 })
    expect(r.paid.byType.transfer).toEqual({ count: 1, revenueUsd: 95.5 })
  })

  test('started counts every row created in the window; abandoned only those still pending', () => {
    const r = aggregateBookings(
      [
        row({ status: 'pending', paid_at: null, total_paid: null }),
        row({ status: 'pending', paid_at: null, total_paid: null }),
        row({ status: 'canceled', paid_at: null }),
        row({ status: 'paid' }),
        row({ status: 'pending', paid_at: null, created_at: BEFORE }),
      ],
      SINCE,
      UNTIL
    )
    expect(r.started.count).toBe(4)
    expect(r.abandoned.count).toBe(2)
    expect(r.paid.count).toBe(1)
  })

  test('refunds count by refunded_at, even for a booking paid in an earlier week', () => {
    const r = aggregateBookings(
      [
        row({ status: 'refunded', paid_at: BEFORE, created_at: BEFORE, refunded_at: MID, refund_amount: '80.25' }),
        row({ status: 'refunded', refunded_at: BEFORE, refund_amount: 50 }),
        row({ status: 'refunded', refunded_at: MID, refund_amount: 19.75 }),
      ],
      SINCE,
      UNTIL
    )
    expect(r.refunds).toEqual({ count: 2, amountUsd: 100 })
  })

  test('coupons: paid rows with a code sum their discount; missing columns count as zero', () => {
    const withCols = aggregateBookings(
      [
        row({ coupon_code: 'JAMAICA5', coupon_discount: '6.00' }),
        row({ coupon_code: 'JAMAICA5', coupon_discount: 4.5 }),
        row({ coupon_code: 'JAMAICA5', coupon_discount: 9, status: 'pending', paid_at: null }),
      ],
      SINCE,
      UNTIL
    )
    expect(withCols.coupons).toEqual({ count: 2, discountUsd: 10.5 })

    const drifted = row()
    delete drifted.coupon_code
    delete drifted.coupon_discount
    const without = aggregateBookings([drifted], SINCE, UNTIL)
    expect(without.coupons).toEqual({ count: 0, discountUsd: 0 })
    expect(without.paid.count).toBe(1)
  })

  test('attribution groups by source/medium, defaults to (direct), keeps the top 8 by started', () => {
    const rows: ReportBookingRow[] = [
      row({ attribution: { source: 'google', medium: 'cpc' } }),
      row({ attribution: { source: 'google', medium: 'cpc' }, status: 'pending', paid_at: null }),
      row({ attribution: null, status: 'pending', paid_at: null }),
      row({ attribution: { source: '', medium: '' } }),
      row({ attribution: { source: 'webmcp', medium: 'browser-agent' }, created_at: BEFORE }),
    ]
    for (let i = 0; i < 9; i++) rows.push(row({ attribution: { source: `s${i}`, medium: 'm' }, status: 'pending', paid_at: null }))
    rows.push(row({ attribution: { source: 's0', medium: 'm' }, status: 'pending', paid_at: null }))
    rows.push(row({ attribution: { source: 's0', medium: 'm' }, status: 'pending', paid_at: null }))

    const r = aggregateBookings(rows, SINCE, UNTIL)
    expect(r.attribution).toHaveLength(8)
    expect(r.attribution[0]).toEqual({ source: 's0', medium: 'm', paid: 0, started: 3 })
    expect(r.attribution).toContainEqual({ source: 'google', medium: 'cpc', paid: 1, started: 2 })
    expect(r.attribution).toContainEqual({ source: '(direct)', medium: '(none)', paid: 1, started: 2 })
    expect(JSON.stringify(r)).not.toMatch(/@/)

    // Paid this week, started last week: counts as paid, not started.
    const late = aggregateBookings([row({ attribution: { source: 'webmcp', medium: 'browser-agent' }, created_at: BEFORE })], SINCE, UNTIL)
    expect(late.attribution).toEqual([{ source: 'webmcp', medium: 'browser-agent', paid: 1, started: 0 }])
  })
})

describe('parseWindow', () => {
  test('accepts ISO instants and normalizes them', () => {
    expect(parseWindow('2026-09-14T00:00:00-05:00', '2026-09-21T00:00:00-05:00')).toEqual({
      since: '2026-09-14T05:00:00.000Z',
      until: '2026-09-21T05:00:00.000Z',
    })
  })
  test('refuses missing, malformed, reversed and over-long windows', () => {
    expect(parseWindow(null, UNTIL)).toHaveProperty('error')
    expect(parseWindow('last monday', UNTIL)).toHaveProperty('error')
    // an instant without a zone would be read in the server's local time
    expect(parseWindow('2026-09-14T00:00', UNTIL)).toHaveProperty('error')
    expect(parseWindow('2026-09-14', UNTIL)).toHaveProperty('error')
    expect(parseWindow('2026-09-10T00:00:00Z', '2026-09-31T00:00:00Z')).toHaveProperty('error')
    expect(parseWindow(UNTIL, SINCE)).toHaveProperty('error')
    expect(parseWindow('2026-06-01T00:00:00Z', '2026-08-03T00:00:01Z')).toHaveProperty('error')
    expect(parseWindow('2026-06-01T00:00:00Z', '2026-08-02T00:00:00Z')).not.toHaveProperty('error')
  })
})

// ── Route ──────────────────────────────────────────────────────────────────

type Result = { data: unknown[] | null; error: { code?: string; message?: string } | null }
const db: { selects: string[]; results: Result[]; ors: string[] } = { selects: [], results: [], ors: [] }

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe('bookings')
      const q = {
        select(cols: string) {
          db.selects.push(cols)
          return q
        },
        or(f: string) {
          db.ors.push(f)
          return q
        },
        order() {
          return q
        },
        range() {
          return Promise.resolve(db.results.shift() ?? { data: [], error: null })
        },
      }
      return q
    },
  }),
}))

import { GET } from '@/app/api/report/bookings/route'

function req(qs: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://mapltours.com/api/report/bookings${qs}`, { headers })
}
const GOOD = `?since=${SINCE}&until=${UNTIL}`

describe('GET /api/report/bookings', () => {
  beforeEach(() => {
    process.env.REPORT_KEY = 'test-report-key'
    db.selects = []
    db.results = []
    db.ors = []
  })
  afterEach(() => {
    delete process.env.REPORT_KEY
  })

  test('401 without the header, and never from the query string', async () => {
    const r = await GET(req(`${GOOD}&secret=test-report-key`))
    expect(r.status).toBe(401)
    expect(db.selects).toHaveLength(0)
  })

  test('401 with the wrong secret, including one of a different length', async () => {
    expect((await GET(req(GOOD, { 'x-report-key': 'test-cron-secreT' }))).status).toBe(401)
    expect((await GET(req(GOOD, { 'x-report-key': 'short' }))).status).toBe(401)
  })

  test('401 when REPORT_KEY is unset, even with an empty header', async () => {
    delete process.env.REPORT_KEY
    expect((await GET(req(GOOD, { 'x-report-key': '' }))).status).toBe(401)
  })

  test('400 on bad dates', async () => {
    const h = { 'x-report-key': 'test-report-key' }
    expect((await GET(req('', h))).status).toBe(400)
    expect((await GET(req(`?since=yesterday&until=${UNTIL}`, h))).status).toBe(400)
    expect((await GET(req(`?since=2026-01-01T00:00:00Z&until=${UNTIL}`, h))).status).toBe(400)
  })

  test('200 with the report shape, no-store, and a retry without coupon columns on drift', async () => {
    db.results = [
      { data: null, error: { code: '42703', message: 'column bookings.coupon_code does not exist' } },
      {
        data: [
          row({ booking_type: 'transfer', total_paid: 90, attribution: { source: 'google', medium: 'cpc' } }),
          row({ email: 'walk@example.com' }),
        ],
        error: null,
      },
    ]
    const r = await GET(req(GOOD, { 'x-report-key': 'test-report-key' }))
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(db.selects[0]).toContain('coupon_code')
    expect(db.selects[1]).not.toContain('coupon_code')
    expect(db.ors[0]).toContain(`paid_at.gte."${SINCE}"`)
    const body = await r.json()
    expect(body).toEqual({
      ok: true,
      since: SINCE,
      until: UNTIL,
      paid: { count: 1, revenueUsd: 90, byType: { tour: { count: 0, revenueUsd: 0 }, transfer: { count: 1, revenueUsd: 90 } } },
      started: { count: 1 },
      abandoned: { count: 0 },
      refunds: { count: 0, amountUsd: 0 },
      coupons: { count: 0, discountUsd: 0 },
      attribution: [{ source: 'google', medium: 'cpc', paid: 1, started: 1 }],
    })
  })

  test('500 on any other query error, without leaking detail', async () => {
    db.results = [{ data: null, error: { code: '57014', message: 'statement timeout' } }]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await GET(req(GOOD, { 'x-report-key': 'test-report-key' }))
    spy.mockRestore()
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'Could not read bookings.' })
  })
})
