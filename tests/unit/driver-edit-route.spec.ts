import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * Changing a saved driver's details from the driver portal (a fleet manager,
 * app/api/driver/drivers) and from the admin Drivers page (app/api/admin/
 * drivers), over an in-memory database that keeps apply_driver_edit's rules
 * (migration 044: the driver must still hold what was shown; only paid
 * bookings still carrying the old details move; a clash with another working
 * driver's name or email changes nothing) and a fake Resend. The owner, Nov 25
 * 2026: "have the fleet manager be able to enter the vehicle information for
 * drivers as well. So make him able to edit driver details. Make sure it is
 * perfect. There can be no mistake", and "When I look at the driver portal in
 * the admin page, I need to see the same settings that a Fleet Manager would
 * have" (the portal's route treats an admin as a fleet manager).
 *
 * Made-up guests, drivers and addresses.
 */

const HOUR = 3_600_000
const wall = (s: string) => `${s}:00+00:00`
const ja = (s: string) => Date.parse(`${s}:00Z`) + 5 * HOUR

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  access: null as null | Record<string, unknown>,
  adminUser: null as null | { id: string; email: string },
  mail: [] as Array<Record<string, unknown>>,
  mailFails: [] as string[],
  rpcCalls: [] as string[],
  /** Runs inside apply_driver_edit before it reads anything: a change by someone else at that moment. */
  beforeEdit: null as null | (() => void),
  /** Runs as apply_driver_edit returns: the hourly job claiming a day-of email inside the save. */
  afterEdit: null as null | (() => void),
}))

vi.mock('@/lib/driver-access-server', () => ({
  DRIVER_ROLE_COLS: 'id, name, whatsapp, vehicle, colour, plate, email, active, role, created_at, updated_at',
  getDriverAccess: async () => db.access ?? { ok: false, denied: 'not_signed_in' },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: db.adminUser } }) } }),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '1.1.1.1' }))
vi.mock('@/lib/travel-party-server', () => ({ sendToParty: async () => ({ sent: 0, failed: 0 }) }))
vi.mock('@/lib/google-calendar', () => ({ updateBookingInCalendar: async () => ({ ok: true }) }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (m: Record<string, unknown>) => {
    db.mail.push(m)
    const to = ([] as string[]).concat(m.to as string)
    if (to.some((t) => db.mailFails.includes(t)) || db.mailFails.some((f) => String(m.subject).startsWith(f))) return { ok: false, error: 'refused' }
    return { ok: true, id: `em_${db.mail.length}` }
  }),
  opsBcc: (guest: string, extra: (string | null)[] = []) => ['ops@example.com', ...extra.filter(Boolean)].filter((e) => e !== guest),
}))

/* ── An in-memory PostgREST, enough for these routes ── */
function q(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let values: Row = {}
  let limit = Infinity
  let order: [string, boolean] | null = null
  let single = false
  const api: Record<string, unknown> = {}
  const rows = () => (db.tables[table] ??= [])
  api.select = () => api
  api.eq = (k: string, v: unknown) => { filters.push((r) => r[k] === v); return api }
  api.gt = (k: string, v: unknown) => { filters.push((r) => String(r[k]) > String(v)); return api }
  api.lt = (k: string, v: unknown) => { filters.push((r) => String(r[k]) < String(v)); return api }
  api.gte = (k: string, v: unknown) => {
    const [t, c] = k.split('.')
    filters.push(c ? (r) => ((r[t] as Row[]) ?? []).some((i) => String(i[c] ?? '') >= String(v)) : (r) => String(r[k]) >= String(v))
    return api
  }
  api.in = (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return api }
  api.ilike = (k: string, v: string) => {
    const re = new RegExp(`^${v.replace(/\\([%_\\])/g, '$1').replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/%/g, '.*')}$`, 'i')
    filters.push((r) => re.test(String(r[k] ?? '')))
    return api
  }
  api.or = () => api
  api.order = (k: string, o?: { ascending?: boolean }) => { order = [k, o?.ascending !== false]; return api }
  api.limit = (n: number) => { limit = n; return api }
  api.update = (v: Row) => { op = 'update'; values = v; return api }
  api.insert = (v: Row) => { op = 'insert'; values = v; return api }
  const run = () => {
    if (op === 'insert') {
      const row: Row = { id: `${table}-${rows().length + 1}`, created_at: new Date().toISOString(), ...values }
      rows().push(row)
      return { data: row, error: null }
    }
    let hit = rows().filter((r) => filters.every((f) => f(r)))
    if (op === 'update') {
      if (table === 'drivers' && values.active === true) {
        for (const r of hit) {
          if (rows().some((o) => o !== r && o.active && String(o.name).toLowerCase() === String(r.name).toLowerCase())) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "drivers_active_name_once"' } }
          }
        }
      }
      for (const r of hit) Object.assign(r, values)
      return { data: single ? structuredClone(hit[0] ?? null) : structuredClone(hit), error: null }
    }
    if (order) { const [k, asc] = order; hit = [...hit].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1)) }
    hit = structuredClone(hit.slice(0, limit))
    return { data: single ? hit[0] ?? null : hit, error: null }
  }
  api.maybeSingle = async () => { single = true; return run() }
  api.single = async () => { single = true; return run() }
  api.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
  return api
}

