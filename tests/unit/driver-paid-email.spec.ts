import { describe, test, expect, vi, beforeEach } from 'vitest'
import type React from 'react'
import { render } from '@react-email/components'
import { moneyBlock, money, round2, type Bk } from '../../lib/dispatch'
import { notifyDriverPaid, notifyTourPaid, tourDayLabel } from '../../lib/email/driver-paid'

/**
 * The driver's "payment sent" email (lib/email/driver-paid.ts), shared by the
 * dispatch console's pay tick and the Wise payout job. One once-only claim in
 * the dispatch map means a ride half is announced once, whichever paid it.
 * The job passes a time limit and an idempotency key; the console passes none.
 */

const { sent } = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }))
vi.mock('@/lib/email/send', () => ({
  driverNotifyEmail: () => process.env.DRIVER_NOTIFY_EMAIL || null,
  opsBcc: () => ['ops@example.com'],
  sendEmail: vi.fn(async (input: Record<string, unknown>) => { sent.push(input); return { ok: true } }),
}))


const booking = (item: Record<string, unknown>, subtotal = 162): Bk => ({
  id: '8a1b01c5-0000-4000-8000-000000000000',
  first_name: 'Ada',
  last_name: 'Lovelace',
  subtotal,
  booking_fee: 40,
  total_paid: subtotal + 40,
  driver_name: 'Devon Brown',
  booking_items: [{ hotel: 'Riu Negril', passengers: 2, price_per_person: 101, ...item }],
})
const roundTrip = booking({ trip_type: 'round_trip', arrival_at: '2026-11-21T15:00:00', departure_at: '2026-11-28T11:00:00' })
const departureOnly = booking({ trip_type: 'one_way', departure_at: '2026-11-22T09:00:00' }, 81)

/** merge_dispatch with p_only_if_absent, as the database does it: one claim per key. */
function fakeSvc() {
  const claims = new Set<string>()
  return {
    claims,
    rpc: vi.fn(async (_fn: string, args: { p_booking_id: string; p_patch: Record<string, string>; p_only_if_absent: string }) => {
      const k = `${args.p_booking_id}:${args.p_only_if_absent}`
      if (claims.has(k)) return { data: [] }
      claims.add(k)
      return { data: [{ dispatch: args.p_patch }] }
    }),
  }
}

beforeEach(() => {
  sent.length = 0
  process.env.DRIVER_NOTIFY_EMAIL = 'driver@example.com'
})

describe('the payment email', () => {
  test('a round trip half: the console figures, the right leg, the subject', async () => {
    const svc = fakeSvc()
    const m = moneyBlock(roundTrip, null)
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(true)
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_second', 'second')).toBe(true)
    expect(String(sent[0].subject)).toBe(`${money(m.driverPerLeg)} sent · first half · MAPL-8A1B01C5`)
    expect(String(sent[1].subject)).toBe(`${money(round2(m.driverTotal - m.driverPerLeg))} sent · second half · MAPL-8A1B01C5`)
    expect(String(sent[0].subject)).toMatch(/first half · MAPL-8A1B01C5$/)
    expect(String(sent[1].subject)).toMatch(/second half · MAPL-8A1B01C5$/)
    expect(sent.every((s) => s.to === 'driver@example.com')).toBe(true)
  })

  test('a one-way to the airport is a payment in full', async () => {
    const svc = fakeSvc()
    expect(await notifyDriverPaid(svc, departureOnly, 'paid_first', 'first')).toBe(true)
    expect(String(sent[0].subject)).toMatch(/payment in full · MAPL-8A1B01C5$/)
  })

  test('once only: the console tick and the job share the claim', async () => {
    const svc = fakeSvc()
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(true) // the job
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(false) // a tick afterwards
    expect(sent).toHaveLength(1)
  })

  test("the job's time limit and idempotency key reach the send; the console sends neither", async () => {
    const svc = fakeSvc()
    await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first', { timeoutMs: 2500, idempotencyKey: 'driver-paid/x/paid_first' })
    await notifyDriverPaid(svc, roundTrip, 'paid_second', 'second')
    expect(sent[0]).toMatchObject({ timeoutMs: 2500, idempotencyKey: 'driver-paid/x/paid_first' })
    expect(sent[1]).not.toHaveProperty('timeoutMs')
    expect(sent[1]).not.toHaveProperty('idempotencyKey')
  })

  test('no driver inbox, or nothing owed: no claim, no email', async () => {
    const svc = fakeSvc()
    delete process.env.DRIVER_NOTIFY_EMAIL
    expect(await notifyDriverPaid(svc, roundTrip, 'paid_first', 'first')).toBe(false)
    process.env.DRIVER_NOTIFY_EMAIL = 'driver@example.com'
    expect(await notifyDriverPaid(svc, booking({ trip_type: 'round_trip', arrival_at: '2026-11-21T15:00:00' }, 0), 'paid_first', 'first')).toBe(false)
    expect(svc.claims.size).toBe(0)
    expect(sent).toHaveLength(0)
  })
})

