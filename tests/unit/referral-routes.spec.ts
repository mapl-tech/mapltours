import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The referral routes (app/api/referrals, app/api/referrals/payout-account,
 * app/api/admin/referrals) over an in-memory database and a fake session:
 * who may call each, that a change must come from the site's own page, that
 * a referrer acts only on their own rows whatever the request says, and that
 * an account number never comes back. Made-up people.
 */

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  user: null as null | Record<string, unknown>,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  mail: [] as Array<Record<string, unknown>>,
  /** The fake Wise the admin's resolve action asks (wiseClient is mocked to return it). */
  wise: null as null | { state: string | null; calls: string[]; cancels: boolean; down: boolean },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: db.user } }) } }) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '1.1.1.1' }))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async (m: Record<string, unknown>) => { db.mail.push(m); return { ok: true, id: 'em' } }) }))
vi.mock('@/lib/payouts/notify', () => ({ opsRecipients: () => ['ops@example.com'], sendOpsMessage: async () => true }))
vi.mock('@/lib/wise/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/wise/client')>()
  return {
    ...mod,
    wiseClient: () => ({
      async getTransfer(id: number) {
        const w = db.wise!
        w.calls.push(`read:${id}`)
        if (w.down) throw new mod.WiseApiError('timed out', 0, null, true)
        return { id, status: w.state, targetAccount: 2001, targetValue: 5.53 }
      },
      async cancelTransfer(id: number) {
        const w = db.wise!
        w.calls.push(`cancel:${id}`)
        if (!w.cancels) throw new mod.WiseApiError('cannot cancel', 422, 'transfer.cancel.not_allowed', false)
        w.state = 'cancelled'
        return { id, status: 'cancelled' }
      },
    }),
  }
})

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let patch: Row = {}
  let inserted: Row[] = []
  let single = false
  const rows = () => (db.tables[table] ??= [])
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return api },
    neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return api },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return api },
    is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return api },
    not: (c: string, _o: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return api },
    order: () => api, limit: () => api, range: () => api,
    update: (p: Row) => { op = 'update'; patch = p; return api },
    insert: (r: Row | Row[]) => {
      op = 'insert'
      inserted = (Array.isArray(r) ? r : [r]).map((x) => ({ id: `${table}-${rows().length + 1}`, status: 'invited', invite_sends: 0, commission_percent: 3, invited_at: '2026-11-26T00:00:00Z', created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z', ...x }))
      return api
    },
    maybeSingle: () => { single = true; return api },
    single: () => { single = true; return api },
    then: (resolve: (v: unknown) => unknown) => {
      if (op === 'insert') {
        if (table === 'referrers' && inserted.some((n) => rows().some((r) => r.email === n.email && r.status !== 'removed'))) return resolve({ data: null, error: { code: '23505', message: 'duplicate' } })
        rows().push(...inserted)
        return resolve({ data: single ? inserted[0] : inserted, error: null })
      }
      const hit = rows().filter((r) => filters.every((f) => f(r)))
      if (op === 'update') hit.forEach((r) => Object.assign(r, patch))
      return resolve({ data: single ? hit[0] ?? null : hit, error: null })
    },
  }
  return api
}

const FN: Record<string, (a: Record<string, unknown>) => unknown> = {
  accept_referral_terms: (a) => {
    const r = db.tables.referrers.find((x) => x.id === a.p_referrer)
    if (!r || r.status === 'removed') return { result: 'not_found' }
    Object.assign(r, { terms_version: a.p_version, terms_accepted_at: '2026-11-26T02:00:00Z', name: a.p_name, status: r.status === 'invited' ? 'active' : r.status })
    return { result: 'accepted' }
  },
  create_referral_code: (a) => {
    const r = db.tables.referrers.find((x) => x.id === a.p_referrer)
    if (!r || r.status !== 'active') return { result: 'not_active' }
    if ((db.tables.coupons ?? []).some((c) => c.code === a.p_code)) return { result: 'taken' }
    ;(db.tables.coupons ??= []).push({ id: `c-${a.p_code}`, code: a.p_code, referrer_id: a.p_referrer, status: 'active', referral_hold: false, note: a.p_label, uses: 0, created_at: '2026-11-26T03:00:00Z', retired_at: null })
    return { result: 'created', id: `c-${a.p_code}` }
  },
  set_referral_code_status: (a) => {
    const c = (db.tables.coupons ?? []).find((x) => x.id === a.p_coupon && x.referrer_id === a.p_referrer)
    if (!c) return { result: 'not_found' }
    c.status = a.p_action === 'pause' ? 'paused' : a.p_action === 'resume' ? 'active' : 'void'
    return { result: 'done' }
  },
  set_referrer_status: (a) => {
    const r = db.tables.referrers.find((x) => x.id === a.p_referrer)
    if (!r) return { result: 'not_found' }
    r.status = a.p_status === 'active' ? 'active' : a.p_status
    return { result: 'done', status: r.status }
  },
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (t: string) => query(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpc.push({ fn, args })
      return FN[fn] ? { data: FN[fn](args), error: null } : { data: null, error: { message: 'no such function' } }
    },
  }),
}))

