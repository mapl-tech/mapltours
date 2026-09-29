import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  MAX_HTML_BYTES,
  MAX_SENDS,
  TIPS_FROM,
  TIPS_REPLY_TO,
  TIPS_BOOKING_SELECT,
  TipsRunError,
  idempotencyKey,
  runTripTips,
  type BuildTip,
  type TipContext,
  type TipsDeps,
} from '@/lib/trip-tips/run'
import { verifyStop } from '@/lib/trip-tips/unsubscribe'
import { TRIP_TIPS_POSTAL_ADDRESS } from '@/lib/trip-tips/postal'
import { DAY_MS } from '@/lib/trip-tips/plan'
import { DESTINATIONS, getTransferPrice } from '@/lib/airport-transfers'
import {
  dbWrites,
  fakeTipsFetch,
  fakeTipsSupabase,
  fetchesTo,
  makeTipsWorld,
  rideBooking,
  subscribe,
  tourBooking,
  type TipsWorld,
} from './trip-tips-fakes'

/**
 * The trip tips run over a fake Supabase, Resend and HubSpot: the eligibility
 * gates, the claim and its race, release on failure, the retry rules, the send
 * gate, masked dry output and test addresses. Synthetic addresses only
 * (example.org / example.net are not test addresses to the job; example.com is).
 */

const NOW = Date.parse('2026-10-01T14:00:00Z')
const SECRET = 'trip-tips-test-secret'
const ago = (days: number) => new Date(NOW - days * DAY_MS).toISOString()
const jaIn = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)

const ANA = 'ana.guest@example.org'
const BEN = 'ben_guest@example.net'

const fakeBuild: BuildTip = (key, ctx) => ({
  subject: `Subject ${key}`,
  preheader: 'Preheader',
  html: `<p>${key}</p><a href="${ctx.unsubscribeUrl.replace(/&/g, '&amp;')}">Unsubscribe</a>`,
  text: `${key}\nUnsubscribe: ${ctx.unsubscribeUrl}`,
})

function deps(w: TipsWorld, over: Partial<TipsDeps> = {}): TipsDeps {
  return {
    svc: fakeTipsSupabase(w),
    resendKey: 're_test',
    hubspotKey: 'pat-test',
    segmentId: 'seg_tips',
    secret: SECRET,
    send: true,
    fetch: fakeTipsFetch(w),
    now: () => w.now,
    pause: async (ms) => { w.now += ms },
    deadlineMs: 600_000,
    buildTip: fakeBuild,
    ...over,
  }
}

const world = () => makeTipsWorld(NOW)
const emailPosts = (w: TipsWorld) => fetchesTo(w, 'api.resend.com/emails', 'POST')
const tipOf = (b: unknown) => ((b as { tags: Array<{ name: string; value: string }> }).tags.find((t) => t.name === 'tip')?.value)

