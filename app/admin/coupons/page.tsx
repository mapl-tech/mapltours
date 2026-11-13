import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import CouponDesk from '@/components/admin/CouponDesk'

/**
 * Coupon desk.
 *
 * Server component: confirms the caller is an admin (session cookie -> user ->
 * admins allowlist) BEFORE the service-role client is touched, mirroring
 * /admin/gift-cards. Codes are discounts anyone holding them can spend, so
 * this page must never render for anyone else.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The coupons page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap">{children}</div>
    </div>
  )
}

export default async function AdminCouponsPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 className="adm-h1">Coupons</h1>
        <p className="adm-lead">
          Please <Link href="/login?redirect=/admin/coupons" className="adm-inline-link">sign in</Link> to view this page.
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

  return (
    <Shell>
      <CouponDesk />
    </Shell>
  )
}
