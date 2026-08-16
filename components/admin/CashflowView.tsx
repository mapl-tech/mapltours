'use client'

import { useState } from 'react'
import Link from 'next/link'

export interface CashRow {
  id: string
  ref: string
  date: string | null
  name: string
  type: 'tour' | 'transfer'
  gross: number
  stripeFeeUsd: number | null
  supplierPayout: number
  remitlyEstUsd: number
  netUsd: number
  settledCad: number | null
}

/* Validated categorical palette (dataviz validator, light surface, all checks pass):
   net = green, driver payouts = blue, Stripe fees = copper. */
const C = { net: '#1D7A50', payout: '#2F6FB0', fee: '#B87333', remit: '#6E4694' }
// Darker copper for fee TEXT (the #B87333 fill is only 3.79:1 on white, which
// fails AA for small text). Fills/swatches keep the validated hue; text uses this.
const FEE_TEXT = '#8A5320'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'
const faint = '#6E6A62' // AA-passing tertiary
const border = '1px solid var(--border, #E7E1D6)'
const borderSoft = '1px solid var(--border-subtle, #F1ECE3)'
const tnum = { fontVariantNumeric: 'tabular-nums' as const }
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: faint, margin: 0 }

function usd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function monthLabel(ym: string): string {
  try { return new Date(ym + '-01T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: '2-digit' }) } catch { return ym }
}
function dateShort(iso: string | null): string {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) } catch { return String(iso) }
}
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

