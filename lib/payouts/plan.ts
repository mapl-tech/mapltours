/**
 * Payouts by Wise: who is owed what, decided from the bookings alone.
 * Pure: no I/O, no clock of its own. The run (lib/payouts/run.ts) supplies
 * the bookings, the ledger and "now", and does the sending.
 *
 * The owner's rule (Nov 18 2026, replacing the monthly plan of Nov 15): pay
 * as today, BEFORE the ride or the tour; and (Nov 21 2026) "we want the
 * transfer to arrive either the day of or day before". Each part is sent
 * `transitBusinessDays` business days (Wise's time to the account, 2) before
 * the bank day it should arrive (lib/payouts/business-days arrivalDayFor):
 * the day before the trip, else the day of it, else the last bank day before.
 * A booking made after its send day is paid on the next run, and arrives as
 * soon as the bank allows (`landsDay`). Asked what to do for
 * a booking made close to the ride, while the guest may still cancel within
 * 48 hours for 80% back, he chose to pay before the ride as today: a payment
 * the guest's refund makes wrong is recovered by hand.
 *
 * The parts a booking owes (the same figures as the dispatch console and the
 * driver portal):
 *  - an airport ride: the driver is paid the subtotal in full (lib/dispatch
 *    moneyBlock). A round trip is two halves, `first` (the arrival leg) and
 *    `second` (the departure leg); a one-way is one `first` half for its only
 *    leg. Each half is due by its own leg's day. The payee is the driver
 *    named on the booking.
 *  - a tour booking: the operator is paid the booking's subtotal, which the
 *    tour checkout stores as exactly what MAPL owes the operator, priced from
 *    the rate card at booking time (lib/checkout-pricing priceTourCart). One
 *    `tour` part for the whole booking, due by its FIRST tour day. The payee
 *    is `tourPayee` (WISE_TOUR_PAYEE).
 *
 * A part is NOT paid when:
 *  - the booking is not `paid`, has been refunded, or has a refund requested
 *    or approved (a declined refund is paid: the guest kept the trip);
 *  - it has no payee, or no day;
 *  - its day is before `fromDay` (PAYOUT_FROM: nothing before the launch is
 *    ever paid, so a ride paid by hand on Remitly and never ticked in the
 *    console cannot be paid again), or no `fromDay` is set at all;
 *  - its send day has not come;
 *  - the dispatch map already shows it paid (`paid_first`, `paid_second`,
 *    `paid_tour`: by hand in the console, or by an earlier payout), or the
 *    payout ledger already holds it.
 *
 * One payout per Wise recipient per run: names that map to the same
 * recipient (a driver who works for the operator, the tour payee) share one
 * payment. A recipient is held, with the reason, when the payouts table says
 * one of its earlier payouts needs a look, when its total is over the
 * per-payee limit, or when the run's total is over the per-run limit. A name
 * with no Wise recipient configured is reported and never sent anything.
 *
 * Leg times are Jamaica wall-clock stored as UTC (`...T14:30:00+00:00`), so
 * a leg's day is its first ten characters, never a Date of the server's zone.
 */

import { firstLeg, moneyBlock, round2, bookingRef } from '@/lib/dispatch'
import { isYmd, jamaicaDay, landingDayFor, sendDayFor } from './business-days'

export type PayPart = 'first' | 'second' | 'tour'

/** Dispatch keys for each part, as the console and the driver portal read them. */
export const PART_STAMP: Record<PayPart, 'paid_first' | 'paid_second' | 'paid_tour'> = {
  first: 'paid_first',
  second: 'paid_second',
  tour: 'paid_tour',
}

export interface PayoutBookingItem {
  trip_type?: string | null
  arrival_at?: string | null
  departure_at?: string | null
  /** A tour line's day, 'YYYY-MM-DD'. */
  date?: string | null
  item_type?: string | null
  [k: string]: unknown
}

/** The booking columns the planner reads (lib/payouts/store.ts PAYOUT_BOOKING_SELECT). */
export interface PayoutBooking {
  id: string
  status: string
  booking_type: string
  subtotal: number | string | null
  driver_name: string | null
  dispatch: Record<string, unknown> | null
  refund_state?: string | null
  refunded_at?: string | null
  booking_items?: PayoutBookingItem[] | null
}

