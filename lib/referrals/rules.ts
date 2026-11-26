/**
 * The referral program's rules (Nov 26 2026), pure: no I/O and no clock of
 * its own, so every rule is tested on its own (tests/unit/referral-rules.spec.ts).
 *
 * The owner, Nov 26 2026: "I want a referal program built. The admin can add
 * an email account that initiates and invitation; when the user signs in with
 * their gmail, they go to their referral page; on the ferral page they can
 * create there coupon code and create different coupons, max 7; the coupons
 * should give 5% off and give the referrer a certain amount", then in the
 * question dialog "3% of what guest pays", "mapltours.com/referrals", and
 * "make sure everything is secure as well".
 *
 * What a referral code is: a row in `coupons` (migration 031/032) with a
 * `referrer_id` (migration 045). So checkout prices it exactly as any other
 * code (lib/coupons applyCoupon, capped at MAPL's margin), the webhook counts
 * it exactly as any other code (lib/coupon-redemption), and neither checkout
 * route nor the Stripe webhook changes. The one addition is a trigger on the
 * redemption ledger (045) that records the referrer's commission rate when
 * the booking is paid, so a later change of rate never reaches a booking
 * already paid.
 *
 * What the referrer earns: COMMISSION_PERCENT of what the guest paid (the
 * booking's total_paid, already net of the 5%), never more than MAPL keeps on
 * that booking after the card fee, so a booking with a code can never leave
 * MAPL below $0. It is earned once the trip has happened and the 48-hour
 * cancellation window has closed, never on a booking that is refunded or
 * waiting on a refund, and paid every Monday by Wise into the referrer's own
 * Wise US-dollar account (free, in seconds).
 */

import { CARD_FIXED, CARD_RATE } from '@/lib/airport-transfers'
import { CANCELLATION_WINDOW_HOURS } from '@/lib/refund-pricing'
import { addDays, isYmd, jamaicaDay, weekday } from '@/lib/payouts/business-days'

/* ── The program ─────────────────────────────────────────────────────── */

/** What a guest saves with any referral code, in percent. */
export const REFERRAL_DISCOUNT_PERCENT = 5
/** What a new referrer earns, in percent of what the guest paid (owner, Nov 26 2026: "3% of what guest pays"). */
export const DEFAULT_COMMISSION_PERCENT = 3
/** The most the admin may set for one referrer. The cap at MAPL's margin applies whatever is set. */
export const MAX_COMMISSION_PERCENT = 10
/** Codes a referrer may hold at once (owner: "max 7"). Paused codes count; retired ones do not. */
export const MAX_LIVE_CODES = 7
/** The day payouts go: Monday (0 = Sunday ... 6 = Saturday, as lib/payouts/business-days weekday). */
export const PAYOUT_WEEKDAY = 1
/** The run's time in Jamaica on a payout day (netlify/functions/referral-payouts-cron.mjs, 14:45 UTC). */
export const PAYOUT_RUN_JAMAICA = { hour: 9, minute: 45 }
/** Payouts start at this amount; less waits for the next payout. */
export const MIN_PAYOUT_USD = 1
/** After a payout account is added or changed, payouts to it wait this long (a stolen session cannot cash out at once). */
export const PAYOUT_ACCOUNT_HOLD_HOURS = 72
/** Changing where the money goes needs a sign-in no older than this. */
export const REAUTH_MAX_AGE_MINUTES = 60
/** The terms a referrer accepts at setup. A new version asks them again. */
export const TERMS_VERSION = '2026-11-26'

/* ── Codes ───────────────────────────────────────────────────────────── */

export const CODE_MIN_LENGTH = 4
export const CODE_MAX_LENGTH = 16
export const LABEL_MAX_LENGTH = 40

/**
 * The code as checkout reads it: lib/coupons normalizeCouponCode keeps only
 * letters and digits, upper case. A referrer typing "Villa-Mimosa 5" gets
 * VILLAMIMOSA5, and so does a guest typing it.
 */
