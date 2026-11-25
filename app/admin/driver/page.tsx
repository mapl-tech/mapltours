import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { driverAllowlist } from '@/lib/driver'
import { getDriverAccess, DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import { loadPortal } from '@/lib/driver-portal-data'
import { firstWord } from '@/lib/dispatch-change-words'
import type { Driver } from '@/lib/drivers'
import DriverDashboard from '@/components/driver/DriverDashboard'

/**
 * Admin preview of the driver portal: renders EXACTLY the same data and
 * component the portal does (lib/driver-portal-data), wrapped in an admin
 * gate. By default the fleet manager's view, as Collin sees it, with every
 * control his has, the Drivers tab's edits included (a change saved here is
 * real, and is logged as from MAPL Tours Jamaica; the routes treat an admin
 * as a fleet manager, so the same limits apply). `?as=<driver id>` shows
 * what that regular driver sees, read-only.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1EB' }}>
      {/* Side gutters match the admin bar above (.adm-bar-in), so the preview lines up under it. */}
      <div style={{ width: '100%', padding: '32px clamp(16px, 3vw, 48px) 80px', fontFamily: dm, color: ink }}>
        {children}
      </div>
    </div>
  )
}

export default async function AdminDriverPreviewPage({ searchParams }: { searchParams?: { as?: string } }) {
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
    const gate = await getDriverAccess()
    if (gate.ok) redirect('/driver')
    return (
      <Shell>
        <h1 style={{ fontWeight: 700, fontSize: 22 }}>Not authorised</h1>
        <p style={{ marginTop: 8, color: soft }}>This page is limited to MAPL Tours Jamaica admins.</p>
        <p style={{ marginTop: 6, color: soft }}>Driving for MAPL Tours Jamaica? Your portal is at <Link href="/driver" style={{ color: ink, fontWeight: 600 }}>mapltours.com/driver</Link>.</p>
      </Shell>
    )
  }

  // Which view: the fleet manager's (default), or one regular driver's.
  const { data: rows } = await svc.from('drivers').select(DRIVER_ROLE_COLS).order('active', { ascending: false }).order('name', { ascending: true })
  const roster = ((rows ?? []) as unknown as (Driver & { role?: string })[])
  const asId = typeof searchParams?.as === 'string' ? searchParams.as : ''
  const as = roster.find((d) => d.id === asId && d.active && d.role !== 'fleet_manager') ?? null
  // The fleet manager's view is shown as the fleet manager sees it (owner, Nov 25 2026: "When I look at
  // the driver portal in the admin page, I need to see the same settings that a Fleet Manager would
  // have"): their name on it, their own row marked, and every control theirs has.
  const fm = roster.find((d) => d.active && d.role === 'fleet_manager') ?? null
  const data = await loadPortal(svc, as ? { role: 'driver', driver: as } : { role: 'fleet_manager', driver: null })

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
      </div>
      <nav aria-label="Preview as" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 16px', fontSize: 14 }}>
        <span style={{ color: soft, fontWeight: 600 }}>Preview as:</span>
        <Link href="/admin/driver" aria-current={!as ? 'page' : undefined} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 9999, border: '1px solid #E7E1D6', background: !as ? ink : '#fff', color: !as ? '#fff' : ink, fontWeight: 600, textDecoration: 'none' }}>Fleet manager</Link>
        {roster.filter((d) => d.active && d.role !== 'fleet_manager').map((d) => (
          <Link key={d.id} href={`/admin/driver?as=${d.id}`} aria-current={as?.id === d.id ? 'page' : undefined} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 9999, border: '1px solid #E7E1D6', background: as?.id === d.id ? ink : '#fff', color: as?.id === d.id ? '#fff' : ink, fontWeight: 600, textDecoration: 'none' }}>{d.name}</Link>
        ))}
      </nav>
      <DriverDashboard
        trips={data.trips}
        tours={data.tours}
        driverLabel={as ? firstWord(as.name) : fm ? firstWord(fm.name) : 'Collin'}
        adminPreview
        role={as ? 'driver' : 'fleet_manager'}
        showPay={!as}
        drivers={data.drivers}
        changes={data.changes}
        incomplete={data.incomplete}
        selfDriverId={as ? as.id : fm?.id ?? null}
      />
    </Shell>
  )
}
