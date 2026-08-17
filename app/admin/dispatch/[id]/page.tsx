import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import DispatchConsole from '@/components/admin/DispatchConsole'
import { driverNotifyEmail } from '@/lib/email/send'

/**
 * Transfer dispatch console (per booking). Server component: confirms the
 * caller is an admin, then fetches the booking + the exact Stripe fee with the
 * service role, and hands off to the client console. Read-only reads here; all
 * writes go through the admin-gated /api/admin/dispatch route.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const dm = 'var(--font-dm-sans)'
const ink = 'var(--text-primary, #171614)'
const soft = 'var(--text-secondary, #57534C)'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm, #F4F1EB)' }}>
      <div style={{ width: '100%', maxWidth: 1500, margin: '0 auto', padding: '40px clamp(20px, 3vw, 44px) 90px', fontFamily: dm, color: ink }}>
        {children}
      </div>
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
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Dispatch</h1><p style={{ marginTop: 8, color: soft }}>Please <Link href={`/login?redirect=/admin/dispatch/${params.id}`} style={{ color: ink, fontWeight: 600 }}>sign in</Link>.</p></Shell>
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Not authorised</h1><p style={{ marginTop: 8, color: soft }}>This page is limited to MAPL Tours admins.</p></Shell>
  }

  const { data: booking } = await svc.from('bookings').select('*, booking_items(*)').eq('id', params.id).maybeSingle()
  if (!booking) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Booking not found</h1><p style={{ marginTop: 8 }}><Link href="/admin/bookings" style={{ color: ink, fontWeight: 600 }}>Back to bookings</Link></p></Shell>
  }
  if (booking.booking_type !== 'transfer') {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Not a transfer</h1><p style={{ marginTop: 8, color: soft }}>The dispatch console is for airport transfers. <Link href="/admin/bookings" style={{ color: ink, fontWeight: 600 }}>Back to bookings</Link></p></Shell>
  }

  const stripeFee = await stripeFeeFor(booking.stripe_payment_id)

  return (
    <Shell>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <DispatchConsole booking={booking as any} stripeFee={stripeFee} driverEmailConfigured={!!driverNotifyEmail()} />
    </Shell>
  )
}
