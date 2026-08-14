import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isAllowedDriver } from '@/lib/driver'
import { normalizeFlight } from '@/lib/flight'
import { lookupFlight } from '@/lib/flightProvider'

/**
 * Live flight status for the driver portal. Read-only. Gated to the driver
 * allowlist (or an admin previewing the portal), and the flight must belong to
 * one of the driver's paid transfer bookings - the endpoint is not a general
 * flight-lookup proxy.
 */

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  let allowed = isAllowedDriver(user.email)
  if (!allowed) {
    // Admins may use the endpoint too (the admin preview renders the same UI).
    const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    allowed = !!adminRow
  }
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const rawFlight = url.searchParams.get('flight')
  const date = url.searchParams.get('date')

  // The requested flight must appear on a paid transfer booking.
  const { iata } = normalizeFlight(rawFlight)
  const { data: rows } = await svc
    .from('bookings')
    .select('id, booking_items(arrival_flight, departure_flight)')
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .limit(300)
  const known = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rows ?? []) as any[]) {
    for (const i of b.booking_items ?? []) {
      const a = normalizeFlight(i.arrival_flight).iata
      const d = normalizeFlight(i.departure_flight).iata
      if (a) known.add(a)
      if (d) known.add(d)
    }
  }
  if (!iata || !known.has(iata)) {
    return NextResponse.json({ error: 'flight_not_on_a_booking' }, { status: 404 })
  }

  const status = await lookupFlight(rawFlight, date)
  return NextResponse.json(status)
}
