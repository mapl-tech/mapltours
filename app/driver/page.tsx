import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getDriverAccess } from '@/lib/driver-access-server'
import { loadPortal } from '@/lib/driver-portal-data'
import { firstWord } from '@/lib/dispatch-change-words'
import DriverDashboard from '@/components/driver/DriverDashboard'
import DriverShell from '@/components/driver/DriverShell'

/**
 * Driver portal. Server component: the signed-in address decides the role
 * (lib/driver-access): a fleet manager sees every ride and tour and can
 * change who drives and when; a regular driver sees only the rides and tours
 * that name them, with no pay (lib/driver-portal-data filters on the server,
 * so nothing else reaches their browser). Customer totals, fees and margin
 * never reach any driver's browser.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function DriverPage() {
  const gate = await getDriverAccess()
  if (!gate.ok) {
    if (gate.denied === 'not_signed_in') redirect('/driver/login')
    redirect(`/driver/login?error=${gate.denied === 'retired' ? 'retired' : gate.denied === 'unavailable' ? 'unavailable' : 'not_allowed'}`)
  }
  const { access } = gate
  const data = await loadPortal(createServiceClient(), access)
  const fleet = access.role === 'fleet_manager'
  return (
    <DriverShell signedInAs={access.email}>
      <DriverDashboard
        trips={data.trips}
        tours={data.tours}
        driverLabel={firstWord(access.label)}
        role={access.role}
        showPay={fleet}
        drivers={data.drivers}
        changes={data.changes}
        incomplete={data.incomplete}
        selfDriverId={access.driver?.id ?? null}
      />
    </DriverShell>
  )
}