export function normalizeReferralCode(input: string | null | undefined): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type CodeProblem = 'empty' | 'too_short' | 'too_long' | 'letters' | 'reserved' | 'misleading_word' | 'misleading_number'

/**
 * Words a code may not hold anywhere in it, because a guest would read a
 * promise into them that a 5% code does not keep, or a role it does not have.
 */
const MISLEADING_WORDS = ['FREE', 'REFUND', 'GIFTCARD', 'ADMIN', 'STAFF', 'TEST']

/**
 * Whether a code may be created, and if not, why. The database decides
 * whether it is free (the unique index on coupons.code); this decides
 * whether it is allowed.
 *  - 4 to 16 letters and digits, at least two of them letters;
 *  - never starting with MAPL: every issued coupon and every gift card is
 *    MAPL-XXXX-XXXX, and checkout tries a code before a gift card;
 *  - no word that promises what the code does not (FREE, REFUND, ...);
 *  - no number from 6 to 100 at the end: VILLA10 reads as 10% off and the
 *    code gives 5%. A 5, a year (2026) or an area code (876) is fine.
 */
export function codeProblem(code: string): CodeProblem | null {
  if (!code) return 'empty'
  if (code.length < CODE_MIN_LENGTH) return 'too_short'
  if (code.length > CODE_MAX_LENGTH) return 'too_long'
  if (!/^[A-Z0-9]+$/.test(code) || (code.match(/[A-Z]/g) ?? []).length < 2) return 'letters'
  if (code.startsWith('MAPL')) return 'reserved'
  if (MISLEADING_WORDS.some((w) => code.includes(w))) return 'misleading_word'
  const tail = /(\d+)$/.exec(code)?.[1]
  if (tail && !tail.startsWith('0')) {
    const n = Number(tail)
    if (n >= 6 && n <= 100) return 'misleading_number'
  }
  return null
}

/** What the referrer reads beside the field. */
export function codeProblemMessage(p: CodeProblem): string {
  switch (p) {
    case 'empty': return 'Type the code you want your guests to use.'
    case 'too_short': return `Use at least ${CODE_MIN_LENGTH} letters or numbers.`
    case 'too_long': return `Use ${CODE_MAX_LENGTH} letters or numbers at most.`
    case 'letters': return 'Use letters and numbers only, with at least two letters.'
    case 'reserved': return 'Codes starting with MAPL are kept for MAPL Tours Jamaica. Try another.'
    case 'misleading_word': return 'That word would promise guests something the code does not give. Try another.'
    case 'misleading_number': return `A number at the end reads as a discount, and your code gives ${REFERRAL_DISCOUNT_PERCENT}% off. End it with ${REFERRAL_DISCOUNT_PERCENT} or leave the number off.`
  }
}

/** The label a referrer gives a code ("Welcome book"), tidied: one line, at most LABEL_MAX_LENGTH. */
export function cleanLabel(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, LABEL_MAX_LENGTH) : null
}

/**
 * Codes to offer a new referrer, from their business or their name:
 * "Charela Inn" gives CHARELA5, CHARELAINN and CHARELA. Every suggestion
 * passes codeProblem; the page still checks that it is free.
 */
