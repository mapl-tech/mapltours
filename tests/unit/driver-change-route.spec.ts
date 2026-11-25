import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * The driver portal's change route (app/api/driver/change) and the saved
 * drivers route for fleet managers (app/api/driver/drivers), over an
 * in-memory database that keeps apply_dispatch_change's rules (migration 043:
 * paid only, refused when the booking no longer holds what was shown) and a
 * fake Resend. Owner, Nov 24 2026:
 *
 *   "Whenever a driver assignment or pickup time is updated, display a
 *   confirmation prompt asking the user to confirm the change before it is
 *   saved ... if change happens within the time that the customer would have
 *   received the email, send the email after a second confirmation popup. If
 *   a change happens and the email is chosen not to be sent, email me an
 *   alert." "There can be no mistakes to the booking flow, money flow, or
 *   webhooks."
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
  mail: [] as Array<Record<string, unknown>>,
  mailFails: [] as string[],
  calendar: [] as string[],
  /** Simulate the hourly job claiming the day-of email inside the save. */
  raceStamp: null as null | { leg: 'arrival' | 'departure' },
  env: {} as Record<string, string>,
  rpcCalls: [] as string[],
}))

vi.mock('@/lib/driver-access-server', () => ({
  DRIVER_ROLE_COLS: 'id, name, whatsapp, vehicle, colour, plate, email, active, role, created_at, updated_at',
  getDriverAccess: async () => db.access ?? { ok: false, denied: 'not_signed_in' },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '1.1.1.1' }))
vi.mock('@/lib/travel-party-server', () => ({ sendToParty: async () => ({ sent: 0, failed: 0 }) }))
vi.mock('@/lib/google-calendar', () => ({
  updateBookingInCalendar: async (b: Row) => { db.calendar.push(String(b.id)); return { ok: true } },
}))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (m: Record<string, unknown>) => {
    db.mail.push(m)
    const to = ([] as string[]).concat(m.to as string)
    if (to.some((t) => db.mailFails.includes(t)) || db.mailFails.includes(String(m.subject))) return { ok: false, error: 'refused' }
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
  api.in = (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return api }
  api.ilike = (k: string, v: string) => { const re = new RegExp(`^${v.replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/%/g, '.*')}$`, 'i'); filters.push((r) => re.test(String(r[k] ?? ''))); return api }
  api.or = () => api
  api.order = (k: string, o?: { ascending?: boolean }) => { order = [k, o?.ascending !== false]; return api }
  api.limit = (n: number) => { limit = n; return api }
  api.update = (v: Row) => { op = 'update'; values = v; return api }
  api.insert = (v: Row) => { op = 'insert'; values = v; return api }
  const run = () => {
    if (op === 'insert') {
      const row: Row = { id: `${table}-${rows().length + 1}`, created_at: new Date().toISOString(), ...values }
      if (table === 'drivers' && rows().some((r) => r.active && String(r.name).toLowerCase() === String(row.name).toLowerCase())) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "drivers_active_name_once"' } }
      }
      rows().push(row)
      return { data: row, error: null }
    }
    let hit = rows().filter((r) => filters.every((f) => f(r)))
    if (op === 'update') {
      for (const r of hit) Object.assign(r, values)
      return { data: single ? hit[0] ?? null : hit, error: null }
    }
    if (order) { const [k, asc] = order; hit = [...hit].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1)) }
    // A read hands back copies, as PostgREST does: a later write never reaches into a row already read.
    hit = structuredClone(hit.slice(0, limit))
    return { data: single ? hit[0] ?? null : hit, error: null }
  }
  api.maybeSingle = async () => { single = true; return run() }
  api.single = async () => { single = true; return run() }
  api.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
  return api
}

