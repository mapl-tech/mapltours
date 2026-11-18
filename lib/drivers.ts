/**
 * Saved drivers (table `drivers`, migration 041): the rules for a driver's
 * details, shared by the admin drivers desk, its route and the dispatch
 * console. Pure, so the browser and the server clean a field the same way.
 *
 * A driver's details are what a guest is told, so every field is required
 * except the driver's own email, and each is tidied once here: spaces
 * collapsed, the colour in lower case (it is read inside a sentence, "a
 * silver Toyota Hiace"), the plate in capitals.
 */

export interface Driver {
  id: string
  name: string
  /** The number guests are told to message, with its country code. */
  whatsapp: string
  /** Make and model, e.g. "Toyota Hiace". */
  vehicle: string
  /** Lower case, e.g. "silver". */
  colour: string
  plate: string
  /** Optional: the driver gets a blind copy of a driver-update email. */
  email: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export type DriverFields = Pick<Driver, 'name' | 'whatsapp' | 'vehicle' | 'colour' | 'plate' | 'email'>

export const DRIVER_COLS = 'id, name, whatsapp, vehicle, colour, plate, email, active, created_at, updated_at'

/** A real address, not merely a string with an @ (the rule lib/email/send uses). */
export const VALID_EMAIL = /^[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}$/i

const tidy = (v: unknown): string => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim()

/** The digits of a phone number, for a wa.me link. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * A driver's details from a form, cleaned and checked, or the first problem
 * in words the desk can show as it is.
 */
export function parseDriverFields(input: Record<string, unknown>): { ok: true; fields: DriverFields } | { ok: false; error: string; field: keyof DriverFields } {
  const name = tidy(input.name)
  if (name.length < 2 || name.length > 80) return { ok: false, field: 'name', error: 'Add the driver\'s name as guests should read it.' }
  if (/[<>@]|https?:/i.test(name)) return { ok: false, field: 'name', error: 'The name can only be a name.' }

  const whatsapp = tidy(input.whatsapp)
  const digits = phoneDigits(whatsapp)
  if (!/^\+[0-9][0-9 ()-]{6,24}$/.test(whatsapp) || digits.length < 8 || digits.length > 15) {
    return { ok: false, field: 'whatsapp', error: 'Add the WhatsApp number with its country code, starting with +, for example +1 876 919-7534.' }
  }

  const vehicle = tidy(input.vehicle)
  if (vehicle.length < 2 || vehicle.length > 80) return { ok: false, field: 'vehicle', error: 'Add the make and model, for example Toyota Hiace.' }

  const colour = tidy(input.colour).toLowerCase()
  if (colour.length < 2 || colour.length > 30 || !/^[a-z][a-z /-]*$/.test(colour)) return { ok: false, field: 'colour', error: 'Add the colour in words, for example silver.' }

  const plate = tidy(input.plate).toUpperCase()
  if (plate.length < 2 || plate.length > 20 || !/^[A-Z0-9][A-Z0-9 -]*$/.test(plate)) return { ok: false, field: 'plate', error: 'Add the license plate as it reads on the vehicle, for example PJ 1234.' }

  const rawEmail = tidy(input.email).toLowerCase()
  if (rawEmail && !VALID_EMAIL.test(rawEmail)) return { ok: false, field: 'email', error: 'That email address does not look right. Leave it empty if the driver has none.' }

  return { ok: true, fields: { name, whatsapp, vehicle, colour, plate, email: rawEmail || null } }
}

/** "Toyota Hiace, silver": how a booking stores the vehicle (driver_vehicle). */
export function bookingVehicle(d: Pick<Driver, 'vehicle' | 'colour'>): string {
  return `${d.vehicle}, ${d.colour}`
}

/** "silver Toyota Hiace": how a sentence reads it. */
export function vehicleInWords(d: Pick<Driver, 'vehicle' | 'colour'>): string {
  return `${d.colour} ${d.vehicle}`
}

/** "a silver Toyota Hiace" or "an orange Toyota Hiace". */
export function aVehicle(d: Pick<Driver, 'vehicle' | 'colour'>): string {
  return `${/^[aeiou]/i.test(d.colour) ? 'an' : 'a'} ${vehicleInWords(d)}`
}

/** The booking's own driver columns, as the dispatch console writes them. */
export function bookingDriverColumns(d: Pick<Driver, 'name' | 'whatsapp' | 'vehicle' | 'colour' | 'plate'>) {
  return { driver_name: d.name, driver_phone: d.whatsapp, driver_vehicle: bookingVehicle(d), driver_plate: d.plate }
}

/** Does the booking already carry exactly this driver's details? */
export function bookingHasDriver(b: { driver_name?: string | null; driver_phone?: string | null; driver_vehicle?: string | null; driver_plate?: string | null }, d: Driver): boolean {
  const c = bookingDriverColumns(d)
  return (b.driver_name ?? '') === c.driver_name && (b.driver_phone ?? '') === c.driver_phone
    && (b.driver_vehicle ?? '') === c.driver_vehicle && (b.driver_plate ?? '') === c.driver_plate
}

/** "Devon Brown · silver Toyota Hiace · PJ 1234", for a dropdown. */
export function driverOptionLabel(d: Driver): string {
  return `${d.name} · ${vehicleInWords(d)} · ${d.plate}`
}

/** "Devon" from "Devon Brown": how the steps name the driver. */
export function driverFirstName(d: Pick<Driver, 'name'>): string {
  return d.name.split(' ')[0]
}