/** apply_driver_edit, with migration 044's rules. */
function applyDriverEdit(a: Row) {
  db.rpcCalls.push('apply_driver_edit')
  db.beforeEdit?.()
  const before = a.p_before as Row
  const after = a.p_after as Row
  const ids = (a.p_booking_ids as string[]) ?? []
  if (after.role !== undefined && after.role !== 'driver' && after.role !== 'fleet_manager') return { result: 'bad_request', why: 'role' }
  const d = db.tables.drivers.find((r) => r.id === a.p_driver_id)
  if (!d) return { result: 'not_found' }
  if (!d.active) return { result: 'retired' }
  for (const k of ['name', 'whatsapp', 'vehicle', 'colour', 'plate', 'email', 'role']) if ((d[k] ?? null) !== (before[k] ?? null)) return { result: 'changed' }
  const others = db.tables.drivers.filter((r) => r.active && r.id !== d.id)
  if (others.some((r) => String(r.name).toLowerCase() === String(after.name).toLowerCase())) return { result: 'duplicate', constraint: 'drivers_active_name_once' }
  if (after.email && others.some((r) => r.email && String(r.email).toLowerCase() === String(after.email).toLowerCase())) return { result: 'duplicate', constraint: 'drivers_active_email_once' }
  Object.assign(d, { name: after.name, whatsapp: after.whatsapp, vehicle: after.vehicle, colour: after.colour, plate: after.plate, email: after.email ?? null, role: after.role ?? d.role, updated_at: new Date().toISOString() })
  const cb = a.p_cols_before as Row
  const ca = a.p_cols_after as Row
  const changes: Row[] = []
  const skipped: Row[] = []
  for (const id of ids) {
    const b = db.tables.bookings.find((r) => r.id === id)
    if (!b) { skipped.push({ booking_id: id, why: 'not_found' }); continue }
    if (b.status !== 'paid') { skipped.push({ booking_id: id, why: 'not_paid' }); continue }
    if (['driver_name', 'driver_phone', 'driver_vehicle', 'driver_plate'].some((k) => (b[k] ?? null) !== (cb[k] ?? null))) { skipped.push({ booking_id: id, why: 'changed' }); continue }
    Object.assign(b, { driver_name: ca.driver_name, driver_phone: ca.driver_phone, driver_vehicle: ca.driver_vehicle, driver_plate: ca.driver_plate })
    const changeId = crypto.randomUUID()
    db.tables.dispatch_changes.push({ id: changeId, booking_id: id, kind: 'driver', leg: null, before: cb, after: ca, actor_email: String(a.p_actor_email).trim().toLowerCase(), actor_label: String(a.p_actor_label).trim(), guest_email: 'pending', guest_email_detail: null, created_at: new Date().toISOString() })
    changes.push({ booking_id: id, change_id: changeId })
  }
  db.afterEdit?.()
  return { result: 'applied', changes, skipped }
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: q,
    rpc: async (fn: string, args: Row) => {
      if (fn === 'apply_driver_edit') return { data: applyDriverEdit(args), error: null }
      if (fn === 'merge_dispatch') {
        const b = (db.tables.bookings ?? []).find((r) => r.id === args.p_booking_id)
        if (b) Object.assign(b.dispatch as Row, args.p_patch as Row)
        return { data: [{ id: args.p_booking_id }], error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    },
  }),
}))

import { PATCH as fleetPATCH } from '@/app/api/driver/drivers/route'
import { PATCH as adminPATCH } from '@/app/api/admin/drivers/route'
import { GET as sweepGET } from '@/app/api/driver/change/sweep/route'
import { POST as changePOST } from '@/app/api/driver/change/route'
import { defaultDriverColumns } from '@/lib/default-driver'