describe('the tour payment email', () => {
  const tourBooking = (subtotal = 300, items: Record<string, unknown>[] = [{ item_type: 'experience', title: 'Dunn\'s River Falls Climb', date: '2026-11-25', travelers: 2 }]): Bk => ({
    id: '3dba7aff-0000-4000-8000-000000000000',
    first_name: 'Ada',
    last_name: 'Lovelace',
    booking_type: 'tour',
    subtotal,
    total_paid: subtotal + 40, // the guest paid more than the operator is owed: the notice names what was sent
    pickup: 'Riu Montego Bay (Montego Bay)',
    booking_items: items,
  })

  test('the subtotal, the tour, its day and party, to the operator inbox with ops copied', async () => {
    const svc = fakeSvc()
    expect(await notifyTourPaid(svc, tourBooking(), 'Collin', { timeoutMs: 2500, idempotencyKey: 'tour-paid/x' })).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: 'driver@example.com', bcc: ['ops@example.com'], subject: '$300.00 sent · tour · MAPL-3DBA7AFF', timeoutMs: 2500, idempotencyKey: 'tour-paid/x' })
    const text = await render(sent[0].react as React.ReactElement, { plainText: true })
    for (const part of ['payment for the tour below', '$300.00 on the way, Collin.', 'MAPL-3DBA7AFF', '$300.00 USD', 'The whole tour booking', 'Ada Lovelace', "DUNN'S RIVER FALLS CLIMB", 'Wednesday, November 25, 2 guests', 'Riu Montego Bay (Montego Bay)', 'Respect, Collin.']) {
      expect(text.toUpperCase()).toContain(part.toUpperCase())
    }
    expect(text).not.toMatch(/\u2014/) // no em dashes in the copy
  })

  test('once only, under its own claim', async () => {
    const svc = fakeSvc()
    expect(await notifyTourPaid(svc, tourBooking(), 'Collin')).toBe(true)
    expect(await notifyTourPaid(svc, tourBooking(), 'Collin')).toBe(false)
    expect(sent).toHaveLength(1)
    expect(Array.from(svc.claims)).toEqual(['3dba7aff-0000-4000-8000-000000000000:paid_tour_notified'])
  })

  test('several tours on one booking are listed in day order', async () => {
    const svc = fakeSvc()
    await notifyTourPaid(svc, tourBooking(500, [
      { item_type: 'experience', title: 'Rick\'s Cafe', date: '2026-11-28', travelers: 4 },
      { item_type: 'experience', title: 'Bamboo Rafting', date: '2026-11-26', travelers: 1 },
    ]), 'Collin')
    const text = (await render(sent[0].react as React.ReactElement, { plainText: true })).toUpperCase()
    expect(text).toContain('ALL 2 TOURS ON THIS BOOKING')
    expect(text).toContain('PAYMENT FOR THE TOURS BELOW')
    expect(text).toContain('THURSDAY, NOVEMBER 26, 1 GUEST')
    expect(text).toContain('SATURDAY, NOVEMBER 28, 4 GUESTS')
    expect(text.indexOf('BAMBOO RAFTING')).toBeLessThan(text.indexOf("RICK'S CAFE"))
  })

  test('no inbox, nothing owed or no tour on it: no claim, no email', async () => {
    const svc = fakeSvc()
    delete process.env.DRIVER_NOTIFY_EMAIL
    expect(await notifyTourPaid(svc, tourBooking(), 'Collin')).toBe(false)
    process.env.DRIVER_NOTIFY_EMAIL = 'driver@example.com'
    expect(await notifyTourPaid(svc, tourBooking(0), 'Collin')).toBe(false)
    expect(await notifyTourPaid(svc, tourBooking(300, []), 'Collin')).toBe(false)
    expect(svc.claims.size).toBe(0)
    expect(sent).toHaveLength(0)
  })

  test('a tour day is the calendar day it names, in any zone', () => {
    expect(tourDayLabel('2026-11-25')).toBe('Wednesday, November 25')
    expect(tourDayLabel('2026-12-31')).toBe('Thursday, December 31')
    expect(tourDayLabel('')).toBe('day to be confirmed')
  })
})