/** apply_dispatch_change, with the migration's rules. */
function applyDispatchChange(a: Row) {
  db.rpcCalls.push('apply_dispatch_change')
  const b = (db.tables.bookings ?? []).find((r) => r.id === a.p_booking_id)
  if (!b) return { result: 'not_found' }
  if (b.status !== 'paid') return { result: 'not_paid', status: b.status }
  const before = a.p_before as Row
  const after = a.p_after as Row
  const same = (x: unknown, y: unknown) => (x ?? null) === (y ?? null)
  if (a.p_kind === 'driver') {
    for (const k of ['driver_name', 'driver_phone', 'driver_vehicle', 'driver_plate']) if (!same(b[k], before[k])) return { result: 'changed' }
    Object.assign(b, { driver_name: after.driver_name, driver_phone: after.driver_phone, driver_vehicle: after.driver_vehicle, driver_plate: after.driver_plate })
  } else if (a.p_kind === 'time') {
    const item = (b.booking_items as Row[])[0]
    const col = a.p_leg === 'arrival' ? 'arrival_at' : 'departure_at'
    if (Date.parse(String(item[col])) !== Date.parse(String(before.at))) return { result: 'changed' }
    item[col] = after.at
  } else {
    if (!same(b.pickup_time, before.pickup_time)) return { result: 'changed' }
    b.pickup_time = after.pickup_time
  }
  const id = crypto.randomUUID()
  db.tables.dispatch_changes ??= []
  db.tables.dispatch_changes.push({ id, booking_id: b.id, kind: a.p_kind, leg: a.p_kind === 'time' ? a.p_leg : null, before, after, actor_email: a.p_actor_email, actor_label: a.p_actor_label, guest_email: 'pending', guest_email_detail: null, created_at: new Date().toISOString() })
  if (db.raceStamp) (b.dispatch as Row)[`dayof_${db.raceStamp.leg}_sent`] = new Date().toISOString()
  return { result: 'applied', id }
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: q,
    rpc: async (fn: string, args: Row) => {
      if (fn === 'apply_dispatch_change') return { data: applyDispatchChange(args), error: null }
      if (fn === 'merge_dispatch') {
        const b = (db.tables.bookings ?? []).find((r) => r.id === args.p_booking_id)
        if (b) Object.assign(b.dispatch as Row, args.p_patch as Row)
        return { data: [{ id: args.p_booking_id }], error: null }
      }
      throw new Error(`unexpected rpc ${fn}`)
    },
  }),
}))

import { POST } from '@/app/api/driver/change/route'
import { GET as sweepGET } from '@/app/api/driver/change/sweep/route'
import { GET as rosterGET, POST as rosterPOST, PATCH as rosterPATCH } from '@/app/api/driver/drivers/route'

