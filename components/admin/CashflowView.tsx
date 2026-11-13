'use client'

import { useMemo, useState } from 'react'
import Segmented from '@/components/admin/Segmented'
import Arrow from '@/components/ui/Arrow'
import { money, OWNER_ZONE, plural, stamp } from '@/lib/admin-format'

/**
 * The cash-flow dashboard's client half: what paid bookings brought in, what
 * they cost, and what MAPL kept. Read-only. The server page computes every
 * row (Stripe's exact fee and CAD settlement, the supplier payout, the Remitly
 * estimate); this view only sums and draws them.
 *
 * Built by the dataviz method (Nov 13 2026): one period filter above
 * everything it scopes; the profit as the one hero figure; stat tiles for the
 * rest; the split as a thin segmented bar over a list that prints every part,
 * so nothing hides behind a hover; collected by month as single-series
 * columns, labelled only at the latest and the highest month, with a tooltip
 * on hover and keyboard focus and a table view. Series colours mark the
 * marks; text keeps the text colours. Palette validated by the dataviz
 * validator (light surface, all checks pass). Periods and dates follow the
 * owner's Toronto calendar (lib/admin-format).
 *
 * Styles: the .adm-cf block in app/globals.css.
 */

export interface CashRow {
  id: string
  ref: string
  date: string | null
  name: string
  type: 'tour' | 'transfer'
  gross: number
  /** Share of `gross` paid with a gift card, i.e. money collected earlier. */
  giftFunded: number
  /** What Stripe actually settled for this booking: gross minus giftFunded. */
  cashCollected: number
  stripeFeeUsd: number | null
  supplierPayout: number
  remitlyEstUsd: number
  netUsd: number
  settledCad: number | null
}

export type Period = 'all' | 'this' | 'last' | '90'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'this', label: 'This month' },
  { key: 'last', label: 'Last month' },
  { key: '90', label: 'Last 90 days' },
]
const PAGE = 50

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0))

/** The owner's calendar month of a moment: "2026-11". */
export function torontoMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_ZONE, year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7)
}

/** "2026-01" to "2025-12". */
export function previousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Whether a payment falls in a period, on the owner's calendar. */
export function inPeriod(iso: string | null, period: Period, nowMs: number): boolean {
  if (period === 'all') return true
  if (!iso) return false
  if (period === '90') return new Date(iso).getTime() >= nowMs - 90 * 86_400_000
  const now = torontoMonth(new Date(nowMs).toISOString())
  return torontoMonth(iso) === (period === 'this' ? now : previousMonth(now))
}

/** The owner's calendar day of the month of a moment: 13. */
function torontoDayOfMonth(iso: string): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: OWNER_ZONE, day: 'numeric' }).format(new Date(iso)))
}

/**
 * What a period is compared with, like for like: this month so far against
 * the same days of last month (a part month against a whole one would
 * flatter last month), last month against the month before, the last 90 days
 * against the 90 before. All time has nothing to compare with.
 */
export function comparisonFor(rows: CashRow[], period: Period, nowMs: number): { rows: CashRow[]; label: string } | null {
  if (period === 'all') return null
  if (period === '90') {
    const from = nowMs - 180 * 86_400_000, to = nowMs - 90 * 86_400_000
    return { rows: rows.filter((r) => { const t = r.date ? new Date(r.date).getTime() : NaN; return t >= from && t < to }), label: 'the 90 days before' }
  }
  const nowIso = new Date(nowMs).toISOString()
  const now = torontoMonth(nowIso)
  if (period === 'last') {
    const m = previousMonth(previousMonth(now))
    return { rows: rows.filter((r) => r.date && torontoMonth(r.date) === m), label: monthName(m, true) }
  }
  const m = previousMonth(now)
  const day = torontoDayOfMonth(nowIso)
  return { rows: rows.filter((r) => r.date && torontoMonth(r.date) === m && torontoDayOfMonth(r.date) <= day), label: 'the same days last month' }
}

/** Every total the page shows, from the same rows, so the numbers always agree. */
export function summarize(rows: CashRow[]) {
  const collected = sum(rows.map((r) => r.gross))
  const stripeFees = sum(rows.map((r) => r.stripeFeeUsd ?? 0))
  const supplierPayouts = sum(rows.map((r) => r.supplierPayout))
  const remitlyEst = sum(rows.map((r) => r.remitlyEstUsd))
  return {
    count: rows.length,
    collected,
    giftFunded: sum(rows.map((r) => r.giftFunded)),
    stripeFees,
    supplierPayouts,
    remitlyEst,
    netKept: r2(collected - stripeFees - supplierPayouts - remitlyEst),
    settledCad: rows.some((r) => r.settledCad != null) ? sum(rows.map((r) => r.settledCad ?? 0)) : null,
  }
}