const DEVON = '11111111-1111-4111-8111-111111111111'
const ANN = '22222222-2222-4222-8222-222222222222'
const LEE = '33333333-3333-4333-8333-333333333333'
const SAM = '44444444-4444-4444-8444-444444444444'
const devonCols = { driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234' }
const leeCols = { driver_name: 'Lee Grant', driver_phone: '+1 876 555 0102', driver_vehicle: 'Toyota Noah, white', driver_plate: 'PK 0002' }
const MAYA = 'abcd1234-6c73-444e-83c6-1f79f15a59d1'
const KIM = 'bbbb5678-6c73-444e-83c6-1f79f15a59d1'
const TOM = 'cccc9012-6c73-444e-83c6-1f79f15a59d1'
const OLD = 'dddd3456-6c73-444e-83c6-1f79f15a59d1'
const JOY = 'eeee7890-6c73-444e-83c6-1f79f15a59d1'
const GONE = 'ffff1234-6c73-444e-83c6-1f79f15a59d1'
const ANNS = 'aaaa4321-6c73-444e-83c6-1f79f15a59d1'
const LEES = '99994321-6c73-444e-83c6-1f79f15a59d1'

const transfer = (id: string, first: string, email: string | null, cols: Row, item: Row, over: Row = {}): Row => ({
  id, booking_type: 'transfer', status: 'paid', email, first_name: first, last_name: 'Grey', phone: null, subtotal: 100, total_paid: 120,
  ...cols, dispatch: {}, pickup: null, dropoff: null, pickup_time: null,
  booking_items: [{ item_type: 'transfer', hotel: 'Seaview Resort, Negril', trip_type: 'round_trip', passengers: 2, arrival_flight: 'AA 1311', departure_flight: 'AA 1312', ...item }],
  ...over,
})

function seed() {
  db.tables = {
    drivers: [
      { id: DEVON, name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: 'devon@example.com', active: true, role: 'driver' },
      { id: ANN, name: 'Ann Lee', whatsapp: '+1 876 555 0101', vehicle: 'Toyota Noah', colour: 'black', plate: 'PK 0001', email: 'ann@example.com', active: true, role: 'driver' },
      { id: LEE, name: 'Lee Grant', whatsapp: '+1 876 555 0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', email: 'Lee@Example.com', active: true, role: 'fleet_manager' },
      { id: SAM, name: 'Sam Hill', whatsapp: '+1 876 555 0103', vehicle: 'Toyota Voxy', colour: 'grey', plate: 'PS 0003', email: null, active: true, role: 'driver' },
    ],
    bookings: [
      // Maya: lands tomorrow, home on Monday; no day-of email yet.
      transfer(MAYA, 'Maya', 'maya@example.com', devonCols, { arrival_at: wall('2026-11-27T14:10'), departure_at: wall('2026-11-30T15:30') }),
      // Kim: lands today at 4:00 PM; the day-of email went at 6:00 AM with Devon's details as they were.
      transfer(KIM, 'Kim', 'kim@example.com', devonCols, { trip_type: 'one_way', arrival_at: wall('2026-11-26T16:00'), departure_at: null }, { dispatch: { dayof_arrival_sent: new Date(ja('2026-11-26T06:00')).toISOString() } }),
      // Tom: a tour on Dec 2 with Devon driving.
      { id: TOM, booking_type: 'tour', status: 'paid', email: 'tom@example.com', first_name: 'Tom', last_name: 'Ray', phone: null, subtotal: 300, total_paid: 360, ...devonCols, dispatch: {}, pickup: 'Seaview Resort, Negril', dropoff: null, pickup_time: '08:30', booking_items: [{ item_type: 'experience', title: 'River rafting', date: '2026-12-02', travelers: 2 }] },
      // A ride Devon drove last week: what that guest was told stays on record.
      transfer(OLD, 'Ola', 'ola@example.com', devonCols, { trip_type: 'one_way', arrival_at: wall('2026-11-20T11:00'), departure_at: null }),
      // Joy: Devon by name, but with a vehicle typed by hand for this ride: left as it is.
      transfer(JOY, 'Joy', 'joy@example.com', { ...devonCols, driver_vehicle: 'Toyota Hiace, grey' }, { trip_type: 'one_way', arrival_at: wall('2026-11-28T10:00'), departure_at: null }),
      // A refunded ride with Devon's details: never touched.
      transfer(GONE, 'Gil', 'gil@example.com', devonCols, { trip_type: 'one_way', arrival_at: wall('2026-11-29T10:00'), departure_at: null }, { status: 'refunded' }),
      // Ann's ride and Lee's ride.
      transfer(ANNS, 'Ana', 'ana@example.com', { driver_name: 'Ann Lee', driver_phone: '+1 876 555 0101', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PK 0001' }, { trip_type: 'one_way', arrival_at: wall('2026-11-29T12:00'), departure_at: null }),
      transfer(LEES, 'Lia', 'lia@example.com', leeCols, { trip_type: 'one_way', arrival_at: wall('2026-11-29T13:00'), departure_at: null }),
    ],
    dispatch_changes: [],
  }
}

const asFleet = () => { db.access = { ok: true, userId: 'u-lee', access: { role: 'fleet_manager', driver: db.tables.drivers[2], email: 'lee@example.com', label: 'Lee Grant', via: 'roster' } } }
const asAdminInPortal = () => { db.access = { ok: true, userId: 'u-admin', access: { role: 'fleet_manager', driver: null, email: 'owner@example.com', label: 'MAPL Tours Jamaica', via: 'admin' } } }
const asDriver = () => { db.access = { ok: true, userId: 'u-devon', access: { role: 'driver', driver: db.tables.drivers[0], email: 'devon@example.com', label: 'Devon Brown', via: 'roster' } } }
const admins = () => { db.adminUser = { id: 'u-admin', email: 'Owner@Example.com' }; db.tables.admins = [{ user_id: 'u-admin' }] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (fn: (r: Request) => Promise<any>, body: Row) => {
  const res = await fn(new Request('https://mapltours.com/api/x', { method: 'PATCH', body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}
const devon = () => db.tables.drivers[0]
const lee = () => db.tables.drivers[2]
const bk = (id: string) => db.tables.bookings.find((b) => b.id === id) as Row
const changes = () => db.tables.dispatch_changes
const office = () => db.mail.filter((m) => ([] as string[]).concat(m.to as string).includes('office@example.com'))
const toGuest = (email: string) => db.mail.filter((m) => m.to === email)
const fields = (d: Row) => ({ name: d.name, whatsapp: d.whatsapp, vehicle: d.vehicle, colour: d.colour, plate: d.plate, email: d.email })
const newVan = () => ({ id: DEVON, ...fields(devon()), vehicle: 'Toyota Noah', colour: 'White', plate: 'pk 0009' })
const money = () => JSON.stringify(db.tables.bookings.map((b) => [b.id, b.status, b.subtotal, b.total_paid]))

async function planThenCommit(fn: typeof fleetPATCH, body: Row, notify?: 'send' | 'skip') {
  const plan = await call(fn, { ...body, mode: 'plan' })
  expect(plan.status).toBe(200)
  const commit = await call(fn, { ...body, mode: 'commit', planKey: plan.json.plan.key, ...(notify ? { notify } : {}) })
  return { plan, commit }
}

beforeEach(() => {
  seed()
  asFleet()
  db.adminUser = null
  db.mail = []
  db.mailFails = []
  db.rpcCalls = []
  db.beforeEdit = null
  db.afterEdit = null
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(ja('2026-11-26T09:00'))
  process.env.OPERATIONS_EMAIL = 'office@example.com'
  delete process.env.WISE_PAYOUTS_ENABLED
  delete process.env.WISE_PAYOUT_RECIPIENTS
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('who may change a driver, and how', () => {
  test('nobody signed in: 401; a regular driver: 403; nothing read, written or sent', async () => {
    db.access = null
    expect((await call(fleetPATCH, { ...newVan(), mode: 'plan' })).status).toBe(401)
    asDriver()
    expect((await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: 'x' })).status).toBe(403)
    expect(db.rpcCalls).toEqual([])
    expect(devon().plate).toBe('PJ 1234')
    expect(db.mail).toEqual([])
  })

  test('a page from before the review step is told to reload, and nothing is saved', async () => {
    const r = await call(fleetPATCH, newVan())
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ code: 'reload', message: 'This page is out of date. Reload it, then make the change again. Nothing was saved.' })
    db.adminUser = { id: 'u-admin', email: 'owner@example.com' }
    db.tables.admins = [{ user_id: 'u-admin' }]
    const a = await call(adminPATCH, newVan())
    expect(a.status).toBe(409)
    expect(a.json.error).toBe('This page is out of date. Reload it, then make the change again. Nothing was saved.')
    expect(devon().plate).toBe('PJ 1234')
    expect(db.rpcCalls).toEqual([])
  })

  test('a field that breaks the rules, nothing changed, a retired driver, an unknown id: refused in words', async () => {
    expect((await call(fleetPATCH, { ...newVan(), plate: 'P!', mode: 'plan' })).json).toMatchObject({ field: 'plate', message: 'Add the license plate as it reads on the vehicle, for example PJ 1234.' })
    expect((await call(fleetPATCH, { id: DEVON, ...fields(devon()), mode: 'plan' })).json).toMatchObject({ ok: false, message: 'Nothing has changed.' })
    db.tables.drivers[3].active = false
    expect((await call(fleetPATCH, { id: SAM, ...fields(db.tables.drivers[3]), plate: 'PS 0004', mode: 'plan' })).json.message).toBe('Sam Hill is retired. Bring Sam Hill back first.')
    expect((await call(fleetPATCH, { ...newVan(), id: '55555555-5555-4555-8555-555555555555', mode: 'plan' })).status).toBe(404)
    expect((await call(fleetPATCH, { ...newVan(), id: 'Devon', mode: 'plan' })).status).toBe(400)
  })
})

describe('plan: what saving would do, and nothing written', () => {
  test('every paid ride still ahead that carries the old details, soonest first, each with when its guest hears', async () => {
    const r = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    expect(r.status).toBe(200)
    const w = r.json.plan.words
    expect(w.title).toBe("Change Devon Brown's details")
    expect(w.diff).toEqual([{ label: 'Vehicle', from: 'silver Toyota Hiace', to: 'white Toyota Noah' }, { label: 'Plate', from: 'PJ 1234', to: 'PK 0009' }])
    // Kim today, Maya tomorrow, Tom's tour on Dec 2. Not Ola (over), Joy (other details), Gil (refunded), Ana or Lia.
    expect(w.rides.map((x: Row) => x.title)).toEqual(['MAPL-BBBB5678 · Kim', 'MAPL-ABCD1234 · Maya', 'MAPL-CCCC9012 · Tom'])
    expect(w.rides[0].lines[0]).toMatchObject({ tone: 'ask', note: "Kim's day-of email went at 6:00 AM today with the old details." })
    expect(w.rides[1].lines.map((l: Row) => l.tone)).toEqual(['ok', 'ok'])
    expect(w.ridesIntro).toBe("Saving gives these rides Devon's new details. Past rides keep what their guests were told.")
    expect(w.notes.map((n: Row) => n.text)).toEqual(['1 ride ahead names Devon with other details and is left as it is.'])
    expect(w.question.title).toBe('Email Kim now?')
    expect(r.json.plan.decide).toEqual([KIM])
    expect(db.rpcCalls).toEqual([])
    expect(db.mail).toEqual([])
    expect(devon().plate).toBe('PJ 1234')
    expect(bk(MAYA).driver_plate).toBe('PJ 1234')
  })
})

describe('commit: saved only as confirmed', () => {
  test('send: the driver and the three rides change together, Kim gets the new-details email once, money untouched', async () => {
    const before = money()
    const { commit } = await planThenCommit(fleetPATCH, newVan(), 'send')
    expect(commit.status).toBe(200)
    expect(commit.json).toMatchObject({ ok: true, warn: false, moved: 3, message: "Saved. Devon's details are updated, and 3 upcoming rides carry them. Kim was emailed." })
    expect(devon()).toMatchObject({ vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0009', role: 'driver', active: true })
    const now = { driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Noah, white', driver_plate: 'PK 0009' }
    for (const id of [MAYA, KIM, TOM]) expect(bk(id)).toMatchObject(now)
    // Past, typed by hand, refunded, other drivers: as they were.
    for (const id of [OLD, GONE]) expect(bk(id)).toMatchObject(devonCols)
    expect(bk(JOY).driver_vehicle).toBe('Toyota Hiace, grey')
    expect(bk(ANNS).driver_name).toBe('Ann Lee')
    expect(bk(LEES)).toMatchObject(leeCols)
    expect(money()).toBe(before)
    // The log: one row per ride moved, by Lee, each settled.
    expect(changes().map((c) => [c.booking_id, c.kind, c.actor_label, c.guest_email]).sort()).toEqual([
      [MAYA, 'driver', 'Lee Grant', 'automatic'], [KIM, 'driver', 'Lee Grant', 'sent'], [TOM, 'driver', 'Lee Grant', 'not_needed'],
    ].sort())
    expect(changes()[0].before).toMatchObject({ ...devonCols, driver_id: DEVON })
    expect(changes()[0].after).toMatchObject({ ...now, driver_id: DEVON })
    // Kim's email: the details variant, keyed to this change, the driver copied; nobody else emailed; no alert.
    const kimMail = toGuest('kim@example.com')
    expect(kimMail).toHaveLength(1)
    expect(kimMail[0].subject).toBe('Your driver today: updated details (MAPL-BBBB5678)')
    const kimChange = changes().find((c) => c.booking_id === KIM)!
    expect(kimMail[0].dedupe).toBe(`dispatch-change/${kimChange.id}/arrival`)
    expect(kimMail[0].bcc).toEqual(['ops@example.com', 'devon@example.com'])
    expect(toGuest('maya@example.com')).toEqual([])
    expect(toGuest('tom@example.com')).toEqual([])
    expect(office()).toEqual([])
    expect(bk(KIM).dispatch).toMatchObject({ driver_update_arrival_sent: expect.any(String), driver_update_arrival_driver: 'Devon Brown' })
  })

  test('skip: nobody is emailed, the office is told which guests have the old details, the change is settled', async () => {
    const { commit } = await planThenCommit(fleetPATCH, newVan(), 'skip')
    expect(commit.json.message).toBe("Saved. Devon's details are updated, and 3 upcoming rides carry them. Kim wasn't emailed, and MAPL Tours Jamaica was told.")
    expect(toGuest('kim@example.com')).toEqual([])
    expect(office().map((m) => m.subject)).toEqual(["Guests not emailed about a driver's new details: Devon Brown"])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alert = (office()[0].react as any).props
    expect(alert.body).toBe("Lee Grant changed Devon Brown's details and chose not to email the guests who already had the old ones. Check that each guest knows, by WhatsApp or by email.")
    expect(alert.lines).toEqual([
      'Driver: Devon Brown',
      'Before: Toyota Hiace, silver · PJ 1234 · +1 876 555 0100',
      'Now: Toyota Noah, white · PK 0009 · +1 876 555 0100',
      'Rides: MAPL-BBBB5678 (Kim)',
      'Changed by: Lee Grant',
    ])
    expect(changes().find((c) => c.booking_id === KIM)).toMatchObject({ guest_email: 'skipped' })
  })

  test('the office alert failing on skip: kept open, and the sweep tells the office later, saying what changed', async () => {
    db.mailFails = ["Guests not emailed about a driver's new details"]
    const { commit } = await planThenCommit(fleetPATCH, newVan(), 'skip')
    expect(commit.json.message).toContain('MAPL Tours Jamaica will be told.')
    const open = changes().find((c) => c.booking_id === KIM)!
    expect(open).toMatchObject({ guest_email: 'pending', guest_email_detail: 'skipped: chose not to email; the office alert has not gone yet' })
    db.mailFails = []
    open.created_at = new Date(Date.now() - 11 * 60_000).toISOString()
    process.env.CRON_SECRET = 'cron-test'
    const sweep = await sweepGET(new Request('https://x/api/driver/change/sweep', { headers: { authorization: 'Bearer cron-test' } }) as never)
    expect(await sweep.json()).toMatchObject({ told: 1 })
    const told = office().filter((m) => String(m.subject).startsWith('Guest not emailed'))
    expect(told).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((told[0].react as any).props.lines).toContain('Driver: Devon Brown · silver Toyota Hiace · PJ 1234, now Devon Brown · white Toyota Noah · PK 0009')
    expect(changes().find((c) => c.booking_id === KIM)).toMatchObject({ guest_email: 'skipped' })
  })

  test('a send that fails: the change stays saved, the office is told, the person is told how to try again', async () => {
    db.mailFails = ['kim@example.com']
    const { commit } = await planThenCommit(fleetPATCH, newVan(), 'send')
    expect(commit.json.warn).toBe(true)
    expect(commit.json.message).toBe("Saved. Devon's details are updated, and 3 upcoming rides carry them. The email to Kim didn't go. MAPL Tours Jamaica was told; open the ride to try again.")
    expect(devon().plate).toBe('PK 0009')
    expect(office().map((m) => m.subject)).toEqual(["Guests not emailed about a driver's new details: Devon Brown"])
    expect(changes().find((c) => c.booking_id === KIM)).toMatchObject({ guest_email: 'failed' })
    // The ride card offers the email again, and the follow-up sends the new-details email, not a "new driver" one.
    db.mailFails = []
    const kimChange = changes().find((c) => c.booking_id === KIM)!
    const res = await changePOST(new Request('https://mapltours.com/api/driver/change', { method: 'POST', body: JSON.stringify({ mode: 'email', changeId: kimChange.id, email: 'send' }) }))
    expect(res.status).toBe(200)
    const again = toGuest('kim@example.com').at(-1)!
    expect(again.subject).toBe('Your driver today: updated details (MAPL-BBBB5678)')
  })

  test('a plan that needs the email question is not saved without an answer; a stale plan is not saved', async () => {
    const plan = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    const no = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key })
    expect(no.status).toBe(409)
    expect(no.json).toMatchObject({ code: 'decide', message: 'Choose whether to email the guests.' })
    // Maya's day-of email goes before the save: her ride is now one to ask about too.
    bk(MAYA).dispatch = { dayof_arrival_sent: new Date(ja('2026-11-26T08:30')).toISOString() }
    const stale = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key, notify: 'send' })
    expect(stale.status).toBe(409)
    expect(stale.json.code).toBe('replan')
    expect(stale.json.plan.decide.sort()).toEqual([KIM, MAYA].sort())
    expect(db.rpcCalls).toEqual([])
    expect(devon().plate).toBe('PJ 1234')
    expect(db.mail).toEqual([])
  })

  test('an email that cannot be written is refused before anything is saved', async () => {
    bk(KIM).booking_items = [{ ...(bk(KIM).booking_items as Row[])[0], hotel: null }]
    const { commit } = await planThenCommit(fleetPATCH, newVan(), 'send')
    expect(commit.status).toBe(409)
    expect(String(commit.json.message)).toMatch(/^MAPL-BBBB5678: .* Nothing was changed\.$/)
    expect(db.rpcCalls).toEqual([])
    expect(devon().plate).toBe('PJ 1234')
  })

  test('someone else changed the driver between the plan and the save: nothing saved, the new plan shown', async () => {
    const plan = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    db.beforeEdit = () => { db.tables.drivers[0].whatsapp = '+1 876 555 0177'; db.beforeEdit = null }
    const r = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key, notify: 'send' })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ code: 'changed', message: 'This driver was changed by someone else a moment ago. Nothing was saved.' })
    expect(devon().plate).toBe('PJ 1234')
    expect(bk(MAYA).driver_plate).toBe('PJ 1234')
    expect(changes()).toEqual([])
    expect(db.mail).toEqual([])
  })

  test('a ride given to another driver as the save runs keeps its new driver, and the person is told', async () => {
    const plan = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    db.beforeEdit = () => { Object.assign(bk(MAYA), { driver_name: 'Ann Lee', driver_phone: '+1 876 555 0101', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PK 0001' }); db.beforeEdit = null }
    const r = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key, notify: 'send' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ warn: true, moved: 2 })
    expect(r.json.message).toBe("Saved. Devon's details are updated, and 2 upcoming rides carry them. Kim was emailed. 1 ride changed while you were saving and kept its details.")
    expect(bk(MAYA).driver_name).toBe('Ann Lee')
  })

  test("Maya's day-of email going out as the save runs: her change is kept open, and the person is told to email her", async () => {
    const plan = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    db.afterEdit = () => { (bk(MAYA).dispatch as Row).dayof_arrival_sent = new Date().toISOString() }
    const r = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key, notify: 'send' })
    expect(r.json.warn).toBe(true)
    expect(r.json.message).toContain("Maya's day-of email went out just as you saved. Open the ride to email Maya.")
    expect(changes().find((c) => c.booking_id === MAYA)).toMatchObject({ guest_email: 'pending', guest_email_detail: 'raced: the day-of email went as this was saved' })
  })

  test('no email address on a booking that needs one: saved, the person told to use WhatsApp, the office told', async () => {
    bk(KIM).email = null
    const plan = await call(fleetPATCH, { ...newVan(), mode: 'plan' })
    expect(plan.json.plan.words.question).toBeNull()
    const r = await call(fleetPATCH, { ...newVan(), mode: 'commit', planKey: plan.json.plan.key })
    expect(r.status).toBe(200)
    expect(r.json.message).toBe("Saved. Devon's details are updated, and 3 upcoming rides carry them. Kim has no email address. Tell Kim on WhatsApp; MAPL Tours Jamaica was told.")
    expect(office().map((m) => m.subject)).toEqual(["Guests not emailed about a driver's new details: Devon Brown"])
    expect(changes().find((c) => c.booking_id === KIM)).toMatchObject({ guest_email: 'unreachable' })
  })
})

