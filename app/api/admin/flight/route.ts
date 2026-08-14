import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { lookupFlight } from '@/lib/flightProvider'

/**
 * Authoritative flight status for the dispatch console. Admin-gated, read-only,
 * airline-agnostic (see lib/flightProvider.ts). Without a provider key it
 * returns { configured: false } and the console falls back to deep links.
 */

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  // Auth: admin only.
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const role = url.searchParams.get('role') === 'departure' ? 'departure' as const : 'arrival' as const
  const status = await lookupFlight(url.searchParams.get('flight'), url.searchParams.get('date'), role)
  return NextResponse.json(status)
}