describe('a real send', () => {
  test('a prospect due today gets p1: checked, claimed, sent and marked, in that order', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ ok: true, dry: false, subscribers: 1, planned: 1, sent: 1, failed: 0, unconfirmed: 0 })
    expect(r).not.toHaveProperty('plans')

    expect(w.ledger).toHaveLength(1)
    expect(w.ledger[0]).toMatchObject({ email: ANA, tip_key: 'p1_ride_costs', track: 'PROSPECT', booking_id: null, status: 'sent', resend_id: 're_1' })
    expect(w.ledger[0].sent_at).toBeTruthy()

    const order = w.log
      .map((e) => (e.kind === 'fetch' ? `${e.method} ${new URL(e.url).pathname}` : `${e.op} ${e.table}`))
      .filter((s) => /contacts\/ana|insert|\/emails|update/.test(s))
    expect(order).toEqual([`GET /contacts/${ANA}`, 'insert trip_tips_log', 'POST /emails', 'update trip_tips_log'])
  })

  test('the email carries the sender, the reply-to, the tags, both unsubscribe routes and an idempotency key', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    await runTripTips(deps(w))
    const [post] = emailPosts(w)
    const body = post.body as Record<string, unknown>
    expect(body).toMatchObject({ from: TIPS_FROM, to: [ANA], reply_to: TIPS_REPLY_TO, subject: 'Subject p1_ride_costs' })
    expect(TIPS_FROM).toBe('MAPL Tours Jamaica <contact@mapltours.com>')
    expect(body.tags).toEqual([{ name: 'campaign', value: 'trip_tips' }, { name: 'tip', value: 'p1_ride_costs' }])

    const h = body.headers as Record<string, string>
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const m = /^<(https:\/\/mapltours\.com\/api\/trip-tips\/unsubscribe\?e=([A-Za-z0-9_-]+)&t=([A-Za-z0-9_-]+))>, <mailto:contact@mapltours\.com\?subject=stop>$/.exec(h['List-Unsubscribe'])
    expect(m).not.toBeNull()
    expect(verifyStop(m![2], m![3], SECRET)).toBe(ANA)
    expect(String(body.html)).toContain(m![1].replace(/&/g, '&amp;'))
    expect(String(body.text)).toContain(m![1])

    const want = `trip-tips-p1_ride_costs-${createHash('sha256').update(ANA).digest('hex').slice(0, 16)}`
    expect(post.headers['Idempotency-Key']).toBe(want)
    expect(idempotencyKey('p1_ride_costs', ` ${ANA.toUpperCase()} `)).toBe(want)
  })

  test('a booked guest gets their track\'s tip with the trip facts and the booking id, and no mailing address', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    const ride = rideBooking({ email: ANA, arrival: `${jaIn(16)}T13:00`, departure: `${jaIn(23)}T09:00`, paidAt: ago(5) })
    w.bookings.push(ride)
    const seen: TipContext[] = []
    const r = await runTripTips(deps(w, { buildTip: (k, c) => { seen.push(c); return fakeBuild(k, c) } }))
    expect(r.sent).toBe(1)
    expect(w.ledger[0]).toMatchObject({ tip_key: 'r1_before_you_fly', track: 'RIDE', booking_id: ride.id, status: 'sent' })
    expect(seen[0]).toMatchObject({
      track: 'RIDE',
      hotel: 'Sample Resort Montego Bay',
      arrival: { date: jaIn(16), time: '13:00', flight: 'AA 123' },
      tours: [],
    })
    // The address comes from lib/trip-tips/postal.ts inside the builder, never from the run (owner, Sept 27 2026: none).
    expect(seen[0]).not.toHaveProperty('postalAddress')
    expect(TRIP_TIPS_POSTAL_ADDRESS).toBeNull()
  })
})

describe('the send gate and dry runs', () => {
  test('send off: every read, every build, no claim, no send, no write; addresses masked', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    subscribe(w, BEN, ago(30))
    w.bookings.push(rideBooking({ email: BEN, arrival: `${jaIn(6)}T13:00`, paidAt: ago(20) }))
    let builds = 0
    const r = await runTripTips(deps(w, { send: false, buildTip: (k, c) => { builds += 1; return fakeBuild(k, c) } }))
    expect(r).toMatchObject({ dry: true, planned: 2, would_send: 2, sent: 0 })
    expect(builds).toBe(2)
    expect(emailPosts(w)).toHaveLength(0)
    expect(dbWrites(w)).toHaveLength(0)
    expect(w.ledger).toHaveLength(0)
    const out = JSON.stringify(r)
    for (const raw of [ANA, BEN, 'ana.guest', 'ben_guest']) expect(out).not.toContain(raw)
    expect(r.plans).toEqual(expect.arrayContaining([
      { email: 'a***@example.org', track: 'PROSPECT', key: 'p1_ride_costs', outcome: 'would_send' },
      { email: 'b***@example.net', track: 'RIDE', key: 'r2_week_before', outcome: 'would_send' },
    ]))
  })

  test('a dry run without the secret still plans (placeholder signature), a real one refuses', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    await expect(runTripTips(deps(w, { send: false, secret: null }))).resolves.toMatchObject({ would_send: 1 })
    await expect(runTripTips(deps(world(), { secret: null }))).rejects.toThrow(new TipsRunError('secret_missing'))
  })
})