describe("a fleet manager's own details", () => {
  test('Lee changes Lee\'s own van: saved, and Lee\'s ride moves with it', async () => {
    const { commit } = await planThenCommit(fleetPATCH, { id: LEE, ...fields(lee()), vehicle: 'Toyota Hiace', colour: 'black', plate: 'PL 7777' })
    expect(commit.status).toBe(200)
    expect(lee()).toMatchObject({ name: 'Lee Grant', vehicle: 'Toyota Hiace', colour: 'black', plate: 'PL 7777', email: 'Lee@Example.com', role: 'fleet_manager' })
    expect(bk(LEES)).toMatchObject({ driver_name: 'Lee Grant', driver_vehicle: 'Toyota Hiace, black', driver_plate: 'PL 7777' })
  })

  test("never a fleet manager's name or sign-in email, from the portal; the saved address kept exactly as it is", async () => {
    const name = await call(fleetPATCH, { id: LEE, ...fields(lee()), name: 'Lee Grantham', mode: 'plan' })
    expect(name.status).toBe(403)
    expect(name.json).toMatchObject({ field: 'name', message: "Only MAPL Tours Jamaica changes a fleet manager's name or sign-in email. Write to contact@mapltours.com." })
    const email = await call(fleetPATCH, { id: LEE, ...fields(lee()), email: 'lee.g@example.com', mode: 'plan' })
    expect(email.status).toBe(403)
    expect(email.json.field).toBe('email')
    // The form sends the address as it shows it (lower case): not a change, and the saved spelling stays.
    const plate = await call(fleetPATCH, { id: LEE, ...fields(lee()), email: 'lee@example.com', plate: 'PK 0003', mode: 'plan' })
    expect(plate.status).toBe(200)
    expect(plate.json.plan.words.diff).toEqual([{ label: 'Plate', from: 'PK 0002', to: 'PK 0003' }])
    // A role in a portal request is refused.
    expect((await call(fleetPATCH, { id: DEVON, ...fields(devon()), role: 'fleet_manager', mode: 'plan' })).status).toBe(403)
  })

  test('an admin in the portal preview has exactly the fleet manager\'s settings: the same edits, the same locks', async () => {
    asAdminInPortal()
    const ok = await planThenCommit(fleetPATCH, newVan(), 'skip')
    expect(ok.commit.status).toBe(200)
    expect(changes().every((c) => c.actor_label === 'MAPL Tours Jamaica' && c.actor_email === 'owner@example.com')).toBe(true)
    expect((await call(fleetPATCH, { id: LEE, ...fields(lee()), name: 'Lee Grantham', mode: 'plan' })).status).toBe(403)
    expect((await call(fleetPATCH, { id: LEE, action: 'retire' })).status).toBe(403)
  })
})

