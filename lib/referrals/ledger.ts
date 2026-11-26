/**
 * The referral ledger, composed: from the rows the database holds (referrers,
 * their codes, the earnings the redemption trigger wrote, the bookings behind
 * them, the payouts and their items) to what the referral page and the admin
 * page show. Pure: lib/referrals/server reads the rows, this decides, and
 * tests/unit/referral-ledger.spec.ts holds it to every case.
 *
 * One rule for both pages: an earning's amount is the payout item's when it
 * has been paid (frozen then), otherwise lib/referrals/rules commissionFor on
 * the booking as it stands; its status is rules.earningStatus. So the
 * referrer, the admin, the payout run and the payout email can never disagree
 * about a figure.
 *
 * Privacy: the referrer's view carries no guest name, email, phone, hotel,
 * flight or booking reference, only what the trip was, its days, what the
 * guest paid and the commission. The admin's view adds the booking reference
 * so a person can open the booking.
 */

import { lastServiceDay } from '@/lib/review-request'
import type { ReferrerRow, ReferrerStatus } from './access'
import {
  commissionFor, earningStatus, nextPayoutDay, payoutRunInstant, shortDay, suggestCodes,
  MAX_LIVE_CODES, MIN_PAYOUT_USD, DEFAULT_COMMISSION_PERCENT, REFERRAL_DISCOUNT_PERCENT,
  type EarningStatus,
} from './rules'
import { jamaicaDay } from '@/lib/payouts/business-days'

/* ── Rows, as read ───────────────────────────────────────────────────── */

export interface CodeRow {
  id: string
  referrer_id: string
  code: string
  note: string | null
  status: 'active' | 'paused' | 'void'
  referral_hold: boolean
  uses: number
  created_at: string
  retired_at: string | null
}

export interface EarningRow {
  id: string
  booking_id: string
  referrer_id: string
  coupon_id: string
  code: string
  commission_percent: number | string
  recorded_late: boolean
  voided_at: string | null
  void_reason: string | null
  voided_by: string | null
  created_at: string
}

export interface LedgerBookingItem {
  item_type?: string | null
  title?: string | null
  trip_type?: string | null
  date?: string | null
  arrival_at?: string | null
  departure_at?: string | null
}

export interface LedgerBooking {
  id: string
  status: string
  booking_type: string | null
  total_paid: number | string | null
  subtotal: number | string | null
  coupon_discount: number | string | null
  refund_state: string | null
  refunded_at: string | null
  created_at: string
  booking_items: LedgerBookingItem[] | null
}

export type ReferralPayoutStatus = 'claimed' | 'created' | 'funded' | 'sent' | 'failed' | 'returned' | 'needs_review'

export interface ReferralPayoutRow {
  id: string
  referrer_id: string
  payee: string
  recipient_id: number | string
  account_last4: string
  amount_usd: number | string
  fee_usd: number | string | null
  status: ReferralPayoutStatus
  wise_transfer_id: number | string | null
  pay_day: string
  error: string | null
  created_at: string
  funded_at: string | null
  sent_at: string | null
  resolved_at: string | null
}

export interface PayoutItemRow {
  id: string
  payout_id: string
  earning_id: string
  booking_id: string
  amount_usd: number | string
  active: boolean
}

export interface EventRow {
  id: string
  referrer_id: string
  kind: string
  detail: Record<string, unknown> | null
  actor: string | null
  created_at: string
}

export interface LedgerRows {
  referrers: ReferrerRow[]
  codes: CodeRow[]
  earnings: EarningRow[]
  bookings: LedgerBooking[]
  payouts: ReferralPayoutRow[]
  items: PayoutItemRow[]
  events?: EventRow[]
}

/* ── Views ───────────────────────────────────────────────────────────── */

export type CodeState = 'active' | 'paused' | 'held' | 'retired'

export interface CodeView {
  id: string
  code: string
  label: string | null
  state: CodeState
  createdAt: string
  retiredAt: string | null
  /** Paid bookings made with it, cancelled ones and ones MAPL did not count left out. */
  bookings: number
  guestsSavedCents: number
  earnedCents: number
  paidCents: number
  waitingCents: number
}

export interface EarningView {
  id: string
  bookingId: string
  /** MAPL-XXXXXXXX: the admin's view only. */
  ref?: string
  code: string
  what: string
  days: string
  /** The trip's last day, for sorting and the email. */
  lastDay: string | null
  bookedAt: string
  guestPaidCents: number
  percent: number
  commissionCents: number
  capped: boolean
  status: EarningStatus
  payDay: string | null
  /** When it was paid (the payout's day), for a paid one. */
  paidDay: string | null
  /** Why it is not counted, for a void one. */
  note: string | null
  /** Admin only: paid, then the booking was refunded. */
  paidThenRefunded?: boolean
  recordedLate?: boolean
}

