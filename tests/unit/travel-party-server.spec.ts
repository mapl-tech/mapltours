import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@react-email/render'
import type React from 'react'
import { sendEmail, sendEmailBatch } from '@/lib/email/send'
import {
  activeRows, partySecret, partyStopUrl, partyView, sendPartyCancellation, sendPartyConfirmation, sendToParty, signPartyStop,
  travelPartyUrl, tripPropsOf, verifyPartyStop,
} from '@/lib/travel-party-server'
import { bookingProofShape, keepsBookingProof } from '@/lib/confirm-proof'
import { bookingProof } from '@/lib/confirm-proof-server'
import { BOOKING_ID, fakeDb, member, rideBooking } from './travel-party-fakes'

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async () => ({ ok: true, id: 'em_1' })),
  sendEmailBatch: vi.fn(async (emails: unknown[]) => ({ ok: true, results: emails.map(() => ({ ok: true, id: 'em_b' })) })),
}))
const sendEmailMock = vi.mocked(sendEmail)
const batchMock = vi.mocked(sendEmailBatch)
type BatchCall = [Record<string, unknown>[], { idempotencyKey: string; timeoutMs?: number }]
const batchCall = (i: number) => batchMock.mock.calls[i] as unknown as BatchCall

/**
 * The travel party's server half (lib/travel-party-server): the signed
 * links, and every email a party member gets. Each goes to one person with a
 * stop link, once, only while the booking is paid and the person is still on
 * the party, and nothing here ever throws into the caller.
 */

const SECRET = 'test-secret-for-travel-party-0123456789'

