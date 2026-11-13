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

/** The preview page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap">{children}</div>
    </div>
  )
}

export default async function AdminDriverPreviewPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return <Shell><h1 className="adm-h1">Driver portal</h1><p className="adm-lead">Please <Link href="/login?redirect=/admin/driver" className="adm-inline-link">sign in</Link> to view this page.</p></Shell>
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
        <h1 className="adm-h1">Not authorised</h1>
        <p className="adm-lead">This page is limited to MAPL Tours Jamaica admins.</p>
        <p className="adm-lead">Driving for MAPL Tours Jamaica? Your portal is at <Link href="/driver" className="adm-inline-link">mapltours.com/driver</Link>.</p>
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
      {/* The portal at the width the driver sees it, with its own h1 ("Your trips") and the preview banner. */}
      <div className="adm-drv-preview">
        <p className="adm-meta adm-drv-allow">
          {allow.length ? `Can sign in to the driver portal: ${allow.join(', ')}` : 'No driver can sign in yet (set DRIVER_ALLOWED_EMAILS).'}
        </p>
        <DriverDashboard trips={trips} tours={tours} driverLabel="your driver" adminPreview />
      </div>
    </Shell>
  )
}