export type PayoutState = 'sent' | 'on_its_way' | 'needs_attention' | 'returned' | 'failed'

export interface PayoutView {
  id: string
  day: string
  amountCents: number
  trips: number
  last4: string
  state: PayoutState
  /** Admin only. */
  transferId?: number | null
  error?: string | null
  resolved?: boolean
  feeCents?: number | null
}

export type NextPayoutBlock = 'paused' | 'no_account' | 'account_hold' | 'below_minimum' | null

export interface ReferrerView {
  me: {
    id: string
    name: string
    business: string | null
    email: string
    status: ReferrerStatus
    percent: number
    discount: number
  }
  account: null | { last4: string; holder: string; legalType: string; addedAt: string; holdUntil: string | null; onHold: boolean }
  codes: CodeView[]
  liveCodes: number
  maxCodes: number
  earnings: EarningView[]
  payouts: PayoutView[]
  totals: { earnedCents: number; paidCents: number; waitingCents: number; bookings: number }
  next: { day: string; amountCents: number; block: NextPayoutBlock; holdUntilDay: string | null }
  /** One line for a returning visit: the latest thing that happened. */
  latest: string | null
  suggestions: string[]
  today: string
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const toCents = (v: number | string | null | undefined): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const bookingRef = (id: string): string => 'MAPL-' + id.slice(0, 8).toUpperCase()

function firstServiceDay(b: LedgerBooking): string | null {
  const days: string[] = []
  for (const i of b.booking_items ?? []) {
    for (const s of [i.arrival_at, i.departure_at, i.date]) {
      if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)) days.push(s.slice(0, 10))
    }
  }
  return days.length ? days.sort()[0] : null
}

/** "Airport ride, round trip" or the tour's name, never the hotel or the guest. */
export function tripLabel(b: LedgerBooking | null | undefined): string {
  if (!b) return 'A booking that no longer exists'
  const items = b.booking_items ?? []
  if (b.booking_type === 'transfer') {
    const t = items.find((i) => i.trip_type)?.trip_type
    return t === 'round_trip' ? 'Airport ride, round trip' : 'Airport ride, one way'
  }
  const titles = items.map((i) => (i.title ?? '').trim()).filter(Boolean)
  if (!titles.length) return 'Tour'
  return titles.length === 1 ? titles[0] : `${titles[0]} and ${titles.length - 1} more`
}

function daysText(b: LedgerBooking | null | undefined, today: string): string {
  if (!b) return ''
  const first = firstServiceDay(b)
  const last = lastServiceDay({ id: b.id, status: b.status, booking_items: b.booking_items ?? [] } as never)
  if (!first || !last) return 'Day to be confirmed'
  return first === last ? shortDay(first, today) : `${shortDay(first, today)} to ${shortDay(last, today)}`
}

function codeState(c: CodeRow): CodeState {
  if (c.status === 'void') return 'retired'
  if (c.referral_hold) return 'held'
  return c.status === 'active' ? 'active' : 'paused'
}

function payoutState(p: ReferralPayoutRow): PayoutState {
  switch (p.status) {
    case 'sent': return 'sent'
    case 'funded': return 'sent'
    case 'claimed':
    case 'created': return 'on_its_way'
    case 'needs_review': return 'needs_attention'
    case 'returned': return 'returned'
    case 'failed': return 'failed'
  }
}

const COUNTED: EarningStatus[] = ['paid', 'sending', 'ready', 'upcoming', 'held', 'check']
const WAITING: EarningStatus[] = ['sending', 'ready', 'upcoming', 'held', 'check']

/* ── The composition ─────────────────────────────────────────────────── */

export interface Composed {
  earnings: EarningView[]
  byReferrer: Map<string, EarningView[]>
}

