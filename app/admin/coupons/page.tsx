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

export default async function AdminCouponsPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 style={{ fontFamily: dm, fontWeight: 700, fontSize: 24, letterSpacing: '-0.02em' }}>Coupons</h1>
        <p style={{ marginTop: 10, color: soft }}>
          Please <Link href="/login?redirect=/admin/coupons" style={{ color: ink, fontWeight: 600 }}>sign in</Link> to view this page.
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
        <p style={{ marginTop: 10, color: soft }}>This dashboard is limited to MAPL Tours admins.</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <CouponDesk />
    </Shell>
  )
}
