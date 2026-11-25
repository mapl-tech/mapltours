import 'server-only'
import { driverTrip, driverTour, nextActionAt, transferLegWindow, type DriverTrip, type DriverTour } from '@/lib/driver'
import { bookingIsTheirs, type DriverAccess } from '@/lib/driver-access'
import { escapeLikePattern } from '@/lib/pg-like'
import { DRIVER_ROLE_COLS } from '@/lib/driver-access-server'
import { lastChanges, type LastChange } from '@/lib/dispatch-change-server'
import type { Driver } from '@/lib/drivers'

/**
 * What the driver portal shows, by role (Nov 24 2026, lib/driver-access):
 *
 *   fleet_manager  every paid ride in the window and the newest tours, with
 *                  pay, the saved drivers (to assign and to manage) and the
 *                  last change on each booking
 *   driver         only the rides and tours whose booking names them, with no
 *                  pay, no other driver and no change log
 *
 * Filtered here, on the server: what a regular driver may not see never
 * reaches their browser. The /admin/driver preview reads the fleet manager's
 * view.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Svc = any

export type PortalDriver = Pick<Driver, 'id' | 'name' | 'whatsapp' | 'vehicle' | 'colour' | 'plate' | 'email' | 'active'> & { role: 'driver' | 'fleet_manager' }

export interface PortalData {
  trips: DriverTrip[]
  tours: DriverTour[]
  /** Fleet managers only: every saved driver, working ones first. */
  drivers: PortalDriver[] | null
  /** Fleet managers only: the newest change on each booking shown. */
  changes: Record<string, LastChange> | null
  /** Set when a read failed, so the page can say the list may be incomplete. */
  incomplete: boolean
}

const TRIP_COLS = 'id, first_name, last_name, phone, subtotal, special_requests, dispatch, driver_name, driver_vehicle, driver_plate, booking_items!inner(*)'
const TOUR_COLS = 'id, first_name, last_name, phone, special_requests, pickup, pickup_time, driver_name, driver_vehicle, driver_plate, booking_items(title, destination, date, travelers)'

export async function loadPortal(svc: Svc, access: Pick<DriverAccess, 'role' | 'driver'>, nowMs: number = Date.now()): Promise<PortalData> {
  const fleet = access.role === 'fleet_manager'
  const mine = !fleet ? access.driver : null
  let incomplete = false

  // A regular driver without a saved row cannot be matched to anything.
  if (!fleet && !mine) return { trips: [], tours: [], drivers: null, changes: null, incomplete: false }

  // Bounded by LEG TIME, not row age (lib/driver transferLegWindow): 45 days
  // back, because the list is also the payout ledger. 500 rows ordered by
  // created_at, the cap the portal has always had.
  const { orFilter } = transferLegWindow(nowMs, { backDays: 45 })
  let tq = svc.from('bookings').select(TRIP_COLS)
    .eq('status', 'paid').eq('booking_type', 'transfer')
    .or(orFilter, { referencedTable: 'booking_items' })
  // A regular driver's rides are narrowed in the query (so the cap never
  // hides one), loosely, then matched exactly below by lib/driver-access.
  if (mine) tq = tq.ilike('driver_name', `%${escapeLikePattern(mine.name.trim())}%`)
  const { data: bookings, error: tErr } = await tq.order('created_at', { ascending: true }).limit(500)
  if (tErr) { incomplete = true; console.error('[driver-portal] window query failed', tErr) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tripRows = ((bookings ?? []) as any[]).filter((b) => !mine || bookingIsTheirs(b, mine))
  const trips = tripRows
    .map((b) => driverTrip(b, { withPay: fleet }))
    .filter((t): t is DriverTrip => t !== null)
    .sort((a, b) => nextActionAt(a) - nextActionAt(b))

  // Tours: itinerary only; the select carries no price columns at all.
  let rq = svc.from('bookings').select(TOUR_COLS).eq('status', 'paid').eq('booking_type', 'tour')
  if (mine) rq = rq.ilike('driver_name', `%${escapeLikePattern(mine.name.trim())}%`)
  const { data: tourRows, error: rErr } = await rq.order('created_at', { ascending: false }).limit(100)
  if (rErr) { incomplete = true; console.error('[driver-portal] tour query failed', rErr) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tours = ((tourRows ?? []) as any[])
    .filter((b) => !mine || bookingIsTheirs(b, mine))
    .map(driverTour)
    .filter((t): t is DriverTour => t !== null)
    .sort((a, b) => (a.firstDate ?? '9999').localeCompare(b.firstDate ?? '9999'))

  if (!fleet) return { trips, tours, drivers: null, changes: null, incomplete }

  const [{ data: drivers, error: dErr }, changes] = await Promise.all([
    svc.from('drivers').select(DRIVER_ROLE_COLS).order('active', { ascending: false }).order('name', { ascending: true }),
    lastChanges(svc, [...trips.map((t) => t.id), ...tours.map((t) => t.id)]),
  ])
  if (dErr) { incomplete = true; console.error('[driver-portal] drivers not read', dErr.message) }
  const list: PortalDriver[] = ((drivers ?? []) as PortalDriver[]).map((d) => ({
    id: d.id, name: d.name, whatsapp: d.whatsapp, vehicle: d.vehicle, colour: d.colour, plate: d.plate,
    email: d.email ?? null, active: d.active, role: d.role === 'fleet_manager' ? 'fleet_manager' : 'driver',
  }))
  return { trips, tours, drivers: list, changes, incomplete }
}