const B = 'abcd1234-6c73-444e-83c6-1f79f15a59d1'
const T = 'eeee1234-6c73-444e-83c6-1f79f15a59d1'
const DEVON = '11111111-1111-4111-8111-111111111111'
const ANN = '22222222-2222-4222-8222-222222222222'
const LEE = '33333333-3333-4333-8333-333333333333'
const devonCols = { driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PJ 1234' }

function seed(over: Row = {}, item: Row = {}) {
  db.tables = {
    drivers: [
      { id: DEVON, name: 'Devon Brown', whatsapp: '+1 876 555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PJ 1234', email: 'devon@example.com', active: true, role: 'driver' },
      { id: ANN, name: 'Ann Lee', whatsapp: '+1 876 555 0101', vehicle: 'Toyota Noah', colour: 'black', plate: 'PK 0001', email: null, active: true, role: 'driver' },
      { id: LEE, name: 'Lee Grant', whatsapp: '+1 876 555 0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', email: 'lee@example.com', active: true, role: 'fleet_manager' },
    ],
    bookings: [
      {
        id: B, booking_type: 'transfer', status: 'paid', email: 'maya@example.com', first_name: 'Maya', last_name: 'Grey', phone: null,
        subtotal: 100, total_paid: 120, ...devonCols, dispatch: {}, pickup: null, dropoff: null, pickup_time: null,
        booking_items: [{ item_type: 'transfer', hotel: 'Seaview Resort, Negril', trip_type: 'round_trip', passengers: 2, arrival_at: wall('2026-11-27T14:10'), arrival_flight: 'AA 1311', departure_at: wall('2026-11-30T15:30'), departure_flight: 'AA 1312', ...item }],
        ...over,
      },
      {
        id: T, booking_type: 'tour', status: 'paid', email: 'tom@example.com', first_name: 'Tom', last_name: 'Ray', phone: null, subtotal: 300, total_paid: 360,
        driver_name: null, driver_phone: null, driver_vehicle: null, driver_plate: null, dispatch: {}, pickup: 'Seaview Resort, Negril', dropoff: null, pickup_time: null,
        booking_items: [{ item_type: 'experience', title: 'River rafting', date: '2026-12-02', travelers: 2 }],
      },
    ],
    dispatch_changes: [],
  }
}
const asFleet = () => { db.access = { ok: true, userId: 'u-lee', access: { role: 'fleet_manager', driver: db.tables.drivers[2], email: 'lee@example.com', label: 'Lee Grant', via: 'roster' } } }
const asDriver = () => { db.access = { ok: true, userId: 'u-devon', access: { role: 'driver', driver: db.tables.drivers[0], email: 'devon@example.com', label: 'Devon Brown', via: 'roster' } } }
const post = async (body: Row) => {
  const res = await POST(new Request('https://mapltours.com/api/driver/change', { method: 'POST', body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}
const booking = () => db.tables.bookings[0]
const changes = () => db.tables.dispatch_changes
const office = () => db.mail.filter((m) => ([] as string[]).concat(m.to as string).includes('ops@example.com') || ([] as string[]).concat(m.to as string).includes('office@example.com'))
const guestMail = () => db.mail.filter((m) => m.to === 'maya@example.com')

async function planThenCommit(change: Row, email?: 'send' | 'skip', bookingId = B) {
  const plan = await post({ mode: 'plan', bookingId, change })
  expect(plan.status).toBe(200)
  const commit = await post({ mode: 'commit', bookingId, change, planKey: plan.json.plan.key, ...(email ? { email } : {}) })
  return { plan, commit }
}

beforeEach(() => {
  seed()
  asFleet()
  db.mail = []
  db.mailFails = []
  db.calendar = []
  db.raceStamp = null
  db.rpcCalls = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(ja('2026-11-26T09:00'))
  process.env.OPERATIONS_EMAIL = 'office@example.com'
  delete process.env.WISE_PAYOUTS_ENABLED
  delete process.env.WISE_PAYOUT_RECIPIENTS
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('who may change a ride', () => {
  test('nobody signed in: 401; a regular driver: 403; refused or unreadable access: 403 or 503; nothing read or written', async () => {
    db.access = null
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })).status).toBe(401)
    asDriver()
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: 'x' })
    expect(r.status).toBe(403)
    expect(r.json.message).toBe('Only a fleet manager can change rides.')
    db.access = { ok: false, denied: 'retired' }
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })).status).toBe(403)
    db.access = { ok: false, denied: 'unavailable' }
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })).status).toBe(503)
    expect(db.rpcCalls).toEqual([])
    expect(booking().driver_name).toBe('Devon Brown')
    expect(db.mail).toEqual([])
  })

  test('a malformed request is refused before anything is read', async () => {
    for (const body of [
      { mode: 'plan', bookingId: 'x', change: { kind: 'driver', driverId: ANN } },
      { mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: 'Ann' } },
      { mode: 'plan', bookingId: B, change: { kind: 'time', leg: 'lunch', at: '2026-11-30T12:00' } },
      { mode: 'plan', bookingId: B, change: { kind: 'tour_time', time: '8:30 in the morning' } },
      { mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN } },
      { mode: 'email', changeId: 'x', email: 'send' },
      { mode: 'delete', bookingId: B },
    ]) expect((await post(body)).status).toBe(400)
  })
})

describe('plan: the first step writes nothing', () => {
  test('a new driver days ahead: the words, the key, and no write or email', async () => {
    const r = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    expect(r.status).toBe(200)
    expect(r.json.plan.ref).toBe('MAPL-ABCD1234')
    expect(r.json.plan.decide).toEqual([])
    expect(r.json.plan.words.title).toBe('Change the driver')
    expect(r.json.plan.words.rides.map((x: Row) => x.note)).toEqual([
      "Maya's day-of email, about 2:00 AM tomorrow, will name Ann.",
      "Maya's day-of email, about 3:00 AM on Monday, will name Ann.",
    ])
    expect(db.rpcCalls).toEqual([])
    expect(db.mail).toEqual([])
    expect(changes()).toEqual([])
  })

  test('refusals in words: the driver already on it, a retired driver, a past time, a tour time on a ride', async () => {
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: DEVON } })).json.message).toBe('Devon Brown is already on this ride.')
    db.tables.drivers[1].active = false
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })).json.message).toBe('Ann Lee is retired. Choose another driver.')
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'time', leg: 'departure', at: '2026-11-26T08:00' } })).json.message).toBe('Choose a time that has not passed yet.')
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'tour_time', time: '08:30' } })).json.message).toBe('Only a tour has a tour pickup time.')
    booking().status = 'refunded'
    expect((await post({ mode: 'plan', bookingId: B, change: { kind: 'time', leg: 'departure', at: '2026-11-30T12:00' } })).json.message).toBe('This booking is not paid, so nothing on it can be changed here.')
  })
})