export interface PayoutLine {
  bookingId: string
  ref: string
  part: PayPart
  /** 'arrival', 'ride to the airport' or 'tour', for the email. */
  label: string
  /** The name the part is owed to: the booking's driver, or the tour payee. */
  name: string
  /** What this payment sends for the part: the part's amount less anything already sent for it (prepaidFor). */
  amountUsd: number
  /** The Jamaica day of the ride or the first tour, 'YYYY-MM-DD'. */
  serviceDay: string
  /** The first day a run sends it: `transitBusinessDays` business days before it should arrive. */
  sendDay: string
  /** Sent earlier for this part outside the job, already taken off amountUsd. */
  prepaidUsd?: number
  /** What that earlier money was, for the payment email. */
  prepaidNote?: string | null
}

/**
 * Money already sent for a ride half outside the job, recorded in the
 * booking's dispatch map as `paid_first_prepaid_usd` / `paid_second_prepaid_usd`
 * (a number of dollars and cents), with an optional `..._prepaid_note` saying
 * what it was.
 *
 * Owner, Nov 24 2026: "make sure the $1 is remove from his next payment", the
 * US$1 test sent to Collin's new Wise account that morning. The job pays the
 * half less it. A half is paid once (one live ledger item), so the money comes
 * off once. A value that is not a positive number of cents is `invalid` and
 * holds the payee: the job never guesses at money. Tours take no prepaid
 * amount (their email states the subtotal), so one recorded on a tour is
 * invalid too, never silently ignored.
 */
export interface Prepaid {
  usd: number
  note: string | null
  invalid: boolean
}

export function prepaidFor(dispatch: Record<string, unknown> | null | undefined, part: PayPart): Prepaid {
  const stamp = PART_STAMP[part]
  const raw = dispatch?.[`${stamp}_prepaid_usd`]
  const noteRaw = dispatch?.[`${stamp}_prepaid_note`]
  const note = typeof noteRaw === 'string' && noteRaw.trim() ? noteRaw.trim().slice(0, 200) : null
  if (raw === undefined || raw === null) return { usd: 0, note: null, invalid: false }
  const cents = typeof raw === 'number' ? raw * 100 : NaN
  const ok = part !== 'tour' && Number.isFinite(cents) && cents >= 1 && Math.abs(Math.round(cents) - cents) < 1e-6
  return ok ? { usd: Math.round(cents) / 100, note, invalid: false } : { usd: 0, note, invalid: true }
}

export type PayeeStatus = 'ready' | 'held' | 'no_recipient'

export interface PayeePlan {
  /** The names paid, as the bookings write them, joined: "Collin", or "Collin and Devon Brown". */
  payee: string
  recipientId: number | null
  lines: PayoutLine[]
  totalUsd: number
  status: PayeeStatus
  reasons: string[]
}

export type SkipReason =
  | 'not_paid'
  | 'refund_requested'
  | 'refunded'
  | 'no_payee'
  | 'no_date'
  | 'before_start'
  | 'not_due'
  | 'paid_by_hand'
  | 'in_ledger'
  | 'zero_amount'

export interface PayoutLimits {
  /** A recipient owed more than this in one run is held for the owner. */
  maxPayeeUsd: number
  /** A run whose ready total is over this holds everybody. */
  maxRunUsd: number
  /** Wise's fee on one payout above this stops that payout. */
  maxFeeUsd: number
  /** The business days Wise takes to put a payment in the account (2 to Collin's US account, Nov 2026). */
  transitBusinessDays: number
}

export const DEFAULT_LIMITS: PayoutLimits = {
  maxPayeeUsd: 3000,
  maxRunUsd: 6000,
  maxFeeUsd: 40,
  transitBusinessDays: 2,
}

export interface PlanInput {
  bookings: PayoutBooking[]
  /** `${bookingId}:${part}` for every part an active ledger item already holds. */
  ledger: ReadonlySet<string>
  /** Name (as stored on bookings, compared trimmed and case-insensitively) to Wise recipient id. */
  recipients: Readonly<Record<string, number>>
  /** Who tours are paid to, a name in `recipients`; null when not set. */
  tourPayee: string | null
  /** Recipient id to the reason its payouts are held (an open problem in the ledger). */
  holds: ReadonlyMap<number, string>
  /** No part whose day is before this is ever paid; null pays nothing. */
  fromDay: string | null
  nowMs: number
  limits: PayoutLimits
}

