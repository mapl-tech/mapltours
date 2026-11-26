/**
 * Referral payouts by Wise: the run (app/api/referrals/payouts, called daily
 * by netlify/functions/referral-payouts-cron.mjs at 09:45 Jamaica). It pays
 * each referrer, in one Wise transfer from the US-dollar balance, every
 * commission whose payout day has come (lib/referrals/rules: the Monday after
 * the trip and the cancellation window; a missed run catches up the next
 * day), into their own Wise account, balance to balance, for nothing.
 *
 * NOT LIVE until REFERRAL_PAYOUTS_ENABLED is exactly '1': every other run is
 * a dry run that reads and plans and never calls Wise or writes a row.
 *
 * It pays the way the driver payouts pay (lib/payouts/run.ts), with the same
 * primitives, and the same guarantees:
 *   1. CLAIM: one database function (claim_referral_payout, migration 045)
 *      writes the payout and one item per commission, all or nothing; an
 *      earning may sit in only one live item, so it is never paid twice.
 *   2. The recipient: active, US dollars, an 'aba' account (the referrer's
 *      own Wise account, created from /referrals).
 *   3. The quote: exactly what is owed, from the balance, and it must route
 *      balance to balance (payOut BALANCE) for US$0. Anything else holds the
 *      referrer for a person: a referral payout is never paid at a cost.
 *   4. Requirements, then the transfer with the payout's
 *      customerTransactionId (Wise's idempotency key), then funding (Wise
 *      funds a transfer once).
 *   5. Recorded `funded`, and the referrer is emailed what went and for which
 *      trips (lib/referrals/emails sendPaidNotice). Wise's webhook later marks
 *      it `sent` (app/api/webhooks/wise, the same state machine).
 * A refusal before money moved fails the payout and frees its commissions for
 * the next run; an unknown outcome is `needs_review`, keeps them claimed and
 * holds that referrer until a person resolves it on the admin page.
 *
 * Commissions whose redemption trigger could not record them (045 warns, never
 * fails) are recorded here, late, at the referrer's rate then.
 */

import { randomUUID } from 'node:crypto'
import type { WiseApi, WiseRequirementField, WiseTransfer } from '@/lib/wise/client'
import { WiseApiError } from '@/lib/wise/client'
import { Definite, Unknown, definite, retryOnce, cancelSafely, chooseReference, unmetRequirements, MONEY_MOVED, STALE_CLAIM_MS } from '@/lib/payouts/run'
import { jamaicaDay } from '@/lib/payouts/business-days'
import type { ReferrerRow } from './access'
import { composeEarnings, type EarningView, type LedgerRows, type ReferralPayoutRow, type ReferralPayoutStatus } from './ledger'
import { MIN_PAYOUT_USD, usd } from './rules'

/* ── The plan (pure) ─────────────────────────────────────────────────── */

export interface ReferralLimits {
  /** One referrer's payout over this is held for a person. */
  maxReferrerUsd: number
  /** The run's total over this holds the rest. */
  maxRunUsd: number
}

export const DEFAULT_REFERRAL_LIMITS: ReferralLimits = { maxReferrerUsd: 1500, maxRunUsd: 3000 }

export interface PlanLine {
  earningId: string
  bookingId: string
  amountCents: number
  what: string
  days: string
  code: string
  guestPaidCents: number
}

export interface ReferralPayeePlan {
  referrerId: string
  payee: string
  recipientId: number | null
  last4: string | null
  lines: PlanLine[]
  totalCents: number
  status: 'ready' | 'held'
  reason: string | null
}

export interface ReferralPlan {
  payDay: string
  payees: ReferralPayeePlan[]
}

/** A payout still in flight, or a problem not yet resolved, holds its referrer. */
export function holdFor(open: Pick<ReferralPayoutRow, 'referrer_id' | 'status' | 'resolved_at' | 'amount_usd'>[], referrerId: string): string | null {
  for (const p of open) {
    if (p.referrer_id !== referrerId) continue
    if (p.status === 'claimed' || p.status === 'created') return 'a payout to this referrer is still in progress'
    if ((p.status === 'needs_review' || p.status === 'returned') && !p.resolved_at) {
      return p.status === 'returned' ? `an earlier payout (${usd(Math.round(Number(p.amount_usd) * 100))}) came back from Wise` : `an earlier payout (${usd(Math.round(Number(p.amount_usd) * 100))}) needs a look in Wise`
    }
  }
  return null
}

