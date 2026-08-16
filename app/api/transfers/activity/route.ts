import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Real booking activity for the transfers page social-proof line.
 *
 * Returns AGGREGATES ONLY, never guest data: counts by window, plus the age
 * and route shape of the most recent PAID transfer. The client renders the
 * strongest claim these numbers make true, and renders nothing when they are
 * not worth saying. Honest by construction: every figure is a database count.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const svc = createServiceClient()
  const now = Date.now()
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

  const base = () => svc
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('booking_type', 'transfer')
    .eq('status', 'paid')

  const [h24, d7, d30, last] = await Promise.all([
    base().gte('paid_at', iso(24 * 3_600_000)),
    base().gte('paid_at', iso(7 * 24 * 3_600_000)),
    base().gte('paid_at', iso(30 * 24 * 3_600_000)),
    svc
      .from('bookings')
      .select('paid_at, booking_items(hotel, trip_type)')
      .eq('booking_type', 'transfer')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const lastRow = last.data
  const item = (lastRow?.booking_items as { hotel?: string; trip_type?: string }[] | null)?.[0]
  const lastAgoMin = lastRow?.paid_at
    ? Math.max(1, Math.round((now - Date.parse(lastRow.paid_at)) / 60_000))
    : null

  return NextResponse.json(
    {
      count24h: h24.count ?? 0,
      count7d: d7.count ?? 0,
      count30d: d30.count ?? 0,
      lastAgoMin,
      lastTrip: item?.trip_type === 'round_trip' ? 'round trip' : 'transfer',
      lastHotel: item?.hotel ?? null,
    },
    { headers: { 'cache-control': 'public, max-age=120, stale-while-revalidate=300' } },
  )
}