describe('eligibility', () => {
  test('only subscribed, HubSpot-yes, non-test addresses are considered; test addresses reach nothing', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.segment.push({ id: 'c_x', email: 'left@example.org', unsubscribed: true })
    w.hubspot.set('left@example.org', { mapl_tips: 'yes', mapl_tips_at: ago(30) })
    subscribe(w, 'said.no@example.org', ago(30))
    w.hubspot.set('said.no@example.org', { mapl_tips: 'no', mapl_tips_at: ago(3) })
    w.segment.push({ id: 'c_y', email: 'unknown@example.org', unsubscribed: false })
    w.contacts.set('unknown@example.org', { unsubscribed: false })
    subscribe(w, 'qa@example.com', ago(30))
    subscribe(w, 'x+1@resend.dev', ago(30))

    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ subscribers: 5, skipped_test: 2, not_yes: 2, planned: 1, sent: 1 })
    expect(emailPosts(w).map((p) => (p.body as { to: string[] }).to[0])).toEqual([ANA])

    const hubspotInputs = fetchesTo(w, 'batch/read').flatMap((f) => (f.body as { inputs: Array<{ id: string }> }).inputs.map((i) => i.id))
    expect(hubspotInputs).not.toContain('qa@example.com')
    expect(hubspotInputs).not.toContain('x+1@resend.dev')
    const bookingReads = w.log.filter((e) => e.kind === 'db' && e.table === 'bookings')
    expect(bookingReads).toHaveLength(1)
  })

  test('addresses are compared lower-cased and once each', async () => {
    const w = world()
    subscribe(w, 'Ana.Guest@Example.org', ago(30))
    w.segment.push({ id: 'dup', email: ' ana.guest@example.org ', unsubscribed: false })
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ subscribers: 1, sent: 1 })
    expect(w.ledger[0].email).toBe(ANA)
  })

  test('a pending refund request holds the address', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.bookings.push(rideBooking({ email: ANA, arrival: `${jaIn(20)}T13:00`, refund_state: 'requested', paidAt: ago(10) }))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ planned: 0, sent: 0, held: { refund_requested: 1 } })
  })

  test('bookings are matched by the exact address: an underscore is not a wildcard, case does not matter', async () => {
    const w = world()
    subscribe(w, BEN, ago(30))
    // Another guest whose address differs only where BEN has an underscore.
    w.bookings.push(rideBooking({ email: 'benxguest@example.net', arrival: `${jaIn(16)}T13:00`, paidAt: ago(9) }))
    let r = await runTripTips(deps(w))
    expect(w.ledger[0]).toMatchObject({ tip_key: 'p1_ride_costs', track: 'PROSPECT' })
    expect(r.sent).toBe(1)

    const w2 = world()
    subscribe(w2, BEN, ago(30))
    w2.bookings.push(rideBooking({ email: 'Ben_Guest@Example.NET', arrival: `${jaIn(16)}T13:00`, paidAt: ago(9) }))
    r = await runTripTips(deps(w2))
    expect(w2.ledger[0]).toMatchObject({ tip_key: 'r1_before_you_fly', track: 'RIDE' })
  })

  test('stopped since the segment was read: checked again at send time', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    subscribe(w, BEN, ago(30))
    w.contacts.set(ANA, { unsubscribed: true })
    w.contacts.delete(BEN)
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, skipped: { unsubscribed: 1, no_contact: 1 } })
    expect(emailPosts(w)).toHaveLength(0)
    expect(dbWrites(w)).toHaveLength(0)
  })

  test('a contact check that fails sends nothing', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.fail.contactStatus = 500
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, skipped: { contact_check_failed: 1 }, errors: { resend_contact_500: 1 } })
    expect(dbWrites(w)).toHaveLength(0)
  })
})

