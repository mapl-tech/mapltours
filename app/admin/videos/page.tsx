'use client'

/**
 * /admin/videos - moderation queue for user-submitted tour videos.
 *
 * Access is gated by the `admins` allowlist (see migration 003). The RLS
 * policies let admins read every row; non-admins hit a "Not authorised" wall.
 * Approving a video triggers the DB function that may unlock a 5%-off reward.
 * The queue itself (filters, cards, decisions) is components/admin/VideoQueue.
 */

import Link from 'next/link'
import { useAdminVideoQueue, useIsAdmin, moderateVideo } from '@/lib/tour-videos'
import { useAuth } from '@/lib/supabase/auth-context'
import VideoQueue from '@/components/admin/VideoQueue'

export default function AdminVideosPage() {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  // The whole recent queue at once, so the filters can show live counts and
  // switching between them is instant (no refetch per filter).
  const { videos, loading, refresh } = useAdminVideoQueue('all')

  if (authLoading || adminLoading) {
    return <Shell><h1 className="adm-h1">Videos</h1><p className="adm-lead">Checking access…</p></Shell>
  }
  if (!user) {
    return (
      <Shell>
        <h1 className="adm-h1">Videos</h1>
        <p className="adm-lead">Please <Link href="/login?redirect=/admin/videos" className="adm-inline-link">sign in</Link> to view this page.</p>
      </Shell>
    )
  }
  if (!isAdmin) {
    return (
      <Shell>
        <h1 className="adm-h1">Not authorised</h1>
        <p className="adm-lead">This dashboard is limited to MAPL Tours Jamaica admins.</p>
      </Shell>
    )
  }
  return (
    <Shell>
      <VideoQueue videos={videos} loading={loading} refresh={refresh} moderate={moderateVideo} />
    </Shell>
  )
}

/** The videos page: the .adm classes in app/globals.css, like every admin screen. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="adm-page">
      <div className="adm adm-wrap adm-wrap--wide">{children}</div>
    </div>
  )
}
