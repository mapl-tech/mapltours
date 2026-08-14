import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { driverAllowlist, driverTrip, nextActionAt, type DriverTrip } from '@/lib/driver'
import DriverDashboard from '@/components/driver/DriverDashboard'

/**
 * Admin preview of the driver portal: renders EXACTLY the same DriverTrip
 * data and component the driver sees, wrapped in an admin gate, so the
 * operator can verify what Collins sees at any time. Read-only.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EB' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px 80px', fontFamily: dm, color: ink }}>
        {children}
      </div>
    </div>
  )
}

export default async function AdminDriverPreviewPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Driver portal preview</h1><p style={{ marginTop: 8, color: soft }}>Please <Link href="/login?redirect=/admin/driver" style={{ color: ink, fontWeight: 600 }}>sign in</Link>.</p></Shell>
  }
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) {
    return <Shell><h1 style={{ fontWeight: 700, fontSize: 22 }}>Not authorised</h1><p style={{ marginTop: 8, color: soft }}>This page is limited to MAPL admins.</p></Shell>
  }

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, first_name, last_name, phone, subtotal, special_requests, dispatch, booking_items(*)')
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .order('created_at', { ascending: false })
    .limit(100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips = ((bookings ?? []) as any[])
    .map(driverTrip)
    .filter((t): t is DriverTrip => t !== null)
    .sort((a, b) => nextActionAt(a) - nextActionAt(b))

  const allow = driverAllowlist()
  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>Driver portal preview</h1>
          <span style={{ fontSize: 13, color: soft }}>
            {allow.length ? `Approved: ${allow.join(', ')}` : 'No driver emails approved yet (set DRIVER_ALLOWED_EMAILS)'}
          </span>
        </div>
        <Link href="/admin/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9999, border: '1px solid #E7E1D6', background: '#fff', color: ink, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <span aria-hidden="true">←</span> Bookings
        </Link>
      </div>
      <DriverDashboard trips={trips} driverLabel="your driver" adminPreview />
    </Shell>
  )
}