describe('claims, releases and retries', () => {
  test('another run took the key first: this run skips it and sends nothing', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.beforeClaim = (row) => {
      w.ledger.push({ id: 'other', email: String(row.email), tip_key: String(row.tip_key), track: 'PROSPECT', booking_id: null, status: 'claimed', resend_id: null, created_at: new Date(w.now).toISOString(), sent_at: null })
    }
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, skipped: { claimed_elsewhere: 1 } })
    expect(emailPosts(w)).toHaveLength(0)
  })

  test('a claim that fails for another reason sends nothing', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.fail.claimError = true
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, skipped: { claim_failed: 1 }, errors: { ledger_claim: 1 } })
    expect(emailPosts(w)).toHaveLength(0)
  })

  test('a refusal releases the claim, and the next run deletes it and sends', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.sendAnswers.push({ status: 422, body: { name: 'validation_error' } })
    let r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, failed: 1, errors: { resend_send_422: 1 } })
    expect(w.ledger).toHaveLength(1)
    expect(w.ledger[0].status).toBe('failed')

    r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 1, failed: 0 })
    expect(w.ledger).toHaveLength(1)
    expect(w.ledger[0]).toMatchObject({ tip_key: 'p1_ride_costs', status: 'sent' })
    expect(w.log.some((e) => e.kind === 'db' && e.op === 'delete')).toBe(true)
  })

  test('an open answer is retried once with the same key and the same body', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.sendAnswers.push({ status: 500 })
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 1, unconfirmed: 0 })
    const posts = emailPosts(w)
    expect(posts).toHaveLength(2)
    expect(posts[0].headers['Idempotency-Key']).toBe(posts[1].headers['Idempotency-Key'])
    expect(posts[0].body).toEqual(posts[1].body)
  })

  test('a concurrent request with the key is waited for once', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.sendAnswers.push({ status: 409, body: { name: 'concurrent_idempotent_requests' } })
    const r = await runTripTips(deps(w))
    expect(r.sent).toBe(1)
  })

  test.each([
    ['5xx twice', [{ status: 500 }, { status: 503 }]],
    ['no answer twice', [{ status: 0 }, { status: 0 }]],
    ['the key already used with another body', [{ status: 409, body: { name: 'invalid_idempotent_request' } }]],
  ])('%s: outcome unknown, the claim stays, and the key is never mailed again', async (_label, answers) => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.sendAnswers.push(...answers)
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, unconfirmed: 1, failed: 0 })
    expect(w.ledger[0].status).toBe('claimed')
    const before = emailPosts(w).length

    // Weeks later nothing re-sends p1; the next tip in line may go.
    w.now += 20 * DAY_MS
    await runTripTips(deps(w))
    const tips = emailPosts(w).slice(before).map((p) => tipOf(p.body))
    expect(tips).not.toContain('p1_ride_costs')
  })

  test.each<[string, Array<{ status: number; body?: Record<string, unknown> }>]>([
    ['no answer, then rate limited', [{ status: 0 }, { status: 429 }]],
    ['a 5xx, then rate limited', [{ status: 500 }, { status: 429 }]],
    ['a concurrent request, then refused', [{ status: 409, body: { name: 'concurrent_idempotent_requests' } }, { status: 422, body: { name: 'validation_error' } }]],
  ])('%s: the first attempt may have gone out, so the claim stays and nothing is posted again, even after the 24-hour key expires', async (_l, answers) => {
    const w = world()
    subscribe(w, ANA, ago(30))
    // The first POST lands at Resend (and is delivered) before its answer is lost.
    const inner = fakeTipsFetch(w)
    let posts = 0
    let delivered = 0
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/emails') && (init?.method ?? 'GET').toUpperCase() === 'POST') {
        posts += 1
        if (posts === 1) delivered += 1
        const a = answers[posts - 1]
        if (a) {
          if (a.status === 0) throw new TypeError('fetch failed')
          return new Response(JSON.stringify(a.body ?? { message: 'no' }), { status: a.status })
        }
        delivered += 1
      }
      return inner(input, init)
    }) as typeof fetch
    const r = await runTripTips(deps(w, { fetch: f }))
    expect(r).toMatchObject({ sent: 0, unconfirmed: 1, failed: 0 })
    expect(w.ledger[0].status).toBe('claimed')
    w.now += DAY_MS + 60_000
    await runTripTips(deps(w, { fetch: f }))
    expect(posts).toBe(2)
    expect(delivered).toBe(1)
  })

  test('rate limited twice: never accepted, so released', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.sendAnswers.push({ status: 429, retryAfter: 1 }, { status: 429 })
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, failed: 1 })
    expect(w.ledger[0].status).toBe('failed')
  })

  test('a mark that fails leaves the row claimed, which still blocks a resend', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.fail.markError = true
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 1, errors: { ledger_mark_sent: 1 } })
    expect(w.ledger[0].status).toBe('claimed')
  })

  test('claims left by a run that stopped mid-send are reported', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.ledger.push({ id: 'old', email: ANA, tip_key: 'p1_ride_costs', track: 'PROSPECT', booking_id: null, status: 'claimed', resend_id: null, created_at: new Date(NOW - 2 * 3_600_000).toISOString(), sent_at: null })
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ stale_claims: 1, sent: 0, held: { cadence_7d: 1 } })
  })
})

