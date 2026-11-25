import type { Driver } from '@/lib/drivers'

/**
 * Who may open the driver portal, and as what (Nov 24 2026).
 *
 * The owner: "Implement role-based permissions for drivers, with two roles:
 * Regular Driver and Fleet Supervisor. Regular Drivers: Have access to their
 * assigned rides and tours. Fleet Manager: Can assign and reassign drivers to
 * rides and tours, as well as update pickup times and create new drivers.
 * Collin should be a Fleet Manager."
 *
 *   driver         sees only the rides and tours whose booking names them
 *                  (bookings.driver_name), never what MAPL pays for them
 *   fleet_manager  sees every ride and tour, and may change who drives, a
 *                  ride's time and a tour's pickup time, and add drivers
 *
 * The saved drivers decide (table drivers, migration 043): a working driver
 * whose email is the address they sign in with gets that row's role. A
 * retired one gets nothing, even if the address is also on the old
 * allowlist: retiring someone on the Drivers page has to close the portal to
 * them. With no row for the address, DRIVER_ALLOWED_EMAILS (Netlify, set by
 * the owner) still opens it, as a fleet manager: that list has only ever
 * held the people who run the rides, and it keeps the owner able to let
 * someone in without a deploy. Admins previewing the portal see what a fleet
 * manager sees.
 *
 * The address must be confirmed (Google sign-in always is; an email sign-up
 * is once its link was opened), or anyone could claim a driver's address.
 *
 * Pure, so the rule is tested on its own (tests/unit/driver-access.spec.ts);
 * lib/driver-access-server.ts reads the session and the rows.
 */

export type DriverRole = 'driver' | 'fleet_manager'

export interface DriverAccess {
  role: DriverRole
  /** The saved driver signed in, when the access comes from the Drivers list. */
  driver: Driver | null
  /** The signed-in address, lower case. */
  email: string
  /** How the change log and the office name this person: the saved name, else the address's local part. */
  label: string
  via: 'roster' | 'allowlist' | 'admin'
}

export type AccessDenied = 'not_signed_in' | 'unconfirmed' | 'retired' | 'not_allowed'

export type DriverRow = Driver & { role?: string | null }

export const isFleetManager = (a: DriverAccess | null | undefined): boolean => !!a && a.role === 'fleet_manager'

/** The comma-separated allowlist, lower case. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

const roleOf = (r: string | null | undefined): DriverRole => (r === 'fleet_manager' ? 'fleet_manager' : 'driver')

function localLabel(email: string): string {
  const local = email.split('@')[0] ?? 'Driver'
  return (local.charAt(0).toUpperCase() + local.slice(1)).slice(0, 80) || 'Driver'
}

/**
 * The portal access for a signed-in address. `rows` are the saved drivers
 * whose email is this address in any case (active or not); `isAdmin` is the
 * admins table's answer for the same user.
 */
export function resolveDriverAccess(input: {
  email: string | null | undefined
  confirmed: boolean
  rows: DriverRow[]
  allowlist: string[]
  isAdmin?: boolean
}): { ok: true; access: DriverAccess } | { ok: false; denied: AccessDenied } {
  const email = (input.email ?? '').trim().toLowerCase()
  if (!email) return { ok: false, denied: 'not_signed_in' }
  if (!input.confirmed) return { ok: false, denied: 'unconfirmed' }
  const mine = input.rows.filter((r) => (r.email ?? '').trim().toLowerCase() === email)
  const working = mine.filter((r) => r.active)
  // The database allows one working driver per address (drivers_active_email_once); two would be refused, never guessed.
  if (working.length === 1) {
    const d = working[0]
    return { ok: true, access: { role: roleOf(d.role), driver: d, email, label: d.name, via: 'roster' } }
  }
  if (input.isAdmin) return { ok: true, access: { role: 'fleet_manager', driver: null, email, label: 'MAPL Tours Jamaica', via: 'admin' } }
  if (working.length > 1) return { ok: false, denied: 'not_allowed' }
  if (mine.length) return { ok: false, denied: 'retired' }
  if (input.allowlist.includes(email)) {
    return { ok: true, access: { role: 'fleet_manager', driver: null, email, label: localLabel(email), via: 'allowlist' } }
  }
  return { ok: false, denied: 'not_allowed' }
}

/** How payouts and the portal compare a driver's name with a booking's (lib/payouts/plan key). */
export const nameKey = (name: string | null | undefined): string => (name ?? '').trim().toLowerCase()

/** Is this booking one a regular driver may see: does it name them as its driver? */
export function bookingIsTheirs(b: { driver_name?: string | null }, driver: Pick<Driver, 'name'>): boolean {
  const k = nameKey(driver.name)
  return !!k && nameKey(b.driver_name) === k
}
