import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { render } from '@react-email/render'
import type React from 'react'

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })),
  sendEmailBatch: vi.fn(async (emails: unknown[]) => ({ ok: true, results: emails.map(() => ({ ok: true, id: 'em_b' })) })),
  opsBcc: () => ['ops@example.com'],
}))

import { sendEmail, sendEmailBatch } from '@/lib/email/send'
import { sendDayOf, stampKey } from '@/lib/dayof'
import { sendReviewRequest } from '@/lib/email/review-request'
import { REVIEW_STAMP_KEY } from '@/lib/review-request'
import { BOOKING_ID, member, type Row } from './travel-party-fakes'

/**
 * Where the travel party meets the emails that already existed: a party
 * member's copy goes only AFTER the guest's went, never when the guest's did
 * not, and nothing about it can change what the existing sender reports. The
 * review request reaches them too (owner, Nov 24 2026), once, after the
 * guest's. Otherwise the addresses reach nothing else: no trip tip, reminder,
 * CRM or advertising code reads them.
 */

const sendEmailMock = vi.mocked(sendEmail)
const batchMock = vi.mocked(sendEmailBatch)
const SECRET = 'test-secret-for-travel-party-0123456789'
const HOUR = 3_600_000
const legIso = (hoursAhead: number) => new Date(Date.now() + hoursAhead * HOUR - 5 * HOUR).toISOString()

function rideRow(over: Row = {}): Row {
  return {
    id: BOOKING_ID, status: 'paid', email: 'ana@example.com', first_name: 'Ana',
    driver_name: 'Devon Brown', driver_phone: '+1 876 555 0100', driver_vehicle: 'Toyota Noah, black', driver_plate: 'PJ 1234',
    dispatch: {},
    booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', trip_type: 'one_way', passengers: 3, arrival_at: legIso(6), arrival_flight: 'AA1311' }],
    ...over,
  }
}