describe('commit: saved only as confirmed', () => {
  test('a new driver days ahead: saved, logged, no email (the day-of email will carry it), no alert', async () => {
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN })
    expect(commit.status).toBe(200)
    expect(commit.json).toMatchObject({ ok: true, outcome: 'automatic', message: "Saved. Maya's day-of email will carry it." })
    expect(booking()).toMatchObject({ driver_name: 'Ann Lee', driver_phone: '+1 876 555 0101', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PK 0001' })
    expect(booking()).toMatchObject({ status: 'paid', subtotal: 100, total_paid: 120 })
    expect(changes()[0]).toMatchObject({ kind: 'driver', guest_email: 'automatic', actor_label: 'Lee Grant', actor_email: 'lee@example.com' })
    expect(db.mail).toEqual([])
  })

  test('a stale confirmation (the plan moved since) is not saved: 409 with the new plan', async () => {
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    // The day-of email for the arrival goes before the person presses Save.
    vi.setSystemTime(ja('2026-11-27T02:10'))
    booking().dispatch = { dayof_arrival_sent: new Date(ja('2026-11-27T02:00')).toISOString() }
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: plan.json.plan.key })
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('replan')
    expect(r.json.plan.decide).toEqual(['arrival'])
    expect(booking().driver_name).toBe('Devon Brown')
    expect(db.rpcCalls).toEqual([])
  })

  test('a plan that needs the second question is not saved without an answer', async () => {
    booking().dispatch = { dayof_departure_sent: new Date(ja('2026-11-30T03:00')).toISOString() }
    vi.setSystemTime(ja('2026-11-30T08:00'))
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    expect(plan.json.plan.decide).toEqual(['departure'])
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: plan.json.plan.key })
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('decide')
    expect(booking().driver_name).toBe('Devon Brown')
  })

  test('somebody else changed the driver between the plan and the save: nothing saved, 409', async () => {
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    Object.assign(booking(), { driver_name: 'Sam Hill', driver_phone: '+1 876 555 0199', driver_vehicle: 'Toyota Hiace, white', driver_plate: 'PS 0001' })
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: plan.json.plan.key })
    expect(r.status).toBe(409)
    expect(booking().driver_name).toBe('Sam Hill')
    expect(changes()).toEqual([])
  })
})