export function planReferralPayouts(rows: LedgerRows, open: ReferralPayoutRow[], nowMs: number, limits: ReferralLimits = DEFAULT_REFERRAL_LIMITS): ReferralPlan {
  const payDay = jamaicaDay(nowMs)
  const { byReferrer } = composeEarnings(rows, nowMs)
  const payees: ReferralPayeePlan[] = []
  let runCents = 0
  for (const r of rows.referrers.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const due = (byReferrer.get(r.id) ?? []).filter((e: EarningView) => e.status === 'ready' && !!e.payDay && payDay >= e.payDay && e.commissionCents > 0)
    if (!due.length) continue
    const lines: PlanLine[] = due
      .slice()
      .sort((a, b) => (a.lastDay ?? '').localeCompare(b.lastDay ?? '') || a.bookingId.localeCompare(b.bookingId))
      .map((e) => ({ earningId: e.id, bookingId: e.bookingId, amountCents: e.commissionCents, what: e.what, days: e.days, code: e.code, guestPaidCents: e.guestPaidCents }))
    const totalCents = lines.reduce((s, l) => s + l.amountCents, 0)
    const hold = Number(Date.parse(String(r.payout_hold_until ?? '')))
    const reason =
      r.status === 'paused' ? 'the referrer is paused'
      : r.status === 'invited' ? 'the referrer has not accepted the terms'
      : !r.wise_recipient_id || !r.payout_last4 ? 'no payout account yet'
      : Number.isFinite(hold) && hold > nowMs ? `a new payout account is waiting until ${new Date(hold).toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : holdFor(open, r.id)
      ?? (totalCents < MIN_PAYOUT_USD * 100 ? `under ${usd(MIN_PAYOUT_USD * 100)}, it waits for the next payout`
      : totalCents > limits.maxReferrerUsd * 100 ? `over the ${usd(limits.maxReferrerUsd * 100)} limit for one referrer: a person should check it`
      : runCents + totalCents > limits.maxRunUsd * 100 ? `the run would pass its ${usd(limits.maxRunUsd * 100)} limit: the rest waits for a person`
      : null)
    if (!reason) runCents += totalCents
    payees.push({
      referrerId: r.id,
      payee: r.business ? `${r.name} (${r.business})` : r.name,
      recipientId: r.wise_recipient_id == null ? null : Number(r.wise_recipient_id),
      last4: r.payout_last4,
      lines,
      totalCents,
      status: reason ? 'held' : 'ready',
      reason,
    })
  }
  return { payDay, payees }
}

/* ── The run ─────────────────────────────────────────────────────────── */

export interface ReferralPayoutPatch {
  status?: ReferralPayoutStatus
  wise_quote_id?: string | null
  wise_transfer_id?: number | null
  wise_state?: string | null
  fee_usd?: number | null
  source_amount_usd?: number | null
  error?: string | null
  funded_at?: string | null
  notified_at?: string | null
}

export interface ReferralRunStore {
  loadRows(): Promise<LedgerRows>
  openPayouts(): Promise<ReferralPayoutRow[]>
  claim(input: { referrerId: string; payee: string; recipientId: number; last4: string; amountUsd: number; payDay: string; customerTransactionId: string; items: { earning_id: string; booking_id: string; amount_usd: number }[] }): Promise<string | null>
  update(id: string, patch: ReferralPayoutPatch): Promise<void>
  voidItems(payoutId: string): Promise<void>
  /** Paid bookings carrying a referral code that have no earning row: recorded late. Answers how many. */
  recordMissingEarnings(rows: LedgerRows): Promise<number>
}

export interface ReferralRunDeps {
  store: ReferralRunStore
  wise: WiseApi | null
  config: { profileId: number; balanceId: number | null; limits: ReferralLimits }
  send: boolean
  nowMs: number
  budgetMs?: number
  clock?: () => number
  /** The referrer's payout email; true when it went. */
  notifyPaid?: (referrer: ReferrerRow, p: { payoutId: string; amountCents: number; last4: string; lines: PlanLine[] }) => Promise<boolean>
  /** The operations inbox, when something needs a person. */
  notifyOps?: (report: ReferralRunReport) => Promise<void>
}

export type ReferralOutcome = 'planned' | 'held' | 'funded' | 'failed' | 'needs_review' | 'taken' | 'deferred'

export interface ReferralPayeeReport {
  payee: string
  referrerId: string
  amountCents: number
  trips: number
  outcome: ReferralOutcome
  detail: string | null
  transferId: number | null
  emailed: boolean | null
}

export interface ReferralRunReport {
  mode: 'dry' | 'live'
  payDay: string
  payees: ReferralPayeeReport[]
  earlier: { payoutId: string; outcome: ReferralPayoutStatus; detail: string | null }[]
  recordedLate: number
  attention: boolean
}

export class ReferralRunError extends Error {}

const REFERENCES = ['MAPL Tours Jamaica referrals', 'MAPL referrals', 'MAPL Tours Jamaica', 'MAPL']

export function referralCounts(r: ReferralRunReport) {
  const by = (o: ReferralOutcome) => r.payees.filter((d) => d.outcome === o).length
  return {
    mode: r.mode,
    pay_day: r.payDay,
    referrers: r.payees.length,
    planned: by('planned'),
    funded: by('funded'),
    failed: by('failed'),
    needs_review: by('needs_review'),
    held: by('held'),
    deferred: by('deferred'),
    owed_usd: r.payees.reduce((s, d) => s + d.amountCents, 0) / 100,
    paid_usd: r.payees.filter((d) => d.outcome === 'funded').reduce((s, d) => s + d.amountCents, 0) / 100,
    earlier: r.earlier.length,
    recorded_late: r.recordedLate,
  }
}

export async function runReferralPayouts(deps: ReferralRunDeps): Promise<ReferralRunReport> {
  const { store, nowMs } = deps
  const live = deps.send && deps.wise !== null
  const clock = deps.clock ?? (() => Date.now())
  const startedAt = clock()
  const budgetMs = deps.budgetMs ?? 6000

  let rows: LedgerRows
  let open: ReferralPayoutRow[]
  try {
    ;[rows, open] = await Promise.all([store.loadRows(), store.openPayouts()])
  } catch (err) {
    throw new ReferralRunError(err instanceof Error ? `read failed: ${err.message}` : 'read failed')
  }

  const report: ReferralRunReport = { mode: live ? 'live' : 'dry', payDay: jamaicaDay(nowMs), payees: [], earlier: [], recordedLate: 0, attention: false }

  if (live) {
    // Earnings the trigger could not record, recorded now (and the plan re-read with them).
    try {
      report.recordedLate = await store.recordMissingEarnings(rows)
      if (report.recordedLate > 0) rows = await store.loadRows()
    } catch (err) {
      throw new ReferralRunError(err instanceof Error ? `late earnings: ${err.message}` : 'late earnings failed')
    }
    // Earlier payouts: finish what is safe to finish, flag what is not.
    for (const p of open) {
      if (p.status === 'created') report.earlier.push({ payoutId: p.id, ...(await resumeCreated(deps, p)) })
      else if (p.status === 'claimed' && nowMs - Date.parse(p.created_at) > STALE_CLAIM_MS) {
        const detail = 'stopped before a transfer was recorded; check Wise for a transfer to this referrer before resolving'
        await store.update(p.id, { status: 'needs_review', error: detail })
        report.earlier.push({ payoutId: p.id, outcome: 'needs_review', detail })
      }
    }
    open = await store.openPayouts()
    rows = await store.loadRows()
  }

  const plan = planReferralPayouts(rows, open, nowMs, deps.config.limits)
  report.payDay = plan.payDay
  const byId = new Map(rows.referrers.map((r) => [r.id, r]))
  for (const d of plan.payees) {
    const base: ReferralPayeeReport = {
      payee: d.payee, referrerId: d.referrerId, amountCents: d.totalCents, trips: d.lines.length,
      outcome: d.status === 'ready' ? 'planned' : 'held', detail: d.reason, transferId: null, emailed: null,
    }
    if (d.status !== 'ready' || !live) { report.payees.push(base); continue }
    if (clock() - startedAt > budgetMs) {
      report.payees.push({ ...base, outcome: 'deferred', detail: 'out of time in this run; the next run sends it' })
      continue
    }
    report.payees.push(await payReferrer(deps, d, plan.payDay, base, byId.get(d.referrerId)!))
  }

  report.attention = live && (
    report.payees.some((d) => d.outcome !== 'planned' && !(d.outcome === 'funded' && d.emailed && !d.detail)) ||
    report.earlier.length > 0 ||
    report.recordedLate > 0
  )
  if (report.attention && deps.notifyOps) {
    try { await deps.notifyOps(report) } catch { /* the answer still carries it */ }
  }
  return report
}

async function payReferrer(deps: ReferralRunDeps, d: ReferralPayeePlan, payDay: string, base: ReferralPayeeReport, referrer: ReferrerRow): Promise<ReferralPayeeReport> {
  const { store, config } = deps
  const wise = deps.wise as WiseApi
  const recipientId = d.recipientId as number
  const amountUsd = d.totalCents / 100
  const customerTransactionId = randomUUID()
  const payoutId = await store.claim({
    referrerId: d.referrerId, payee: d.payee, recipientId, last4: d.last4 as string, amountUsd, payDay, customerTransactionId,
    items: d.lines.map((l) => ({ earning_id: l.earningId, booking_id: l.bookingId, amount_usd: l.amountCents / 100 })),
  })
  if (!payoutId) return { ...base, outcome: 'taken', detail: 'another run already holds one of these commissions' }

  let transfer: WiseTransfer | null = null
  try {
    const recipient = await definite(() => wise.getRecipient(recipientId))
    if (!recipient.active) throw new Definite('the Wise recipient is not active')
    // Wise's 2026Q4 API names the type 'Aba' (checked against MAPL's own recipients, Nov 26 2026), v1 'aba'.
    if (recipient.currency !== 'USD' || recipient.type.toLowerCase() !== 'aba') throw new Definite('the Wise recipient is not a US-dollar Wise account')

    const quote = await definite(() => wise.createQuote({ profileId: config.profileId, currency: 'USD', targetAmount: amountUsd, targetAccount: recipientId, payOut: null, balanceId: config.balanceId }))
    if (quote.status !== 'PENDING') throw new Definite(`Wise's quote is ${quote.status || 'not usable'}`)
    if (Math.abs(quote.targetAmount - amountUsd) > 0.005) throw new Definite(`Wise quoted ${usd(Math.round(quote.targetAmount * 100))} instead of ${usd(d.totalCents)}`)
    if (!quote.option) throw new Definite('Wise offered no way to pay this from the balance')
    if (quote.option.disabled) {
      const why = quote.option.disabledReason ?? 'unavailable'
      throw new Definite(/payInmethod|balance|insufficient/i.test(why) ? 'not enough US dollars in the Wise balance' : `Wise cannot pay this from the balance (${why})`)
    }
    // A referral payout goes balance to balance, for nothing, or not at all.
    if (quote.payOut !== 'BALANCE' || quote.option.payOut !== 'BALANCE') throw new Definite('Wise would not pay this account balance to balance: check the referrer\'s Wise account')
    if (quote.option.feeTotal !== 0) throw new Definite(`Wise would charge ${usd(Math.round(quote.option.feeTotal * 100))} for this payout, and referral payouts are free`)
    await store.update(payoutId, { wise_quote_id: quote.id, fee_usd: 0, source_amount_usd: Math.round(quote.option.sourceAmount * 100) / 100 })

    const fields: WiseRequirementField[] = await definite(() => wise.transferRequirements({ targetAccount: recipientId, quoteUuid: quote.id, customerTransactionId, reference: REFERENCES[0] }))
    const unmet = unmetRequirements(fields)
    if (unmet.length) throw new Definite(`Wise needs more for this transfer: ${unmet.join(', ')}`)
    const reference = chooseReference(REFERENCES, fields)
    if (!reference) throw new Definite('no reference fits what Wise allows on this route')

    transfer = await retryOnce(() => wise.createTransfer({ targetAccount: recipientId, quoteUuid: quote.id, customerTransactionId, reference }))
    if (transfer.targetAccount && transfer.targetAccount !== recipientId) throw new Unknown('Wise returned a transfer to a different recipient')
    if (transfer.targetValue != null && Math.abs(transfer.targetValue - amountUsd) > 0.005) throw new Unknown(`Wise's transfer is for ${usd(Math.round(transfer.targetValue * 100))}`)
    await store.update(payoutId, { status: 'created', wise_transfer_id: transfer.id, wise_state: transfer.status })

    const funded = await fund(wise, config.profileId, config.balanceId, transfer.id)
    if (funded.result === 'funded') {
      await store.update(payoutId, { status: 'funded', funded_at: new Date(deps.nowMs).toISOString(), error: null })
      let emailed = false
      if (deps.notifyPaid) {
        try {
          emailed = await deps.notifyPaid(referrer, { payoutId, amountCents: d.totalCents, last4: d.last4 as string, lines: d.lines })
          if (emailed) await store.update(payoutId, { notified_at: new Date().toISOString() })
        } catch {
          emailed = false
        }
      }
      return { ...base, outcome: 'funded', transferId: transfer.id, emailed, detail: emailed || !deps.notifyPaid ? null : 'the payout email did not go; the payout itself is recorded' }
    }
    if (funded.result === 'refused') {
      const why = /insufficient|balance|payment-option-unavailable/i.test(funded.refusal) ? 'not enough US dollars in the Wise balance' : `Wise refused the payment (${funded.refusal})`
      if (!(await cancelSafely(wise, transfer.id))) {
        const detail = `${why}; and transfer ${transfer.id} could not be cancelled, so cancel it in Wise before resolving`
        await store.update(payoutId, { status: 'needs_review', error: detail })
        return { ...base, outcome: 'needs_review', detail, transferId: transfer.id }
      }
      await store.update(payoutId, { status: 'failed', error: why, wise_state: 'cancelled' })
      await store.voidItems(payoutId)
      return { ...base, outcome: 'failed', detail: why, transferId: transfer.id }
    }
    const detail = `transfer ${transfer.id} was created but whether it was paid is unknown; check Wise before resolving`
    await store.update(payoutId, { status: 'needs_review', error: detail })
    return { ...base, outcome: 'needs_review', detail, transferId: transfer.id }
  } catch (err) {
    if (err instanceof Definite) {
      if (transfer) {
        if (!(await cancelSafely(wise, transfer.id))) {
          const detail = `${err.message}; and transfer ${transfer.id} could not be cancelled, so cancel it in Wise before resolving`
          await store.update(payoutId, { status: 'needs_review', error: detail })
          return { ...base, outcome: 'needs_review', detail, transferId: transfer.id }
        }
      }
      await store.update(payoutId, { status: 'failed', error: err.message })
      await store.voidItems(payoutId)
      return { ...base, outcome: 'failed', detail: err.message, transferId: transfer?.id ?? null }
    }
    const detail = `${err instanceof Error ? err.message : 'unknown error'}; the outcome is unknown, check Wise before resolving`
    await store.update(payoutId, { status: 'needs_review', error: detail })
    return { ...base, outcome: 'needs_review', detail, transferId: transfer?.id ?? null }
  }
}

