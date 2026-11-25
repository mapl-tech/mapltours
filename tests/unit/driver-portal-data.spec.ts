import { describe, test, expect, vi } from 'vitest'

/**
 * What the driver portal loads, by role (lib/driver-portal-data). Owner, Nov
 * 24 2026: "Regular Drivers: Have access to their assigned rides and tours."
 * A regular driver's browser never receives another driver's ride, any pay,
 * or the saved drivers; a fleet manager's receives all of it. Made-up people.
 */

vi.mock('@/lib/driver-access-server', () => ({ DRIVER_ROLE_COLS: 'id, name, role' }))
vi.mock('@/lib/dispatch-change-server', () => ({
  lastChanges: async (_svc: unknown, ids: string[]) => Object.fromEntries(ids.map((id) => [id, { text: 'changed', changeId: 'c' }])),
}))

import { loadPortal } from '@/lib/driver-portal-data'

const HOUR = 3_600_000
const soon = (h: number) => new Date(Date.now() + h * HOUR - 5 * HOUR).toISOString()

type Row = Record<string, unknown>
const bookings: Row[] = [
  { id: 'r-devon', booking_type: 'transfer', status: 'paid', first_name: 'Ana', last_name: 'B', phone: null, subtotal: 100, special_requests: null, dispatch: { paid_first: 'x' }, driver_name: 'Devon Brown', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234', booking_items: [{ item_type: 'transfer', hotel: 'Seaview Resort', trip_type: 'one_way', passengers: 2, arrival_at: soon(30) }] },
  { id: 'r-devon-2', booking_type: 'transfer', status: 'paid', first_name: 'Cy', last_name: 'D', phone: null, subtotal: 80, special_requests: null, dispatch: {}, driver_name: ' devon brown ', driver_vehicle: null, driver_plate: null, booking_items: [{ item_type: 'transfer', hotel: 'Hilltop Villa', trip_type: 'one_way', passengers: 1, departure_at: soon(60) }] },
  { id: 'r-devonne', booking_type: 'transfer', status: 'paid', first_name: 'Eve', last_name: 'F', phone: null, subtotal: 90, special_requests: null, dispatch: {}, driver_name: 'Devon Browne', driver_vehicle: null, driver_plate: null, booking_items: [{ item_type: 'transfer', hotel: 'Bay Inn', trip_type: 'one_way', passengers: 1, arrival_at: soon(40) }] },
  { id: 'r-ann', booking_type: 'transfer', status: 'paid', first_name: 'Gil', last_name: 'H', phone: null, subtotal: 70, special_requests: null, dispatch: {}, driver_name: 'Ann Lee', driver_vehicle: null, driver_plate: null, booking_items: [{ item_type: 'transfer', hotel: 'Cove Hotel', trip_type: 'one_way', passengers: 3, arrival_at: soon(20) }] },
  { id: 't-devon', booking_type: 'tour', status: 'paid', first_name: 'Ida', last_name: 'J', phone: null, special_requests: null, pickup: 'Seaview Resort', pickup_time: '08:30', driver_name: 'Devon Brown', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234', booking_items: [{ title: 'River rafting', destination: 'Martha Brae', date: '2026-12-02', travelers: 2 }] },
  { id: 't-none', booking_type: 'tour', status: 'paid', first_name: 'Kay', last_name: 'L', phone: null, special_requests: null, pickup: null, pickup_time: null, driver_name: null, booking_items: [{ title: 'Falls climb', destination: 'Ocho Rios', date: '2026-12-03', travelers: 1 }] },
]
const drivers: Row[] = [{ id: 'd1', name: 'Devon Brown', role: 'driver', active: true }, { id: 'd2', name: 'Lee Grant', role: 'fleet_manager', active: true }]

function svc() {
  const reads: string[] = []
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    const api: Record<string, unknown> = {}
    api.select = (cols: string) => { reads.push(`${table}:${cols}`); return api }
    api.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api }
    api.or = () => api
    api.order = () => api
    api.limit = () => api
    api.ilike = (k: string, v: string) => {
      const re = new RegExp(`^${v.replace(/\\(.)/g, '$1').replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
      filters.push((r) => re.test(String(r[k] ?? '')))
      return api
    }
    api.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: structuredClone((table === 'drivers' ? drivers : bookings).filter((r) => filters.every((f) => f(r)))), error: null }).then(ok)
    return api
  }
  return { svc: { from }, reads }
}

describe('a regular driver', () => {
  test('gets only the rides and tours that name them, exactly, and no pay', async () => {
    const { svc: s, reads } = svc()
    const d = await loadPortal(s, { role: 'driver', driver: { id: 'd1', name: 'Devon Brown' } as never })
    expect(d.trips.map((t) => t.id).sort()).toEqual(['r-devon', 'r-devon-2'])
    expect(d.tours.map((t) => t.id)).toEqual(['t-devon'])
    for (const t of d.trips) {
      expect(t.payoutTotal).toBe(0)
      expect(t.payoutLegs).toEqual([])
    }
    expect(JSON.stringify(d)).not.toMatch(/"amount"|paid_first|"subtotal"/)
    expect(d.drivers).toBe(null)
    expect(d.changes).toBe(null)
    // The saved drivers are never even read for them.
    expect(reads.some((r) => r.startsWith('drivers:'))).toBe(false)
  })

  test('a regular driver with no saved row sees nothing at all', async () => {
    const d = await loadPortal(svc().svc, { role: 'driver', driver: null })
    expect(d).toEqual({ trips: [], tours: [], drivers: null, changes: null, incomplete: false })
  })

  test('a name with LIKE characters matches only itself', async () => {
    const d = await loadPortal(svc().svc, { role: 'driver', driver: { id: 'dx', name: 'Devon%' } as never })
    expect(d.trips).toEqual([])
  })
})

describe('a fleet manager', () => {
  test('gets every ride and tour, with pay, the drivers and the last changes', async () => {
    const d = await loadPortal(svc().svc, { role: 'fleet_manager', driver: null })
    expect(d.trips).toHaveLength(4)
    expect(d.tours).toHaveLength(2)
    expect(d.trips.find((t) => t.id === 'r-devon')!.payoutTotal).toBe(100)
    expect(d.trips.find((t) => t.id === 'r-devon')!.driver).toEqual({ name: 'Devon Brown', vehicle: 'silver Toyota Hiace', plate: 'PJ 1234' })
    expect(d.tours.find((t) => t.id === 't-devon')).toMatchObject({ pickup: 'Seaview Resort', pickupTime: '08:30' })
    expect(d.tours.find((t) => t.id === 't-none')).toMatchObject({ pickup: null, pickupTime: null, driver: null })
    expect(d.drivers!.map((x) => [x.name, x.role])).toEqual([['Devon Brown', 'driver'], ['Lee Grant', 'fleet_manager']])
    expect(Object.keys(d.changes!)).toHaveLength(6)
  })
})
