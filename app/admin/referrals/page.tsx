import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { composeAdminView } from '@/lib/referrals/ledger'
import { readLedger } from '@/lib/referrals/server'
import ReferralDesk from '@/components/admin/ReferralDesk'

/**
 * Referrals (lib/referrals, migration 045): the admin's desk. Server
 * component: confirms the caller is an admin before anything is read, as
 * every admin screen; the desk then writes through /api/admin/referrals.
 * No analytics tag runs here (lib/tracker-gate NO_TRACKER_PATHS).
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

export default async function AdminReferralsPage() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) {
    return <Shell><h1 className="adm-h1">Referrals</h1><p className="adm-lead">Please <Link href="/login?redirect=/admin/referrals" className="adm-inline-link">sign in</Link> to view this page.</p></Shell>
  }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 className="adm-h1">Not authorised</h1><p className="adm-lead">This page is limited to MAPL Tours Jamaica admins.</p></Shell>
  }
  let view
  try {
    view = composeAdminView(await readLedger(svc, { events: true }), Date.now())
  } catch (err) {
    console.error('[admin/referrals] read failed', err instanceof Error ? err.message : 'error')
    return <Shell><h1 className="adm-h1">Referrals</h1><p className="adm-lead">The referrals could not be read. If migration 045 has not been applied yet, apply it first, then reload.</p></Shell>
  }
  return <Shell><ReferralDesk initial={view} payoutsOn={process.env.REFERRAL_PAYOUTS_ENABLED === '1'} /></Shell>
}