/** Collected per month on the owner's calendar, every month from the first to the last (a month with no sales shows as zero). */
export function monthTotals(rows: CashRow[]): { month: string; collected: number }[] {
  const by = new Map<string, number>()
  for (const r of rows) if (r.date) { const k = torontoMonth(r.date); by.set(k, (by.get(k) ?? 0) + r.gross) }
  const keys = Array.from(by.keys()).sort()
  if (keys.length === 0) return []
  const out: { month: string; collected: number }[] = []
  for (let k = keys[keys.length - 1]; ; k = previousMonth(k)) {
    out.unshift({ month: k, collected: r2(by.get(k) ?? 0) })
    if (k === keys[0]) break
  }
  return out
}

/** Four clean ticks from zero that cover the highest value: [0, 500, 1000, 1500]. */
export function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1, 2, 3]
  const raw = max / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pow).find((s) => s >= raw) ?? 10 * pow
  return [0, step, step * 2, step * 3]
}

function monthName(ym: string, long = false): string {
  return new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' })
}
/** Axis ticks: in full under 10,000, compact above. */
function tick(n: number): string {
  return n >= 10_000 ? `$${Math.round(n / 1000)}K` : `$${n.toLocaleString('en-US')}`
}
/** A label at a column's cap: whole dollars. */
function capLabel(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}
function pct(part: number, whole: number): string {
  if (!(whole > 0)) return ''
  const p = (part / whole) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}

