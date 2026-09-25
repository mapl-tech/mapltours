import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { driverAllowlist, driverTrip, driverTour, isAllowedDriver, nextActionAt, type DriverTrip, type DriverTour, transferLegWindow } from '@/lib/driver'
import DriverDashboard from '@/components/driver/DriverDashboard'

/**
 * Admin preview of the driver portal: renders EXACTLY the same DriverTrip
 * data and component the driver sees, wrapped in an admin gate, so the
 * operator can verify what Collin sees at any time. Read-only.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EB' }}>
      <div style={{ width: '100%', padding: '32px clamp(16px, 2.5vw, 32px) 80px', fontFamily: dm, color: ink }}>
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
    // A driver who lands on the admin preview by mistake belongs in his own
    // portal; send him there instead of a dead end. (Observed: Collins hit
    // this page 6x from Kingston on launch day.)
    if (isAllowedDriver(user.email)) redirect('/driver')
    return (
      <Shell>
        <h1 style={{ fontWeight: 700, fontSize: 22 }}>Not authorised</h1>
        <p style={{ marginTop: 8, color: soft }}>This page is limited to MAPL Tours admins.</p>
        <p style={{ marginTop: 6, color: soft }}>Driving for MAPL Tours? Your portal is at <Link href="/driver" style={{ color: ink, fontWeight: 600 }}>mapltours.com/driver</Link>.</p>
      </Shell>
    )
  }

  // Bounded by LEG TIME, not row age: newest-100-by-created_at let history
  // crowd upcoming pickups off the list once the table outgrew the cap. One
  // inner-join query, so no id list to overflow a URL; ordered so the 500 cap
  // is a deterministic page rather than an arbitrary sample; error LOGGED,
  // because an outage that renders as "no upcoming trips" strands a driver.
  // 45 days back, because the list is also the payout ledger: a past leg
  // stays here until its payout is marked paid, and a one-day window hid
  // unpaid rides from both the driver and the operator. 500 rows because
  // created_at ASC pages from the OLDEST booking in the window; at 200, a
  // long payout backlog could push the newest-booked pickups off the end.
  const { orFilter } = transferLegWindow(Date.now(), { backDays: 45 })
  const { data: bookings, error: bookingsErr } = await svc
    .from('bookings')
    .select('id, first_name, last_name, phone, subtotal, special_requests, dispatch, booking_items!inner(*)')
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .or(orFilter, { referencedTable: 'booking_items' })
    .order('created_at', { ascending: true })
    .limit(500)
  if (bookingsErr) console.error('[driver-portal] window query failed', bookingsErr)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trips = ((bookings ?? []) as any[])
    .map(driverTrip)
    .filter((t): t is DriverTrip => t !== null)
    .sort((a, b) => nextActionAt(a) - nextActionAt(b))

  const { data: tourRows } = await svc
    .from('bookings')
    .select('id, first_name, last_name, phone, special_requests, booking_items(title, destination, date, travelers)')
    .eq('status', 'paid')
    .eq('booking_type', 'tour')
    .order('created_at', { ascending: false })
    .limit(100)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tours = ((tourRows ?? []) as any[])
    .map(driverTour)
    .filter((t): t is DriverTour => t !== null)
    .sort((a, b) => (a.firstDate ?? '9999').localeCompare(b.firstDate ?? '9999'))

  const allow = driverAllowlist()
  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mapl-logo.svg" alt="MAPL Tours Jamaica" style={{ height: 52, width: 'auto', display: 'block', margin: '-10px 0' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', margin: 0 }}>Driver portal preview</h1>
            <span style={{ fontSize: 13, color: soft }}>
              {allow.length ? `Approved: ${allow.join(', ')}` : 'No driver emails approved yet (set DRIVER_ALLOWED_EMAILS)'}
            </span>
          </div>
        </div>
        <Link href="/admin/bookings" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 44, padding: '0 18px', borderRadius: 9999, border: '1px solid #E7E1D6', background: '#fff', color: ink, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <span aria-hidden="true">←</span> Bookings
        </Link>
      </div>
      <DriverDashboard trips={trips} tours={tours} driverLabel="your driver" adminPreview />
    </Shell>
  )
}
