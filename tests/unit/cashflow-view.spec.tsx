import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CashflowView, { comparisonFor, inPeriod, monthTotals, niceTicks, previousMonth, summarize, torontoMonth, type CashRow } from '../../components/admin/CashflowView'

/**
 * The admin cash-flow view (Nov 13 2026 redesign). It only sums and draws the
 * rows the server computed, so these pin the sums, the owner's Toronto
 * calendar for periods and months, and that every value the charts show is
 * also printed (nothing hides behind a hover).
 */

const row = (i: number, date: string, gross: number, fee: number | null, payout: number, remit: number, extra: Partial<CashRow> = {}): CashRow => ({
  id: `${i}`, ref: `MAPL-${i}`, date, name: `Guest ${i}`, type: 'transfer', gross, giftFunded: 0, cashCollected: gross,
  stripeFeeUsd: fee, supplierPayout: payout, remitlyEstUsd: remit, netUsd: Math.round((gross - (fee ?? 0) - payout - remit) * 100) / 100,
  settledCad: fee == null ? null : 100, ...extra,
})

describe('the owner’s calendar', () => {
  test('a payment late on the last evening of a month belongs to that month in Toronto', () => {
    expect(torontoMonth('2099-11-01T03:30:00Z')).toBe('2099-10')
    expect(torontoMonth('2099-11-01T04:30:00Z')).toBe('2099-11')
    expect(torontoMonth('2099-12-01T04:30:00Z')).toBe('2099-11')
    expect(previousMonth('2099-01')).toBe('2098-12')
    expect(previousMonth('2099-11')).toBe('2099-10')
  })

  test('periods: this month and last month by Toronto month, 90 days rolling, all time everything', () => {
    const now = Date.parse('2099-11-15T12:00:00Z')
    expect(inPeriod('2099-11-01T04:30:00Z', 'this', now)).toBe(true)
    expect(inPeriod('2099-11-01T03:30:00Z', 'this', now)).toBe(false)
    expect(inPeriod('2099-11-01T03:30:00Z', 'last', now)).toBe(true)
    expect(inPeriod('2099-08-18T12:00:00Z', '90', now)).toBe(true)
    expect(inPeriod('2099-08-16T12:00:00Z', '90', now)).toBe(false)
    expect(inPeriod(null, 'all', now)).toBe(true)
    expect(inPeriod(null, 'this', now)).toBe(false)
  })
})

describe('comparisonFor: like for like', () => {
  const now = Date.parse('2099-11-15T17:00:00Z') // Nov 15, noon in Toronto
  const rows = [
    row(1, '2099-10-15T20:00:00Z', 100, 5, 80, 3), // Oct 15: inside "the same days last month"
    row(2, '2099-10-16T20:00:00Z', 100, 5, 80, 3), // Oct 16: after the same days
    row(3, '2099-09-20T20:00:00Z', 100, 5, 80, 3), // September: the month before last month
    row(4, '2099-07-01T20:00:00Z', 100, 5, 80, 3), // 137 days back: inside "the 90 days before"
  ]
  const ids = (c: ReturnType<typeof comparisonFor>) => c?.rows.map((r) => r.id)

  test('this month so far against the same days of last month, never the whole of it', () => {
    expect(comparisonFor(rows, 'this', now)?.label).toBe('the same days last month')
    expect(ids(comparisonFor(rows, 'this', now))).toEqual(['1'])
  })

  test('last month against the month before it, by name; 90 days against the 90 before; all time against nothing', () => {
    expect(comparisonFor(rows, 'last', now)?.label).toBe('September 2099')
    expect(ids(comparisonFor(rows, 'last', now))).toEqual(['3'])
    expect(ids(comparisonFor(rows, '90', now))).toEqual(['4'])
    expect(comparisonFor(rows, 'all', now)).toBeNull()
  })
})

describe('the sums', () => {
  const rows = [
    row(1, '2099-08-10T15:00:00Z', 520, 29.86, 420, 11.72),
    row(2, '2099-10-04T15:00:00Z', 410, 23.6, 330, 9.83, { giftFunded: 50 }),
    row(3, '2099-10-24T15:00:00Z', 140, null, 120, 5.42),
  ]

  test('net kept is collected less every cost, and a missing Stripe fee counts as none', () => {
    expect(summarize(rows)).toEqual({
      count: 3, collected: 1070, giftFunded: 50, stripeFees: 53.46, supplierPayouts: 870, remitlyEst: 26.97, netKept: 119.57, settledCad: 200,
    })
    expect(summarize([]).settledCad).toBeNull()
  })

  test('months run from the first to the last, an empty month as zero', () => {
    expect(monthTotals(rows)).toEqual([
      { month: '2099-08', collected: 520 },
      { month: '2099-09', collected: 0 },
      { month: '2099-10', collected: 550 },
    ])
    expect(monthTotals([])).toEqual([])
  })

  test('four clean ticks from zero cover the highest month', () => {
    expect(niceTicks(520)).toEqual([0, 200, 400, 600])
    expect(niceTicks(1234)).toEqual([0, 500, 1000, 1500])
    expect(niceTicks(0)).toEqual([0, 1, 2, 3])
  })
})

describe('the page as it renders', () => {
  const rows = [
    row(1, '2099-08-10T15:00:00Z', 520, 29.86, 420, 11.72),
    row(2, '2099-10-04T15:00:00Z', 34, 2.16, 32, 3.57),
  ]
  const html = renderToStaticMarkup(<CashflowView rows={rows} />)
  const text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ')

  test('the profit leads, and every part of the split is printed with its share', () => {
    expect(text).toContain('Net kept, all time $54.69 USD')
    expect(text).toMatch(/Net kept \$54\.69 10%/)
    expect(text).toMatch(/Supplier payouts \$452\.00 82%/)
    expect(text).toMatch(/Stripe fees \$32\.02 6%/)
  })

  test('every month has a name, and the months also come as a table', () => {
    expect(html).toContain('aria-label="August 2099: $520.00 collected"')
    expect(html).toContain('aria-label="September 2099: $0.00 collected"')
    expect(text).toContain('Show the months as a table')
  })

  test('a loss reads with a true minus sign, and costs read as money out', () => {
    expect(text).toContain('−$3.73')
    expect(text).toContain('−$32.00')
  })
})