describe('the second question: email the guest, or tell the office', () => {
  beforeEach(() => {
    booking().dispatch = { dayof_departure_sent: new Date(ja('2026-11-30T03:00')).toISOString() }
    vi.setSystemTime(ja('2026-11-30T08:00'))
  })

  test('send: the guest gets the driver-update email about the new driver, once, keyed to this change; no alert', async () => {
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN }, 'send')
    expect(commit.json).toMatchObject({ ok: true, outcome: 'sent', message: 'Saved. Maya was emailed.' })
    const g = guestMail()
    expect(g).toHaveLength(1)
    expect(g[0].subject).toBe('Your ride to the airport today: Ann Lee, black Toyota Noah (MAPL-ABCD1234)')
    expect(g[0].dedupe).toBe(`dispatch-change/${changes()[0].id}/departure`)
    expect(g[0].bcc).toEqual(['ops@example.com'])
    expect((booking().dispatch as Row).driver_update_departure_sent).toBeTruthy()
    expect(changes()[0].guest_email).toBe('sent')
    expect(office()).toEqual([])
  })

  test('skip: the guest gets nothing, the office gets the alert, and it says what changed', async () => {
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN }, 'skip')
    expect(commit.json).toMatchObject({ ok: true, outcome: 'skipped', message: "Saved. Maya wasn't emailed, and MAPL Tours Jamaica was told." })
    expect(guestMail()).toEqual([])
    const o = office()
    expect(o).toHaveLength(1)
    expect(o[0].to).toEqual(['office@example.com'])
    expect(o[0].subject).toBe('Guest not emailed about a change: MAPL-ABCD1234')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = (o[0].react as any).props
    expect(props.body).toContain('Lee Grant saved a change on MAPL-ABCD1234 and chose not to email Maya.')
    expect(props.lines).toContain('Driver: Devon Brown · silver Toyota Hiace · PJ 1234, now Ann Lee · black Toyota Noah · PK 0001')
    expect(changes()[0].guest_email).toBe('skipped')
    expect(booking().driver_name).toBe('Ann Lee')
  })

  test('skip, with the office alert failing: kept open, and the sweep tells the office later', async () => {
    db.mailFails = ['office@example.com']
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN }, 'skip')
    expect(commit.json.outcome).toBe('pending')
    expect(changes()[0]).toMatchObject({ guest_email: 'pending' })
    expect(String(changes()[0].guest_email_detail)).toMatch(/^skipped/)
    // Ten minutes on, the alert goes through.
    db.mailFails = []
    changes()[0].created_at = new Date(Date.now() - 11 * 60_000).toISOString()
    process.env.CRON_SECRET = 'cron-test'
    const res = await sweepGET(new Request('https://mapltours.com/api/driver/change/sweep', { headers: { authorization: 'Bearer cron-test' } }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, told: 1 })
    expect(changes()[0].guest_email).toBe('skipped')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((office().at(-1)!.react as any).props.body).toContain('chose not to email Maya')
  })

  test('a send that fails: the change stays saved, the office is told, the person is told to tell the guest', async () => {
    db.mailFails = ['maya@example.com']
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN }, 'send')
    expect(commit.json).toMatchObject({ ok: true, outcome: 'failed' })
    expect(commit.json.message).toBe("Saved, but the email to Maya didn't go. MAPL Tours Jamaica was told. Tell Maya on WhatsApp, or try the email again.")
    expect(office()).toHaveLength(1)
    expect(changes()[0].guest_email).toBe('failed')
    // Trying again from the card: the follow-up sends it.
    db.mailFails = []
    const again = await post({ mode: 'email', changeId: changes()[0].id, email: 'send' })
    expect(again.json).toMatchObject({ ok: true, outcome: 'sent' })
    expect(changes()[0].guest_email).toBe('sent')
  })

  test('an email that cannot be written is refused before anything is saved', async () => {
    ;(booking().booking_items as Row[])[0].hotel = ''
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: plan.json.plan.key, email: 'send' })
    expect(r.status).toBe(409)
    expect(r.json.message).toBe('This booking has no hotel, so the email cannot say where the ride goes. Nothing was changed.')
    expect(booking().driver_name).toBe('Devon Brown')
    expect(db.rpcCalls).toEqual([])
  })

  test('a new time cannot be emailed about a driver who is not saved: refused before anything is saved', async () => {
    Object.assign(booking(), { driver_name: 'Sam Hill', driver_phone: '+1 876 555 0199', driver_vehicle: 'Toyota Hiace, white', driver_plate: 'PS 0001' })
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'time', leg: 'departure', at: '2026-11-30T12:00' } })
    expect(plan.json.plan.decide).toEqual(['departure'])
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'time', leg: 'departure', at: '2026-11-30T12:00' }, planKey: plan.json.plan.key, email: 'send' })
    expect(r.status).toBe(409)
    expect(r.json.message).toMatch(/not on the drivers list.*Nothing was changed/)
    expect((booking().booking_items as Row[])[0].departure_at).toBe(wall('2026-11-30T15:30'))
    expect(db.rpcCalls).toEqual([])
    expect(db.mail).toEqual([])
  })

  test('a new pickup time, sent: the new-time email, with the old time named', async () => {
    const { commit } = await planThenCommit({ kind: 'time', leg: 'departure', at: '2026-11-30T12:00' }, 'send')
    expect(commit.json.outcome).toBe('sent')
    expect((booking().booking_items as Row[])[0].departure_at).toBe(wall('2026-11-30T12:00'))
    const g = guestMail()
    expect(g[0].subject).toBe('New pickup time today: 12:00 noon (MAPL-ABCD1234)')
    expect(db.calendar).toEqual([B])
  })
})

