import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { transferLegWindow } from '@/lib/driver'
import { getDriverAccess } from '@/lib/driver-access-server'
import { bookingIsTheirs } from '@/lib/driver-access'
import { normalizeFlight } from '@/lib/flight'
import { lookupFlight } from '@/lib/flightProvider'

/**
 * Live flight status for the driver portal. Read-only. Open to whoever the
 * portal opens for (lib/driver-access: a fleet manager, a regular driver, an
 * admin previewing it), and the flight must belong to a paid transfer booking
 * in the working window: for a regular driver, one of the bookings that name
 * them (Nov 24 2026). The endpoint is not a general flight-lookup proxy.
 */

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const gate = await getDriverAccess()
  if (!gate.ok) {
    if (gate.denied === 'not_signed_in') return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    return NextResponse.json({ error: gate.denied === 'unavailable' ? 'unavailable' : 'forbidden' }, { status: gate.denied === 'unavailable' ? 503 : 403 })
  }
  const mine = gate.access.role === 'fleet_manager' ? null : gate.access.driver
  if (gate.access.role !== 'fleet_manager' && !mine) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const svc = createServiceClient()

  const url = new URL(request.url)
  const rawFlight = url.searchParams.get('flight')
  const date = url.searchParams.get('date')

  // The requested flight must appear on a paid transfer booking whose leg is
  // inside the driver's working window. The old scan took the 300 NEWEST
  // bookings by row age, so once history outgrew the cap a legitimate lookup
  // for an upcoming pickup started 404ing, the same starvation the portal
  // itself had. The window query is the one the portal now uses.
  const { iata } = normalizeFlight(rawFlight)
  const { orFilter } = transferLegWindow()
  const { data: rows, error: flightErr } = await svc
    .from('bookings')
    .select('id, driver_name, booking_items!inner(arrival_flight, departure_flight)')
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .or(orFilter, { referencedTable: 'booking_items' })
    .limit(500)
  if (flightErr) console.error('[driver-flight] window query failed', flightErr)
  const known = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rows ?? []) as any[]) {
    if (mine && !bookingIsTheirs(b, mine)) continue
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

  const role = url.searchParams.get('role') === 'departure' ? 'departure' as const : 'arrival' as const
  const status = await lookupFlight(rawFlight, date, role)
  return NextResponse.json(status)
}
