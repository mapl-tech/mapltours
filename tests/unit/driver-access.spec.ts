import { describe, test, expect } from 'vitest'
import { bookingIsTheirs, isFleetManager, parseAllowlist, resolveDriverAccess, type DriverRow } from '@/lib/driver-access'

/**
 * Who opens the driver portal, and as what (lib/driver-access). Owner, Nov 24
 * 2026: "Regular Drivers: Have access to their assigned rides and tours.
 * Fleet Manager: Can assign and reassign drivers ... Collin should be a Fleet
 * Manager." Made-up people and addresses.
 */

const row = (over: Partial<DriverRow> = {}): DriverRow => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Devon Brown', whatsapp: '+1 876 555 0100',
  vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: 'devon@example.com', active: true, role: 'driver', ...over,
})
const run = (over: Partial<Parameters<typeof resolveDriverAccess>[0]> = {}) =>
  resolveDriverAccess({ email: 'devon@example.com', confirmed: true, rows: [row()], allowlist: [], ...over })

describe('the saved drivers decide', () => {
  test('a working driver signs in as their role, named by their saved name', () => {
    const r = run()
    expect(r).toEqual({ ok: true, access: { role: 'driver', driver: row(), email: 'devon@example.com', label: 'Devon Brown', via: 'roster' } })
    const fm = run({ rows: [row({ role: 'fleet_manager', name: 'Lee Grant' })] })
    expect(fm.ok && fm.access.role).toBe('fleet_manager')
    expect(fm.ok && isFleetManager(fm.access)).toBe(true)
    expect(isFleetManager(r.ok ? r.access : null)).toBe(false)
  })

  test('the address matches in any case and with stray spaces', () => {
    const r = run({ email: '  DEVON@Example.com ', rows: [row({ email: 'Devon@EXAMPLE.com' })] })
    expect(r.ok && r.access.email).toBe('devon@example.com')
  })

  test('an unknown or missing role reads as a regular driver, never as a fleet manager', () => {
    for (const role of [null, undefined, '', 'owner', 'FLEET_MANAGER']) {
      const r = run({ rows: [row({ role: role as string })] })
      expect(r.ok && r.access.role).toBe('driver')
    }
  })

  test('a retired driver is refused, even with the address on the allowlist', () => {
    expect(run({ rows: [row({ active: false })] })).toEqual({ ok: false, denied: 'retired' })
    expect(run({ rows: [row({ active: false })], allowlist: ['devon@example.com'] })).toEqual({ ok: false, denied: 'retired' })
  })

  test('a working row wins over a retired one with the same address', () => {
    const r = run({ rows: [row({ active: false, role: 'fleet_manager' }), row({ id: '22222222-2222-4222-8222-222222222222', name: 'Devon B', active: true })] })
    expect(r.ok && r.access).toMatchObject({ role: 'driver', label: 'Devon B' })
  })

  test('two working rows for one address (the database forbids it) are refused, never guessed', () => {
    expect(run({ rows: [row(), row({ id: '33333333-3333-4333-8333-333333333333', role: 'fleet_manager' })] })).toEqual({ ok: false, denied: 'not_allowed' })
  })

  test('a row for another address does not count', () => {
    expect(run({ rows: [row({ email: 'someone@example.com' })] })).toEqual({ ok: false, denied: 'not_allowed' })
  })
})

describe('without a saved row', () => {
  test('the allowlist opens the portal as a fleet manager, labelled by the address', () => {
    const r = run({ email: 'lee.grant@example.com', rows: [], allowlist: parseAllowlist(' Lee.Grant@example.com, other@example.com ') })
    expect(r).toEqual({ ok: true, access: { role: 'fleet_manager', driver: null, email: 'lee.grant@example.com', label: 'Lee.grant', via: 'allowlist' } })
  })

  test('an admin previews as a fleet manager', () => {
    const r = run({ email: 'owner@example.com', rows: [], isAdmin: true })
    expect(r.ok && r.access).toMatchObject({ role: 'fleet_manager', via: 'admin', label: 'MAPL Tours Jamaica' })
  })

  test('anyone else is refused', () => {
    expect(run({ email: 'stranger@example.com', rows: [] })).toEqual({ ok: false, denied: 'not_allowed' })
  })
})

describe('the address must be confirmed and present', () => {
  test('an unconfirmed address is refused before anything else, admin or allowlist included', () => {
    expect(run({ confirmed: false })).toEqual({ ok: false, denied: 'unconfirmed' })
    expect(run({ confirmed: false, rows: [], allowlist: ['devon@example.com'], isAdmin: true })).toEqual({ ok: false, denied: 'unconfirmed' })
  })
  test('no address: not signed in', () => {
    expect(run({ email: null })).toEqual({ ok: false, denied: 'not_signed_in' })
    expect(run({ email: '  ' })).toEqual({ ok: false, denied: 'not_signed_in' })
  })
})

describe("a regular driver's bookings", () => {
  test('a booking is theirs when it names them, in any case and with stray spaces', () => {
    expect(bookingIsTheirs({ driver_name: 'Devon Brown' }, { name: 'Devon Brown' })).toBe(true)
    expect(bookingIsTheirs({ driver_name: ' devon brown ' }, { name: 'Devon Brown' })).toBe(true)
  })
  test('a booking naming someone else, part of their name, or no one, is not', () => {
    expect(bookingIsTheirs({ driver_name: 'Devon' }, { name: 'Devon Brown' })).toBe(false)
    expect(bookingIsTheirs({ driver_name: 'Devon Browne' }, { name: 'Devon Brown' })).toBe(false)
    expect(bookingIsTheirs({ driver_name: null }, { name: 'Devon Brown' })).toBe(false)
    expect(bookingIsTheirs({ driver_name: '' }, { name: '' })).toBe(false)
  })
})
