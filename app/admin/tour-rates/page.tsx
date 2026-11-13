import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { experiences, defaultRateCard, placeLabel, RATES_PUBLISHED } from '@/lib/experiences'
import { cardOf } from '@/lib/tour-rates'
import { readRateChanges, readSavedRates, type RateChange, type SavedRate } from '@/lib/tour-rates-server'
import TourRatesDesk, { type TourRateView, type RateChangeView } from '@/components/admin/TourRatesDesk'

/**
 * Tour prices: Collin's rate for every tour, edited and published from here.
 *
 * Server component: confirms the caller is an admin (session cookie -> user ->
 * admins allowlist) BEFORE the service-role client is touched, like every
 * other admin page. The rates set what every guest pays, so nobody else may
 * see or change them. How a save reaches the site: lib/tour-rates.ts.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** The desk's page: the .adm classes in app/globals.css, like the desk itself. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap">{children}</div>
    </div>
  )
}

export default async function AdminTourRatesPage() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return (
      <Shell>
        <h1 className="adm-h1">Tour prices</h1>
        <p className="adm-lead">
          Please <Link href="/login?redirect=/admin/tour-rates" className="adm-inline-link">sign in</Link> to view this page.
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

  let saved: SavedRate[] = []
  let changes: RateChange[] = []
  let loadError: string | null = null
  try {
    ;[saved, changes] = await Promise.all([readSavedRates(svc), readRateChanges(svc)])
  } catch (e) {
    console.error('[admin/tour-rates] read failed', e instanceof Error ? e.message : e)
    loadError = 'The saved rates could not be read, so editing is off until they can. Reload in a moment.'
  }

  const byId = new Map(saved.map((s) => [s.experienceId, s]))
  const titles = new Map(experiences.map((e) => [e.id, e.title]))
  const tours: TourRateView[] = experiences.map((e) => {
    const s = byId.get(e.id) ?? null
    return {
      id: e.id,
      title: e.title,
      kind: e.kind === 'package' ? 'package' : 'single',
      place: placeLabel(e),
      live: cardOf(e),
      saved: s ? s.card : null,
      savedAt: s ? s.updatedAt : null,
      savedBy: s ? s.updatedByEmail : null,
      fallback: defaultRateCard(e.id)!,
    }
  })
  const log: RateChangeView[] = changes.map((c) => ({
    id: c.id,
    experienceId: c.experienceId,
    tourTitle: titles.get(c.experienceId) ?? `Tour ${c.experienceId}`,
    action: c.action,
    before: c.before,
    after: c.after,
    by: c.changedByEmail,
    at: c.changedAt,
  }))

  return (
    <Shell>
      <TourRatesDesk
        tours={tours}
        changes={log}
        publishedAt={RATES_PUBLISHED.snapshotAt}
        canPublish={!!process.env.NETLIFY_RATES_BUILD_HOOK}
        loadError={loadError}
      />
    </Shell>
  )
}
