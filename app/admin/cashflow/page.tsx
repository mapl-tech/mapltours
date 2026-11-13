import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { supplierPayout, round2, remitlyEstimate } from '@/lib/dispatch'
import CashflowView, { type CashRow } from '@/components/admin/CashflowView'
import CashflowNotes from '@/components/admin/CashflowNotes'

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

/** The cash-flow page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap adm-wrap--wide">{children}</div>
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
    return <Shell><h1 className="adm-h1">Cash flow</h1><p className="adm-lead">Please <Link href="/login?redirect=/admin/cashflow" className="adm-inline-link">sign in</Link> to view this page.</p></Shell>
  }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 className="adm-h1">Not authorised</h1><p className="adm-lead">This dashboard is limited to MAPL Tours Jamaica admins.</p></Shell>
  }

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, first_name, last_name, booking_type, subtotal, total_paid, gift_card_amount, stripe_payment_id, paid_at, created_at, booking_items(trip_type)')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .limit(500)

  const rows: CashRow[] = await Promise.all(((bookings ?? []) as Row[]).map(async (b) => {
    const { feeUsd, settledCad } = await stripeMoney(b.stripe_payment_id)
    const gross = Number(b.total_paid ?? 0)
    // Part of `gross` may have been paid with a gift card, which is value we
    // were paid for at PURCHASE time — counting it again here would book the
    // same dollar twice. It is carried separately so the cash column reflects
    // what Stripe actually settled for this booking.
    const giftFunded = Number(b.gift_card_amount ?? 0) || 0
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
      giftFunded,
      cashCollected: round2(gross - giftFunded),
      stripeFeeUsd: feeUsd,
      supplierPayout: supplierCost,
      remitlyEstUsd,
      netUsd: round2(gross - (feeUsd ?? 0) - supplierCost - remitlyEstUsd),
      settledCad,
    }
  }))

  return (
    <Shell>
      <CashflowView rows={rows} />

      <CashflowNotes />
    </Shell>
  )
}