describe('failing closed', () => {
  test.each([
    ['segment', (w: TipsWorld) => { w.fail.segmentStatus = 500 }, 'segment_read_500'],
    ['HubSpot', (w: TipsWorld) => { w.fail.hubspotStatus = 401 }, 'hubspot_read_401'],
    ['ledger', (w: TipsWorld) => { w.fail.ledgerRead = true }, 'ledger_read'],
  ])('a %s read that fails stops the run before anything is sent', async (_l, breakIt, code) => {
    const w = world()
    subscribe(w, ANA, ago(30))
    breakIt(w)
    await expect(runTripTips(deps(w))).rejects.toThrow(new TipsRunError(code))
    expect(emailPosts(w)).toHaveLength(0)
    expect(dbWrites(w)).toHaveLength(0)
  })

  test('a list longer than the job reads is a failure, never a silent cut', async () => {
    const w = world()
    w.pageSize = 1
    for (let i = 0; i < 21; i++) subscribe(w, `guest${i}@example.org`, ago(30))
    await expect(runTripTips(deps(w))).rejects.toThrow(new TipsRunError('segment_too_long'))
  })

  test('every page of the segment is read', async () => {
    const w = world()
    w.pageSize = 2
    for (let i = 0; i < 5; i++) subscribe(w, `guest${i}@example.org`, ago(30))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ subscribers: 5, sent: 5 })
  })

  test('a booking read that fails skips only that address', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    subscribe(w, BEN, ago(30))
    w.fail.bookingReadFor = [ANA]
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ unread: 1, sent: 1, errors: { booking_read: 1 } })
    expect(emailPosts(w).map((p) => (p.body as { to: string[] }).to[0])).toEqual([BEN])
  })

  test.each([
    ['throws', (() => { throw new Error('bad data') }) as BuildTip, 'build_failed'],
    ['drops the unsubscribe link', ((k) => ({ subject: 's', preheader: 'p', html: `<p>${k}</p>`, text: k })) as BuildTip, 'build_failed'],
    ['is empty', (() => ({ subject: '', preheader: '', html: '', text: '' })) as BuildTip, 'build_failed'],
    ['is too large', ((k, c) => ({ ...fakeBuild(k, c), html: `${fakeBuild(k, c).html}${'x'.repeat(MAX_HTML_BYTES)}` })) as BuildTip, 'build_too_large'],
  ])('an email that %s is never sent or claimed', async (_l, build, why) => {
    const w = world()
    subscribe(w, ANA, ago(30))
    const r = await runTripTips(deps(w, { buildTip: build }))
    expect(r).toMatchObject({ sent: 0, skipped: { [why]: 1 } })
    expect(dbWrites(w)).toHaveLength(0)
    expect(emailPosts(w)).toHaveLength(0)
  })
})

describe('the stop link must work before a tip goes', () => {
  test('an address with ~ or & (which the job mails) gets a tip whose link verifies', async () => {
    const w = world()
    subscribe(w, 'jane~trips@example.org', ago(30))
    subscribe(w, 'o&m@example.org', ago(30))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 2, skipped: {} })
    for (const p of emailPosts(w)) {
      const u = new URL(/<(https:[^>]+)>/.exec((p.body as { headers: Record<string, string> }).headers['List-Unsubscribe'])![1])
      expect(verifyStop(u.searchParams.get('e'), u.searchParams.get('t'), SECRET)).toBe((p.body as { to: string[] }).to[0])
    }
  })

  test('an address whose link would not verify is skipped: no claim, no send', async () => {
    const w = world()
    subscribe(w, 'a\u0001b@example.org', ago(30))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ sent: 0, planned: 1, skipped: { unsubscribe_unverifiable: 1 } })
    expect(emailPosts(w)).toHaveLength(0)
    expect(dbWrites(w)).toHaveLength(0)
  })
})