/**
 * Funds a created transfer once, reading it back before any second attempt
 * (Wise funds a transfer once; a repeat answers payment.exists). The same
 * sequence as lib/payouts/run.ts fundAndRecord: keep the two in step.
 */
export async function fund(wise: WiseApi, profileId: number, balanceId: number | null, transferId: number): Promise<{ result: 'funded' | 'refused' | 'unknown'; refusal: string }> {
  let refusal = ''
  const attempt = async (): Promise<'funded' | 'refused' | 'unknown'> => {
    try {
      const f = await wise.fundFromBalance(profileId, transferId, balanceId)
      if (f.status === 'COMPLETED') return 'funded'
      if (f.status === 'REJECTED') {
        if (f.errorCode === 'payment.exists') return 'funded'
        refusal = f.errorCode ?? f.errorMessage ?? 'refused'
        return 'refused'
      }
      return 'unknown'
    } catch (err) {
      if (err instanceof WiseApiError && !err.ambiguous) {
        if (err.code === 'payment.exists') return 'funded'
        refusal = err.code ?? `HTTP ${err.status}`
        return 'refused'
      }
      return 'unknown'
    }
  }
  const readBack = async (): Promise<'funded' | 'waiting' | 'cancelled' | 'unknown'> => {
    try {
      const t = await wise.getTransfer(transferId)
      if (MONEY_MOVED.has(t.status)) return 'funded'
      if (t.status === 'incoming_payment_waiting') return 'waiting'
      if (t.status === 'cancelled') return 'cancelled'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }
  let result = await attempt()
  if (result === 'unknown') {
    const seen = await readBack()
    if (seen === 'funded') result = 'funded'
    else if (seen === 'waiting') {
      result = await attempt()
      if (result === 'unknown') result = (await readBack()) === 'funded' ? 'funded' : 'unknown'
    }
  }
  return { result, refusal }
}

async function resumeCreated(deps: ReferralRunDeps, p: ReferralPayoutRow): Promise<{ outcome: ReferralPayoutStatus; detail: string | null }> {
  const { store, config } = deps
  const wise = deps.wise as WiseApi
  const transferId = p.wise_transfer_id == null ? null : Number(p.wise_transfer_id)
  if (!transferId) {
    const detail = 'marked created without a transfer id; check Wise before resolving'
    await store.update(p.id, { status: 'needs_review', error: detail })
    return { outcome: 'needs_review', detail }
  }
  let t: WiseTransfer
  try {
    t = await wise.getTransfer(transferId)
  } catch {
    return { outcome: 'created', detail: 'Wise did not answer; tried again on the next run' }
  }
  if (t.status === 'cancelled') {
    await store.update(p.id, { status: 'failed', error: 'the transfer was cancelled before it was paid', wise_state: t.status })
    await store.voidItems(p.id)
    return { outcome: 'failed', detail: 'the transfer was cancelled before it was paid' }
  }
  if (MONEY_MOVED.has(t.status)) {
    await store.update(p.id, { status: 'funded', funded_at: new Date(deps.nowMs).toISOString(), error: null, wise_state: t.status })
    return { outcome: 'funded', detail: 'it had been paid; recorded now' }
  }
  if (t.status === 'incoming_payment_waiting') {
    const f = await fund(wise, config.profileId, config.balanceId, transferId)
    if (f.result === 'funded') {
      await store.update(p.id, { status: 'funded', funded_at: new Date(deps.nowMs).toISOString(), error: null })
      return { outcome: 'funded', detail: 'funded on this run' }
    }
    const detail = f.result === 'refused' ? `Wise refused the payment (${f.refusal}); check Wise before resolving` : 'whether it was paid is unknown; check Wise before resolving'
    await store.update(p.id, { status: 'needs_review', error: detail })
    return { outcome: 'needs_review', detail }
  }
  const detail = `the transfer is ${t.status}; check Wise before resolving`
  await store.update(p.id, { status: 'needs_review', error: detail, wise_state: t.status })
  return { outcome: 'needs_review', detail }
}

/** The operations email for a run that needs a person. Referrer names and amounts only, never bank details. */
export function referralRunSummary(r: ReferralRunReport): { subject: string; body: string; lines: string[] } {
  const lines: string[] = []
  for (const d of r.payees) {
    const trips = `${d.trips} trip${d.trips === 1 ? '' : 's'}`
    if (d.outcome === 'funded') lines.push(`${d.payee}: ${usd(d.amountCents)} for ${trips}, PAID (transfer ${d.transferId})${d.emailed === false ? '. The payout email did not go: tell them.' : ''}`)
    else if (d.outcome === 'held') lines.push(`${d.payee}: ${usd(d.amountCents)} for ${trips}, HELD: ${d.detail ?? ''}`)
    else if (d.outcome === 'failed') lines.push(`${d.payee}: ${usd(d.amountCents)} for ${trips}, NOT PAID: ${d.detail ?? 'refused'}. Tried again on the next run.`)
    else if (d.outcome === 'needs_review') lines.push(`${d.payee}: ${usd(d.amountCents)} for ${trips}, NEEDS A LOOK: ${d.detail ?? 'outcome unknown'}`)
    else if (d.outcome === 'deferred') lines.push(`${d.payee}: ${usd(d.amountCents)} for ${trips}, waits for the next run`)
    else if (d.outcome === 'taken') lines.push(`${d.payee}: skipped, another run holds these commissions`)
  }
  for (const e of r.earlier) lines.push(`Earlier payout ${e.payoutId}: ${e.outcome}${e.detail ? `, ${e.detail}` : ''}`)
  if (r.recordedLate) lines.push(`${r.recordedLate} commission${r.recordedLate === 1 ? '' : 's'} recorded late: the database could not record ${r.recordedLate === 1 ? 'it' : 'them'} when the booking was paid.`)
  const paid = r.payees.filter((d) => d.outcome === 'funded').reduce((s, d) => s + d.amountCents, 0)
  const subject = paid > 0 ? `Referral payouts: ${usd(paid)} sent, something needs a look` : 'Referral payouts: something needs a look'
  return { subject, body: 'The referral payout run found something for a person. The lines below say what. Manage referrers at mapltours.com/admin/referrals.', lines: lines.slice(0, 80) }
}