export default function CashflowView({ rows }: { rows: CashRow[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)

  const collected = sum(rows.map((r) => r.gross))
  const stripeFees = sum(rows.map((r) => r.stripeFeeUsd ?? 0))
  const supplierPayouts = sum(rows.map((r) => r.supplierPayout))
  const remitlyEst = sum(rows.map((r) => r.remitlyEstUsd))
  const netKept = Math.round((collected - stripeFees - supplierPayouts - remitlyEst) * 100) / 100
  const settledCad = rows.some((r) => r.settledCad != null) ? sum(rows.map((r) => r.settledCad ?? 0)) : null
  const hasTour = rows.some((r) => r.type === 'tour')

  const byMonth: Record<string, number> = {}
  for (const r of rows) if (r.date) { const k = r.date.slice(0, 7); byMonth[k] = (byMonth[k] ?? 0) + r.gross }
  const months = Object.keys(byMonth).sort()
  const monthMax = Math.max(1, ...Object.values(byMonth))

  const parts = [
    { key: 'net', label: 'Net kept', value: netKept, color: C.net },
    { key: 'payout', label: 'Supplier payouts', value: supplierPayouts, color: C.payout },
    { key: 'fee', label: 'Stripe fees', value: stripeFees, color: C.fee },
    { key: 'remit', label: 'Remitly (est.)', value: remitlyEst, color: C.remit },
  ].filter((p) => p.value > 0)

  const kpis = [
    { label: 'Collected', value: usd(collected), sub: `${rows.length} paid ${rows.length === 1 ? 'booking' : 'bookings'}`, color: ink },
    { label: 'Stripe fees', value: usd(stripeFees), sub: 'processing + FX, in USD', color: C.fee },
    { label: 'Supplier payouts', value: usd(supplierPayouts), sub: 'drivers + tour operators', color: C.payout },
    { label: 'Remitly (est.)', value: usd(remitlyEst), sub: 'cost of sending the payouts', color: C.remit },
    { label: 'Net kept', value: usd(netKept), sub: settledCad != null ? `${usd(settledCad).replace('$', '')} CAD settled` : 'after fees, payouts + Remitly', color: C.net, hero: true },
  ]

  return (
    <div style={{ fontFamily: dm, color: ink, position: 'relative' }} onMouseLeave={() => setTip(null)}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-0.025em', margin: 0 }}>Cash flow</h1>
          <Link href="/admin/bookings" style={{ fontSize: 13, fontWeight: 600, color: soft, textDecoration: 'none' }}>← Bookings</Link>
        </div>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9999, border, background: '#fff', color: ink, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <span aria-hidden="true">←</span> Back to website
        </Link>
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginTop: 22 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border, borderRadius: 14, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            {k.hero && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: C.net }} />}
            <div style={label}>{k.label}</div>
            <div style={{ fontWeight: 800, fontSize: k.hero ? 34 : 30, letterSpacing: '-0.02em', marginTop: 8, color: k.hero ? C.net : ink, ...tnum }}>{k.value}</div>
            <div style={{ fontSize: 12, color: soft, marginTop: 2, ...tnum }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Where revenue goes */}
      <section style={{ background: '#fff', border, borderRadius: 14, padding: '20px 22px', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>Where your revenue goes</h2>
          <span style={{ fontSize: 12, color: faint, ...tnum }}>of {usd(collected)} collected</span>
        </div>

        {collected > 0 ? (
          <>
            <div style={{ display: 'flex', gap: 2, marginTop: 16, height: 46, borderRadius: 8, overflow: 'hidden' }}>
              {parts.map((p) => {
                const pct = (p.value / collected) * 100
                return (
                  <div
                    key={p.key}
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [p.label, `${usd(p.value)} (${pct.toFixed(1)}%)`] })}
                    style={{ flex: `${p.value} 0 0`, minWidth: 3, background: p.color, display: 'flex', alignItems: 'center', paddingLeft: 12, color: '#fff', cursor: 'default' }}
                  >
                    {pct >= 12 && <span style={{ fontSize: 12, fontWeight: 700, ...tnum }}>{Math.round(pct)}%</span>}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
              {parts.map((p) => (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: soft }}>{p.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, ...tnum }}>{usd(p.value)}</span>
                </div>
              ))}
            </div>
          </>
        ) : <p style={{ marginTop: 14, color: faint, fontSize: 13 }}>No paid revenue yet.</p>}
      </section>

      {/* Monthly collected */}
      {months.length > 0 && (
        <section style={{ background: '#fff', border, borderRadius: 14, padding: '20px 22px', marginTop: 16 }}>
          <h2 style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>Collected by month</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, height: 180, marginTop: 20, paddingBottom: 2 }}>
            {months.map((mo) => {
              const v = byMonth[mo]
              const h = Math.max(4, (v / monthMax) * 140)
              return (
                <div key={mo} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: '0 0 auto', minWidth: 54 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, ...tnum }}>{usd(v).replace('.00', '')}</span>
                  <div
                    onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [monthLabel(mo), usd(v)] })}
                    style={{ width: 40, height: h, background: ink, borderRadius: '5px 5px 2px 2px', transition: 'height 0.3s ease', cursor: 'default' }}
                  />
                  <span style={{ fontSize: 12, color: faint, ...tnum }}>{monthLabel(mo)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Transactions table */}
      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', margin: '0 0 12px' }}>Transactions</h2>
        <div tabIndex={0} role="region" aria-label="Transactions table" style={{ overflowX: 'auto', border, borderRadius: 14, background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: faint, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {['Date', 'Booking', 'Customer', 'Type', 'Gross', 'Stripe (USD)', 'Driver', 'Remitly (est.)', 'Net kept', 'Settled (CAD)'].map((h, i) => (
                  <th key={h} style={{ padding: '12px 16px', fontWeight: 600, textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} style={{ padding: 22, color: faint, textAlign: 'center' }}>No paid bookings yet.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: borderSoft }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: soft, ...tnum }}>{dateShort(r.date)}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, whiteSpace: 'nowrap', ...tnum }}>{r.ref}</td>
                  <td style={{ padding: '12px 16px' }}>{r.name}</td>
                  <td style={{ padding: '12px 16px', textTransform: 'capitalize', color: soft }}>{r.type}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', ...tnum }}>{usd(r.gross)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: FEE_TEXT, ...tnum }}>{r.stripeFeeUsd != null ? '- ' + usd(r.stripeFeeUsd) : '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: r.supplierPayout > 0 ? C.payout : faint, ...tnum }}>{r.supplierPayout > 0 ? '- ' + usd(r.supplierPayout) : '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: r.remitlyEstUsd > 0 ? C.remit : faint, ...tnum }}>{r.remitlyEstUsd > 0 ? '- ' + usd(r.remitlyEstUsd) : '-'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: r.netUsd < 0 ? '#8A2A0A' : C.net, ...tnum }}>{usd(r.netUsd)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: soft, ...tnum }}>{r.settledCad != null ? usd(r.settledCad) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ fontSize: 12, color: faint, marginTop: 16, lineHeight: 1.55, maxWidth: 760 }}>
        Figures are in USD (the currency customers are charged). Your Stripe account is Canadian and settles in CAD, so each Stripe fee (processing plus currency conversion) is converted to USD at the transaction rate, and the actual amount deposited is shown as Settled (CAD). Pricing since Aug 15 builds in a 10% margin, a 5% Remitly cover, and card processing on top of the supplier&rsquo;s rate, with round trips at 90% of double the one-way base (Collin&rsquo;s discount). The Remitly column estimates what sending each payout costs (about $2.90 flat per send plus 2.1% FX, two sends for a round trip paid in halves), so Net kept is profit after EVERYTHING. Bookings paid before Aug 15 were priced under the old 10%-only model, which is why some show thin or negative nets: that is the real history, and the new pricing exists to fix it. Batching payouts into one weekly send cuts the Remitly cost sharply.{hasTour ? ' Tour supplier costs (guides and creators) are not tracked yet, so the net kept on tour bookings is shown before any supplier payout.' : ''}
      </p>

      {tip && (
        <div style={{ position: 'fixed', left: tip.x + 14, top: tip.y + 14, zIndex: 50, background: ink, color: '#fff', borderRadius: 8, padding: '8px 11px', fontSize: 12, pointerEvents: 'none', boxShadow: '0 6px 22px rgba(0,0,0,0.25)' }}>
          {tip.lines.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 500, ...tnum }}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
