import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * Sending the driver-update email (lib/driver-update-send.ts) and the two
 * admin routes behind it (/api/admin/driver-update, /api/admin/drivers).
 *
 *   • a send saves the driver on the booking FIRST, and only while the
 *     booking is a paid transfer; nothing is mailed if that write fails
 *   • the guest gets it with operations, the driver inbox and the driver
 *     on BCC, under a key that delivers a repeat once; then it is recorded
 *   • a test goes to the one address typed, "[Test]" first, copies nobody
 *     and writes nothing; a preview writes nothing
 *   • only admins reach any of it
 */

const st = vi.hoisted(() => ({
  user: { id: 'admin-1' } as null | { id: string },
  admin: true,
  booking: null as null | Record<string, unknown>,
  driver: null as null | Record<string, unknown>,
  updateRows: 1,
  updateError: null as null | { message: string },
  insertError: null as null | { code?: string; message: string },
  mergeError: null as null | { message: string },
  writes: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reads: [] as string[],
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })),
  opsBcc: (guest: string, extra: (string | null)[] = []) => ['contact@mapltours.com', 'driver-inbox@example.com', ...extra.filter(Boolean)].filter((e) => e !== guest),
}))

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let values: Record<string, unknown> = {}
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.order = () => q
  q.eq = (k: string, v: unknown) => { filters.push([k, v]); return q }
  q.update = (v: Record<string, unknown>) => { op = 'update'; values = v; return q }
  q.insert = (v: Record<string, unknown>) => { op = 'insert'; values = v; return q }
  const result = () => {
    if (op === 'update') {
      st.writes.push({ table, values, filters: [...filters] })
      if (table === 'bookings') return st.updateError ? { data: null, error: st.updateError } : { data: Array.from({ length: st.updateRows }, () => ({ id: 'b' })), error: null }
      return { data: { id: filters[0]?.[1], ...st.driver, ...values }, error: null }
    }
    if (op === 'insert') {
      st.inserts.push({ table, values })
      return st.insertError ? { data: null, error: st.insertError } : { data: { id: 'new-id', ...values }, error: null }
    }
    st.reads.push(table)
    if (table === 'admins') return { data: st.admin ? { user_id: 'admin-1' } : null, error: null }
    if (table === 'bookings') return { data: st.booking, error: null }
    if (table === 'drivers') return { data: st.driver, error: null }
    return { data: null, error: null }
  }
  q.maybeSingle = async () => result()
  q.single = async () => result()
  q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad)
  return q
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }) }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: builder,
    rpc: async (fn: string, args: Record<string, unknown>) => { st.rpc.push({ fn, args }); return { data: [{}], error: st.mergeError } },
  }),
}))

import { sendEmail } from '@/lib/email/send'
import { createServiceClient } from '@/lib/supabase/service'
import { previewDriverUpdate, sendDriverUpdate, testDriverUpdate } from '@/lib/driver-update-send'
import { POST as updatePOST } from '@/app/api/admin/driver-update/route'
import { POST as driversPOST, PATCH as driversPATCH, GET as driversGET } from '@/app/api/admin/drivers/route'

const sendMock = vi.mocked(sendEmail)
const BOOKING_ID = 'abcd1234-6c73-444e-83c6-1f79f15a59d1'
const DRIVER_ID = '11111111-1111-4111-8111-111111111111'
const NOW = Date.parse('2026-11-18T13:35:00Z') // 8:35 AM Jamaica, the arrival lands at 1:09 PM
const svc = () => createServiceClient()