describe('no question needed, and the cases around it', () => {
  test('a new pickup time days ahead: saved, the calendar moved, no email', async () => {
    vi.setSystemTime(ja('2026-11-28T09:00'))
    const { commit } = await planThenCommit({ kind: 'time', leg: 'departure', at: '2026-11-30T12:00' })
    expect(commit.json).toMatchObject({ ok: true, outcome: 'automatic', calendar: 'done' })
    expect(db.calendar).toEqual([B])
    expect(db.mail).toEqual([])
  })

  test('no email address on the booking: saved, and the office is told', async () => {
    booking().email = null
    const { commit } = await planThenCommit({ kind: 'driver', driverId: ANN })
    expect(commit.json).toMatchObject({ ok: true, outcome: 'unreachable', message: 'Saved. Maya has no email address, so MAPL Tours Jamaica was told.' })
    expect(office()).toHaveLength(1)
  })

  test('a tour: saved, no email, no alert, no question', async () => {
    const { commit } = await planThenCommit({ kind: 'tour_time', time: '07:45' }, undefined, T)
    expect(commit.json).toMatchObject({ ok: true, outcome: 'not_needed', message: 'Saved.' })
    expect(db.tables.bookings[1].pickup_time).toBe('07:45')
    const d = await planThenCommit({ kind: 'driver', driverId: ANN }, undefined, T)
    expect(d.commit.json.outcome).toBe('not_needed')
    expect(db.tables.bookings[1].driver_name).toBe('Ann Lee')
    expect(db.mail).toEqual([])
  })

  test('a driver the payout job cannot pay: the office is told, the change still saved', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    process.env.WISE_PAYOUT_RECIPIENTS = JSON.stringify({ 'Devon Brown': 1 })
    const plan = await post({ mode: 'plan', bookingId: B, change: { kind: 'driver', driverId: ANN } })
    expect(plan.json.plan.words.notes[0].text).toBe("Ann Lee isn't set up for payment yet, so payment for these rides is held until MAPL Tours Jamaica adds Ann. Saving tells them.")
    const r = await post({ mode: 'commit', bookingId: B, change: { kind: 'driver', driverId: ANN }, planKey: plan.json.plan.key })
    expect(r.json.ok).toBe(true)
    expect(office().map((m) => m.subject)).toEqual(['New driver not set up for payment: Ann Lee'])
  })

  test('a driver the payout job can pay (any case): no alert', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    process.env.WISE_PAYOUT_RECIPIENTS = JSON.stringify({ 'ann lee ': 1 })
    await planThenCommit({ kind: 'driver', driverId: ANN })
    expect(office()).toEqual([])
  })
})