export function suggestCodes(name: string | null | undefined, business: string | null | undefined): string[] {
  const words = (s: string | null | undefined) =>
    String(s ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((w) => w && !['THE', 'AND', 'OF', 'AT', 'LTD', 'LIMITED', 'LLC', 'INC', 'CO', 'COMPANY'].includes(w))
  const out: string[] = []
  const add = (c: string) => {
    const code = c.slice(0, CODE_MAX_LENGTH)
    if (!codeProblem(code) && !out.includes(code)) out.push(code)
  }
  for (const ws of [words(business), words(name)]) {
    if (!ws.length) continue
    add(`${ws[0]}${REFERRAL_DISCOUNT_PERCENT}`)
    if (ws.length > 1) add(ws.slice(0, 2).join(''))
    add(ws[0])
  }
  return out.slice(0, 3)
}

/* ── Money ───────────────────────────────────────────────────────────── */

/** Dollars to cents; a missing figure is NaN, never 0 (Number(null) is 0, which would read an unknown supplier share as nothing owed). */
const cents = (usd: number | string | null | undefined): number => {
  if (usd === null || usd === undefined || (typeof usd === 'string' && usd.trim() === '')) return NaN
  const n = Number(usd)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

export interface CommissionInput {
  /** bookings.total_paid: what the guest paid, already net of the code. */
  totalPaid: number | string | null | undefined
  /** bookings.subtotal: what the driver or the operator is paid. */
  subtotal: number | string | null | undefined
  /** The rate recorded when the booking was paid. */
  percent: number | string | null | undefined
}

export interface Commission {
  cents: number
  /** true when MAPL's margin, not the percent, decided it. */
  capped: boolean
  /** false when the booking's figures cannot be read: nothing is owed on a guess. */
  valid: boolean
}

/**
 * The commission on one booking, in cents: `percent` of what the guest paid,
 * never more than MAPL keeps on it (what the guest paid less the supplier's
 * share and the card fee, the price rules' own CARD_RATE and CARD_FIXED).
 * A figure that cannot be read owes nothing and says so.
 */
export function commissionFor(input: CommissionInput): Commission {
  const paid = cents(input.totalPaid)
  const supplier = cents(input.subtotal)
  const pct = Number(input.percent)
  if (!(paid > 0) || !(supplier >= 0) || !Number.isFinite(pct) || pct < 0 || pct > MAX_COMMISSION_PERCENT) {
    return { cents: 0, capped: false, valid: false }
  }
  const raw = Math.round((paid * pct) / 100)
  const cardFee = Math.round(paid * CARD_RATE) + Math.round(CARD_FIXED * 100)
  const mapl = paid - supplier - cardFee
  const value = Math.max(0, Math.min(raw, mapl))
  return { cents: value, capped: value < raw, valid: true }
}

/** US$1,234.50: always the currency, cents only when there are some (every figure a referrer reads). */
export function usd(centsValue: number): string {
  const c = Math.round(Number(centsValue) || 0)
  const abs = Math.abs(c)
  const body = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: abs % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })
  return `${c < 0 ? '−' : ''}US$${body}`
}

/** A percent as people read it: 3%, 2.5%. */
export function percentText(p: number | string): string {
  const n = Math.round(Number(p) * 100) / 100
  return `${Number.isFinite(n) ? n : 0}%`
}

/* ── When a commission is paid ───────────────────────────────────────── */

const HOUR_MS = 3_600_000
const JAMAICA_OFFSET_MS = 5 * HOUR_MS

/** The instant a Jamaica wall-clock time on a day happens. */
function jamaicaInstant(ymd: string, hour = 0, minute = 0): number {
  return Date.parse(`${ymd}T00:00:00Z`) + JAMAICA_OFFSET_MS + hour * HOUR_MS + minute * 60_000
}

/** The instant of the payout run on a given day. */
export function payoutRunInstant(ymd: string): number {
  return jamaicaInstant(ymd, PAYOUT_RUN_JAMAICA.hour, PAYOUT_RUN_JAMAICA.minute)
}

/** The first payout day (Monday) on or after `ymd`. */
export function payoutDayOnOrAfter(ymd: string): string {
  const shift = (PAYOUT_WEEKDAY - weekday(ymd) + 7) % 7
  return addDays(ymd, shift)
}

/**
 * When a commission becomes payable: the start of the Jamaica day after the
 * last day of the trip, or the end of the 48-hour cancellation window,
 * whichever is later. Null when the booking's days or its time cannot be read.
 */