/** Every earning, with its status and amount, as both pages and the payout run see it. */
export function composeEarnings(rows: LedgerRows, nowMs: number, opts: { admin?: boolean } = {}): Composed {
  const today = jamaicaDay(nowMs)
  const bookings = new Map(rows.bookings.map((b) => [b.id, b]))
  const payouts = new Map(rows.payouts.map((p) => [p.id, p]))
  const itemsByEarning = new Map<string, PayoutItemRow[]>()
  for (const it of rows.items) itemsByEarning.set(it.earning_id, [...(itemsByEarning.get(it.earning_id) ?? []), it])

  const out: EarningView[] = []
  for (const e of rows.earnings) {
    const b = bookings.get(e.booking_id) ?? null
    const items = itemsByEarning.get(e.id) ?? []
    const live = items.find((i) => i.active) ?? null
    const p = live ? payouts.get(live.payout_id) ?? null : null
    const paid = !!p && (p.status === 'funded' || p.status === 'sent')
    const sending = !!p && (p.status === 'claimed' || p.status === 'created' || p.status === 'needs_review')
    const last = b ? lastServiceDay({ id: b.id, status: b.status, booking_items: b.booking_items ?? [] } as never) : null
    const st = b
      ? earningStatus({
          bookingStatus: b.status, refundState: b.refund_state, refundedAt: b.refunded_at, createdAt: b.created_at,
          lastServiceDay: last, voided: !!e.voided_at, paid, sending,
        }, nowMs)
      : { status: (e.voided_at ? 'void' : paid ? 'paid' : sending ? 'sending' : 'cancelled') as EarningStatus, payDay: null }
    const c = live ? { cents: toCents(live.amount_usd), capped: false, valid: true } : commissionFor({ totalPaid: b?.total_paid, subtotal: b?.subtotal, percent: e.commission_percent })
    const view: EarningView = {
      id: e.id,
      bookingId: e.booking_id,
      code: e.code,
      what: tripLabel(b),
      days: daysText(b, today),
      lastDay: last,
      bookedAt: b?.created_at ?? e.created_at,
      guestPaidCents: toCents(b?.total_paid),
      percent: Number(e.commission_percent),
      commissionCents: c.valid ? c.cents : 0,
      capped: c.capped,
      // A figure that cannot be read is a case for a person, never a payment.
      status: !c.valid && st.status !== 'void' && st.status !== 'cancelled' && st.status !== 'paid' && st.status !== 'sending' ? 'check' : st.status,
      payDay: st.payDay,
      paidDay: paid && p ? p.pay_day : null,
      note: e.voided_at ? e.void_reason : null,
    }
    if (opts.admin) {
      view.ref = bookingRef(e.booking_id)
      view.paidThenRefunded = paid && !!b && (b.status === 'refunded' || !!b.refunded_at)
      view.recordedLate = e.recorded_late
    }
    out.push(view)
  }
  out.sort((a, b) => b.bookedAt.localeCompare(a.bookedAt))
  const byReferrer = new Map<string, EarningView[]>()
  for (const v of out) {
    const r = rows.earnings.find((e) => e.id === v.id)!.referrer_id
    byReferrer.set(r, [...(byReferrer.get(r) ?? []), v])
  }
  return { earnings: out, byReferrer }
}

function codeViews(codes: CodeRow[], earnings: EarningView[], bookingsById: Map<string, LedgerBooking>): CodeView[] {
  return codes
    .slice()
    .sort((a, b) => {
      const ra = a.status === 'void' ? 1 : 0
      const rb = b.status === 'void' ? 1 : 0
      return ra - rb || a.created_at.localeCompare(b.created_at)
    })
    .map((c) => {
      const mine = earnings.filter((e) => e.code === c.code)
      const counted = mine.filter((e) => COUNTED.includes(e.status))
      return {
        id: c.id,
        code: c.code,
        label: c.note,
        state: codeState(c),
        createdAt: c.created_at,
        retiredAt: c.retired_at,
        bookings: counted.length,
        guestsSavedCents: counted.reduce((s, e) => s + toCents(bookingsById.get(e.bookingId)?.coupon_discount), 0),
        earnedCents: counted.reduce((s, e) => s + e.commissionCents, 0),
        paidCents: mine.filter((e) => e.status === 'paid').reduce((s, e) => s + e.commissionCents, 0),
        waitingCents: mine.filter((e) => WAITING.includes(e.status)).reduce((s, e) => s + e.commissionCents, 0),
      }
    })
}