beforeEach(() => {
  st.user = { id: 'admin-1' }
  st.admin = true
  st.booking = {
    id: BOOKING_ID, booking_type: 'transfer', status: 'paid', email: 'guest@example.com', first_name: 'Ana',
    driver_name: 'Collin', driver_phone: '+1 876 919-7534', driver_vehicle: 'Toyota Noah minivan, black', driver_plate: 'PM 9482',
    dispatch: { dayof_arrival_sent: '2026-11-18T06:00:54.936Z' },
    booking_items: [{ hotel: 'Grand Palladium Jamaica, Lucea', trip_type: 'round_trip', passengers: 2, arrival_at: '2026-11-18T13:09:00+00:00', arrival_flight: '521', departure_at: '2026-11-25T16:22:00+00:00', departure_flight: '922' }],
  }
  st.driver = { id: DRIVER_ID, name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000', email: 'devon@example.com', active: true }
  st.updateRows = 1
  st.updateError = null
  st.insertError = null
  st.mergeError = null
  st.writes = []; st.inserts = []; st.rpc = []; st.reads = []
  sendMock.mockClear()
  sendMock.mockResolvedValue({ ok: true, id: 'em_1' })
})

describe('sending to the guest', () => {
  test('saves the driver on the paid booking, then emails the guest, then records it', async () => {
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: true, sentTo: 'guest@example.com' })
    expect(st.writes).toHaveLength(1)
    expect(st.writes[0].values).toEqual({ driver_name: 'Devon Brown', driver_phone: '+1 876 555-0100', driver_vehicle: 'Toyota Hiace, silver', driver_plate: 'PS 0000' })
    expect(st.writes[0].filters).toEqual([['id', BOOKING_ID], ['status', 'paid'], ['booking_type', 'transfer']])
    expect(sendMock).toHaveBeenCalledTimes(1)
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('guest@example.com')
    expect(arg.subject).toBe('Your driver today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)')
    expect(arg.bcc).toEqual(['contact@mapltours.com', 'driver-inbox@example.com', 'devon@example.com'])
    expect(arg.dedupe).toBe(`driver-update/${BOOKING_ID}/arrival/${DRIVER_ID}`)
    expect(arg.timeoutMs).toBeGreaterThan(0)
    expect(st.rpc).toEqual([{ fn: 'merge_dispatch', args: { p_booking_id: BOOKING_ID, p_patch: { driver_update_arrival_sent: new Date(NOW).toISOString(), driver_update_arrival_driver: 'Devon Brown' } } }])
  })

  test('"replaces" is decided before this send stamps the booking', async () => {
    st.booking = { ...st.booking, dispatch: {} }
    await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    // Plain text prints the heading in capitals.
    const text = (await (await import('@react-email/render')).render(sendMock.mock.calls[0][0].react, { plainText: true })).toLowerCase()
    expect(text).toContain('your driver for your arrival today.')
    expect(text).not.toContain('this replaces')
  })

  test('a booking that stopped being paid is not written to or mailed', async () => {
    st.booking = { ...st.booking, status: 'refunded' }
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: false, status: 409 })
    expect(st.writes).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('one that stops being paid between the read and the write: the guarded write matches nothing, and nothing is mailed', async () => {
    st.updateRows = 0
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: false, status: 409, error: 'This booking is no longer paid. Nothing was saved or sent.' })
    expect(sendMock).not.toHaveBeenCalled()
    expect(st.rpc).toHaveLength(0)
  })

  test('a failed write sends nothing', async () => {
    st.updateError = { message: 'connection reset' }
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: false, status: 500 })
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('a failed send says the driver is saved, and records no send', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'timeout' })
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: false, status: 502 })
    expect((out as { error: string }).error).toMatch(/Devon Brown is saved on the booking, but the email did not send/)
    expect(st.rpc).toHaveLength(0)
  })

  test('a retired driver, or a ride that is over, is refused before anything happens', async () => {
    st.driver = { ...st.driver, active: false }
    expect(await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)).toMatchObject({ ok: false, status: 409 })
    st.driver = { ...st.driver, active: true }
    expect(await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, Date.parse('2026-11-18T21:00:00Z'))).toMatchObject({ ok: false, status: 409 })
    expect(st.writes).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('the send worked but the record did not: it says so, and does not pretend the email failed', async () => {
    st.mergeError = { message: 'blip' }
    const out = await sendDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: true, sentTo: 'guest@example.com' })
    expect((out as { warning?: string }).warning).toMatch(/could not record/)
  })
})

describe('a test, and a preview', () => {
  test('a test goes to the typed address only, "[Test]" first, and writes nothing', async () => {
    const out = await testDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, ' Owner@Example.com ', NOW)
    expect(out).toEqual({ ok: true, sentTo: 'owner@example.com' })
    const arg = sendMock.mock.calls[0][0]
    expect(arg.to).toBe('owner@example.com')
    expect(arg.subject).toBe('[Test] Your driver today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)')
    expect(arg.bcc).toBeUndefined()
    expect(arg.dedupe).toBeUndefined()
    expect(st.writes).toHaveLength(0)
    expect(st.rpc).toHaveLength(0)
  })

  test('a test needs a real address', async () => {
    expect(await testDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, 'owner@', NOW)).toMatchObject({ ok: false, status: 400 })
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('a test still works for a ride the guest can no longer be sent (to check the words)', async () => {
    const late = Date.parse('2026-11-18T21:00:00Z')
    expect(await testDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, 'owner@example.com', late)).toMatchObject({ ok: true })
  })

  test('a preview renders the email, says whether the guest can get it, and writes nothing', async () => {
    const out = await previewDriverUpdate(svc(), BOOKING_ID, 'arrival', DRIVER_ID, NOW)
    expect(out).toMatchObject({ ok: true, subject: 'Your driver today: Devon Brown, silver Toyota Hiace (MAPL-ABCD1234)', told: true, guestProblem: null })
    expect((out as { html: string }).html).toContain('Grand Palladium Jamaica, Lucea')
    expect(st.writes).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })
})