export interface PayoutPlan {
  /** The Jamaica day of this run. */
  payDay: string
  /** The day a payment funded in this run is in the account, by the banking calendar. */
  landsDay: string
  fromDay: string | null
  payees: PayeePlan[]
  skipped: Record<SkipReason, number>
  /** Booking refs held back because a refund was requested or approved, for the owner's summary. */
  refundHeld: string[]
}

/** Who a tour is paid to when WISE_TOUR_PAYEE is not set: reported, never paid. */
export const NO_TOUR_PAYEE = 'Tours (WISE_TOUR_PAYEE is not set)'

interface Part {
  part: PayPart
  label: string
  amountUsd: number
  /** null when the booking gives no usable day. */
  serviceDay: string | null
}

const dayOf = (wallClock: string | null | undefined): string | null => {
  const d = (wallClock ?? '').slice(0, 10)
  return isYmd(d) ? d : null
}

/** The parts an airport ride owes, with amounts and days. */
export function ridePartsOf(b: PayoutBooking): Part[] {
  const leg = firstLeg(b)
  if (!leg) return []
  const m = moneyBlock(b, null)
  if (leg.tripType === 'round_trip') {
    return [
      { part: 'first', label: 'arrival', amountUsd: m.driverPerLeg, serviceDay: dayOf(leg.arrivalAt) },
      { part: 'second', label: 'ride to the airport', amountUsd: round2(m.driverTotal - m.driverPerLeg), serviceDay: dayOf(leg.departureAt) },
    ]
  }
  return [{
    part: 'first',
    label: leg.arrivalAt ? 'arrival' : 'ride to the airport',
    amountUsd: m.driverTotal,
    serviceDay: dayOf(leg.arrivalAt ?? leg.departureAt),
  }]
}

/** The one part a tour booking owes: its subtotal, by its first tour day. */
export function tourPartOf(b: PayoutBooking): Part {
  const days = (b.booking_items ?? []).map((i) => i.date).filter(isYmd).sort()
  return { part: 'tour', label: 'tour', amountUsd: round2(Number(b.subtotal ?? 0) || 0), serviceDay: days[0] ?? null }
}

const key = (name: string) => name.trim().toLowerCase()

function emptySkips(): Record<SkipReason, number> {
  return { not_paid: 0, refund_requested: 0, refunded: 0, no_payee: 0, no_date: 0, before_start: 0, not_due: 0, paid_by_hand: 0, in_ledger: 0, zero_amount: 0 }
}