/** The referral page: one referrer's codes, earnings, payouts and next payout. */
export function composeReferrerView(rows: LedgerRows, referrer: ReferrerRow, nowMs: number): ReferrerView {
  const today = jamaicaDay(nowMs)
  const scoped: LedgerRows = {
    ...rows,
    earnings: rows.earnings.filter((e) => e.referrer_id === referrer.id),
    codes: rows.codes.filter((c) => c.referrer_id === referrer.id),
    payouts: rows.payouts.filter((p) => p.referrer_id === referrer.id),
  }
  const { earnings } = composeEarnings(scoped, nowMs)
  const bookingsById = new Map(rows.bookings.map((b) => [b.id, b]))
  const codes = codeViews(scoped.codes, earnings, bookingsById)
  const counted = earnings.filter((e) => COUNTED.includes(e.status))

  const itemsByPayout = new Map<string, number>()
  for (const it of rows.items) itemsByPayout.set(it.payout_id, (itemsByPayout.get(it.payout_id) ?? 0) + 1)
  const payouts: PayoutView[] = scoped.payouts
    // A payout that never sent money (failed) is not the referrer's business: its trips are simply owed again.
    .filter((p) => p.status !== 'failed')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((p) => ({ id: p.id, day: p.pay_day, amountCents: toCents(p.amount_usd), trips: itemsByPayout.get(p.id) ?? 0, last4: p.account_last4, state: payoutState(p) }))

  const holdUntilMs = referrer.payout_hold_until ? Date.parse(referrer.payout_hold_until) : NaN
  const account = referrer.wise_recipient_id && referrer.payout_last4 && referrer.payout_holder
    ? {
        last4: referrer.payout_last4,
        holder: referrer.payout_holder,
        legalType: referrer.payout_legal_type ?? 'PRIVATE',
        addedAt: referrer.payout_added_at ?? referrer.updated_at,
        holdUntil: Number.isFinite(holdUntilMs) && holdUntilMs > nowMs ? referrer.payout_hold_until : null,
        onHold: Number.isFinite(holdUntilMs) && holdUntilMs > nowMs,
      }
    : null

  const day = nextPayoutDay(nowMs)
  const due = earnings.filter((e) => (e.status === 'ready' || e.status === 'upcoming') && !!e.payDay && e.payDay <= day)
  const amountCents = due.reduce((s, e) => s + e.commissionCents, 0)
  let block: NextPayoutBlock = null
  let holdUntilDay: string | null = null
  if (referrer.status === 'paused') block = 'paused'
  else if (!account) block = 'no_account'
  else if (account.onHold && Date.parse(account.holdUntil!) > payoutRunInstant(day)) {
    block = 'account_hold'
    holdUntilDay = jamaicaDay(Date.parse(account.holdUntil!))
  } else if (amountCents > 0 && amountCents < MIN_PAYOUT_USD * 100) block = 'below_minimum'

  return {
    me: {
      id: referrer.id,
      name: referrer.name,
      business: referrer.business,
      email: referrer.email,
      status: referrer.status,
      percent: Number(referrer.commission_percent ?? DEFAULT_COMMISSION_PERCENT),
      discount: REFERRAL_DISCOUNT_PERCENT,
    },
    account,
    codes,
    liveCodes: codes.filter((c) => c.state !== 'retired').length,
    maxCodes: MAX_LIVE_CODES,
    earnings: earnings.slice(0, 200),
    payouts: payouts.slice(0, 100),
    totals: {
      earnedCents: counted.reduce((s, e) => s + e.commissionCents, 0),
      paidCents: earnings.filter((e) => e.status === 'paid').reduce((s, e) => s + e.commissionCents, 0),
      waitingCents: earnings.filter((e) => WAITING.includes(e.status)).reduce((s, e) => s + e.commissionCents, 0),
      bookings: counted.length,
    },
    next: { day, amountCents, block, holdUntilDay },
    latest: latestLine(earnings, payouts, today),
    suggestions: suggestCodes(referrer.name, referrer.business),
    today,
  }
}

/** The status line at the top of a returning visit: the newest booking or payout, in one sentence. */
function latestLine(earnings: EarningView[], payouts: PayoutView[], today: string): string | null {
  const e = earnings[0]
  const p = payouts.find((x) => x.state === 'sent')
  const eAt = e ? e.bookedAt.slice(0, 10) : ''
  const pAt = p ? p.day : ''
  if (!e && !p) return null
  if (p && pAt >= eAt) return `Latest: we sent you ${usdText(p.amountCents)} on ${shortDay(p.day, today)}.`
  return `Latest: ${e!.what.charAt(0).toLowerCase() + e!.what.slice(1)} booked with ${e!.code} on ${shortDay(jamaicaDay(Date.parse(e!.bookedAt)), today)}.`
}

const usdText = (c: number) => {
  const abs = Math.abs(c)
  return `US$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: abs % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`
}

/* ── The admin page ──────────────────────────────────────────────────── */

export interface AdminReferrerView {
  id: string
  name: string
  business: string | null
  email: string
  status: ReferrerStatus
  percent: number
  invitedAt: string
  inviteSentAt: string | null
  inviteSends: number
  acceptedAt: string | null
  note: string | null
  account: ReferrerView['account']
  codes: CodeView[]
  earnings: EarningView[]
  payouts: PayoutView[]
  totals: { bookings: number; guestSpendCents: number; earnedCents: number; paidCents: number; owedCents: number }
  next: ReferrerView['next']
  attention: string[]
  events: { kind: string; detail: Record<string, unknown> | null; actor: string | null; at: string }[]
}