beforeEach(() => {
  sendEmailMock.mockClear()
  batchMock.mockClear()
  vi.stubEnv('CART_REMINDER_SECRET', SECRET)
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-for-tests')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllEnvs())

describe('the stop link', () => {
  test('names the row, signed; a changed id or token is refused', () => {
    const id = member(1).id
    const url = new URL(partyStopUrl(id, SECRET))
    expect(url.origin + url.pathname).toBe('https://mapltours.com/api/travel-party/stop')
    expect(url.searchParams.get('p')).toBe(id)
    expect(url.search).not.toContain('@')
    expect(verifyPartyStop(id, url.searchParams.get('t'), SECRET)).toBe(true)
    expect(verifyPartyStop(id.toUpperCase(), signPartyStop(id, SECRET), SECRET)).toBe(true)
    expect(verifyPartyStop(member(2).id, url.searchParams.get('t'), SECRET)).toBe(false)
    expect(verifyPartyStop(id, 'x' + url.searchParams.get('t')!.slice(1), SECRET)).toBe(false)
    expect(verifyPartyStop(id, 'a'.repeat(101), SECRET)).toBe(false)
    expect(verifyPartyStop('not-a-uuid', 'x', SECRET)).toBe(false)
    expect(verifyPartyStop(id, url.searchParams.get('t'), 'another-secret-0123456789')).toBe(false)
  })
  test('the key is an existing one under its own prefix: no new environment variable', () => {
    expect(partySecret({ CART_REMINDER_SECRET: 'a'.repeat(16) } as never)).toBe('a'.repeat(16))
    expect(partySecret({ MENTIONS_SECRET: 'b'.repeat(16) } as never)).toBe('b'.repeat(16))
    expect(partySecret({ TRIP_TIPS_SECRET: 'c'.repeat(16) } as never)).toBe('c'.repeat(16))
    expect(partySecret({ CART_REMINDER_SECRET: 'short' } as never)).toBeNull()
    expect(partySecret({} as never)).toBeNull()
    // Never the same signature a cart reminder's stop link would have for the same id.
    expect(signPartyStop(BOOKING_ID, SECRET)).not.toBe(signPartyStop(BOOKING_ID, SECRET + 'x'))
  })
})

describe("the booker's link to their party page", () => {
  test('carries the booking proof the checkout gives, in the shape the middleware keeps', () => {
    const url = new URL(travelPartyUrl(BOOKING_ID.toUpperCase())!)
    expect(url.origin + url.pathname).toBe('https://mapltours.com/travel-party')
    expect(url.searchParams.get('b')).toBe(BOOKING_ID)
    expect(url.searchParams.get('trip_proof')).toBe(bookingProof(BOOKING_ID))
    expect(bookingProofShape(url.searchParams.get('trip_proof'))).toBe(url.searchParams.get('trip_proof'))
    expect(keepsBookingProof(url.pathname)).toBe(true)
  })
  test('no link without a key or for a malformed id', () => {
    expect(travelPartyUrl('nope')).toBeNull()
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(travelPartyUrl(BOOKING_ID)).toBeNull()
  })
})

describe("what a party member's confirmation is built from", () => {
  test('a ride: where, when, flights and party; nothing about money or the booker but a first name', () => {
    const p = tripPropsOf(rideBooking() as never)
    expect(p).toEqual({
      bookingRef: 'MAPL-ABCD1234',
      addedBy: 'Ana',
      kind: 'transfer',
      transfers: [{ destination: 'Riu Negril', tripType: 'round_trip', passengers: 3, arrivalAt: '2026-11-25T15:09:00+00:00', arrivalFlight: 'aa1311', departureAt: '2026-12-02T09:30:00+00:00', departureFlight: 'aa922' }],
      tours: [],
      pickup: null,
      supportEmail: 'contact@mapltours.com',
    })
    expect(JSON.stringify(p)).not.toMatch(/194|ana@example|555/)
  })
  test('a tour: its tours by day, never its transport line, and the pickup', () => {
    const p = tripPropsOf(rideBooking({
      booking_type: 'tour', pickup: 'Riu Montego Bay',
      booking_items: [
        { item_type: 'experience', title: 'Rick’s Cafe', destination: 'Negril', date: '2026-11-28', travelers: 2 },
        { item_type: 'transfer', title: 'Transport', destination: 'x', date: '2026-11-20', travelers: 2 },
        { item_type: 'experience', title: 'Dunn’s River', destination: 'Ocho Rios', date: '2026-11-26', travelers: 2 },
      ],
    }) as never)
    expect(p.tours.map((t) => t.title)).toEqual(['Dunn’s River', 'Rick’s Cafe'])
    expect(p.transfers).toEqual([])
    expect(p.pickup).toBe('Riu Montego Bay')
  })
})

const reactOf = (call: number) => (sendEmailMock.mock.calls[call][0] as { react: React.ReactElement }).react

describe("a party member's copy of the confirmation", () => {
  test('goes once, to that person alone, with a stop link, and is stamped', async () => {
    const { db, svc } = fakeDb({ bookings: [rideBooking()], party: [member(1)] })
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('sent')
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
    const sent = sendEmailMock.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(sent.to).toBe('friend1@example.com')
    expect(sent).not.toHaveProperty('cc')
    expect(sent).not.toHaveProperty('bcc')
    expect(sent.subject).toBe('Your Jamaica airport ride, booked by Ana (MAPL-ABCD1234)')
    expect(sent.idempotencyKey).toBe(`travel-party/confirm/${member(1).id}`)
    const headers = sent.headers as Record<string, string>
    expect(headers['List-Unsubscribe']).toBe(`<${partyStopUrl(member(1).id, SECRET)}>`)
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(await render(reactOf(0))).toContain('Stop these emails')
    expect(db.party[0].confirmation_sent_at).toBeTruthy()
    // A second tap, a second run: nothing more goes.
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('already')
    expect(sendEmailMock).toHaveBeenCalledTimes(1)
  })

  test('nothing to someone removed or who stopped, to a booking no longer paid, or without a stop link', async () => {
    const { svc } = fakeDb({ bookings: [rideBooking()], party: [member(1, { removed_at: 'x' }), member(2, { stopped_at: 'x' })] })
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('skipped')
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(2).id)).toBe('skipped')
    const refunded = fakeDb({ bookings: [rideBooking({ status: 'refunded' })], party: [member(3)] })
    expect(await sendPartyConfirmation(refunded.svc, BOOKING_ID, member(3).id)).toBe('skipped')
    vi.stubEnv('CART_REMINDER_SECRET', '')
    const noKey = fakeDb({ bookings: [rideBooking()], party: [member(4)] })
    expect(await sendPartyConfirmation(noKey.svc, BOOKING_ID, member(4).id)).toBe('skipped')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test("a row from another booking is never sent this booking's trip", async () => {
    const { svc } = fakeDb({ bookings: [rideBooking()], party: [member(1, { booking_id: '99999999-9999-4999-8999-999999999999' })] })
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('failed')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  test('a refused send is not stamped, so Send again can try; a throw is contained', async () => {
    const { db, svc } = fakeDb({ bookings: [rideBooking()], party: [member(1)] })
    sendEmailMock.mockResolvedValueOnce({ ok: false, error: 'resend 500' })
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('failed')
    expect(db.party[0].confirmation_sent_at).toBeNull()
    sendEmailMock.mockRejectedValueOnce(new Error('network'))
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('failed')
    expect(await sendPartyConfirmation(svc, BOOKING_ID, member(1).id)).toBe('sent')
  })
})

describe('the same email to everyone still on the party', () => {
  const build = (m: { id: string; stopUrl: string }) => ({ subject: 'Today: your driver', react: null as unknown as React.ReactElement, key: `k/${m.id}` })

  test('one email each, in ONE request: never to someone removed or stopped, each to one person with their own stop link', async () => {
    const { svc } = fakeDb({ party: [member(1), member(2, { removed_at: 'x' }), member(3, { stopped_at: 'x' }), member(4)], bookings: [] })
    expect(await sendToParty(svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 2, failed: 0 })
    // One Resend request for the whole party (Resend allows 10 a second), never one per person.
    expect(batchMock).toHaveBeenCalledTimes(1)
    expect(sendEmailMock).not.toHaveBeenCalled()
    const [emails, opts] = batchCall(0)
    expect(emails.map((c) => c.to)).toEqual(['friend1@example.com', 'friend4@example.com'])
    expect(opts.idempotencyKey).toMatch(/^travel-party-batch\/[0-9a-f]{40}$/)
    expect(opts.timeoutMs).toBeLessThanOrEqual(2500)
    for (const c of emails) {
      // Each copy is its own email to one person: no CC, no BCC, nobody sees another address.
      expect(typeof c.to).toBe('string')
      expect(c).not.toHaveProperty('bcc')
      expect(c).not.toHaveProperty('cc')
      expect((c.headers as Record<string, string>)['List-Unsubscribe']).toContain('/api/travel-party/stop?p=')
    }
    expect(new Set(emails.map((c) => (c.headers as Record<string, string>)['List-Unsubscribe'])).size).toBe(2)
    // The same people again: the same key, so Resend delivers it once. Different people: a different key.
    await sendToParty(svc, BOOKING_ID, 'dayof', build)
    expect(batchCall(1)[1].idempotencyKey).toBe(opts.idempotencyKey)
    const other = fakeDb({ party: [member(1)], bookings: [] })
    await sendToParty(other.svc, BOOKING_ID, 'dayof', build)
    expect(batchCall(2)[1].idempotencyKey).not.toBe(opts.idempotencyKey)
  })

  test('never throws, and counts what did not go: a refused copy, a failed or thrown request, an unreadable table, no key', async () => {
    const one = fakeDb({ party: [member(1), member(2)] })
    batchMock.mockResolvedValueOnce({ ok: true, results: [{ ok: false, error: 'refused' }, { ok: true, id: 'em_b' }] })
    expect(await sendToParty(one.svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 1, failed: 1 })
    batchMock.mockResolvedValueOnce({ ok: false, error: 'timeout', results: [{ ok: false, error: 'timeout' }, { ok: false, error: 'timeout' }] })
    expect(await sendToParty(one.svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 0, failed: 2 })
    batchMock.mockRejectedValueOnce(new Error('boom'))
    expect(await sendToParty(one.svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 0, failed: 2 })
    const unreadable = fakeDb({ party: [member(1)] })
    unreadable.db.failRead = 'connection reset'
    expect(await sendToParty(unreadable.svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 0, failed: 0 })
    expect(await sendToParty(one.svc, BOOKING_ID, 'dayof', () => { throw new Error('bad build') })).toEqual({ sent: 0, failed: 2 })
    vi.stubEnv('CART_REMINDER_SECRET', '')
    batchMock.mockClear()
    expect(await sendToParty(one.svc, BOOKING_ID, 'dayof', build)).toEqual({ sent: 0, failed: 0 })
    expect(batchMock).not.toHaveBeenCalled()
  })

  test('the cancellation: the trip only, to everyone still on the party', async () => {
    const { svc } = fakeDb({ bookings: [rideBooking({ status: 'refunded' })], party: [member(1), member(2, { stopped_at: 'x' })] })
    expect(await sendPartyCancellation(svc, BOOKING_ID)).toEqual({ sent: 1, failed: 0 })
    const [emails, opts] = batchCall(0)
    expect(emails).toHaveLength(1)
    const c = emails[0]
    expect(c.to).toBe('friend1@example.com')
    expect(c.subject).toBe('Cancelled: your Jamaica airport ride (MAPL-ABCD1234)')
    expect(opts.idempotencyKey).toMatch(/^travel-party-batch\/[0-9a-f]{40}$/)
    const text = await render(c.react as React.ReactElement, { plainText: true })
    expect(text).toContain('Airport ride · Riu Negril · arrival Wed, Nov 25, departure Wed, Dec 2')
    expect(text).not.toMatch(/\$\s?\d|194/)
  })
})

describe("the booker's view of the party", () => {
  test('everyone not removed, with whether their copy went and who stopped', () => {
    const rows = [member(1, { confirmation_sent_at: 'x' }), member(2, { removed_at: 'x' }), member(3, { stopped_at: 'x', confirmation_sent_at: 'x' }), member(4)]
    expect(partyView(rows as never)).toEqual([
      { email: 'friend1@example.com', sent: true, stopped: false },
      { email: 'friend3@example.com', sent: true, stopped: true },
      { email: 'friend4@example.com', sent: false, stopped: false },
    ])
    expect(activeRows(rows as never).map((r) => r.email)).toEqual(['friend1@example.com', 'friend4@example.com'])
  })
})