const post = (body: unknown) => updatePOST(new Request('http://localhost/api/admin/driver-update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as never)
const drivers = (method: 'POST' | 'PATCH', body: unknown) => (method === 'POST' ? driversPOST : driversPATCH)(new Request('http://localhost/api/admin/drivers', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('the routes', () => {
  test('signed out or not an admin: refused, nothing read or sent', async () => {
    st.user = null
    expect((await post({ bookingId: BOOKING_ID, driverId: DRIVER_ID, leg: 'arrival', mode: 'send' })).status).toBe(401)
    expect((await driversGET()).status).toBe(401)
    st.user = { id: 'admin-1' }; st.admin = false
    expect((await post({ bookingId: BOOKING_ID, driverId: DRIVER_ID, leg: 'arrival', mode: 'send' })).status).toBe(403)
    expect((await drivers('POST', { name: 'Devon Brown' })).status).toBe(403)
    expect(st.reads.filter((t) => t !== 'admins')).toHaveLength(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('the update route checks what it is asked before doing anything', async () => {
    expect((await post({ bookingId: 'nope', driverId: DRIVER_ID, leg: 'arrival', mode: 'send' })).status).toBe(400)
    expect((await post({ bookingId: BOOKING_ID, driverId: '', leg: 'arrival', mode: 'send' })).status).toBe(400)
    expect((await post({ bookingId: BOOKING_ID, driverId: DRIVER_ID, leg: 'both', mode: 'send' })).status).toBe(400)
    expect((await post({ bookingId: BOOKING_ID, driverId: DRIVER_ID, leg: 'arrival', mode: 'blast' })).status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
    expect(st.writes).toHaveLength(0)
  })

  test('the drivers route saves a tidy driver, refuses a bad one at its field, and a duplicate name', async () => {
    const ok = await drivers('POST', { name: ' Devon  Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'Silver', plate: 'ps 0000' })
    expect(ok.status).toBe(200)
    expect(st.inserts[0].values).toEqual({ name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000', email: null, role: 'driver', active: true })
    const bad = await drivers('POST', { name: 'Devon Brown', whatsapp: '555 0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000' })
    expect(bad.status).toBe(400)
    expect((await bad.json()).field).toBe('whatsapp')
    st.insertError = { code: '23505', message: 'duplicate key' }
    const dup = await drivers('POST', { name: 'Devon Brown', whatsapp: '+1 876 555-0100', vehicle: 'Toyota Hiace', colour: 'silver', plate: 'PS 0000' })
    expect(dup.status).toBe(409)
    expect((await dup.json()).error).toMatch(/already on the list/)
  })

  test('the drivers route sets a role (only here is anyone made a fleet manager) and names an email clash', async () => {
    const fm = await drivers('POST', { name: 'Lee Grant', whatsapp: '+1 876 555-0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', email: 'lee@example.com', role: 'fleet_manager' })
    expect(fm.status).toBe(200)
    expect(st.inserts.at(-1)!.values).toMatchObject({ name: 'Lee Grant', email: 'lee@example.com', role: 'fleet_manager' })
    const badRole = await drivers('POST', { name: 'Lee Grant', whatsapp: '+1 876 555-0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', role: 'owner' })
    expect(badRole.status).toBe(400)
    expect((await badRole.json()).field).toBe('role')
    st.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "drivers_active_email_once"' }
    const clash = await drivers('POST', { name: 'Ann Lee', whatsapp: '+1 876 555-0101', vehicle: 'Toyota Noah', colour: 'black', plate: 'PK 0001', email: 'lee@example.com' })
    expect(clash.status).toBe(409)
    expect(await clash.json()).toMatchObject({ field: 'email', error: 'Another working driver already signs in with that email.' })
    st.insertError = null
    const demote = await drivers('PATCH', { id: '11111111-1111-4111-8111-111111111111', name: 'Lee Grant', whatsapp: '+1 876 555-0102', vehicle: 'Toyota Noah', colour: 'white', plate: 'PK 0002', role: 'driver' })
    expect(demote.status).toBe(200)
    expect(st.writes.at(-1)!.values).toMatchObject({ role: 'driver' })
  })

  test('retiring keeps the driver, only switched off', async () => {
    const r = await drivers('PATCH', { id: DRIVER_ID, action: 'retire' })
    expect(r.status).toBe(200)
    expect(st.writes[0]).toMatchObject({ table: 'drivers', values: { active: false } })
    expect(st.writes[0].filters).toEqual([['id', DRIVER_ID]])
  })
})
