import { describe, test, expect } from 'vitest'
import {
  CRM_PAID_KEY,
  CRM_REFUND_KEY,
  CRM_SKIP_KEY,
  CRM_PAID_FILTER,
  CRM_REFUND_FILTER,
  CRM_FAILURES_KEY,
  CRM_RETRY_AT_KEY,
  CRM_ERROR_KEY,
  CRM_RETRY_KEYS,
  CRM_NEVER_FAILED_FILTER,
  CRM_RETRY_DUE_FILTER,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  STUCK_AFTER,
  SYNC_BATCH,
  aggregateForEmail,
  contactName,
  crmProperties,
  failurePatch,
  groupCandidates,
  isTestAddress,
  keptCents,
  maskEmail,
  mayStamp,
  normalizeEmail,
  paidEventFor,
  pendingSyncState,
  reconcileGroup,
  retryDelayMs,
  shouldSetCustomer,
  stampPatch,
  type SyncBooking,
} from '@/lib/booking-sync'
import { runBookingSync } from '@/lib/booking-sync-run'
import { booking, externalWrites, failureMarks, fakeFetch, fakeSupabase, fetches, makeWorld, stamps, writes, type FakeWorld } from './booking-sync-fakes'

const SEP = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00.000Z`
const ms = (iso: string) => Date.parse(iso)

const T0 = Date.parse('2026-09-24T12:00:00.000Z')

function run(world: FakeWorld, opts: { dry?: boolean; resendKey?: string | null; now?: () => number; batch?: number; callTimeoutMs?: number } = {}) {
  return runBookingSync({
    svc: fakeSupabase(world),
    hubspotKey: 'pat-test',
    resendKey: opts.resendKey === undefined ? 're_test' : opts.resendKey,
    dry: opts.dry ?? false,
    fetch: fakeFetch(world),
    now: opts.now,
    batch: opts.batch,
    callTimeoutMs: opts.callTimeoutMs,
  })
}

describe('which money state still has to reach the CRM', () => {
  test('a paid booking without its stamp waits for a paid sync', () => {
    expect(pendingSyncState({ status: 'paid', dispatch: null })).toBe('paid')
    expect(pendingSyncState({ status: 'paid', dispatch: { verified: 'x' } })).toBe('paid')
  })
  test('a paid booking with its stamp is done', () => {
    expect(pendingSyncState({ status: 'paid', dispatch: { [CRM_PAID_KEY]: 'x' } })).toBeNull()
  })
  test('a refund waits for its own stamp even when the paid state was synced', () => {
    expect(pendingSyncState({ status: 'refunded', dispatch: { [CRM_PAID_KEY]: 'x' } })).toBe('refund')
    expect(pendingSyncState({ status: 'refunded', dispatch: null })).toBe('refund')
    expect(pendingSyncState({ status: 'refunded', dispatch: { [CRM_PAID_KEY]: 'x', [CRM_REFUND_KEY]: 'y' } })).toBeNull()
  })
  test('states that never took money are never synced', () => {
    for (const status of ['pending', 'failed', 'canceled', 'anything']) {
      expect(pendingSyncState({ status, dispatch: null })).toBeNull()
    }
  })
  test('the server-side filters name the same keys as the JS rule', () => {
    expect(CRM_PAID_FILTER).toBe(`dispatch->${CRM_PAID_KEY}`)
    expect(CRM_REFUND_FILTER).toBe(`dispatch->${CRM_REFUND_KEY}`)
  })
  test('a skip is recorded beside the stamp, never instead of it', () => {
    expect(stampPatch('paid', 'T')).toEqual({ [CRM_PAID_KEY]: 'T' })
    expect(stampPatch('refund', 'T', 'test_address')).toEqual({ [CRM_REFUND_KEY]: 'T', [CRM_SKIP_KEY]: 'test_address' })
  })
})

describe('addresses', () => {
  test('normalized, or null when unusable', () => {
    expect(normalizeEmail('  Guest@Gmail.COM ')).toBe('guest@gmail.com')
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail('not-an-address')).toBeNull()
    expect(normalizeEmail('a b@c.com')).toBeNull()
  })
  test('test addresses: the same rule as the bio', () => {
    for (const e of ['x@example.com', 'delivered@resend.dev', 'tech@mapltech.com', 'leshanpatterson@gmail.com', 'leshan_patterson@yahoo.com']) {
      expect(isTestAddress(e)).toBe(true)
    }
    for (const e of ['guest@gmail.com', 'example.com.guest@gmail.com', 'someone@examples.com']) {
      expect(isTestAddress(e)).toBe(false)
    }
  })
  test('masked to the first character and the domain', () => {
    expect(maskEmail('guest@gmail.com')).toBe('g***@gmail.com')
    expect(maskEmail('@x.com')).toBe('***')
  })
})

describe('what MAPL kept from a booking', () => {
  test('a paid booking counts its whole total', () => {
    expect(keptCents({ id: 'a', status: 'paid', total_paid: 85 })).toBe(8500)
    expect(keptCents({ id: 'a', status: 'paid', total_paid: '130.50' })).toBe(13050)
  })
  test('an admin-approved refund keeps the admin charge (total less refund_amount)', () => {
    // Admin path: refund_amount is cash + gift credit, admin_charge = total - refund.
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100, refund_amount: 80, admin_charge: 20 })).toBe(2000)
  })
  test('a Dashboard refund of a gift-funded booking does not count the returned gift share as kept', () => {
    // Webhook path: refund_amount is Stripe's cash only (200 of 300; 100 came
    // off a gift card and went back onto it). admin_charge = captured - cash
    // refunded = 0. total_paid - refund_amount would wrongly say 100 was kept.
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 300, refund_amount: 200, admin_charge: 0 })).toBe(0)
  })
  test('without admin_charge, total less refund_amount; with neither, nothing', () => {
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100, refund_amount: 80, admin_charge: null })).toBe(2000)
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100 })).toBe(0)
  })
  test('always within zero and the total', () => {
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100, refund_amount: 150 })).toBe(0)
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100, admin_charge: 500 })).toBe(10000)
    expect(keptCents({ id: 'a', status: 'refunded', total_paid: 100, admin_charge: -5 })).toBe(0)
    expect(keptCents({ id: 'a', status: 'paid', total_paid: 'garbage' })).toBe(0)
    expect(keptCents({ id: 'a', status: 'paid', total_paid: -40 })).toBe(0)
  })
  test('no money state, no value', () => {
    expect(keptCents({ id: 'a', status: 'pending', total_paid: 100 })).toBe(0)
  })
})

describe('the picture for one address, from all its bookings', () => {
  const rows: SyncBooking[] = [
    { id: 'a', status: 'paid', booking_type: 'tour', total_paid: 85, paid_at: SEP(1) },
    { id: 'b', status: 'paid', booking_type: 'transfer', total_paid: 120, paid_at: SEP(10) },
    { id: 'c', status: 'refunded', booking_type: 'tour', total_paid: 100, paid_at: SEP(12), refund_amount: 80, admin_charge: 20 },
    { id: 'd', status: 'pending', booking_type: 'tour', total_paid: 999, paid_at: null },
    { id: 'e', status: 'canceled', booking_type: 'transfer', total_paid: 50, paid_at: SEP(20) },
  ]

  test('sums what was kept over bookings that took money, net of refunds', () => {
    const agg = aggregateForEmail(rows)
    expect(agg.totalCents).toBe(8500 + 12000 + 2000)
    expect(agg.bookingsCounted).toBe(3)
    expect(agg.hasPaid).toBe(true)
  })
  test('last booking is the latest paid_at among them, and its type', () => {
    const agg = aggregateForEmail(rows)
    expect(agg.lastBookingAtMs).toBe(ms(SEP(12)))
    expect(agg.bookingType).toBe('tour')
    const noRefund = aggregateForEmail(rows.filter((r) => r.id !== 'c'))
    expect(noRefund.lastBookingAtMs).toBe(ms(SEP(10)))
    expect(noRefund.bookingType).toBe('transfer')
  })
  test('a set, not an increment: order and repeats do not change it', () => {
    const a = aggregateForEmail(rows)
    expect(aggregateForEmail([...rows].reverse())).toEqual(a)
    expect(aggregateForEmail([...rows, ...rows])).toEqual(a)
  })
  test('only refunds left: not a paying customer now, total is what was kept', () => {
    const agg = aggregateForEmail([rows[2]])
    expect(agg.hasPaid).toBe(false)
    expect(agg.totalCents).toBe(2000)
  })
  test('HubSpot properties: USD with cents, epoch ms, type', () => {
    expect(crmProperties(aggregateForEmail(rows))).toEqual({
      mapl_bookings_total: '225.00',
      mapl_last_booking_at: String(ms(SEP(12))),
      mapl_booking_type: 'tour',
    })
    // No readable paid_at: the date and type are left alone, the total is still set.
    expect(crmProperties(aggregateForEmail([{ id: 'x', status: 'paid', total_paid: 10, paid_at: null }]))).toEqual({ mapl_bookings_total: '10.00' })
  })
  test('the name for a new contact comes from the latest booking that has one', () => {
    expect(contactName([
      { id: 'a', status: 'paid', paid_at: SEP(1), first_name: 'Old', last_name: 'Name' },
      { id: 'b', status: 'paid', paid_at: SEP(9), first_name: ' Ana ', last_name: '' },
      { id: 'c', status: 'paid', paid_at: SEP(15), first_name: null, last_name: null },
    ])).toEqual({ firstname: 'Ana' })
    expect(contactName([{ id: 'a', status: 'paid' }])).toEqual({})
  })
})

describe('lifecycle stage: up to customer, never down', () => {
  test('earlier or empty stages move up when a booking is paid', () => {
    for (const s of [null, undefined, '', 'subscriber', 'lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'LEAD']) {
      expect(shouldSetCustomer(s, true)).toBe(true)
    }
  })
  test('customer and later stages, and unknown custom stages, are left alone', () => {
    for (const s of ['customer', 'evangelist', 'other', '1234567']) {
      expect(shouldSetCustomer(s, true)).toBe(false)
    }
  })
  test('nothing moves without a paid booking', () => {
    expect(shouldSetCustomer('lead', false)).toBe(false)
    expect(shouldSetCustomer(null, false)).toBe(false)
  })
})

describe('grouping a run and the Resend event', () => {
  test('groups by normalized address, skips synced rows, separates unusable addresses', () => {
    const { groups, noEmail } = groupCandidates([
      { id: '1', status: 'paid', email: 'Ana@Gmail.com', dispatch: null },
      { id: '2', status: 'refunded', email: ' ana@gmail.com', dispatch: { [CRM_PAID_KEY]: 'x' } },
      { id: '3', status: 'paid', email: 'ana@gmail.com', dispatch: { [CRM_PAID_KEY]: 'x' } },
      { id: '4', status: 'paid', email: '', dispatch: null },
      { id: '5', status: 'paid', email: 'x@example.com', dispatch: null },
      { id: '1', status: 'paid', email: 'Ana@Gmail.com', dispatch: null },
    ])
    expect(groups.map((g) => [g.email, g.test, g.candidates.map((c) => `${c.booking.id}:${c.state}`)])).toEqual([
      ['ana@gmail.com', false, ['1:paid', '2:refund']],
      ['x@example.com', true, ['5:paid']],
    ])
    expect(noEmail.map((c) => c.booking.id)).toEqual(['4'])
  })
  test('booking.paid only for a newly paid booking, typed by the latest one', () => {
    const g = (cands: Array<[SyncBooking, 'paid' | 'refund']>, test = false) => ({ email: 'a@b.co', test, candidates: cands.map(([booking, state]) => ({ booking, state })) })
    const tour = { id: 't', status: 'paid', booking_type: 'tour', paid_at: SEP(1) }
    const ride = { id: 'r', status: 'paid', booking_type: 'transfer', paid_at: SEP(5) }
    const refund = { id: 'x', status: 'refunded', booking_type: 'transfer', paid_at: SEP(9) }
    expect(paidEventFor(g([[tour, 'paid'], [ride, 'paid']]))).toEqual({ type: 'transfer' })
    expect(paidEventFor(g([[tour, 'paid'], [refund, 'refund']]))).toEqual({ type: 'tour' })
    expect(paidEventFor(g([[refund, 'refund']]))).toBeNull()
    expect(paidEventFor(g([[tour, 'paid']], true))).toBeNull()
  })
  test('stamp only after HubSpot, and Resend not needed or sent', () => {
    expect(mayStamp(true, 'not_needed')).toBe(true)
    expect(mayStamp(true, 'no_contact')).toBe(true)
    expect(mayStamp(true, 'sent')).toBe(true)
    expect(mayStamp(true, 'failed')).toBe(false)
    expect(mayStamp(false, 'sent')).toBe(false)
    expect(mayStamp(false, 'not_needed')).toBe(false)
  })
})

describe('a run', () => {
  test('a first paid booking: HubSpot contact created as customer, Resend told, and the stamp comes last', async () => {
    const b = booking({ email: 'Guest@Gmail.com', booking_type: 'transfer', total_paid: 130, paid_at: SEP(20), first_name: 'Ana', last_name: 'Brown' })
    const world = makeWorld([b])
    world.resendContacts.add('guest@gmail.com')

    const r = await run(world)
    expect(r).toMatchObject({ scanned: 1, addresses: 1, synced: 1, failed: 0, hubspot_created: 1, events_sent: 1, stamp_errors: 0 })

    const create = fetches(world, 'hubapi').find((e) => e.method === 'POST')!
    expect(create.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts')
    expect(create.body).toEqual({
      properties: {
        email: 'guest@gmail.com',
        mapl_source: 'booking',
        firstname: 'Ana',
        lastname: 'Brown',
        mapl_bookings_total: '130.00',
        mapl_last_booking_at: String(ms(SEP(20))),
        mapl_booking_type: 'transfer',
        lifecyclestage: 'customer',
      },
    })

    const resend = fetches(world, 'resend.com')
    expect(resend.map((e) => `${e.method} ${e.url}`)).toEqual([
      'GET https://api.resend.com/contacts/guest%40gmail.com',
      'POST https://api.resend.com/events/send',
    ])
    expect(resend[1].body).toEqual({ event: 'booking.paid', email: 'guest@gmail.com', payload: { type: 'transfer' } })

    const s = stamps(world)
    expect(s).toHaveLength(1)
    expect(s[0].args).toEqual({ p_booking_id: b.id, p_patch: { [CRM_PAID_KEY]: expect.any(String) }, p_remove: CRM_RETRY_KEYS, p_only_if_absent: CRM_PAID_KEY })
    // The stamp is the last thing that happened.
    expect(world.log[world.log.length - 1].kind).toBe('rpc')
    expect(world.rows[0].dispatch).toEqual({ [CRM_PAID_KEY]: expect.any(String) })

    // Nothing left to do: a second run reads nothing and calls nobody.
    world.log.length = 0
    const again = await run(world)
    expect(again).toMatchObject({ scanned: 0, synced: 0 })
    expect(world.log).toHaveLength(0)
  })

  test('an existing contact at lead becomes customer; one at evangelist keeps its stage; neither is renamed', async () => {
    const world = makeWorld([booking({ email: 'lead@gmail.com' }), booking({ email: 'fan@gmail.com' })])
    world.hubspot.set('lead@gmail.com', { id: '1', lifecyclestage: 'lead', properties: {} })
    world.hubspot.set('fan@gmail.com', { id: '2', lifecyclestage: 'evangelist', properties: {} })

    const r = await run(world)
    expect(r).toMatchObject({ synced: 2, hubspot_updated: 2, hubspot_created: 0 })
    const patches = fetches(world, 'hubapi').filter((e) => e.method === 'PATCH')
    const lead = patches.find((e) => e.url.includes('lead%40gmail.com'))!
    const fan = patches.find((e) => e.url.includes('fan%40gmail.com'))!
    expect(lead.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts/lead%40gmail.com?idProperty=email')
    expect((lead.body as { properties: Record<string, string> }).properties.lifecyclestage).toBe('customer')
    expect((fan.body as { properties: Record<string, string> }).properties).not.toHaveProperty('lifecyclestage')
    for (const p of [lead, fan]) {
      expect((p.body as { properties: Record<string, string> }).properties).not.toHaveProperty('firstname')
      expect((p.body as { properties: Record<string, string> }).properties).not.toHaveProperty('email')
    }
    expect(world.hubspot.get('fan@gmail.com')!.lifecyclestage).toBe('evangelist')
  })

  test('the total is recomputed from every booking of the address, never incremented', async () => {
    const old = booking({ email: 'ana@gmail.com', total_paid: 85, paid_at: SEP(1), dispatch: { [CRM_PAID_KEY]: 'earlier' } })
    const pendingOne = booking({ email: 'ana@gmail.com', status: 'pending', total_paid: 999, paid_at: null })
    const fresh = booking({ email: 'ANA@gmail.com', total_paid: 120, booking_type: 'transfer', paid_at: SEP(10) })
    const stranger = booking({ email: 'anaXgmail@com.com', total_paid: 5000, paid_at: SEP(11) })
    const world = makeWorld([old, pendingOne, fresh, stranger])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'customer', properties: { mapl_bookings_total: '85.00' } })

    await run(world)
    const patch = fetches(world, 'hubapi').find((e) => e.method === 'PATCH' && e.url.includes('ana%40gmail.com'))!
    expect((patch.body as { properties: Record<string, string> }).properties).toEqual({
      mapl_bookings_total: '205.00',
      mapl_last_booking_at: String(ms(SEP(10))),
      mapl_booking_type: 'transfer',
    })
  })

  test('a refund: the net total goes to HubSpot, no Resend call at all, the refund stamp is written, the stage stays', async () => {
    const kept = booking({ email: 'ana@gmail.com', total_paid: 85, paid_at: SEP(1), dispatch: { [CRM_PAID_KEY]: 'x' } })
    const refunded = booking({
      email: 'ana@gmail.com', status: 'refunded', total_paid: 100, paid_at: SEP(5), refunded_at: SEP(6),
      refund_amount: 80, admin_charge: 20, dispatch: { [CRM_PAID_KEY]: 'x' },
    })
    const world = makeWorld([kept, refunded])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'customer', properties: {} })
    world.resendContacts.add('ana@gmail.com')

    const r = await run(world)
    expect(r).toMatchObject({ scanned: 1, synced: 1, events_sent: 0 })
    expect(fetches(world, 'resend.com')).toHaveLength(0)
    const patch = fetches(world, 'hubapi').find((e) => e.method === 'PATCH')!
    expect((patch.body as { properties: Record<string, string> }).properties).toEqual({
      mapl_bookings_total: '105.00',
      mapl_last_booking_at: String(ms(SEP(5))),
      mapl_booking_type: 'tour',
    })
    expect(stamps(world).map((s) => s.args.p_only_if_absent)).toEqual([CRM_REFUND_KEY])
    expect(world.rows[1].dispatch).toMatchObject({ [CRM_PAID_KEY]: 'x', [CRM_REFUND_KEY]: expect.any(String) })
  })

  test('a refund that leaves no paid booking never lowers the stage', async () => {
    const refunded = booking({ email: 'ana@gmail.com', status: 'refunded', total_paid: 100, refund_amount: 100, admin_charge: 0, dispatch: { [CRM_PAID_KEY]: 'x' } })
    const world = makeWorld([refunded])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'customer', properties: {} })
    await run(world)
    const patch = fetches(world, 'hubapi').find((e) => e.method === 'PATCH')!
    expect((patch.body as { properties: Record<string, string> }).properties).toEqual({
      mapl_bookings_total: '0.00',
      mapl_last_booking_at: expect.any(String),
      mapl_booking_type: 'tour',
    })
    expect(world.hubspot.get('ana@gmail.com')!.lifecyclestage).toBe('customer')
  })

  test('not a Resend contact: no event (it would create one), and the booking is stamped', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com' })])
    const r = await run(world)
    expect(r).toMatchObject({ synced: 1, events_sent: 0 })
    expect(fetches(world, 'resend.com').map((e) => e.method)).toEqual(['GET'])
    expect(stamps(world)).toHaveLength(1)
  })

  test('the Resend lookup fails: no event, no stamp, retried once the retry is due', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com' })])
    world.resendContacts.add('ana@gmail.com')
    world.fail.resendGet = 500
    const r = await run(world, { now: () => T0 })
    expect(r).toMatchObject({ synced: 0, failed: 1, events_sent: 0, errors: { resend_get_500: 1 } })
    expect(stamps(world)).toHaveLength(0)
    expect(failureMarks(world)).toHaveLength(1)
    expect(fetches(world, 'resend.com').map((e) => e.method)).toEqual(['GET'])

    // Resend back: the retry finishes the job.
    world.fail.resendGet = undefined
    world.log.length = 0
    const next = await run(world, { now: () => T0 + retryDelayMs(1) })
    expect(next).toMatchObject({ synced: 1, events_sent: 1 })
  })

  test('the event is refused (rate limited): no stamp', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com' })])
    world.resendContacts.add('ana@gmail.com')
    world.fail.resendEvent = 429
    const r = await run(world)
    expect(r).toMatchObject({ synced: 0, failed: 1, events_sent: 0, errors: { resend_event_429: 1 } })
    expect(stamps(world)).toHaveLength(0)
    expect(failureMarks(world)).toHaveLength(1)
  })

  test('HubSpot refuses the write: booking.paid still reaches Resend (the tips stop), and nothing is stamped', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com', booking_type: 'transfer' })])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'lead', properties: {} })
    world.resendContacts.add('ana@gmail.com')
    world.fail.hubspotWrite = 500
    const r = await run(world)
    expect(r).toMatchObject({ synced: 0, failed: 1, events_sent: 1, hubspot_updated: 0, errors: { hubspot_patch_500: 1 } })
    const resend = fetches(world, 'resend.com')
    expect(resend.map((e) => e.method)).toEqual(['GET', 'POST'])
    expect(resend[1].body).toEqual({ event: 'booking.paid', email: 'ana@gmail.com', payload: { type: 'transfer' } })
    expect(stamps(world)).toHaveLength(0)
    expect(failureMarks(world).map((e) => (e.args.p_patch as Record<string, unknown>)[CRM_ERROR_KEY])).toEqual(['hubspot_patch_500'])
  })

  test('HubSpot lookup fails (not a 404): nothing created, nothing stamped', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com' })])
    world.fail.hubspotGet = 401
    const r = await run(world)
    expect(r).toMatchObject({ synced: 0, failed: 1, errors: { hubspot_get_401: 1 } })
    expect(externalWrites(world)).toHaveLength(0)
    expect(stamps(world)).toHaveLength(0)
  })

  test('create answers 409 with the existing id: that contact is updated instead, its stage read first', async () => {
    const world = makeWorld([booking({ email: 'second@gmail.com' })])
    world.hubspot.set('primary@gmail.com', { id: '77', lifecyclestage: 'opportunity', properties: {} })
    world.fail.hubspotCreateConflictId = '77'
    const r = await run(world)
    expect(r).toMatchObject({ synced: 1, hubspot_updated: 1, hubspot_created: 0 })
    const hs = fetches(world, 'hubapi').map((e) => `${e.method} ${e.url.replace('https://api.hubapi.com/crm/v3/objects/contacts', '')}`)
    expect(hs).toEqual([
      'GET /second%40gmail.com?idProperty=email&properties=lifecyclestage',
      'POST ',
      'GET /77?properties=lifecyclestage',
      'PATCH /77',
    ])
    expect(world.hubspot.get('primary@gmail.com')!.lifecyclestage).toBe('customer')
  })

  test('test addresses never reach HubSpot or Resend, and leave the queue stamped as skipped', async () => {
    const rows = [
      booking({ email: 'someone@example.com' }),
      booking({ email: 'delivered@resend.dev' }),
      booking({ email: 'tech@mapltech.com', status: 'refunded' }),
    ]
    const world = makeWorld(rows)
    const r = await run(world)
    expect(r).toMatchObject({ skipped_test: 3, synced: 0, failed: 0 })
    expect(fetches(world)).toHaveLength(0)
    expect(stamps(world).map((s) => s.args.p_patch)).toEqual([
      { [CRM_PAID_KEY]: expect.any(String), [CRM_SKIP_KEY]: 'test_address' },
      { [CRM_PAID_KEY]: expect.any(String), [CRM_SKIP_KEY]: 'test_address' },
      { [CRM_REFUND_KEY]: expect.any(String), [CRM_SKIP_KEY]: 'test_address' },
    ])
    world.log.length = 0
    expect(await run(world)).toMatchObject({ scanned: 0 })
  })

  test('a booking with no usable address is stamped skipped and sent nowhere', async () => {
    const world = makeWorld([booking({ email: '  ' })])
    const r = await run(world)
    expect(r).toMatchObject({ skipped_no_email: 1, synced: 0 })
    expect(fetches(world)).toHaveLength(0)
    expect(stamps(world)[0].args.p_patch).toEqual({ [CRM_PAID_KEY]: expect.any(String), [CRM_SKIP_KEY]: 'no_email' })
  })

  test('no Resend key: a paid booking that needs the Resend check waits; a refund still syncs', async () => {
    const paid = booking({ email: 'ana@gmail.com' })
    const refund = booking({ email: 'ben@gmail.com', status: 'refunded', dispatch: { [CRM_PAID_KEY]: 'x' } })
    const world = makeWorld([paid, refund])
    const r = await run(world, { resendKey: null })
    expect(r).toMatchObject({ synced: 1, failed: 1, errors: { resend_key_missing: 1 } })
    expect(stamps(world).map((s) => s.args.p_booking_id)).toEqual([refund.id])
  })

  test('dry run: reads only, writes nothing, and shows no address or name', async () => {
    const world = makeWorld([
      booking({ email: 'new.guest@gmail.com', first_name: 'Secret', last_name: 'Person' }),
      booking({ email: 'known@gmail.com' }),
      booking({ email: 'x@example.com' }),
      booking({ email: '' }),
    ])
    world.hubspot.set('known@gmail.com', { id: '1', lifecyclestage: 'lead', properties: {} })
    world.resendContacts.add('known@gmail.com')

    const r = await run(world, { dry: true })
    expect(writes(world)).toHaveLength(0)
    expect(fetches(world).every((e) => e.method === 'GET')).toBe(true)
    expect(world.rows.every((row) => row.dispatch === null)).toBe(true)
    expect(r).toMatchObject({ dry: true, synced: 2, skipped_test: 1, skipped_no_email: 1, hubspot_created: 0, events_sent: 0 })

    const text = JSON.stringify(r)
    for (const secret of ['new.guest@gmail.com', 'known@gmail.com', 'x@example.com', 'Secret', 'Person']) {
      expect(text).not.toContain(secret)
    }
    const known = r.groups!.find((g) => g.email === 'k***@gmail.com')!
    expect(known).toMatchObject({ hubspot: 'update', lifecycle: 'set_customer', resend: 'would_send' })
    const fresh = r.groups!.find((g) => g.email === 'n***@gmail.com')!
    expect(fresh).toMatchObject({ hubspot: 'create', resend: 'no_contact' })
    expect(fresh.properties).toMatchObject({ email: 'n***@gmail.com', firstname: '(from booking)', lastname: '(from booking)', lifecyclestage: 'customer' })
  })

  test('the deadline: groups past it are deferred untouched', async () => {
    const world = makeWorld([
      booking({ email: 'a@gmail.com', paid_at: SEP(1) }),
      booking({ email: 'b@gmail.com', paid_at: SEP(2) }),
      booking({ email: 'c@gmail.com', paid_at: SEP(3) }),
    ])
    // Each clock read moves 3 s: the start, then the first group's check fit.
    let t = 0
    const r = await run(world, { now: () => { const v = t; t += 3_000; return v } })
    expect(r.deferred).toBeGreaterThan(0)
    expect(r.synced + r.deferred).toBe(3)
    const touched = new Set(fetches(world, 'hubapi').map((e) => decodeURIComponent(e.url)))
    expect(Array.from(touched).some((u) => u.includes('c@gmail.com'))).toBe(false)
  })

  test('the batch is capped', async () => {
    const rows = Array.from({ length: SYNC_BATCH + 5 }, (_, i) => booking({ email: `g${i}@gmail.com`, paid_at: SEP(1 + (i % 28)) }))
    const world = makeWorld(rows)
    const r = await run(world, { dry: true })
    expect(r.scanned).toBe(SYNC_BATCH)
  })

  test('a failed candidate query throws, so the route answers 500 instead of reporting an empty success', async () => {
    const world = makeWorld([booking({ email: 'a@gmail.com' })])
    world.fail.candidateQuery = true
    await expect(run(world)).rejects.toThrow(/candidate query failed/)
  })

  test('the address query fails: that address is left for the next run', async () => {
    const world = makeWorld([booking({ email: 'a@gmail.com' })])
    world.fail.addressQuery = true
    const r = await run(world)
    expect(r).toMatchObject({ failed: 1, synced: 0, errors: { address_query: 1 } })
    expect(fetches(world)).toHaveLength(0)
    expect(stamps(world)).toHaveLength(0)
    expect(failureMarks(world)).toHaveLength(1)
  })

  test('a stamp that does not land is counted, never hidden', async () => {
    const world = makeWorld([booking({ email: 'a@gmail.com' })])
    world.fail.rpc = true
    const r = await run(world)
    expect(r).toMatchObject({ synced: 0, stamp_errors: 1 })
  })

  test('a row another run already stamped is not re-stamped: the first timestamp stays', async () => {
    const b = booking({ email: 'a@gmail.com' })
    const world = makeWorld([b])
    // The candidate is read unstamped; another run stamps it before ours does.
    const svc = fakeSupabase(world)
    const realRpc = svc.rpc.bind(svc)
    ;(svc as unknown as { rpc: typeof svc.rpc }).rpc = ((name: string, args: Record<string, unknown>) => {
      world.rows[0].dispatch = { [CRM_PAID_KEY]: 'first-run' }
      return realRpc(name, args)
    }) as typeof svc.rpc
    const r = await runBookingSync({ svc, hubspotKey: 'pat', resendKey: 're', dry: false, fetch: fakeFetch(world) })
    expect(r.stamp_errors).toBe(0)
    expect(world.rows[0].dispatch).toEqual({ [CRM_PAID_KEY]: 'first-run' })
  })

  test('an address with an underscore matches only itself, never a wildcard neighbour', async () => {
    const mine = booking({ email: 'john_smith@gmail.com', total_paid: 10 })
    const other = booking({ email: 'johnXsmith@gmail.com', total_paid: 9000, dispatch: { [CRM_PAID_KEY]: 'x' } })
    const world = makeWorld([mine, other])
    await run(world)
    const create = fetches(world, 'hubapi').find((e) => e.method === 'POST')!
    expect((create.body as { properties: Record<string, string> }).properties.mapl_bookings_total).toBe('10.00')
  })
})

type Props = { properties: Record<string, string> }
const hubspotWrite = (world: FakeWorld, method: 'POST' | 'PATCH') => fetches(world, 'hubapi').find((e) => e.method === method)?.body as Props | undefined

describe('an address is only ever its own (PostgREST reads * as a wildcard)', () => {
  test('a * in the address never pulls another guest\'s bookings into its totals', async () => {
    const mine = booking({ email: 'a*@gmail.com', total_paid: 10, paid_at: SEP(3) })
    const other = booking({ email: 'ab@gmail.com', total_paid: 9000, paid_at: SEP(9), booking_type: 'transfer', dispatch: { [CRM_PAID_KEY]: 'x' } })
    const world = makeWorld([mine, other])
    const r = await run(world)
    expect(r).toMatchObject({ synced: 1 })
    expect(hubspotWrite(world, 'POST')!.properties).toMatchObject({
      mapl_bookings_total: '10.00',
      mapl_last_booking_at: String(ms(SEP(3))),
      mapl_booking_type: 'tour',
    })
  })

  test('reconcileGroup keeps only rows whose normalized address is the group\'s', () => {
    const cand = { id: 'm', status: 'paid', email: 'a*@gmail.com', dispatch: null }
    const group = { email: 'a*@gmail.com', test: false, candidates: [{ booking: cand, state: 'paid' as const }] }
    const { aggregate, live } = reconcileGroup(group, [
      { ...cand, email: ' A*@Gmail.com ' },
      { id: 'x', status: 'paid', email: 'ab@gmail.com', dispatch: null },
    ])
    expect(aggregate.map((r) => r.id)).toEqual(['m'])
    expect(live.map((c) => c.booking.id)).toEqual(['m'])
  })
})

describe('a booking that changes while the run is under way', () => {
  test('refunded after it was read as paid: no booking.paid, no paid stamp; the next run syncs the refund', async () => {
    const b = booking({ email: 'ana@gmail.com', total_paid: 100, paid_at: SEP(5) })
    const world = makeWorld([b])
    world.resendContacts.add('ana@gmail.com')
    // The charge.refunded webhook lands between the candidate read and the address read.
    world.beforeAddressQuery = () => {
      Object.assign(world.rows[0], { status: 'refunded', refunded_at: SEP(6), refund_amount: 100, admin_charge: 0 })
    }
    const r = await run(world)
    expect(r).toMatchObject({ scanned: 1, synced: 0, failed: 0, deferred: 1, events_sent: 0 })
    expect(fetches(world, 'resend.com')).toHaveLength(0)
    expect(externalWrites(world)).toHaveLength(0)
    expect(world.log.filter((e) => e.kind === 'rpc')).toHaveLength(0)
    expect(world.rows[0].dispatch).toBeNull()

    world.beforeAddressQuery = undefined
    world.log.length = 0
    expect(await run(world)).toMatchObject({ synced: 1, events_sent: 0 })
    const created = hubspotWrite(world, 'POST')!.properties
    expect(created.mapl_bookings_total).toBe('0.00')
    expect(created).not.toHaveProperty('lifecyclestage')
    expect(fetches(world, 'resend.com')).toHaveLength(0)
    expect(world.rows[0].dispatch).toEqual({ [CRM_REFUND_KEY]: expect.any(String) })
  })

  test('a refund claim released back to paid after it was read: no refund stamp, HubSpot untouched, a later real refund still syncs', async () => {
    const b = booking({
      email: 'ana@gmail.com', status: 'refunded', total_paid: 100, paid_at: SEP(5), refunded_at: SEP(6),
      refund_amount: 80, admin_charge: 20, dispatch: { [CRM_PAID_KEY]: 'x' },
    })
    const world = makeWorld([b])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'customer', properties: { mapl_bookings_total: '100.00' } })
    // Stripe refused the refund: the admin route releases the claim.
    world.beforeAddressQuery = () => {
      Object.assign(world.rows[0], { status: 'paid', refunded_at: null, refund_amount: null, admin_charge: null })
    }
    const r = await run(world)
    expect(r).toMatchObject({ synced: 0, failed: 0, deferred: 1 })
    expect(externalWrites(world)).toHaveLength(0)
    expect(world.hubspot.get('ana@gmail.com')!.properties.mapl_bookings_total).toBe('100.00')
    expect(world.rows[0].dispatch).toEqual({ [CRM_PAID_KEY]: 'x' })

    // Approved again, and this time the refund goes through.
    world.beforeAddressQuery = undefined
    Object.assign(world.rows[0], { status: 'refunded', refunded_at: SEP(7), refund_amount: 80, admin_charge: 20 })
    world.log.length = 0
    expect(await run(world)).toMatchObject({ synced: 1 })
    expect(world.hubspot.get('ana@gmail.com')!.properties.mapl_bookings_total).toBe('20.00')
  })

  test('only the changed booking waits: the address\'s other new booking syncs from fresh rows', async () => {
    const changed = booking({ email: 'ana@gmail.com', total_paid: 100, paid_at: SEP(5) })
    const steady = booking({ email: 'ana@gmail.com', total_paid: 40, paid_at: SEP(8), booking_type: 'transfer' })
    const world = makeWorld([changed, steady])
    world.beforeAddressQuery = () => {
      Object.assign(world.rows[0], { status: 'refunded', refunded_at: SEP(9), refund_amount: 100, admin_charge: 0 })
    }
    const r = await run(world)
    expect(r).toMatchObject({ synced: 1, deferred: 1 })
    expect(hubspotWrite(world, 'POST')!.properties.mapl_bookings_total).toBe('40.00')
    expect(stamps(world).map((s) => s.args.p_booking_id)).toEqual([steady.id])
    expect(world.rows[0].dispatch).toBeNull()
  })
})

describe('failures back off and never crowd out new bookings', () => {
  test('backoff: 10 minutes, doubling, at most a day', () => {
    expect(retryDelayMs(1)).toBe(RETRY_BASE_MS)
    expect(retryDelayMs(1)).toBe(10 * 60_000)
    expect(retryDelayMs(2)).toBe(20 * 60_000)
    expect(retryDelayMs(4)).toBe(80 * 60_000)
    expect(retryDelayMs(9)).toBe(RETRY_MAX_MS)
    expect(retryDelayMs(500)).toBe(24 * 60 * 60_000)
    expect(retryDelayMs(0)).toBe(RETRY_BASE_MS)
    expect(retryDelayMs(Number.NaN)).toBe(RETRY_BASE_MS)
  })

  test('the failure patch counts up from what the row holds', () => {
    expect(failurePatch({ dispatch: null }, T0, 'hubspot_get_500')).toEqual({
      [CRM_FAILURES_KEY]: 1,
      [CRM_RETRY_AT_KEY]: new Date(T0 + retryDelayMs(1)).toISOString(),
      [CRM_ERROR_KEY]: 'hubspot_get_500',
    })
    expect(failurePatch({ dispatch: { [CRM_FAILURES_KEY]: 3 } }, T0, 'x')[CRM_FAILURES_KEY]).toBe(4)
    expect(failurePatch({ dispatch: { [CRM_FAILURES_KEY]: 'junk' } }, T0, 'x')[CRM_FAILURES_KEY]).toBe(1)
  })

  test('the retry filters name the retry key', () => {
    expect(CRM_NEVER_FAILED_FILTER).toBe(`dispatch->${CRM_RETRY_AT_KEY}`)
    expect(CRM_RETRY_DUE_FILTER).toBe(`dispatch->>${CRM_RETRY_AT_KEY}`)
    expect(CRM_RETRY_KEYS).toEqual([CRM_FAILURES_KEY, CRM_RETRY_AT_KEY, CRM_ERROR_KEY])
  })

  test('a failed sync is marked, not re-read before its retry is due, and the stamp clears the marks', async () => {
    const b = booking({ email: 'ana@gmail.com' })
    const world = makeWorld([b])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'lead', properties: {} })
    world.fail.hubspotWrite = 500
    expect(await run(world, { now: () => T0 })).toMatchObject({ failed: 1, synced: 0 })
    expect(stamps(world)).toHaveLength(0)
    expect(failureMarks(world).map((e) => e.args)).toEqual([{
      p_booking_id: b.id,
      p_patch: { [CRM_FAILURES_KEY]: 1, [CRM_RETRY_AT_KEY]: new Date(T0 + retryDelayMs(1)).toISOString(), [CRM_ERROR_KEY]: 'hubspot_patch_500' },
      p_only_if_absent: CRM_PAID_KEY,
    }])

    // HubSpot is back, but the retry is not due: the row is not even read.
    world.fail.hubspotWrite = undefined
    world.log.length = 0
    expect(await run(world, { now: () => T0 + 60_000 })).toMatchObject({ scanned: 0 })
    expect(world.log).toHaveLength(0)

    // Due: synced, and the retry keys leave with the stamp.
    expect(await run(world, { now: () => T0 + retryDelayMs(1) })).toMatchObject({ scanned: 1, synced: 1 })
    expect(world.rows[0].dispatch).toEqual({ [CRM_PAID_KEY]: expect.any(String) })
  })

  test('a full batch of bookings that keep failing never holds back a new booking or a new refund', async () => {
    const due = new Date(T0 - 1_000).toISOString()
    const failing = Array.from({ length: SYNC_BATCH }, (_, i) => booking({
      email: `stuck${i}@gmail.com`, paid_at: SEP(1),
      dispatch: { [CRM_FAILURES_KEY]: 3, [CRM_RETRY_AT_KEY]: due, [CRM_ERROR_KEY]: 'hubspot_create_400' },
    }))
    const notDue = booking({
      email: 'later@gmail.com', paid_at: SEP(1),
      dispatch: { [CRM_FAILURES_KEY]: 5, [CRM_RETRY_AT_KEY]: new Date(T0 + 3_600_000).toISOString(), [CRM_ERROR_KEY]: 'x' },
    })
    const newPaid = booking({ email: 'new@gmail.com', paid_at: SEP(20) })
    const newRefund = booking({ email: 'refund@gmail.com', status: 'refunded', paid_at: SEP(2), refunded_at: SEP(21), dispatch: { [CRM_PAID_KEY]: 'x' } })
    const world = makeWorld([...failing, notDue, newPaid, newRefund])
    const r = await run(world, { now: () => T0, dry: true })
    expect(r.scanned).toBe(SYNC_BATCH)
    const seen = r.groups!.map((g) => g.email)
    expect(seen.slice(0, 2)).toEqual(['n***@gmail.com', 'r***@gmail.com'])
    expect(seen).not.toContain('l***@gmail.com')
    expect(seen.filter((e) => e.startsWith('s***'))).toHaveLength(SYNC_BATCH - 2)
  })

  test('a booking that has failed for about a day is reported as stuck', async () => {
    const b = booking({
      email: 'ana@gmail.com',
      dispatch: { [CRM_FAILURES_KEY]: STUCK_AFTER - 1, [CRM_RETRY_AT_KEY]: new Date(T0 - 1_000).toISOString(), [CRM_ERROR_KEY]: 'hubspot_get_400' },
    })
    const world = makeWorld([b])
    world.fail.hubspotGet = 400
    expect(await run(world, { now: () => T0 })).toMatchObject({ failed: 1, stuck: 1 })
    expect(world.rows[0].dispatch).toEqual({
      [CRM_FAILURES_KEY]: STUCK_AFTER,
      [CRM_RETRY_AT_KEY]: new Date(T0 + retryDelayMs(STUCK_AFTER)).toISOString(),
      [CRM_ERROR_KEY]: 'hubspot_get_400',
    })
  })

  test('a dry run marks nothing', async () => {
    const world = makeWorld([booking({ email: 'ana@gmail.com' })])
    world.fail.hubspotGet = 500
    expect(await run(world, { dry: true })).toMatchObject({ failed: 1 })
    expect(writes(world)).toHaveLength(0)
    expect(world.rows[0].dispatch).toBeNull()
  })

  test('the batch is capped across paid and refunded bookings together', async () => {
    const paid = Array.from({ length: SYNC_BATCH }, (_, i) => booking({ email: `p${i}@gmail.com`, paid_at: SEP(1 + (i % 28)) }))
    const refunds = Array.from({ length: 5 }, (_, i) => booking({
      email: `r${i}@gmail.com`, status: 'refunded', paid_at: SEP(1), refunded_at: SEP(2 + i), dispatch: { [CRM_PAID_KEY]: 'x' },
    }))
    const r = await run(makeWorld([...paid, ...refunds]), { dry: true })
    expect(r.scanned).toBe(SYNC_BATCH)
  })
})

describe('refund-only addresses are not customers', () => {
  // Paid and fully refunded between two runs: only the refund syncs.
  const refundOnly = () => booking({ email: 'ana@gmail.com', status: 'refunded', total_paid: 100, paid_at: SEP(5), refunded_at: SEP(6), refund_amount: 100, admin_charge: 0 })

  test('an existing lead stays a lead', async () => {
    const world = makeWorld([refundOnly()])
    world.hubspot.set('ana@gmail.com', { id: '1', lifecyclestage: 'lead', properties: {} })
    expect(await run(world)).toMatchObject({ synced: 1, hubspot_updated: 1 })
    expect(hubspotWrite(world, 'PATCH')!.properties).not.toHaveProperty('lifecyclestage')
    expect(world.hubspot.get('ana@gmail.com')!.lifecyclestage).toBe('lead')
  })

  test('a new contact is created without a stage', async () => {
    const world = makeWorld([refundOnly()])
    expect(await run(world)).toMatchObject({ synced: 1, hubspot_created: 1 })
    expect(hubspotWrite(world, 'POST')!.properties).not.toHaveProperty('lifecyclestage')
    expect(world.hubspot.get('ana@gmail.com')!.lifecyclestage).toBeNull()
  })
})

describe('a call that hangs', () => {
  test('gives up at the per-call timeout: that address fails unstamped, the next is still synced', async () => {
    const slow = booking({ email: 'slow@gmail.com', paid_at: SEP(1) })
    const fine = booking({ email: 'fine@gmail.com', paid_at: SEP(2) })
    const world = makeWorld([slow, fine])
    world.fail.hang = (method, url) => url.includes('api.hubapi.com') && url.includes('slow%40gmail.com')
    const r = await run(world, { callTimeoutMs: 25 })
    expect(r).toMatchObject({ synced: 1, failed: 1, errors: { hubspot_get_0: 1 } })
    expect(world.rows[0].dispatch).not.toHaveProperty(CRM_PAID_KEY)
    expect(world.rows[0].dispatch).toMatchObject({ [CRM_ERROR_KEY]: 'hubspot_get_0' })
    expect(world.rows[1].dispatch).toHaveProperty(CRM_PAID_KEY)
  }, 2_000)
})