/** sendDayOf's own needs (the claim RPC and the status re-read) plus the party table. */
function fakeSvc(row: Row, party: Row[]) {
  const dispatch = row.dispatch as Record<string, unknown>
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: async (fn: string, args: any) => {
      if (fn !== 'merge_dispatch') throw new Error(`unexpected rpc ${fn}`)
      if (args.p_only_if_absent && dispatch[args.p_only_if_absent] !== undefined) return { data: [], error: null }
      for (const k of (args.p_remove ?? []) as string[]) delete dispatch[k]
      Object.assign(dispatch, args.p_patch ?? {})
      return { data: [{ id: row.id }], error: null }
    },
    from: (table: string) => {
      if (table === 'bookings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'paid' }, error: null }) }) }) }
      if (table === 'booking_party') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: party.map((r) => ({ ...r })), error: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

/**
 * Every email in the order it went: the guest's (one request of its own), then
 * the party's (one batch request, each copy its own email; batchKey is that
 * request's idempotency key).
 */
type Sent = Record<string, unknown> & { react: React.ReactElement; batchKey?: string }
const sent = (): Sent[] => {
  const singles = sendEmailMock.mock.invocationCallOrder.map((order, i) => ({ order, emails: [sendEmailMock.mock.calls[i][0] as unknown as Sent] }))
  const batches = batchMock.mock.invocationCallOrder.map((order, i) => {
    const [emails, opts] = batchMock.mock.calls[i] as unknown as [Sent[], { idempotencyKey: string }]
    return { order, emails: emails.map((e) => ({ ...e, batchKey: opts.idempotencyKey })) }
  })
  return [...singles, ...batches].sort((a, b) => a.order - b.order).flatMap((x) => x.emails)
}

beforeEach(() => {
  sendEmailMock.mockClear()
  batchMock.mockClear()
  vi.stubEnv('CART_REMINDER_SECRET', SECRET)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-for-tests')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe("the driver's details before pickup", () => {
  test("the guest first, exactly as before; then each person on the party, their own copy", async () => {
    const row = rideRow()
    const res = await sendDayOf(fakeSvc(row, [member(1), member(2, { removed_at: 'x' }), member(3, { stopped_at: 'x' }), member(4)]) as never, row as never, 'arrival')
    expect(res).toMatchObject({ ok: true, sentTo: 'ana@example.com' })
    const s = sent()
    expect(s.map((e) => e.to)).toEqual(['ana@example.com', 'friend1@example.com', 'friend4@example.com'])
    // The guest's email: as it always was (ops copied, their name, no stop link).
    expect(s[0].bcc).toEqual(['ops@example.com'])
    const guest = await render(s[0].react, { plainText: true })
    // Today or tomorrow by the clock; their name either way.
    expect(guest.toLowerCase()).toMatch(/(welcome to jamaica|see you tomorrow), ana\./)
    expect(guest).not.toContain('Stop these emails')
    // Each party copy: alone, the sign with Ana's name, a stop link, its own key on this claim.
    for (const e of s.slice(1)) {
      expect(e).not.toHaveProperty('bcc')
      expect(e.subject).toBe(s[0].subject)
      const text = await render(e.react, { plainText: true })
      expect(text).toContain("sign showing Ana's name")
      expect(text).not.toContain('your name')
      expect(text).toContain('Stop these emails')
      expect(String(e.batchKey)).toMatch(/^travel-party-batch\/[0-9a-f]{40}$/)
    }
    // The party's copies: one request after the guest's, never one per person.
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(batchMock).toHaveBeenCalledTimes(1)
  })

  test('a guest email that did not go sends nothing to the party, and the claim is released as before', async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const row = rideRow()
    const res = await sendDayOf(fakeSvc(row, [member(1)]) as never, row as never, 'arrival')
    expect(res.ok).toBe(false)
    expect(sent().map((e) => e.to)).toEqual(['ana@example.com'])
    expect((row.dispatch as Row)[stampKey('arrival')]).toBeUndefined()
  })

  test("a party copy that fails, or a party table that cannot be read, never changes the guest's result", async () => {
    batchMock.mockResolvedValueOnce({ ok: true, results: [{ ok: false, error: 'x' }] })
    const row = rideRow()
    expect(await sendDayOf(fakeSvc(row, [member(1)]) as never, row as never, 'arrival')).toMatchObject({ ok: true })
    const broken = rideRow()
    const svc = fakeSvc(broken, [])
    svc.from = ((t: string) => { if (t === 'booking_party') throw new Error('relation does not exist'); return fakeSvc(broken, []).from(t) }) as never
    expect(await sendDayOf(svc as never, broken as never, 'arrival')).toMatchObject({ ok: true, sentTo: 'ana@example.com' })
  })

  test('nobody on the party: the guest alone, as before the party existed', async () => {
    const row = rideRow()
    await sendDayOf(fakeSvc(row, []) as never, row as never, 'arrival')
    expect(sent().map((e) => e.to)).toEqual(['ana@example.com'])
  })
})

/** A one-way ride that landed three days ago: due for its review request. */
function reviewRow(over: Row = {}): Row {
  return {
    id: BOOKING_ID, status: 'paid', email: 'ana@example.com', first_name: 'Ana', booking_type: 'transfer',
    dispatch: {},
    booking_items: [{ item_type: 'transfer', hotel: 'Riu Negril', trip_type: 'one_way', arrival_at: new Date(Date.now() - 72 * HOUR).toISOString() }],
    ...over,
  }
}

describe('the review request', () => {
  test("the guest's first, exactly as before; then each person on the party, their own copy", async () => {
    const row = reviewRow()
    const res = await sendReviewRequest(fakeSvc(row, [member(1), member(2, { removed_at: 'x' }), member(3, { stopped_at: 'x' }), member(4)]) as never, row as never)
    expect(res).toMatchObject({ ok: true, sentTo: 'ana@example.com', party: { sent: 2, failed: 0 } })
    const s = sent()
    expect(s.map((e) => e.to)).toEqual(['ana@example.com', 'friend1@example.com', 'friend4@example.com'])
    // The guest's: as it always was (their name, no stop link).
    expect(s[0].subject).toBe('How was the ride, Ana?')
    const guest = await render(s[0].react, { plainText: true })
    // Plain text sets the headline in capitals.
    expect(guest.toLowerCase()).toContain('thanks for riding with us, ana.')
    expect(guest).not.toContain('Stop these emails')
    // Each party copy: alone, no first name, the booker named in the footer, a stop link, its own key.
    for (const e of s.slice(1)) {
      expect(e).not.toHaveProperty('bcc')
      expect(e.subject).toBe('How was the ride?')
      const text = await render(e.react, { plainText: true })
      expect(text.toLowerCase()).toContain('thanks for riding with us.')
      expect(text.toLowerCase()).not.toContain('with us, ana')
      expect(text).toContain('Write a review on Tripadvisor')
      expect(text).toContain('Ana added your email to their MAPL Tours Jamaica booking, so we email you about this trip, and once after it to ask for a review. We use your address for nothing else.')
      expect(text).toContain('Stop these emails')
      expect(String((e.headers as Record<string, string>)['List-Unsubscribe'])).toContain('/api/travel-party/stop?p=')
      expect(String(e.batchKey)).toMatch(/^travel-party-batch\/[0-9a-f]{40}$/)
    }
    // One request for the guest, one for the whole party; each copy still its own email.
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    expect(batchMock).toHaveBeenCalledTimes(1)
    expect(new Set(s.slice(1).map((e) => (e.headers as Record<string, string>)['List-Unsubscribe'])).size).toBe(2)
  })

  test('a tour: its name in the subject, the day out in the headline', async () => {
    const day = new Date(Date.now() - 72 * HOUR).toISOString().slice(0, 10)
    const row = reviewRow({ booking_type: 'tour', booking_items: [{ item_type: 'tour', title: "Dunn's River Falls Climb", destination: 'Ocho Rios', date: day }] })
    await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never)
    const s = sent()
    expect(s.map((e) => e.to)).toEqual(['ana@example.com', 'friend1@example.com'])
    expect(s[1].subject).toBe(s[0].subject)
    expect((await render(s[1].react, { plainText: true })).toLowerCase()).toContain('thanks for spending the day with us.')
  })

  test("a guest request that did not go sends the party nothing, and the claim is released as before", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    const row = reviewRow()
    const res = await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never)
    expect(res.ok).toBe(false)
    expect(sent().map((e) => e.to)).toEqual(['ana@example.com'])
    expect((row.dispatch as Row)[REVIEW_STAMP_KEY]).toBeUndefined()
  })

  test('asked once: the next run sends nobody anything', async () => {
    const row = reviewRow()
    await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never)
    sendEmailMock.mockClear()
    batchMock.mockClear()
    expect(await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never)).toMatchObject({ ok: false, skipped: 'already_asked' })
    expect(sent()).toHaveLength(0)
  })

  test("an operator's forced resend is for the guest who lost theirs, never the party", async () => {
    const row = reviewRow({ dispatch: { [REVIEW_STAMP_KEY]: '2026-11-20T15:00:00.000Z' } })
    const res = await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never, { force: true })
    expect(res.ok).toBe(true)
    expect(res).not.toHaveProperty('party')
    expect(sent().map((e) => e.to)).toEqual(['ana@example.com'])
  })

  test("a party copy that fails never changes the guest's result", async () => {
    batchMock.mockResolvedValueOnce({ ok: true, results: [{ ok: false, error: 'x' }] })
    const row = reviewRow()
    expect(await sendReviewRequest(fakeSvc(row, [member(1)]) as never, row as never)).toMatchObject({ ok: true, sentTo: 'ana@example.com', party: { sent: 0, failed: 1 } })
  })
})

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the other senders keep the same order', () => {
  test('a driver change: the party copies only after the guest email went', () => {
    const src = read('lib/driver-update-send.ts')
    const guestFailed = src.indexOf("if (!res.ok) {\n    return { ok: false, status: 502")
    const party = src.indexOf("sendToParty(svc, b.id, 'driver_update'")
    expect(guestFailed).toBeGreaterThan(0)
    expect(party).toBeGreaterThan(guestFailed)
    expect(src.match(/sendToParty\(/g)).toHaveLength(1)
  })
  test("a cancellation: the party's notice only in the branch where the guest's receipt went", () => {
    const src = read('lib/email/cancellation.ts')
    const branch = src.slice(src.indexOf("result.customer = 'sent'"), src.indexOf('await releaseEmailChannel(supabase, bookingId, CUSTOMER_CHANNEL)'))
    expect(branch).toContain('await sendPartyCancellation(supabase, bookingId)')
    expect(src.match(/sendPartyCancellation\(/g)).toHaveLength(1)
  })
  test('both confirmation senders give the booker the same link, and send the party nothing', () => {
    for (const p of ['lib/email/booking.ts', 'app/api/webhooks/stripe/route.ts']) {
      const src = read(p)
      expect(src.match(/travelPartyUrl: travelPartyUrl\(booking\.id\),/g), p).toHaveLength(2)
      expect(src, p).toContain("import { travelPartyUrl } from '@/lib/travel-party-server'")
      expect(src, p).not.toMatch(/sendToParty|sendPartyConfirmation|booking_party/)
    }
  })
})

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mts|mjs|js|sql)$/.test(name)) out.push(p)
  }
  return out
}

