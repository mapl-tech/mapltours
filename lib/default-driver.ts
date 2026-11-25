import { DEFAULT_DRIVER } from '@/lib/dispatch'
import { bookingDriverColumns } from '@/lib/drivers'

/**
 * The driver a new paid ride is given, as the booking stores it (the webhook,
 * and both checkouts for a gift-covered booking).
 *
 * It used to be the DEFAULT_DRIVER constant alone. Since Nov 25 2026 a fleet
 * manager can change a saved driver's details in the driver portal (a new van,
 * a new number), so the constant would go stale and every new ride would carry
 * the old plate, which the day-of email then gives the guest. So this reads
 * the saved, working driver of that name and stamps their details as saved
 * now. Anything else (no such row, more than one, a database error, no answer
 * within DEFAULT_DRIVER_WAIT_MS) stamps the constant exactly as before: the
 * paid path never waits on this or fails because of it.
 */

export const DEFAULT_DRIVER_WAIT_MS = 1500

export type DriverColumns = { driver_name: string; driver_phone: string; driver_vehicle: string; driver_plate: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function defaultDriverColumns(svc: any): Promise<DriverColumns> {
  const fallback: DriverColumns = { ...DEFAULT_DRIVER }
  try {
    const read = svc.from('drivers').select('name, whatsapp, vehicle, colour, plate, active').eq('active', true).eq('name', DEFAULT_DRIVER.driver_name)
    const res = await Promise.race([
      Promise.resolve(read),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DEFAULT_DRIVER_WAIT_MS)),
    ])
    const rows = res && !res.error && Array.isArray(res.data) ? res.data : null
    if (!rows || rows.length !== 1) return fallback
    const d = rows[0]
    if (!d || !d.active || !d.name || !d.whatsapp || !d.vehicle || !d.colour || !d.plate) return fallback
    return bookingDriverColumns(d)
  } catch {
    return fallback
  }
}
