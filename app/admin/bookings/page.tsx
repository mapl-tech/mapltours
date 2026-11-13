import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import BookingsDashboard from '@/components/admin/BookingsDashboard'

/**
 * Admin bookings + abandoned-cart dashboard.
 *
 * Server component: it confirms the caller is an admin (session cookie ->
 * user -> admins allowlist) BEFORE ever touching the service-role client, so
 * customer PII is never exposed to a non-admin. It fetches read-only and
 * hands the rows to a client component that owns the tabs + type filter.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The bookings page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap adm-wrap--wide">{children}</div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default async function AdminBookingsPage({ searchParams }: { searchParams: { booking?: string | string[] } }) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 className="adm-h1">Bookings</h1>
        <p className="adm-lead">
          Please <Link href="/login?redirect=/admin/bookings" className="adm-inline-link">sign in</Link> to view this page.
        </p>
      </Shell>
    )
  }

  // /admin/bookings?booking=<id> opens that booking; only a well-formed id is used.
  const wanted = typeof searchParams.booking === 'string' ? searchParams.booking : null
  const focusId = wanted && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wanted) ? wanted : null

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

  const { data: bookings } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .order('created_at', { ascending: false })
    .limit(300)

  return (
    <Shell>
      <BookingsDashboard bookings={(bookings ?? []) as Row[]} focusId={focusId} />
    </Shell>
  )
}
