import { firstLeg, type Bk } from '@/lib/dispatch'
import { jaDateKey } from '@/lib/dayof-rules'
import { legAt, legsOf } from '@/lib/driver-update'
import { legIsAhead } from '@/lib/dispatch-change'
import { bookingDriverColumns, type Driver, type DriverFields } from '@/lib/drivers'

/**
 * Changing a saved driver's details (Nov 25 2026), the pure part. The owner:
 * "have the fleet manager be able to enter the vehicle information for drivers
 * as well. So make him able to edit driver details. Make sure it is perfect.
 * There can be no mistake."
 *
 * A booking keeps its own copy of its driver's details, and every email reads
 * that copy. So an edit that changes what a guest is told (the name, the
 * WhatsApp number, the vehicle, its colour, the plate) also moves every ride
 * still ahead that carries the old details, through the same confirm-first
 * steps as giving a ride to another driver (lib/dispatch-change). The sign-in
 * email and the role change nothing a guest sees.
 *
 * Who may change what:
 *   - an admin: everything, the role included (/admin/drivers);
 *   - a fleet manager: a regular driver's every detail; a fleet manager's
 *     (their own) WhatsApp, vehicle, colour and plate, never the name (the
 *     payout job pays by name) nor the sign-in email (they would lock
 *     themselves out).
 */

export type EditField = keyof DriverFields
export type Editor = 'admin' | 'fleet_manager'
export type DriverRole = 'driver' | 'fleet_manager'

export const FIELD_ORDER: EditField[] = ['name', 'whatsapp', 'vehicle', 'colour', 'plate', 'email']

/** The details a guest is told; the email is not one. */
export const GUEST_FACING: EditField[] = ['name', 'whatsapp', 'vehicle', 'colour', 'plate']

export type SavedDriver = Driver & { role?: string | null }

export const roleOf = (r: string | null | undefined): DriverRole => (r === 'fleet_manager' ? 'fleet_manager' : 'driver')

/** The fields this editor may not change on this driver. */
export function lockedFields(target: SavedDriver, editor: Editor): EditField[] {
  if (editor === 'admin') return []
  return roleOf(target.role) === 'fleet_manager' ? ['name', 'email'] : []
}

const norm = (v: string | null | undefined) => (v ?? '').trim()

/** The fields whose value differs, in display order. */
export function changedFields(before: SavedDriver, after: DriverFields): EditField[] {
  return FIELD_ORDER.filter((k) => norm(before[k] as string | null) !== norm(after[k] as string | null))
}

/** Whether the change moves anything a guest is told: then upcoming rides follow. */
export function touchesGuests(changed: EditField[]): boolean {
  return changed.some((k) => GUEST_FACING.includes(k))
}

/** The booking columns before and after: what a ride carries for this driver. */
export function columnsOf(d: Pick<Driver, 'name' | 'whatsapp' | 'vehicle' | 'colour' | 'plate'>) {
  return bookingDriverColumns(d)
}

/** Does this booking carry exactly these driver details? */
export function carries(b: Bk, cols: ReturnType<typeof bookingDriverColumns>): boolean {
  return (b.driver_name ?? '') === cols.driver_name && (b.driver_phone ?? '') === cols.driver_phone
    && (b.driver_vehicle ?? '') === cols.driver_vehicle && (b.driver_plate ?? '') === cols.driver_plate
}

/**
 * Is anything on this booking still ahead? A ride: an arrival until two hours
 * after landing, a pickup until its time (lib/dispatch-change legIsAhead). A
 * tour: any tour day from today on the Jamaica calendar.
 */
export function bookingAhead(b: Bk, nowMs: number): boolean {
  if (b.booking_type === 'transfer') {
    if (!firstLeg(b)) return false
    return legsOf(b).some((leg) => { const at = legAt(b, leg); return !!at && legIsAhead(at, leg, nowMs) })
  }
  const today = jaDateKey(nowMs)
  return ((b.booking_items ?? []) as { date?: string | null }[]).some((i) => String(i.date ?? '').slice(0, 10) >= today)
}