describe('the admin Drivers page', () => {
  beforeEach(admins)

  test('the same review: plan, then commit, logged as from MAPL Tours Jamaica', async () => {
    const { plan, commit } = await planThenCommit(adminPATCH, newVan(), 'send')
    expect(plan.json.plan.words.title).toBe("Change Devon Brown's details")
    expect(commit.status).toBe(200)
    expect(devon().plate).toBe('PK 0009')
    expect(changes().every((c) => c.actor_label === 'MAPL Tours Jamaica' && c.actor_email === 'owner@example.com')).toBe(true)
  })

  test("an admin may change a fleet manager's name, sign-in email and role", async () => {
    const { plan, commit } = await planThenCommit(adminPATCH, { id: LEE, ...fields(lee()), name: 'Lee Grantham', email: 'lee.g@example.com', role: 'driver' })
    expect(plan.json.plan.words.diff).toEqual([
      { label: 'Name', from: 'Lee Grant', to: 'Lee Grantham' },
      { label: 'Sign-in email', from: 'Lee@Example.com', to: 'lee.g@example.com' },
      { label: 'Role', from: 'Fleet manager', to: 'Driver' },
    ])
    expect(commit.status).toBe(200)
    expect(lee()).toMatchObject({ name: 'Lee Grantham', email: 'lee.g@example.com', role: 'driver' })
    expect(bk(LEES).driver_name).toBe('Lee Grantham')
  })

  test("another working driver's name or sign-in email: refused at the field, with nothing changed", async () => {
    const name = await planThenCommit(adminPATCH, { ...newVan(), name: 'Ann Lee' }, 'send')
    expect(name.commit.status).toBe(409)
    expect(name.commit.json).toMatchObject({ field: 'name', message: 'Another working driver already has that name. Nothing was changed.', error: 'Another working driver already has that name. Nothing was changed.' })
    const email = await planThenCommit(adminPATCH, { ...newVan(), email: 'ANN@example.com' }, 'send')
    expect(email.commit.json).toMatchObject({ field: 'email', message: 'Another working driver already signs in with that email. Nothing was changed.' })
    expect(devon().plate).toBe('PJ 1234')
    expect(bk(MAYA).driver_plate).toBe('PJ 1234')
  })

  test('a non-admin is refused before anything is read', async () => {
    db.tables.admins = []
    expect((await call(adminPATCH, { ...newVan(), mode: 'plan' })).status).toBe(403)
    db.adminUser = null
    expect((await call(adminPATCH, { ...newVan(), mode: 'plan' })).status).toBe(401)
  })
})

