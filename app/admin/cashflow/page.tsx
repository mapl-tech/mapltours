import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { supplierPayout, round2, remitlyEstimate } from '@/lib/dispatch'
import { estimatedRateDestinations, driverCost, getTransferPrice } from '@/lib/airport-transfers'
import CashflowView, { type CashRow } from '@/components/admin/CashflowView'

/**
 * Cash-flow dashboard. Server component: confirms the caller is an admin, then
 * reads paid bookings + each charge's exact Stripe fee / CAD settlement with
 * the service role, and hands rows to the client view. Strictly read-only:
 * no charge, no money-column write, no webhook interaction.
 *
 * Currency: customers are charged USD but the Stripe account settles in CAD,
 * so the balance-transaction fee/net are CAD. We show a consistent USD view
 * (fee converted at the transaction rate) plus the real CAD deposited.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm, #F4F1EB)' }}>
      <div style={{ width: '100%', padding: '40px clamp(20px, 3vw, 44px) 90px', fontFamily: dm, color: ink }}>
        {children}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

/** Fetch fee (converted to USD) + net settled (CAD) for one charge. */
async function stripeMoney(paymentId: string | null): Promise<{ feeUsd: number | null; settledCad: number | null }> {
  const empty = { feeUsd: null, settledCad: null }
  if (!paymentId) return empty
  const sk = process.env.STRIPE_SECRET_KEY
  if (!sk) return empty
  const g = async (p: string) => (await fetch(`https://api.stripe.com/v1/${p}`, { cache: 'no-store', headers: { Authorization: `Bearer ${sk}` } })).json()
  try {
    const pi = await g(`payment_intents/${paymentId}`)
    if (!pi.latest_charge) return empty
    const ch = await g(`charges/${pi.latest_charge}`)
    if (!ch.balance_transaction) return empty
    const bt = await g(`balance_transactions/${ch.balance_transaction}`)
    const rate = typeof bt.exchange_rate === 'number' && bt.exchange_rate > 0 ? bt.exchange_rate : 1
    return {
      feeUsd: typeof bt.fee === 'number' ? round2(bt.fee / 100 / rate) : null,
      settledCad: typeof bt.net === 'number' ? round2(bt.net / 100) : null,
    }
  } catch { return empty }
}

export default async function CashflowPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Cash flow</h1><p style={{ marginTop: 8, color: soft }}>Please <Link href="/login?redirect=/admin/cashflow" style={{ color: ink, fontWeight: 600 }}>sign in</Link>.</p></Shell>
  }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Not authorised</h1><p style={{ marginTop: 8, color: soft }}>This dashboard is limited to MAPL admins.</p></Shell>
  }

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, first_name, last_name, booking_type, subtotal, total_paid, stripe_payment_id, paid_at, created_at, booking_items(trip_type)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(500)

  const rows: CashRow[] = await Promise.all(((bookings ?? []) as Row[]).map(async (b) => {
    const { feeUsd, settledCad } = await stripeMoney(b.stripe_payment_id)
    const gross = Number(b.total_paid ?? 0)
    // The supplier (transfer driver OR tour operator) is paid the subtotal in
    // full; MAPL's margin is the fee charged on top (10% + 5% Remitly cover on transfers, 20% tours).
    const supplierCost = supplierPayout(Number(b.subtotal ?? 0))
    // Delivering the payout costs money too: per the current send pattern a
    // round trip is paid in two halves (two Remitly sends), everything else
    // in one. This is the estimate the 5% Remitly cover in pricing exists
    // to fund, so profit is shown AFTER it.
    const isRoundTrip = (b.booking_items as { trip_type?: string }[] | null)?.some((i) => i.trip_type === 'round_trip') ?? false
    const sends = b.booking_type === 'transfer' && isRoundTrip ? 2 : 1
    const remitlyEstUsd = remitlyEstimate(supplierCost, sends)
    return {
      id: b.id,
      ref: 'MAPL-' + b.id.slice(0, 8).toUpperCase(),
      date: b.paid_at ?? b.created_at ?? null,
      name: `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || '(no name)',
      type: (b.booking_type ?? 'tour') as 'tour' | 'transfer',
      gross,
      stripeFeeUsd: feeUsd,
      supplierPayout: supplierCost,
      remitlyEstUsd,
      netUsd: round2(gross - (feeUsd ?? 0) - supplierCost - remitlyEstUsd),
      settledCad,
    }
  }))

  // Driver rates we inferred rather than received from Collins. Surfaced here
  // so they can be confirmed; each is set at or above the nearest quoted
  // resort, so a booking can never sell below cost in the meantime.
  const estimates = estimatedRateDestinations()

  return (
    <Shell>
      <CashflowView rows={rows} />

      {estimates.length > 0 && (
        <section style={{ marginTop: 28, background: '#fff', border: '1px solid #E7E1D6', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', background: '#FCF6E4', borderBottom: '1px solid #F0E4BE' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A5A08' }}>
              Driver rates to confirm with Collin · {estimates.length}
            </span>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <p style={{ fontSize: 13, color: soft, margin: '0 0 12px', lineHeight: 1.55 }}>
              These resorts are not on Collin&rsquo;s rate sheet, so each uses a conservative
              estimate set at or above the nearest quoted resort. Confirm them and the
              customer price updates automatically.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6E6A62' }}>
                    <th style={{ padding: '6px 10px 6px 0', fontWeight: 600 }}>Resort</th>
                    <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>Collin, one-way</th>
                    <th style={{ padding: '6px 10px', fontWeight: 600, textAlign: 'right' }}>Customer, one-way</th>
                    <th style={{ padding: '6px 0 6px 10px', fontWeight: 600, textAlign: 'right' }}>Customer, round trip</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((d) => (
                    <tr key={d.id} style={{ borderTop: '1px solid #F1ECE3' }}>
                      <td style={{ padding: '8px 10px 8px 0' }}>{d.name}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${driverCost(d.id, 'one_way')?.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${getTransferPrice(d.id, 'one_way')?.toFixed(2)}</td>
                      <td style={{ padding: '8px 0 8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>${getTransferPrice(d.id, 'round_trip')?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </Shell>
  )
}