import { GET as REF_GET, POST as REF_POST } from '@/app/api/referrals/route'
import { POST as ACCOUNT_POST } from '@/app/api/referrals/payout-account/route'
import { GET as ADMIN_GET, POST as ADMIN_POST, PATCH as ADMIN_PATCH } from '@/app/api/admin/referrals/route'
import { NextRequest } from 'next/server'
import { TERMS_VERSION } from '@/lib/referrals/rules'

const SITE = 'https://mapltours.com'
const req = (path: string, method: string, body?: unknown, headers: Record<string, string> = { origin: SITE, 'content-type': 'application/json' }) =>
  new NextRequest(`${SITE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (r: Response) => ({ status: r.status, body: await r.json() })

const ann = { id: 'r1', email: 'ann@example.com', name: 'Ann Lee', business: null, status: 'active', commission_percent: 3, user_id: 'u1', invited_at: '2026-11-01T00:00:00Z', invite_sent_at: null, invite_sends: 1, terms_version: TERMS_VERSION, terms_accepted_at: '2026-11-01T01:00:00Z', wise_recipient_id: null, payout_holder: null, payout_last4: null, payout_legal_type: null, payout_added_at: null, payout_hold_until: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }
const devon = { ...ann, id: 'r2', email: 'devon@example.com', name: 'Devon Brown' }
const signIn = (email: string, o: Record<string, unknown> = {}) => { db.user = { id: 'u1', email, email_confirmed_at: '2026-11-01T00:00:00Z', last_sign_in_at: new Date().toISOString(), ...o } }

beforeEach(() => {
  db.tables = {
    referrers: [{ ...ann }, { ...devon }],
    coupons: [
      { id: 'c-ANN5', code: 'ANN5', referrer_id: 'r1', status: 'active', referral_hold: false, note: null, uses: 0, created_at: '2026-11-02T00:00:00Z', retired_at: null },
      { id: 'c-DEVON5', code: 'DEVON5', referrer_id: 'r2', status: 'active', referral_hold: false, note: null, uses: 0, created_at: '2026-11-02T00:00:00Z', retired_at: null },
    ],
    referral_earnings: [], referral_payouts: [], referral_payout_items: [], referral_events: [], bookings: [], admins: [{ user_id: 'admin-1' }],
  }
  db.user = null
  db.rpc = []
  db.mail = []
  db.wise = null
})

describe('/api/referrals: who may ask', () => {
  test('signed out: 401; signed in but not invited, unconfirmed or removed: 403', async () => {
    expect((await REF_GET(req('/api/referrals', 'GET'))).status).toBe(401)
    signIn('stranger@example.com')
    expect((await json(await REF_GET(req('/api/referrals', 'GET'))))).toMatchObject({ status: 403, body: { denied: 'not_invited' } })
    signIn('ann@example.com', { email_confirmed_at: null, confirmed_at: null })
    expect((await json(await REF_GET(req('/api/referrals', 'GET'))))).toMatchObject({ status: 403, body: { denied: 'unconfirmed' } })
    db.tables.referrers[0].status = 'removed'
    signIn('ann@example.com')
    expect((await json(await REF_GET(req('/api/referrals', 'GET'))))).toMatchObject({ status: 403, body: { denied: 'removed' } })
  })

  test('a referrer sees only their own codes', async () => {
    signIn('ANN@example.com')
    const r = await json(await REF_GET(req('/api/referrals', 'GET')))
    expect(r.status).toBe(200)
    expect(r.body.view.codes.map((c: { code: string }) => c.code)).toEqual(['ANN5'])
    expect(JSON.stringify(r.body)).not.toContain('DEVON5')
  })
})

describe('/api/referrals: changes', () => {
  test('a change must come from the site, as JSON', async () => {
    signIn('ann@example.com')
    const tries: Record<string, string>[] = [{ 'content-type': 'application/json' }, { origin: 'https://evil.example', 'content-type': 'application/json' }, { origin: SITE, 'content-type': 'text/plain' }]
    for (const headers of tries) {
      expect((await REF_POST(req('/api/referrals', 'POST', { action: 'create_code', code: 'ANNVILLA' }, headers))).status).toBe(403)
    }
    expect(db.rpc).toEqual([])
  })

  test('creating a code names the referrer from the session, never from the request', async () => {
    signIn('ann@example.com')
    const r = await json(await REF_POST(req('/api/referrals', 'POST', { action: 'create_code', code: 'ann villa', label: 'Welcome book', referrer: 'r2', p_referrer: 'r2' })))
    expect(r.status).toBe(200)
    expect(db.rpc).toEqual([{ fn: 'create_referral_code', args: expect.objectContaining({ p_referrer: 'r1', p_code: 'ANNVILLA', p_percent: 5, p_max: 7, p_label: 'Welcome book' }) }])
    expect(r.body.view.codes.map((c: { code: string }) => c.code)).toEqual(['ANN5', 'ANNVILLA'])
  })

  test('a code the rules refuse never reaches the database', async () => {
    signIn('ann@example.com')
    for (const code of ['MAPLX', 'FREE5', 'VILLA10', 'AB']) {
      const r = await json(await REF_POST(req('/api/referrals', 'POST', { action: 'create_code', code })))
      expect(r.status).toBe(400)
    }
    expect(db.rpc).toEqual([])
  })

  test("someone else's code cannot be paused, whatever id is sent", async () => {
    signIn('ann@example.com')
    const r = await json(await REF_POST(req('/api/referrals', 'POST', { action: 'code_status', id: 'c-DEVON5', action2: 'pause' })))
    expect(r.status).toBe(400) // not even a UUID shape: refused before the database
    const uuid = '11111111-1111-4111-8111-111111111111'
    db.tables.coupons[1].id = uuid
    const r2 = await json(await REF_POST(req('/api/referrals', 'POST', { action: 'code_status', id: uuid, action2: 'pause' })))
    expect(r2.status).toBe(404)
    expect(db.tables.coupons[1].status).toBe('active')
  })

  test('the terms: an invited referrer becomes active; a tick is required', async () => {
    db.tables.referrers[0].status = 'invited'
    db.tables.referrers[0].terms_accepted_at = null
    signIn('ann@example.com')
    expect((await REF_POST(req('/api/referrals', 'POST', { action: 'accept_terms', name: 'Ann Lee' }))).status).toBe(400)
    const r = await json(await REF_POST(req('/api/referrals', 'POST', { action: 'accept_terms', name: ' Ann  Lee ', accept: true })))
    expect(r.status).toBe(200)
    expect(db.tables.referrers[0].status).toBe('active')
  })
})

describe('/api/referrals/payout-account', () => {
  const form = { legalType: 'PRIVATE', holderName: 'Ann Lee', routingNumber: '026073150', accountNumber: '8310001234567', accountNumberConfirm: '8310001234567', accountType: 'CHECKING', country: 'JM', city: 'Montego Bay', street: '1 Main St', currentLast4: null }

  test('from another site, or signed out: refused, and nothing reaches Wise', async () => {
    expect((await ACCOUNT_POST(req('/api/referrals/payout-account', 'POST', form, { origin: 'https://evil.example', 'content-type': 'application/json' }))).status).toBe(403)
    expect((await ACCOUNT_POST(req('/api/referrals/payout-account', 'POST', form))).status).toBe(401)
  })

  test('an old sign-in must sign in again; the account number is never echoed', async () => {
    signIn('ann@example.com', { last_sign_in_at: new Date(Date.now() - 3 * 3_600_000).toISOString() })
    const r = await json(await ACCOUNT_POST(req('/api/referrals/payout-account', 'POST', form)))
    expect(r).toMatchObject({ status: 401, body: { reauth: true } })
    expect(JSON.stringify(r.body)).not.toContain('8310001234567')
  })

  test('with Wise not configured: 503, nothing saved, and no number in the answer', async () => {
    signIn('ann@example.com')
    const prev = process.env.WISE_API_TOKEN
    delete process.env.WISE_API_TOKEN
    const r = await json(await ACCOUNT_POST(req('/api/referrals/payout-account', 'POST', form)))
    if (prev !== undefined) process.env.WISE_API_TOKEN = prev
    expect(r.status).toBe(503)
    expect(db.tables.referrers[0].wise_recipient_id).toBeNull()
    expect(JSON.stringify(r.body)).not.toContain('8310001234567')
  })
})

describe('/api/admin/referrals', () => {
  test('signed out: 401; not an admin: 403', async () => {
    expect((await ADMIN_GET()).status).toBe(401)
    signIn('ann@example.com')
    expect((await ADMIN_GET()).status).toBe(403)
    expect((await ADMIN_POST(req('/api/admin/referrals', 'POST', { action: 'invite', email: 'x@example.com', name: 'X' }))).status).toBe(403)
  })

  test('an admin invites someone: the row, the event, the invitation email (ops on BCC)', async () => {
    db.user = { id: 'admin-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
    const r = await json(await ADMIN_POST(req('/api/admin/referrals', 'POST', { action: 'invite', email: ' Sam.Hill@Example.com ', name: 'Sam Hill', percent: '3' })))
    expect(r.status).toBe(200)
    expect(r.body.sent).toBe(true)
    expect(db.tables.referrers.find((x) => x.email === 'sam.hill@example.com')).toBeTruthy()
    expect(db.mail[0]).toMatchObject({ to: 'sam.hill@example.com', bcc: ['ops@example.com'], subject: 'You’re invited to refer guests to MAPL Tours Jamaica' })
    expect(db.tables.referral_events.map((e) => e.kind)).toEqual(['invited', 'invite_sent'])
  })

  test('the same address twice is refused; a rate out of range is refused', async () => {
    db.user = { id: 'admin-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
    expect((await json(await ADMIN_POST(req('/api/admin/referrals', 'POST', { action: 'invite', email: 'ann@example.com', name: 'Ann' })))).status).toBe(409)
    expect((await json(await ADMIN_POST(req('/api/admin/referrals', 'POST', { action: 'invite', email: 'z@example.com', name: 'Z', percent: '12' })))).body.field).toBe('percent')
  })

  test('a test invitation goes to one address, marked, and writes nothing', async () => {
    db.user = { id: 'admin-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
    const before = db.tables.referrers.length
    const r = await json(await ADMIN_POST(req('/api/admin/referrals', 'POST', { action: 'test_invite', to: 'contact@mapltours.com', name: 'Sam Hill' })))
    expect(r.status).toBe(200)
    expect(db.mail[0]).toMatchObject({ to: 'contact@mapltours.com', subject: expect.stringMatching(/^\[Test\] /) })
    expect(db.mail[0].bcc).toBeUndefined()
    expect(db.tables.referrers.length).toBe(before)
  })

  test('pausing a referrer goes through the database function, from the site only', async () => {
    db.user = { id: 'admin-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }
    expect((await ADMIN_PATCH(req('/api/admin/referrals', 'PATCH', { action: 'status', id: '00000000-0000-4000-8000-000000000001', status: 'paused' }, { 'content-type': 'application/json' }))).status).toBe(403)
    db.tables.referrers[0].id = '00000000-0000-4000-8000-000000000001'
    const r = await json(await ADMIN_PATCH(req('/api/admin/referrals', 'PATCH', { action: 'status', id: '00000000-0000-4000-8000-000000000001', status: 'paused' })))
    expect(r.status).toBe(200)
    expect(db.rpc[db.rpc.length - 1]).toEqual({ fn: 'set_referrer_status', args: { p_referrer: '00000000-0000-4000-8000-000000000001', p_status: 'paused', p_actor: 'owner@example.com' } })
  })
})

describe('/api/admin/referrals: resolving a payout that needed a look', () => {
  const P = 'aaaaaaaa-1111-4111-8111-111111111111'
  const B1 = 'bbbbbbbb-1111-4111-8111-111111111111'
  const admin = () => { db.user = { id: 'admin-1', email: 'owner@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' } }
  const resolve = (body: Record<string, unknown>) => ADMIN_PATCH(req('/api/admin/referrals', 'PATCH', { action: 'resolve_payout', payoutId: P, ...body }))
  const payout = () => db.tables.referral_payouts[0]
  const item = () => db.tables.referral_payout_items[0]
  const env = { ...process.env }

  beforeEach(() => {
    process.env.WISE_API_TOKEN = 'test-token'
    process.env.WISE_PROFILE_ID = '1'
    db.wise = { state: 'outgoing_payment_sent', calls: [], cancels: true, down: false }
    db.tables.referrers[0] = { ...db.tables.referrers[0], wise_recipient_id: 2001, payout_holder: 'Ann Lee', payout_last4: '4567', payout_legal_type: 'PRIVATE' }
    db.tables.bookings = [{ id: B1, status: 'paid', booking_type: 'transfer', total_paid: 184.3, subtotal: 162, coupon_discount: 9.7, refund_state: 'none', refunded_at: null, created_at: '2026-11-10T12:00:00Z', booking_items: [{ item_type: 'transfer', trip_type: 'round_trip', arrival_at: '2026-11-28T14:00:00+00:00', departure_at: '2026-12-05T10:00:00+00:00' }] }]
    db.tables.referral_earnings = [{ id: 'e1', booking_id: B1, referrer_id: 'r1', coupon_id: 'c-ANN5', code: 'ANN5', commission_percent: 3, recorded_late: false, voided_at: null, void_reason: null, voided_by: null, created_at: '2026-11-10T12:00:00Z' }]
    db.tables.referral_payouts = [{ id: P, referrer_id: 'r1', payee: 'Ann Lee', recipient_id: 2001, account_last4: '4567', amount_usd: 5.53, fee_usd: 0, status: 'needs_review', wise_transfer_id: 777, wise_state: null, pay_day: '2026-12-07', error: 'no answer from Wise', created_at: '2026-12-07T14:45:00Z', funded_at: null, sent_at: null, resolved_at: null, notified_at: null }]
    db.tables.referral_payout_items = [{ id: 'i1', payout_id: P, earning_id: 'e1', booking_id: B1, amount_usd: 5.53, active: true }]
  })
  afterEach(() => { process.env = { ...env } })

  test('paid, and Wise shows it sent: recorded as sent, the commissions stay paid, the payout email goes once', async () => {
    admin()
    const r = await json(await resolve({ outcome: 'paid' }))
    expect(r.status).toBe(200)
    expect(db.wise!.calls).toEqual(['read:777'])
    expect(payout()).toMatchObject({ status: 'sent', wise_state: 'outgoing_payment_sent' })
    expect(payout().resolved_at).toBeTruthy()
    expect(payout().notified_at).toBeTruthy()
    expect(item().active).toBe(true)
    expect(db.mail.map((m) => m.subject)).toEqual(['We sent you US$5.53 for your referrals'])
    expect(r.body.message).toBe('Marked as paid. They have the payout email.')
    expect(db.tables.referral_events.at(-1)).toMatchObject({ kind: 'payout_resolved', detail: { payout_id: P, outcome: 'paid', wise_state: 'outgoing_payment_sent' } })
  })

  test('not paid, but Wise shows the money gone: refused, nothing changes, nothing is freed', async () => {
    admin()
    const r = await json(await resolve({ outcome: 'not_paid' }))
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/the money has gone\. Choose It was paid\./)
    expect(payout()).toMatchObject({ status: 'needs_review', resolved_at: null })
    expect(item().active).toBe(true)
    expect(db.mail).toEqual([])
  })

  test('not paid, and the transfer still waits for our money: cancelled at Wise first, then the commissions are freed for the next run', async () => {
    admin()
    db.wise!.state = 'incoming_payment_waiting'
    const r = await json(await resolve({ outcome: 'not_paid' }))
    expect(r.status).toBe(200)
    expect(db.wise!.calls).toEqual(['read:777', 'cancel:777'])
    expect(item().active).toBe(false)
    expect(payout()).toMatchObject({ status: 'failed' })
    expect(payout().resolved_at).toBeTruthy()
    expect(db.mail).toEqual([])
  })

  test('not paid, but Wise will not cancel: nothing is freed or saved', async () => {
    admin()
    db.wise!.state = 'incoming_payment_waiting'
    db.wise!.cancels = false
    const r = await json(await resolve({ outcome: 'not_paid' }))
    expect(r.status).toBe(502)
    expect(item().active).toBe(true)
    expect(payout()).toMatchObject({ status: 'needs_review', resolved_at: null })
  })

  test('paid, but Wise shows it cancelled: refused', async () => {
    admin()
    db.wise!.state = 'cancelled'
    const r = await json(await resolve({ outcome: 'paid' }))
    expect(r.status).toBe(409)
    expect(r.body.error).toMatch(/so it was not paid/)
    expect(payout().status).toBe('needs_review')
    expect(db.mail).toEqual([])
  })

  test('Wise does not answer, or no answer is chosen: nothing is saved', async () => {
    admin()
    db.wise!.down = true
    expect((await resolve({ outcome: 'paid' })).status).toBe(502)
    expect((await resolve({})).status).toBe(400)
    expect(payout()).toMatchObject({ status: 'needs_review', resolved_at: null })
    expect(item().active).toBe(true)
  })

  test('a payout whose money came back: resolving only lifts the hold (the webhook already freed its commissions)', async () => {
    admin()
    Object.assign(payout(), { status: 'returned' })
    item().active = false
    const r = await json(await resolve({}))
    expect(r.status).toBe(200)
    expect(db.wise!.calls).toEqual([])
    expect(payout().status).toBe('returned')
    expect(payout().resolved_at).toBeTruthy()
    expect(r.body.message).toBe('Marked as resolved. The next payout run pays these commissions again.')
  })

  test('a payout already resolved, or one that never needed it, is refused', async () => {
    admin()
    Object.assign(payout(), { resolved_at: '2026-12-08T00:00:00Z' })
    expect((await resolve({ outcome: 'paid' })).status).toBe(409)
    Object.assign(payout(), { resolved_at: null, status: 'sent' })
    expect((await resolve({ outcome: 'paid' })).status).toBe(409)
    expect(db.wise!.calls).toEqual([])
  })
})