describe('a renamed driver and the payout job', () => {
  test('a new name the payout job cannot pay: said in the review, told to the office on save', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    process.env.WISE_PAYOUT_RECIPIENTS = JSON.stringify({ 'Devon Brown': 1, 'Lee Grant': 1, 'Ann Lee': 1 })
    const { plan, commit } = await planThenCommit(fleetPATCH, { id: DEVON, ...fields(devon()), name: 'Devin Brown' }, 'send')
    expect(plan.json.plan.words.notes.at(-1).text).toBe("Devin Brown isn't set up for payment yet, so rides under the new name are held until MAPL Tours Jamaica adds it. Saving tells them.")
    expect(commit.status).toBe(200)
    expect(office().map((m) => m.subject)).toContain('Driver not set up for payment: Devin Brown')
    expect(toGuest('kim@example.com')[0].subject).toBe('Your driver today: updated details (MAPL-BBBB5678)')
  })
})

describe('retiring a driver who still has rides ahead', () => {
  test('refused with the rides named, from the portal and the admin page; a driver with none is retired', async () => {
    const r = await call(fleetPATCH, { id: DEVON, action: 'retire' })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ code: 'has_rides', message: 'Devon still has 4 rides ahead. Give each one to another driver first, then retire Devon.' })
    expect(r.json.rides.map((x: Row) => [x.ref, x.guest, x.when])).toEqual([
      ['MAPL-BBBB5678', 'Kim', 'Thu, Nov 26'], ['MAPL-ABCD1234', 'Maya', 'Fri, Nov 27'], ['MAPL-EEEE7890', 'Joy', 'Sat, Nov 28'], ['MAPL-CCCC9012', 'Tom', 'Wed, Dec 2'],
    ])
    expect(devon().active).toBe(true)
    admins()
    const a = await call(adminPATCH, { id: DEVON, action: 'retire' })
    expect(a.status).toBe(409)
    expect(a.json.error).toBe('Devon still has 4 rides ahead. Give each one to another driver first, then retire Devon.')
    expect(devon().active).toBe(true)
    const sam = await call(fleetPATCH, { id: SAM, action: 'retire' })
    expect(sam.status).toBe(200)
    expect(db.tables.drivers[3].active).toBe(false)
    // Bringing back is never refused for rides.
    expect((await call(fleetPATCH, { id: SAM, action: 'restore' })).status).toBe(200)
  })
})

describe('new rides after an edit', () => {
  test("the default driver's new details are stamped on the next paid ride", async () => {
    // The default driver is known by name (DEFAULT_DRIVER.driver_name): the fleet manager's row takes that
    // name here, with made-up details, and is the one edited.
    Object.assign(db.tables.drivers[2], { name: 'Collin', whatsapp: '+1 876 555 0104', vehicle: 'Toyota Noah minivan', colour: 'black', plate: 'PM 0000', email: 'lee@example.com' })
    const { commit } = await planThenCommit(fleetPATCH, { id: LEE, ...fields(lee()), plate: 'PM 0001' })
    expect(commit.status).toBe(200)
    expect(await defaultDriverColumns((await import('@/lib/supabase/service')).createServiceClient())).toEqual({
      driver_name: 'Collin', driver_phone: '+1 876 555 0104', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PM 0001',
    })
  })
})
