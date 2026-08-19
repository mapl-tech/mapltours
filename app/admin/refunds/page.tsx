import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import RefundQueue from '@/components/admin/RefundQueue'

/**
 * Refund approval queue.
 *
 * Server component: confirms the caller is an admin (session cookie -> user
 * -> admins allowlist) BEFORE touching the service-role client, so customer
 * PII never reaches a non-admin. Mirrors /admin/bookings.
 *
 * Pending requests are listed first because they are the only rows that need
 * a human; decided ones follow as an audit trail.
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

export default async function AdminRefundsPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Refunds</h1>
        <p style={{ marginTop: 10, color: soft }}>
          Please <Link href="/login?redirect=/admin/refunds" style={{ color: ink, fontWeight: 600 }}>sign in</Link> to view this page.
        </p>
      </Shell>
    )
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Not authorised</h1>
        <p style={{ marginTop: 10, color: soft }}>This dashboard is limited to MAPL TOURS admins.</p>
      </Shell>
    )
  }

  const { data: rows } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .neq('refund_state', 'none')
    .order('refund_requested_at', { ascending: false })
    .limit(200)

  return (
    <Shell>
      <RefundQueue rows={(rows ?? []) as Row[]} />
    </Shell>
  )
}
