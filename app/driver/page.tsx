import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { driverTrip, driverTour, isAllowedDriver, nextActionAt, type DriverTrip, type DriverTour } from '@/lib/driver'
import DriverDashboard from '@/components/driver/DriverDashboard'
import DriverShell from '@/components/driver/DriverShell'

/**
 * Driver portal. Server component: requires a signed-in user whose email is on
 * the DRIVER_ALLOWED_EMAILS allowlist (Google sign-in via /driver/login).
 * Builds driver-safe DriverTrip rows server-side, so customer totals, fees and
 * margin never reach the browser. Read-only: no writes anywhere.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function DriverPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) redirect('/driver/login')
  if (!isAllowedDriver(user.email)) redirect('/driver/login?error=not_allowed')

  const svc = createServiceClient()
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

  // Tours: itinerary only; the select carries no price columns at all.
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

  const label = user.email?.split('@')[0] ?? 'Driver'
  return (
    <DriverShell signedInAs={user.email ?? ''}>
      <DriverDashboard trips={trips} tours={tours} driverLabel={label.charAt(0).toUpperCase() + label.slice(1)} />
    </DriverShell>
  )
}
