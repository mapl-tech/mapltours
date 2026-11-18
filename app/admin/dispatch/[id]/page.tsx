import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import DispatchConsole from '@/components/admin/DispatchConsole'
import { driverNotifyEmail } from '@/lib/email/send'
import { DRIVER_COLS, type Driver } from '@/lib/drivers'

/**
 * Transfer dispatch console (per booking). Server component: confirms the
 * caller is an admin, then fetches the booking + the exact Stripe fee with the
 * service role, and hands off to the client console. Read-only reads here; all
 * writes go through the admin-gated /api/admin/dispatch route.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The dispatch page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap adm-wrap--wide">{children}</div>
    </div>
  )
}

async function stripeFeeFor(paymentId: string | null): Promise<number | null> {
  if (!paymentId) return null
  const sk = process.env.STRIPE_SECRET_KEY
  if (!sk) return null
  const g = async (path: string) => (await fetch(`https://api.stripe.com/v1/${path}`, { cache: 'no-store', headers: { Authorization: `Bearer ${sk}` } })).json()
  try {
    const pi = await g(`payment_intents/${paymentId}`)
    if (!pi.latest_charge) return null
    const ch = await g(`charges/${pi.latest_charge}`)
    if (!ch.balance_transaction) return null
    const bt = await g(`balance_transactions/${ch.balance_transaction}`)
    if (typeof bt.fee !== 'number') return null
    // The account settles in CAD but charges are USD, so the balance-transaction
    // fee is in CAD. Convert it back to the charge (USD) currency with the
    // transaction's exchange rate so the all-USD money card stays consistent.
    const rate = typeof bt.exchange_rate === 'number' && bt.exchange_rate > 0 ? bt.exchange_rate : 1
    return Math.round((bt.fee / 100 / rate) * 100) / 100
  } catch { return null }
}

export default async function DispatchPage({ params }: { params: { id: string } }) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return <Shell><h1 className="adm-h1">Dispatch</h1><p className="adm-lead">Please <Link href={`/login?redirect=/admin/dispatch/${params.id}`} className="adm-inline-link">sign in</Link> to view this page.</p></Shell>
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 className="adm-h1">Not authorised</h1><p className="adm-lead">This page is limited to MAPL Tours Jamaica admins.</p></Shell>
  }

  const { data: booking } = await svc.from('bookings').select('*, booking_items(*)').eq('id', params.id).maybeSingle()
  if (!booking) {
    return <Shell><h1 className="adm-h1">Booking not found</h1><p className="adm-lead"><Link href="/admin/bookings" className="adm-inline-link">Back to bookings</Link></p></Shell>
  }
  if (booking.booking_type !== 'transfer') {
    return <Shell><h1 className="adm-h1">Not a transfer</h1><p className="adm-lead">The dispatch console is for airport transfers. <Link href="/admin/bookings" className="adm-inline-link">Back to bookings</Link></p></Shell>
  }

  const stripeFee = await stripeFeeFor(booking.stripe_payment_id)
  // The saved drivers for the dropdowns. Unreadable (say, before migration 041
  // is applied) is null, and the console says so instead of failing the page.
  const { data: driverRows, error: driversErr } = await svc.from('drivers').select(DRIVER_COLS).order('name', { ascending: true })
  if (driversErr) console.error('[dispatch] saved drivers unreadable', driversErr.message)
  const drivers = driversErr ? null : ((driverRows ?? []) as Driver[])

  return (
    <Shell>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <DispatchConsole booking={booking as any} stripeFee={stripeFee} driverEmailConfigured={!!driverNotifyEmail()} drivers={drivers} />
    </Shell>
  )
}