describe('party addresses reach nothing else', () => {
  test('only these files touch the party table or its senders', () => {
    const allowed = new Set([
      'lib/travel-party-server.ts',
      'lib/dayof.ts',
      'lib/driver-update-send.ts',
      'lib/email/cancellation.ts',
      'lib/email/booking.ts',
      'lib/email/review-request.ts',
      'app/api/webhooks/stripe/route.ts',
      'app/api/travel-party/route.ts',
      'app/api/travel-party/stop/route.ts',
      'app/travel-party/page.tsx',
      'app/checkout/confirm/page.tsx',
      'app/transfers/confirm/page.tsx',
      'supabase/migrations/042_booking_party.sql',
    ])
    const root = process.cwd()
    const touching = ['app', 'lib', 'components', 'netlify', 'scripts', 'supabase']
      .flatMap((d) => walk(join(root, d)))
      .map((p) => p.slice(root.length + 1))
      // An import of the senders, or the table itself; a comment naming the module is not a use.
      .filter((p) => /from '@\/lib\/travel-party-server'|booking_party/.test(read(p)))
    expect(touching.sort()).toEqual(Array.from(allowed).sort())
  })

  test('trip tips, cart reminders, the tour email, HubSpot, Meta and GA4 never see them', () => {
    for (const p of ['lib/cart-reminders.ts', 'lib/email/tour-upsell.ts', 'lib/meta-capi.ts', 'lib/ga4-server.ts', 'lib/booking-sync.ts', 'app/api/abandoned-cart/route.ts']) {
      expect(read(p), p).not.toMatch(/travel-party|booking_party/)
    }
    for (const p of walk(join(process.cwd(), 'lib/trip-tips'))) expect(read(p.slice(process.cwd().length + 1)), p).not.toMatch(/travel-party|booking_party/)
  })
})