export function composeAdminView(rows: LedgerRows, nowMs: number): { referrers: AdminReferrerView[]; totals: { active: number; invited: number; paused: number; liveCodes: number; bookings: number; earnedCents: number; paidCents: number; owedCents: number } } {
  const { byReferrer } = composeEarnings(rows, nowMs, { admin: true })
  const bookingsById = new Map(rows.bookings.map((b) => [b.id, b]))
  const itemsByPayout = new Map<string, number>()
  for (const it of rows.items) itemsByPayout.set(it.payout_id, (itemsByPayout.get(it.payout_id) ?? 0) + 1)

  const views = rows.referrers.map((r): AdminReferrerView => {
    const earnings = byReferrer.get(r.id) ?? []
    const page = composeReferrerView(rows, r, nowMs)
    const counted = earnings.filter((e) => COUNTED.includes(e.status))
    const payouts: PayoutView[] = rows.payouts
      .filter((p) => p.referrer_id === r.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({
        id: p.id, day: p.pay_day, amountCents: toCents(p.amount_usd), trips: itemsByPayout.get(p.id) ?? 0, last4: p.account_last4,
        state: payoutState(p), transferId: p.wise_transfer_id == null ? null : Number(p.wise_transfer_id), error: p.error,
        resolved: !!p.resolved_at, feeCents: p.fee_usd == null ? null : toCents(p.fee_usd),
      }))
    const attention: string[] = []
    for (const p of payouts) {
      if ((p.state === 'needs_attention' || p.state === 'returned') && !p.resolved) {
        attention.push(p.state === 'returned'
          ? `A payout of ${usdText(p.amountCents)} on ${shortDay(p.day)} came back from Wise. Nothing more is paid to this account until it is resolved.`
          : `A payout of ${usdText(p.amountCents)} on ${shortDay(p.day)} needs a look in Wise (${p.error ?? 'outcome unknown'}).`)
      }
    }
    for (const e of earnings) {
      if (e.status === 'check') attention.push(`${e.ref}: its trip days or figures cannot be read, so it is not paid. Check the booking.`)
      if (e.paidThenRefunded) attention.push(`${e.ref}: ${usdText(e.commissionCents)} was paid, then the booking was refunded. Recover it by hand or let it go.`)
    }
    const events = (rows.events ?? [])
      .filter((ev) => ev.referrer_id === r.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 30)
      .map((ev) => ({ kind: ev.kind, detail: ev.detail, actor: ev.actor, at: ev.created_at }))
    return {
      id: r.id,
      name: r.name,
      business: r.business,
      email: r.email,
      status: r.status,
      percent: Number(r.commission_percent),
      invitedAt: r.invited_at,
      inviteSentAt: r.invite_sent_at,
      inviteSends: r.invite_sends,
      acceptedAt: r.terms_accepted_at,
      note: r.note ?? null,
      account: page.account,
      codes: codeViews(rows.codes.filter((c) => c.referrer_id === r.id), earnings, bookingsById),
      earnings,
      payouts,
      totals: {
        bookings: counted.length,
        guestSpendCents: counted.reduce((s, e) => s + e.guestPaidCents, 0),
        earnedCents: counted.reduce((s, e) => s + e.commissionCents, 0),
        paidCents: earnings.filter((e) => e.status === 'paid').reduce((s, e) => s + e.commissionCents, 0),
        owedCents: earnings.filter((e) => WAITING.includes(e.status)).reduce((s, e) => s + e.commissionCents, 0),
      },
      next: page.next,
      attention,
      events,
    }
  })
  const statusOrder: Record<ReferrerStatus, number> = { active: 0, invited: 1, paused: 2, removed: 3 }
  views.sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name))
  const live = views.filter((v) => v.status !== 'removed')
  return {
    referrers: views,
    totals: {
      active: views.filter((v) => v.status === 'active').length,
      invited: views.filter((v) => v.status === 'invited').length,
      paused: views.filter((v) => v.status === 'paused').length,
      liveCodes: live.reduce((s, v) => s + v.codes.filter((c) => c.state === 'active').length, 0),
      bookings: views.reduce((s, v) => s + v.totals.bookings, 0),
      earnedCents: views.reduce((s, v) => s + v.totals.earnedCents, 0),
      paidCents: views.reduce((s, v) => s + v.totals.paidCents, 0),
      owedCents: views.reduce((s, v) => s + v.totals.owedCents, 0),
    },
  }
}