export function payableAt(lastServiceDay: string | null | undefined, createdAt: string | null | undefined): number | null {
  if (!isYmd(lastServiceDay)) return null
  const booked = Date.parse(String(createdAt ?? ''))
  if (!Number.isFinite(booked)) return null
  return Math.max(jamaicaInstant(addDays(lastServiceDay, 1)), booked + CANCELLATION_WINDOW_HOURS * HOUR_MS)
}

/** The payout day whose run is the first at or after `atMs`. */
export function payoutDayFor(atMs: number): string {
  let day = payoutDayOnOrAfter(jamaicaDay(atMs))
  if (payoutRunInstant(day) < atMs) day = addDays(day, 7)
  return day
}

/** The payout day a run at `nowMs` belongs to: today when the run is on a payout day, else the next one. */
export function nextPayoutDay(nowMs: number): string {
  return payoutDayFor(nowMs)
}

/* ── An earning, as the referrer and the payout run see it ───────────── */

export type EarningStatus =
  | 'void'
  | 'cancelled'
  | 'held'
  | 'paid'
  | 'sending'
  | 'upcoming'
  | 'ready'
  /** The booking's trip days or booking time cannot be read: a person looks, nothing is paid on a guess. */
  | 'check'

export interface EarningFacts {
  /** bookings.status */
  bookingStatus: string | null | undefined
  refundState: string | null | undefined
  refundedAt: string | null | undefined
  createdAt: string | null | undefined
  lastServiceDay: string | null | undefined
  /** The earning was marked not counted by an admin. */
  voided: boolean
  /** The earning sits in a payout that funded or was sent. */
  paid: boolean
  /** The earning sits in a payout still in flight or waiting on a person. */
  sending: boolean
}

/**
 * Where an earning stands. Order matters: an admin's "not counted" beats
 * everything; money already sent, or on its way, is reported as such even if
 * a refund came later (the admin page flags that one for a person); then a
 * refund, a refund asked for, and the trip and the cancellation window.
 */
export function earningStatus(f: EarningFacts, nowMs: number): { status: EarningStatus; payDay: string | null } {
  if (f.voided) return { status: 'void', payDay: null }
  if (f.paid) return { status: 'paid', payDay: null }
  if (f.sending) return { status: 'sending', payDay: null }
  if (f.refundedAt || f.bookingStatus !== 'paid') return { status: 'cancelled', payDay: null }
  if (f.refundState === 'requested' || f.refundState === 'approved') return { status: 'held', payDay: null }
  const at = payableAt(f.lastServiceDay, f.createdAt)
  if (at == null) return { status: 'check', payDay: null }
  const payDay = payoutDayFor(at)
  if (nowMs < at) return { status: 'upcoming', payDay }
  return { status: 'ready', payDay }
}

/** The day a run at `nowMs` may pay an earning that became payable at `atMs`: on its payout day or any day after (a missed run catches up). */
export function dueOnRun(atMs: number, nowMs: number): boolean {
  if (nowMs < atMs) return false
  return jamaicaDay(nowMs) >= payoutDayFor(atMs)
}

/* ── Dates for people ────────────────────────────────────────────────── */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Monday, December 7", from a Jamaica calendar day; the year only when it is not this one. */
export function dayText(ymd: string, opts: { weekday?: boolean; todayYmd?: string } = {}): string {
  if (!isYmd(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  const year = opts.todayYmd && opts.todayYmd.slice(0, 4) !== String(y) ? `, ${y}` : ''
  return `${opts.weekday ? `${DAYS[weekday(ymd)]}, ` : ''}${MONTHS[m - 1]} ${d}${year}`
}

/** "Dec 7", short, for tables. */
export function shortDay(ymd: string, todayYmd?: string): string {
  if (!isYmd(ymd)) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${d}${todayYmd && todayYmd.slice(0, 4) !== String(y) ? `, ${y}` : ''}`
}
