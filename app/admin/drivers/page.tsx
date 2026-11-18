import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import DriverRoster from '@/components/admin/DriverRoster'

/**
 * Drivers: the saved drivers the dispatch console's dropdowns offer
 * (table `drivers`, migration 041). Server component: confirms the caller is
 * an admin before anything else, as every admin screen; the desk then reads
 * and writes through the admin-gated /api/admin/drivers.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap">{children}</div>
    </div>
  )
}

export default async function AdminDriversPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return <Shell><h1 className="adm-h1">Drivers</h1><p className="adm-lead">Please <Link href="/login?redirect=/admin/drivers" className="adm-inline-link">sign in</Link> to view this page.</p></Shell>
  }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 className="adm-h1">Not authorised</h1><p className="adm-lead">This page is limited to MAPL Tours Jamaica admins.</p></Shell>
  }
  return <Shell><DriverRoster /></Shell>
}