/** Collected by month: single-series columns with a tooltip on hover and keyboard focus, and a table view. */
function MonthChart({ months }: { months: { month: string; collected: number }[] }) {
  const [tip, setTip] = useState<number | null>(null)
  const max = Math.max(...months.map((m) => m.collected))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const last = months.length - 1
  const peak = months.findIndex((m) => m.collected === max)
  // Past eight months the axis names every few, always the latest.
  const every = months.length > 8 ? Math.ceil(months.length / 6) : 1
  return (
    <figure className="adm-cf-chart">
      <div className="adm-cf-plot">
        <div className="adm-cf-grid" aria-hidden="true">
          {ticks.slice().reverse().map((t) => <div key={t} className="adm-cf-gridline"><span className="adm-cf-tick">{tick(t)}</span></div>)}
        </div>
        <div className="adm-cf-cols">
          {months.map((m, i) => {
            const h = top > 0 ? (m.collected / top) * 100 : 0
            const label = `${monthName(m.month, true)}: ${money(m.collected)} collected`
            return (
              <div
                key={m.month} className={tip === i ? 'adm-cf-col is-on' : 'adm-cf-col'} role="img" aria-label={label} tabIndex={0}
                onPointerEnter={() => setTip(i)} onPointerLeave={() => setTip((t) => (t === i ? null : t))}
                onFocus={() => setTip(i)} onBlur={() => setTip((t) => (t === i ? null : t))}
              >
                <div className="adm-cf-bar-wrap">
                  {(i === last || i === peak) && m.collected > 0 && <span className="adm-cf-cap" style={{ bottom: `${h}%` }} aria-hidden="true">{capLabel(m.collected)}</span>}
                  {m.collected > 0 && <div className="adm-cf-bar" style={{ height: `${h}%` }} />}
                </div>
                {tip === i && (
                  <div className={`adm-cf-tip${i === 0 ? ' adm-cf-tip--start' : i === last ? ' adm-cf-tip--end' : ''}`} style={{ bottom: `calc(${Math.min(h, 80)}% + 8px)` }} aria-hidden="true">
                    <strong>{money(m.collected)}</strong>
                    <span>{monthName(m.month, true)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className="adm-cf-xaxis" aria-hidden="true">
        {months.map((m, i) => <span key={m.month}>{i % every === 0 || i === last ? monthName(m.month) : ''}</span>)}
      </div>
      <details className="adm-details">
        <summary>Show the months as a table</summary>
        <table className="adm-table">
          <caption className="visually-hidden">Collected by month</caption>
          <thead><tr><th scope="col">Month</th><th scope="col" className="adm-num">Collected</th></tr></thead>
          <tbody>
            {months.map((m) => <tr key={m.month}><th scope="row">{monthName(m.month, true)}</th><td className="adm-num">{money(m.collected)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export default function CashflowView({ rows }: { rows: CashRow[] }) {
  const [period, setPeriod] = useState<Period>('all')
  const [limit, setLimit] = useState(PAGE)
  const nowMs = useMemo(() => Date.now(), [])
  const shown = useMemo(() => rows.filter((r) => inPeriod(r.date, period, nowMs)), [rows, period, nowMs])
  const t = summarize(shown)
  const months = monthTotals(shown)
  const loss = t.netKept < 0
  const cmp = comparisonFor(rows, period, nowMs)
  const delta = cmp ? r2(t.netKept - summarize(cmp.rows).netKept) : null

  const parts = [
    { key: 'net', label: 'Net kept', value: t.netKept },
    { key: 'payout', label: 'Supplier payouts', value: t.supplierPayouts },
    { key: 'fee', label: 'Stripe fees', value: t.stripeFees },
    { key: 'remit', label: 'Remitly (est.)', value: t.remitlyEst },
  ]
  const drawn = parts.filter((p) => p.value > 0)
  const periodName = PERIODS.find((p) => p.key === period)!.label.toLowerCase()

  return (
    <div className="adm">
      <h1 className="adm-h1">Cash flow</h1>
      <p className="adm-lead">What paid bookings brought in, what they cost, and what MAPL Tours Jamaica kept. Read-only.</p>

      <div className="adm-cf-filter">
        <Segmented label="Period" value={period} onChange={(p) => { setPeriod(p); setLimit(PAGE) }} options={PERIODS} grid />
      </div>

      <div key={period} className="adm-rows">
      {/* The one number the page leads with. */}
      <section className="adm-cf-hero" aria-labelledby="cf-net">
        <h2 id="cf-net" className="adm-kicker">Net kept, {periodName}</h2>
        <p className={loss ? 'adm-cf-hero-v adm-cf-hero-v--loss' : 'adm-cf-hero-v'}>{money(t.netKept)} <span className="adm-cf-cur">USD</span></p>
        {/* The change, in words as well as colour: up is good here. */}
        {cmp && delta != null && (
          <p className={delta > 0 ? 'adm-cf-delta adm-cf-delta--up' : delta < 0 ? 'adm-cf-delta adm-cf-delta--down' : 'adm-cf-delta'}>
            {delta === 0 ? `Level with ${cmp.label}` : <><Arrow dir={delta > 0 ? 'up' : 'down'} place="before" className="ui-arrow--flush" />{delta > 0 ? 'Up' : 'Down'} {money(Math.abs(delta))} on {cmp.label}</>}
          </p>
        )}
        <p className="adm-cf-hero-sub">
          {t.count === 0
            ? 'No paid bookings in this period.'
            : <>After Stripe fees, supplier payouts and Remitly, from {money(t.collected)} collected on {plural(t.count, 'paid booking')}.{t.settledCad != null ? <> Stripe settled C{money(t.settledCad)} after its fees.</> : null}</>}
        </p>
        {loss && <p className="adm-note adm-note--bad">Costs ran {money(-t.netKept)} past what was collected in this period.</p>}
      </section>

      <dl className="adm-tiles">
        <div className="adm-tile"><dt className="adm-kicker">Collected</dt><dd className="adm-tile-v">{money(t.collected)}</dd><dd className="adm-tile-sub">{t.giftFunded > 0 ? `incl. ${money(t.giftFunded)} by gift card` : 'what guests paid'}</dd></div>
        <div className="adm-tile"><dt className="adm-kicker"><span className="adm-cf-sw adm-cf-sw--fee" aria-hidden="true" />Stripe fees</dt><dd className="adm-tile-v">{money(t.stripeFees)}</dd><dd className="adm-tile-sub">processing and conversion</dd></div>
        <div className="adm-tile"><dt className="adm-kicker"><span className="adm-cf-sw adm-cf-sw--payout" aria-hidden="true" />Supplier payouts</dt><dd className="adm-tile-v">{money(t.supplierPayouts)}</dd><dd className="adm-tile-sub">drivers and tour operators</dd></div>
        <div className="adm-tile"><dt className="adm-kicker"><span className="adm-cf-sw adm-cf-sw--remit" aria-hidden="true" />Remitly (est.)</dt><dd className="adm-tile-v">{money(t.remitlyEst)}</dd><dd className="adm-tile-sub">sending the payouts</dd></div>
      </dl>

      {t.collected > 0 && (
        <section className="adm-card adm-cf-card adm-cf-card--split" aria-labelledby="cf-split">
          <div className="adm-card-in">
            <div className="adm-cf-card-head">
              <h2 id="cf-split" className="adm-h3">Where the money went</h2>
              <p className="adm-meta">of {money(t.collected)} collected</p>
            </div>
            {/* The bar is the picture; the list under it is the data. */}
            <div className="adm-cf-split" aria-hidden="true">
              {drawn.map((p) => <span key={p.key} className={`adm-cf-seg adm-cf-sw--${p.key}`} style={{ flexGrow: p.value }} />)}
            </div>
            <ul className="adm-cf-parts">
              {parts.map((p) => (
                <li key={p.key}>
                  <span className={`adm-cf-sw adm-cf-sw--${p.key}`} aria-hidden="true" />
                  <span className="adm-cf-part-name">{p.label}</span>
                  <span className="adm-cf-part-v">{money(p.value)}</span>
                  <span className="adm-cf-part-share">{p.value > 0 ? pct(p.value, t.collected) : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {months.length >= 2 && (
        <section className="adm-card adm-cf-card" aria-labelledby="cf-months">
          <div className="adm-card-in">
            <h2 id="cf-months" className="adm-h3">Collected by month</h2>
            <MonthChart months={months} />
          </div>
        </section>
      )}

      <section className="adm-section" aria-labelledby="cf-tx">
        <h2 id="cf-tx" className="adm-h3">Transactions</h2>
        {shown.length === 0 ? (
          <p className="adm-empty">No paid bookings in this period. 🇯🇲</p>
        ) : (
          <>
            <div className="adm-cf-scroll" role="region" aria-label="Transactions table, scrolls sideways" tabIndex={0}>
              <table className="adm-cf-table">
                <caption className="visually-hidden">Paid bookings, {periodName}, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Paid</th>
                    <th scope="col" className="adm-num">Gross</th>
                    <th scope="col" className="adm-num"><span className="adm-cf-sw adm-cf-sw--fee" aria-hidden="true" />Stripe fees</th>
                    <th scope="col" className="adm-num"><span className="adm-cf-sw adm-cf-sw--payout" aria-hidden="true" />Supplier</th>
                    <th scope="col" className="adm-num"><span className="adm-cf-sw adm-cf-sw--remit" aria-hidden="true" />Remitly (est.)</th>
                    <th scope="col" className="adm-num"><span className="adm-cf-sw adm-cf-sw--net" aria-hidden="true" />Net kept</th>
                    <th scope="col" className="adm-num">Settled (CAD)</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, limit).map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        <span className="adm-cf-who">{r.name}</span>
                        <span className="adm-cf-ref">{r.ref} · {r.type === 'transfer' ? 'Ride' : 'Tour'}</span>
                      </th>
                      <td className="adm-nowrap">{stamp(r.date, true)}</td>
                      <td className="adm-num">{money(r.gross)}{r.giftFunded > 0 && <span className="adm-cf-ref">incl. {money(r.giftFunded)} gift card</span>}</td>
                      <td className="adm-num">{r.stripeFeeUsd != null ? money(-r.stripeFeeUsd) : <span className="adm-quiet">not found</span>}</td>
                      <td className="adm-num">{r.supplierPayout > 0 ? money(-r.supplierPayout) : <span className="adm-quiet">none</span>}</td>
                      <td className="adm-num">{r.remitlyEstUsd > 0 ? money(-r.remitlyEstUsd) : <span className="adm-quiet">none</span>}</td>
                      <td className={r.netUsd < 0 ? 'adm-num adm-cf-net adm-cf-net--loss' : 'adm-num adm-cf-net'}>{money(r.netUsd)}</td>
                      <td className="adm-num">{r.settledCad != null ? `C${money(r.settledCad)}` : <span className="adm-quiet">not found</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total, {plural(t.count, 'booking')}</th>
                    <td />
                    <td className="adm-num">{money(t.collected)}</td>
                    <td className="adm-num">{money(-t.stripeFees)}</td>
                    <td className="adm-num">{money(-t.supplierPayouts)}</td>
                    <td className="adm-num">{money(-t.remitlyEst)}</td>
                    <td className={loss ? 'adm-num adm-cf-net adm-cf-net--loss' : 'adm-num adm-cf-net'}>{money(t.netKept)}</td>
                    <td className="adm-num">{t.settledCad != null ? `C${money(t.settledCad)}` : ''}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {shown.length > limit && (
              <button type="button" className="adm-btn adm-more" onClick={() => setLimit((n) => n + PAGE)}>
                Show {Math.min(PAGE, shown.length - limit)} more
              </button>
            )}
          </>
        )}
      </section>
      </div>
    </div>
  )
}