describe('the day-of email going out as the change is saved', () => {
  test('the person is asked again, and the follow-up sends the update', async () => {
    vi.setSystemTime(ja('2026-11-28T09:00'))
    db.raceStamp = { leg: 'departure' }
    const { commit } = await planThenCommit({ kind: 'time', leg: 'departure', at: '2026-11-30T12:00' })
    expect(commit.json.outcome).toBe('pending')
    expect(commit.json.message).toBe("Saved. Maya's day-of email went out just as you saved.")
    expect(commit.json.question).toMatchObject({ title: 'Email Maya now?', body: "Maya's day-of email went out just as you saved, so it may still show the old details." })
    expect(changes()[0].guest_email).toBe('pending')
    db.raceStamp = null
    const f = await post({ mode: 'email', changeId: changes()[0].id, email: 'send' })
    expect(f.json).toMatchObject({ ok: true, outcome: 'sent' })
    expect(guestMail()[0].subject).toBe('New pickup time on Monday, November 30: 12:00 noon (MAPL-ABCD1234)')
  })

  test('nobody answers: the sweep tells the office once', async () => {
    vi.setSystemTime(ja('2026-11-28T09:00'))
    db.raceStamp = { leg: 'departure' }
    await planThenCommit({ kind: 'driver', driverId: ANN })
    changes()[0].created_at = new Date(Date.now() - 11 * 60_000).toISOString()
    process.env.CRON_SECRET = 'cron-test'
    const sweep = () => sweepGET(new Request('https://x/api/driver/change/sweep', { headers: { authorization: 'Bearer cron-test' } }) as never)
    expect(await (await sweep()).json()).toMatchObject({ told: 1 })
    expect(await (await sweep()).json()).toMatchObject({ told: 0 })
    expect(office()).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((office()[0].react as any).props.body).toContain('nobody chose whether to email Maya')
    const bad = await sweepGET(new Request('https://x/api/driver/change/sweep', { headers: { authorization: 'Bearer nope' } }) as never)
    expect(bad.status).toBe(401)
  })

  test('the follow-up refuses a change that is settled, or that a newer change replaced', async () => {
    await planThenCommit({ kind: 'driver', driverId: ANN })
    expect((await post({ mode: 'email', changeId: changes()[0].id, email: 'send' })).status).toBe(409)
    changes()[0].guest_email = 'pending'
    changes().push({ ...changes()[0], id: crypto.randomUUID(), created_at: new Date(Date.now() + 1000).toISOString() })
    const r = await post({ mode: 'email', changeId: changes()[0].id, email: 'skip' })
    expect(r.status).toBe(409)
    expect(r.json.message).toBe('A newer change was saved on this ride. Its email is dealt with there.')
  })
})

describe('the saved drivers, for a fleet manager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (fn: (r: Request) => Promise<any>, method: string, body?: Row) => {
    const res = await fn(new Request('https://mapltours.com/api/driver/drivers', { method, ...(body ? { body: JSON.stringify(body) } : {}) }))
    return { status: res.status, json: await res.json() }
  }

  test('a regular driver can neither read nor change the list', async () => {
    asDriver()
    expect((await call(rosterGET, 'GET')).status).toBe(403)
    expect((await call(rosterPOST, 'POST', { name: 'Sam Hill' })).status).toBe(403)
  })

  test('a fleet manager adds a regular driver, whatever the request says about the role', async () => {
    const r = await call(rosterPOST, 'POST', { name: 'Sam Hill', whatsapp: '+1 876 555 0110', vehicle: 'Toyota Hiace', colour: 'White', plate: 'ps 0001', email: 'Sam@Example.com', role: 'fleet_manager' })
    expect(r.status).toBe(200)
    expect(r.json.driver).toMatchObject({ name: 'Sam Hill', colour: 'white', plate: 'PS 0001', email: 'sam@example.com', role: 'driver', active: true })
  })

  test('a new name the payout job cannot pay is told to the office', async () => {
    process.env.WISE_PAYOUTS_ENABLED = '1'
    process.env.WISE_PAYOUT_RECIPIENTS = JSON.stringify({ 'Devon Brown': 1 })
    await call(rosterPOST, 'POST', { name: 'Sam Hill', whatsapp: '+1 876 555 0110', vehicle: 'Toyota Hiace', colour: 'white', plate: 'PS 0001' })
    expect(office().map((m) => m.subject)).toEqual(['Driver not set up for payment: Sam Hill'])
  })

  test('a fleet manager row cannot be edited or retired here; a regular one can', async () => {
    const r = await call(rosterPATCH, 'PATCH', { id: LEE, action: 'retire' })
    expect(r.status).toBe(403)
    expect(db.tables.drivers[2].active).toBe(true)
    const ok = await call(rosterPATCH, 'PATCH', { id: ANN, action: 'retire' })
    expect(ok.status).toBe(200)
    expect(db.tables.drivers[1].active).toBe(false)
  })

  test('a duplicate working name is refused in words', async () => {
    const r = await call(rosterPOST, 'POST', { name: 'Ann Lee', whatsapp: '+1 876 555 0110', vehicle: 'Toyota Hiace', colour: 'white', plate: 'PS 0001' })
    expect(r.status).toBe(409)
    expect(r.json).toMatchObject({ field: 'name', message: 'Ann Lee is already on the list. Edit that driver instead, or retire them first.' })
  })
})