describe('limits', () => {
  test('at most 25 sends a run, the closing windows first; the rest wait', async () => {
    const w = world()
    for (let i = 0; i < 30; i++) subscribe(w, `guest${String(i).padStart(2, '0')}@example.org`, ago(30))
    subscribe(w, BEN, ago(30))
    // BEN's week-before window closes today (arrival 5 days away).
    w.bookings.push(rideBooking({ email: BEN, arrival: `${jaIn(5)}T13:00`, paidAt: ago(20) }))
    const r = await runTripTips(deps(w))
    expect(r).toMatchObject({ planned: 31, sent: MAX_SENDS, deferred: 31 - MAX_SENDS })
    expect((emailPosts(w)[0].body as { to: string[] }).to).toEqual([BEN])
  })

  test('the deadline defers what is left', async () => {
    const w = world()
    for (const e of ['a1@example.org', 'a2@example.org', 'a3@example.org']) subscribe(w, e, ago(30))
    // Each send is two spaced Resend calls (250 ms apart on the fake clock).
    const r = await runTripTips(deps(w, { deadlineMs: 600 }))
    expect(r).toMatchObject({ sent: 2, deferred: 1 })
  })
})

describe('with the real email builder', () => {
  test('a prospect tip and a ride tip build, carry the escaped unsubscribe link, and fit under 102 KB', async () => {
    const w = world()
    const hotel = DESTINATIONS[0]
    subscribe(w, ANA, ago(30))
    subscribe(w, BEN, ago(30))
    w.bookings.push({
      ...rideBooking({ email: BEN, arrival: `${jaIn(16)}T13:00`, departure: `${jaIn(23)}T09:00`, paidAt: ago(5), hotel: hotel.name, zone: hotel.zone }),
    })
    const r = await runTripTips(deps(w, { buildTip: undefined }))
    expect(r).toMatchObject({ sent: 2, skipped: {} })
    for (const p of emailPosts(w)) {
      const b = p.body as { html: string; text: string; headers: Record<string, string> }
      const url = /<(https:[^>]+)>/.exec(b.headers['List-Unsubscribe'])![1]
      expect(b.html.includes(url) || b.html.includes(url.replace(/&/g, '&amp;'))).toBe(true)
      expect(b.text).toContain(url)
      expect(Buffer.byteLength(b.html)).toBeLessThan(MAX_HTML_BYTES)
      expect(b.html).not.toMatch(/Jimmy Cliff|Boulevard|St\. James/)
      expect(b.text).not.toMatch(/Jimmy Cliff|Boulevard|St\. James/)
      // Every tip that goes out carries a photo from the site, and the text version none.
      expect(b.html).toMatch(/<img src="https:\/\/mapltours\.com\/media\/email\/tips\/[a-z-]+\.jpg"/)
      expect(b.text).not.toMatch(/\.jpg/)
    }
    expect(emailPosts(w).map((p) => tipOf(p.body)).sort()).toEqual(['p1_ride_costs', 'r1_before_you_fly'])
  })

  test('a tour guest picked up at a rate-card hotel is priced the ride to that hotel', async () => {
    const w = world()
    const hotel = DESTINATIONS.find((d) => d.name === 'Riu Negril')!
    subscribe(w, ANA, ago(30))
    w.bookings.push({ ...tourBooking({ email: ANA, dates: [jaIn(16)], paidAt: ago(5), experienceId: 14, travelers: 3 }), pickup: hotel.name })
    const r = await runTripTips(deps(w, { buildTip: undefined }))
    expect(r.sent).toBe(1)
    const body = emailPosts(w)[0].body as { text: string }
    expect(tipOf(emailPosts(w)[0].body)).toBe('t1_airport_ride')
    expect(body.text).toContain(`To: ${hotel.name}`)
    expect(body.text).toContain(`Round trip: $${getTransferPrice(hotel.id, 'round_trip', 3)} for up to 4 people, about 10% less than two one-ways\nOne way: $${getTransferPrice(hotel.id, 'one_way', 3)}\n`)
    expect(fetchesTo(w, 'api.resend.com/emails', 'POST')).toHaveLength(1)
  })

  test('the booking read asks for the pickup column', () => {
    expect(TIPS_BOOKING_SELECT).toMatch(/\bpickup\b/)
  })

  test('a tour guest is built as TOUR with the tour lines', async () => {
    const w = world()
    subscribe(w, ANA, ago(30))
    w.bookings.push(tourBooking({ email: ANA, dates: [jaIn(16)], paidAt: ago(5), experienceId: 3, title: 'Bamboo Rafting on the Martha Brae' }))
    const r = await runTripTips(deps(w, { buildTip: undefined }))
    expect(r.sent).toBe(1)
    expect(tipOf(emailPosts(w)[0].body)).toBe('t1_airport_ride')
  })
})
