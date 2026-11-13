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

/** The refunds page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap">{children}</div>
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
        <h1 className="adm-h1">Refunds</h1>
        <p className="adm-lead">
          Please <Link href="/login?redirect=/admin/refunds" className="adm-inline-link">sign in</Link> to view this page.
        </p>
      </Shell>
    )
  }

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return (
      <Shell>
        <h1 className="adm-h1">Not authorised</h1>
        <p className="adm-lead">This dashboard is limited to MAPL Tours Jamaica admins.</p>
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
