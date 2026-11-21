import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { supplierPayout, round2 } from '@/lib/dispatch'
import { feeSourceOf, payoutFees, wiseFeeShares, type Share, type WiseItem, type WisePayout } from '@/lib/payout-fees'
import { readAll } from '@/lib/payouts/store'
import { readPayoutConfig } from '@/lib/payouts/config'
import type { PayPart, PayoutBooking } from '@/lib/payouts/plan'
import CashflowView, { type CashRow } from '@/components/admin/CashflowView'
import CashflowNotes from '@/components/admin/CashflowNotes'

/**
 * Cash-flow dashboard. Server component: confirms the caller is an admin, then
 * reads paid bookings, each charge's exact Stripe fee and settlement, and the
 * Wise payout records with the service role, and hands rows to the client
 * view. Strictly read-only: no charge, no money-column write, no webhook
 * interaction.
 *
 * Currency: customers are charged USD. Until Nov 18 2026 the Stripe account
 * settled in CAD, so those balance transactions carry a CAD fee and net; since
 * then it settles USD charges in USD. We show a consistent USD view (a CAD fee
 * converted at the transaction's own rate) plus what Stripe really paid out,
 * in the currency it paid it in.
 *
 * Payout fees (lib/payout-fees): Wise's own fee where Wise paid the part, its
 * rate where the payout job will, the Remitly estimate where a part was paid
 * by hand before Wise.
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

/** Fetch the fee (converted to USD) and the net Stripe settled, in its own currency, for one charge. */
async function stripeMoney(paymentId: string | null): Promise<{ feeUsd: number | null; settled: number | null; settledCurrency: 'cad' | 'usd' | null }> {
  const empty = { feeUsd: null, settled: null, settledCurrency: null }
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
    // A USD charge settled in USD has no exchange rate: its fee is already dollars.
    const rate = typeof bt.exchange_rate === 'number' && bt.exchange_rate > 0 ? bt.exchange_rate : 1
    const currency = bt.currency === 'cad' || bt.currency === 'usd' ? bt.currency : null
    return {
      feeUsd: typeof bt.fee === 'number' ? round2(bt.fee / 100 / rate) : null,
      settled: typeof bt.net === 'number' && currency ? round2(bt.net / 100) : null,
      settledCurrency: typeof bt.net === 'number' ? currency : null,
    }
  } catch { return empty }
}

/** Every live Wise payout item and its payment's fee, shared out per part; null when the records cannot be read. */
async function wiseShares(svc: ReturnType<typeof createServiceClient>): Promise<Map<string, Share> | null> {
  try {
    const items = await readAll<{ payout_id: string; booking_id: string; part: PayPart; amount_usd: number | string }>(
      (from, to) => svc.from('driver_payout_items').select('payout_id, booking_id, part, amount_usd').eq('active', true).order('id', { ascending: true }).range(from, to),
      'driver_payout_items',
    )
    const payouts = await readAll<{ id: string; amount_usd: number | string; fee_usd: number | string | null }>(
      (from, to) => svc.from('driver_payouts').select('id, amount_usd, fee_usd').order('id', { ascending: true }).range(from, to),
      'driver_payouts',
    )
    const wiseItems: WiseItem[] = items.map((i) => ({ payoutId: String(i.payout_id), bookingId: String(i.booking_id), part: i.part, amountUsd: Number(i.amount_usd) }))
    const wisePayouts: WisePayout[] = payouts.map((p) => ({ id: String(p.id), amountUsd: Number(p.amount_usd), feeUsd: p.fee_usd == null ? null : Number(p.fee_usd) }))
    return wiseFeeShares(wisePayouts, wiseItems)
  } catch (e) {
    console.error('[cashflow] Wise payout records could not be read', e)
    return null
  }
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

  const [{ data: bookings }, shares] = await Promise.all([
    svc
      .from('bookings')
      .select('id, status, first_name, last_name, booking_type, subtotal, booking_fee, coupon_discount, coupon_code, total_paid, gift_card_amount, stripe_payment_id, paid_at, created_at, driver_name, dispatch, booking_items(trip_type, arrival_at, departure_at, date, item_type)')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false, nullsFirst: false })
      .limit(500),
    wiseShares(svc),
  ])
  // The first ride or tour day the payout job pays (PAYOUT_FROM); before it, parts were paid by hand.
  const fromDay = readPayoutConfig(process.env).settings.fromDay

  const rows: CashRow[] = await Promise.all(((bookings ?? []) as Row[]).map(async (b) => {
    const { feeUsd, settled, settledCurrency } = await stripeMoney(b.stripe_payment_id)
    const gross = Number(b.total_paid ?? 0)
    // Part of `gross` may have been paid with a gift card, which is value we
    // were paid for at PURCHASE time — counting it again here would book the
    // same dollar twice. It is carried separately so the cash column reflects
    // what Stripe actually settled for this booking.
    const giftFunded = Number(b.gift_card_amount ?? 0) || 0
    // The supplier (transfer driver OR tour operator) is paid the subtotal in
    // full; MAPL's margin is the fee charged on top.
    const supplierCost = supplierPayout(Number(b.subtotal ?? 0))
    // Delivering the payout costs money too, part by part (lib/payout-fees:
    // Wise's fee, Wise's rate, or Remitly for a half ticked paid by hand), so
    // profit is shown AFTER it.
    const fees = payoutFees(b as PayoutBooking, shares ?? new Map(), fromDay)
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
      payoutFeeUsd: fees.feeUsd,
      payoutFeeSource: feeSourceOf(fees.parts),
      netUsd: round2(gross - (feeUsd ?? 0) - supplierCost - fees.feeUsd),
      settled,
      settledCurrency,
    }
  }))

  return (
    <Shell>
      <CashflowView
        rows={rows}
        notice={shares ? null : 'Wise’s payment records could not be read just now, so every payout fee below is an estimate.'}
      />

      <CashflowNotes />
    </Shell>
  )
}