export function planPayouts(input: PlanInput): PayoutPlan {
  const { limits } = input
  const payDay = jamaicaDay(input.nowMs)
  const fromDay = input.fromDay && isYmd(input.fromDay) ? input.fromDay : null
  const skipped = emptySkips()
  const refundHeld: string[] = []
  const recipientByKey = new Map(Object.entries(input.recipients).map(([name, id]) => [key(name), id]))
  const tourPayee = input.tourPayee?.trim() || null
  const groups = new Map<string, { recipientId: number | null; names: string[]; lines: PayoutLine[]; problems: string[] }>()

  for (const b of input.bookings) {
    const isRide = b.booking_type === 'transfer'
    if (!isRide && b.booking_type !== 'tour') continue
    const ref = bookingRef(b.id)
    if (b.status !== 'paid') { skipped.not_paid++; continue }
    const refund = b.refund_state ?? 'none'
    if (b.refunded_at) { skipped.refunded++; continue }
    if (refund === 'requested' || refund === 'approved') {
      skipped.refund_requested++
      refundHeld.push(ref)
      continue
    }
    const name = isRide ? (b.driver_name ?? '').trim() : (tourPayee ?? NO_TOUR_PAYEE)
    if (!name) { skipped.no_payee++; continue }
    const dispatch = (b.dispatch ?? {}) as Record<string, unknown>

    for (const p of isRide ? ridePartsOf(b) : [tourPartOf(b)]) {
      if (!p.serviceDay) { skipped.no_date++; continue }
      if (!fromDay || p.serviceDay < fromDay) { skipped.before_start++; continue }
      const sendDay = sendDayFor(p.serviceDay, limits.transitBusinessDays)
      if (payDay < sendDay) { skipped.not_due++; continue }
      if (dispatch[PART_STAMP[p.part]]) { skipped.paid_by_hand++; continue }
      if (input.ledger.has(`${b.id}:${p.part}`)) { skipped.in_ledger++; continue }
      if (!(p.amountUsd > 0)) { skipped.zero_amount++; continue }
      // Anything already sent for this half comes off it; all of it sent means it is paid.
      const pre = prepaidFor(dispatch, p.part)
      if (!pre.invalid && pre.usd >= round2(p.amountUsd)) { skipped.paid_by_hand++; continue }
      const recipientId = name === NO_TOUR_PAYEE ? null : recipientByKey.get(key(name)) ?? null
      // Names on one recipient share a payout; a name with none is reported on its own.
      const gk = recipientId != null ? `r:${recipientId}` : `n:${key(name)}`
      const g = groups.get(gk) ?? { recipientId, names: [], lines: [], problems: [] }
      if (!g.names.some((n) => key(n) === key(name))) g.names.push(name)
      g.lines.push({
        bookingId: b.id, ref, part: p.part, label: p.label, name,
        amountUsd: round2(p.amountUsd - pre.usd), serviceDay: p.serviceDay, sendDay,
        ...(pre.usd > 0 ? { prepaidUsd: pre.usd, prepaidNote: pre.note } : {}),
      })
      if (pre.invalid) g.problems.push(`${ref} ${p.label}: the amount recorded as already sent for it (${PART_STAMP[p.part]}_prepaid_usd) is not a usable number of dollars and cents`)
      groups.set(gk, g)
    }
  }

  const payees: PayeePlan[] = Array.from(groups.values())
    .map((g): PayeePlan => {
      const lines = g.lines.sort((a, b) => a.serviceDay.localeCompare(b.serviceDay) || a.ref.localeCompare(b.ref) || a.part.localeCompare(b.part))
      const totalUsd = round2(lines.reduce((s, l) => s + l.amountUsd, 0))
      const payee = g.names.slice().sort((a, b) => a.localeCompare(b)).join(' and ')
      const reasons: string[] = []
      let status: PayeeStatus = 'ready'
      if (g.recipientId == null) {
        status = 'no_recipient'
        reasons.push(payee === NO_TOUR_PAYEE ? 'WISE_TOUR_PAYEE is not set, so tours have nobody to be paid to' : 'no Wise recipient is set for this name (WISE_PAYOUT_RECIPIENTS)')
      } else if (input.holds.has(g.recipientId)) {
        status = 'held'
        reasons.push(input.holds.get(g.recipientId) as string)
      } else if (g.problems.length) {
        status = 'held'
        reasons.push(...g.problems)
      } else if (totalUsd > limits.maxPayeeUsd) {
        status = 'held'
        reasons.push(`US$${totalUsd.toFixed(2)} is over the US$${limits.maxPayeeUsd.toFixed(2)} limit for one payee`)
      }
      return { payee, recipientId: g.recipientId, lines, totalUsd, status, reasons }
    })
    .sort((a, b) => a.payee.localeCompare(b.payee))

  const readyTotal = round2(payees.filter((d) => d.status === 'ready').reduce((s, d) => s + d.totalUsd, 0))
  if (readyTotal > limits.maxRunUsd) {
    for (const d of payees) {
      if (d.status !== 'ready') continue
      d.status = 'held'
      d.reasons.push(`this run's total US$${readyTotal.toFixed(2)} is over the US$${limits.maxRunUsd.toFixed(2)} limit for one run`)
    }
  }

  return { payDay, landsDay: landingDayFor(payDay, limits.transitBusinessDays), fromDay, payees, skipped, refundHeld }
}

/** "Thu, Nov 19" for '2026-11-19'. */
export function dayLabel(ymd: string): string {
  if (!isYmd(ymd)) return ymd
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
}
