/**
 * Payouts by Wise: the run. Called daily by
 * netlify/functions/driver-payouts-cron.mjs through app/api/payouts; it pays
 * every ride half and tour whose send day has come (lib/payouts/plan.ts), so
 * the money lands before the service, as the console's "Pay driver ... before
 * the pickup" steps do by hand today.
 *
 * NOT LIVE until WISE_PAYOUTS_ENABLED is exactly '1' (app/api/payouts). Until
 * then every run is a dry run: it reads and plans, and never calls Wise or
 * writes anything.
 *
 * One payout per Wise recipient per run, one Wise transfer per payout, paid
 * from the US-dollar balance. For each recipient, in this order:
 *   1. CLAIM. One database function (claim_driver_payout, migration 038)
 *      inserts the payout and one item per part (ride half or tour). A unique
 *      index allows a part in only one live item, so two runs, or a run and a
 *      later one, can never pay the same part twice: the loser gets null and
 *      skips.
 *   2. CHECK THE RECIPIENT. Active, and in US dollars.
 *   3. QUOTE. For exactly what is owed, paid from the balance. To a US bank
 *      account (such as a Payoneer receiving account) it is an ordinary US bank
 *      transfer; to a foreign account it is an international wire with
 *      SWIFT_OUR, so MAPL pays every bank's charge and the payee receives the
 *      full amount. Wise's fee must be under the limit.
 *   4. REQUIREMENTS. Wise says how long the reference may be on this route,
 *      and whether it needs anything else; anything we cannot fill stops it.
 *   5. CREATE THE TRANSFER with the payout's customerTransactionId, Wise's
 *      idempotency key: a retry after a lost answer returns the same transfer.
 *   6. FUND it from the balance. Wise funds a transfer once; a second attempt
 *      answers payment.exists.
 *   7. RECORD. The payout becomes `funded` and each part is stamped paid in
 *      the booking's dispatch map (paid_first / paid_second / paid_tour,
 *      through merge_dispatch), so the dispatch console and the driver portal
 *      show it. Each ride half it stamps then gets the driver's "payment
 *      sent" email, the one the console's tick sends, under the same
 *      once-only claim (lib/email/driver-paid.ts). Tours get no email.
 *      Wise's webhook (app/api/webhooks/wise) later marks it `sent`.
 *
 * When a step fails:
 *  - Wise refused (a definite 4xx) before any money moved: the payout is
 *    `failed`, its items are voided, and the parts are owed again on the
 *    next run. An unfunded transfer is cancelled first, so nobody can fund it
 *    by hand later; if the cancel fails, it is `needs_review` instead.
 *  - The outcome is unknown (no answer, a timeout, a 5xx): one careful retry
 *    where Wise makes retries safe (same customerTransactionId; reading the
 *    transfer back before funding again). Still unknown: `needs_review`. Its
 *    items stay live, so those parts cannot be paid again, and the recipient
 *    is held until the owner has looked in Wise and resolved it.
 * Every live run that did or found anything emails the operations inbox.
 */

import { randomUUID } from 'node:crypto'
import { round2 } from '@/lib/dispatch'
import { WiseApiError, type WiseApi, type WiseRequirementField, type WiseTransfer } from '@/lib/wise/client'
import {
  planPayouts,
  type PayeePlan,
  type PayPart,
  type PayoutBooking,
  type PayoutLimits,
  type PayoutLine,
  type SkipReason,
} from './plan'

export type PayoutStatus = 'claimed' | 'created' | 'funded' | 'sent' | 'failed' | 'returned' | 'needs_review'

export interface PayoutRow {
  id: string
  /** Who it pays: "Collin", or "Collin and Devon Brown" when names share a recipient. */
  payee: string
  recipient_id: number
  amount_usd: number
  status: PayoutStatus
  customer_transaction_id: string
  wise_quote_id: string | null
  wise_transfer_id: number | null
  wise_state: string | null
  wise_state_at: string | null
  /** The Jamaica day of the run that made it, 'YYYY-MM-DD'. */
  pay_day: string
  error: string | null
  created_at: string
  funded_at: string | null
  sent_at: string | null
  resolved_at: string | null
}

export interface PayoutItem {
  booking_id: string
  part: PayPart
  amount_usd: number
}

export interface ClaimInput {
  payee: string
  recipientId: number
  amountUsd: number
  payDay: string
  customerTransactionId: string
  items: PayoutItem[]
}

export type PayoutPatch = Partial<Omit<PayoutRow, 'id' | 'created_at'>> & {
  fee_usd?: number | null
  source_amount_usd?: number | null
}

/** The database, as the run needs it (lib/payouts/store.ts over Supabase; an in-memory one in the tests). */
export interface PayoutStore {
  loadBookings(): Promise<PayoutBooking[]>
  activeItemKeys(): Promise<Set<string>>
  /** Payouts still in flight (claimed, created) and problems not yet resolved (needs_review, returned). */
  openPayouts(): Promise<PayoutRow[]>
  /** The payout id, or null when one of its parts is already in a live item. */
  claim(input: ClaimInput): Promise<string | null>
  update(id: string, patch: PayoutPatch): Promise<void>
  voidItems(payoutId: string): Promise<void>
  items(payoutId: string): Promise<PayoutItem[]>
  /** Stamps a part paid in the booking's dispatch map unless a stamp is already there (then false). */
  stamp(bookingId: string, part: PayPart, iso: string, via: string): Promise<boolean>
  /** Removes a stamp only when its `_via` still names this payout. */
  unstamp(bookingId: string, part: PayPart, via: string): Promise<void>
}

export interface PayoutRunConfig {
  profileId: number
  balanceId: number | null
  recipients: Record<string, number>
  tourPayee: string | null
  /** PAYOUT_FROM; null plans nothing (a dry run without it). */
  fromDay: string | null
  limits: PayoutLimits
}

export interface PayoutRunDeps {
  store: PayoutStore
  /** null for a dry run: a dry run never touches Wise. */
  wise: WiseApi | null
  config: PayoutRunConfig
  send: boolean
  nowMs: number
  /** No new payout is started after this long (a serverless function has seconds); the next daily run continues. */
  budgetMs?: number
  clock?: () => number
  notify?: (report: PayoutReport) => Promise<void>
  /**
   * The driver's "payment sent" email for one ride half the job has just
   * stamped paid (lib/email/driver-paid.ts, the console's own email and
   * once-only claim). True when it went. Called only after the money has left
   * the balance and the stamp is written, never for a tour, and its failure
   * never touches the payout's record.
   */
  notifyPaid?: (bookingId: string, part: 'first' | 'second') => Promise<boolean>
  /** Tests only: how long to wait for one payment email (PAID_EMAIL_WAIT_MS otherwise). */
  paidEmailWaitMs?: number
}

/** How long the run waits for one "payment sent" email before carrying on (the send itself may still finish). */
export const PAID_EMAIL_WAIT_MS = 3000

export type PayeeOutcome =
  | 'planned'
  | 'held'
  | 'no_recipient'
  | 'funded'
  | 'failed'
  | 'needs_review'
  | 'taken'
  | 'deferred'

export type ReportLine = Pick<PayoutLine, 'ref' | 'part' | 'label' | 'name' | 'amountUsd' | 'serviceDay'>

export interface PayeeReport {
  payee: string
  amountUsd: number
  outcome: PayeeOutcome
  detail: string | null
  feeUsd: number | null
  transferId: number | null
  lines: ReportLine[]
  /** Parts whose dispatch already showed a payment when this one was stamped: possibly paid twice. */
  alreadyStamped: string[]
}

export interface PayoutReport {
  mode: 'dry' | 'live'
  /** The Jamaica day of this run. */
  payDay: string
  fromDay: string | null
  payees: PayeeReport[]
  /** Earlier payouts this run finished or flagged. */
  earlier: { payee: string; payoutId: string; outcome: PayoutStatus; detail: string | null }[]
  /** Unresolved problems that hold a recipient. */
  holds: { payee: string; payoutId: string; status: PayoutStatus; detail: string | null }[]
  skipped: Record<SkipReason, number>
  refundHeld: string[]
  /** true when the operations inbox should hear about this run. */
  attention: boolean
}

export class PayoutRunError extends Error {}

/** The run in numbers, for the log and the cron: no names. */
export function payoutCounts(r: PayoutReport) {
  const by = (o: PayeeOutcome) => r.payees.filter((d) => d.outcome === o).length
  return {
    mode: r.mode,
    pay_day: r.payDay,
    payees: r.payees.length,
    planned: by('planned'),
    funded: by('funded'),
    failed: by('failed'),
    needs_review: by('needs_review'),
    held: by('held'),
    no_recipient: by('no_recipient'),
    deferred: by('deferred'),
    owed_usd: Math.round(r.payees.reduce((s, d) => s + d.amountUsd, 0) * 100) / 100,
    paid_usd: Math.round(r.payees.filter((d) => d.outcome === 'funded').reduce((s, d) => s + d.amountUsd, 0) * 100) / 100,
    earlier: r.earlier.length,
    holds: r.holds.length,
    refund_held: r.refundHeld.length,
    skipped: r.skipped,
  }
}

/** A claimed payout with no transfer recorded after this long is not "in progress" any more; its outcome is unknown. */
export const STALE_CLAIM_MS = 30 * 60_000

/**
 * What the payee sees on the statement, longest first; requirements pick the
 * longest that fits. One booking is named by its reference (as the console
 * and the emails show it, MAPL-BE0C1B10), so he knows which trip it is for;
 * several are counted, and the operations email lists them.
 */
export function referenceCandidates(lines: Pick<PayoutLine, 'ref'>[]): string[] {
  const refs = Array.from(new Set(lines.map((l) => l.ref)))
  if (refs.length === 1) {
    const ref = refs[0]
    const code = ref.replace(/^MAPL-/, '')
    return [`MAPL Tours Jamaica ${code}`, ref, code, 'MAPL']
  }
  return [`MAPL Tours Jamaica ${refs.length} bookings`, `MAPL ${refs.length} bookings`, 'MAPL Tours Jamaica', 'MAPL']
}

const REFERENCE_KEYS = new Set(['reference', 'details.reference'])

export function chooseReference(candidates: string[], fields: WiseRequirementField[]): string | null {
  const f = fields.find((x) => REFERENCE_KEYS.has(x.key))
  if (!f) return candidates[0] ?? null
  for (const c of candidates) {
    if (f.maxLength != null && c.length > f.maxLength) continue
    if (f.minLength != null && c.length < f.minLength) continue
    if (f.validationRegexp) {
      let ok = true
      try { ok = new RegExp(f.validationRegexp).test(c) } catch { ok = true } // an unreadable pattern is Wise's to judge
      if (!ok) continue
    }
    return c
  }
  return null
}

/** Required transfer fields the run does not fill (anything beyond the reference). */
export function unmetRequirements(fields: WiseRequirementField[]): string[] {
  return fields.filter((f) => f.required && !REFERENCE_KEYS.has(f.key)).map((f) => f.key)
}

/** Transfer states that mean the money has left the balance. */
const MONEY_MOVED = new Set(['processing', 'funds_converted', 'outgoing_payment_sent', 'bounced_back', 'incoming_payment_initiated'])

class Definite extends Error {}
class Unknown extends Error {}

const fmt = (n: number) => `US$${n.toFixed(2)}`

export async function runDriverPayouts(deps: PayoutRunDeps): Promise<PayoutReport> {
  const { store, config, nowMs } = deps
  const live = deps.send && deps.wise !== null
  const clock = deps.clock ?? (() => Date.now())
  const startedAt = clock()
  const budgetMs = deps.budgetMs ?? 6000

  // Reads first. Any failure here stops the run before anything is sent.
  let bookings: PayoutBooking[]
  let ledger: Set<string>
  let open: PayoutRow[]
  try {
    ;[bookings, ledger, open] = await Promise.all([store.loadBookings(), store.activeItemKeys(), store.openPayouts()])
  } catch (err) {
    throw new PayoutRunError(err instanceof Error ? `read failed: ${err.message}` : 'read failed')
  }

  const report: PayoutReport = {
    mode: live ? 'live' : 'dry',
    payDay: '',
    fromDay: config.fromDay,
    payees: [],
    earlier: [],
    holds: [],
    skipped: {} as Record<SkipReason, number>,
    refundHeld: [],
    attention: false,
  }

  // Earlier payouts: finish what can be finished safely, flag what cannot.
  for (const p of open) {
    if (p.status === 'created' && live) {
      report.earlier.push({ payee: p.payee, payoutId: p.id, ...(await resumeCreated(deps, p)) })
    } else if (p.status === 'claimed' && nowMs - Date.parse(p.created_at) > STALE_CLAIM_MS) {
      const detail = 'stopped before a transfer was recorded; check Wise for a transfer with this payout\'s reference before resolving'
      if (live) await store.update(p.id, { status: 'needs_review', error: detail })
      report.earlier.push({ payee: p.payee, payoutId: p.id, outcome: live ? 'needs_review' : 'claimed', detail })
    }
  }

  // Re-read what is still open after the resume, to hold those recipients.
  const stillOpen = live ? await store.openPayouts() : open
  const holds = new Map<number, string>()
  for (const p of stillOpen) {
    const why =
      p.status === 'needs_review' ? `an earlier payout (${fmt(Number(p.amount_usd))}) needs a look in Wise`
      : p.status === 'returned' ? `an earlier payout (${fmt(Number(p.amount_usd))}) came back from the bank`
      : 'a payout to this account is still in progress'
    if (!holds.has(p.recipient_id)) holds.set(p.recipient_id, why)
    if (p.status === 'needs_review' || p.status === 'returned') {
      report.holds.push({ payee: p.payee, payoutId: p.id, status: p.status, detail: p.error })
    }
  }
  const freshLedger = live ? await store.activeItemKeys() : ledger

  const plan = planPayouts({
    bookings,
    ledger: freshLedger,
    recipients: config.recipients,
    tourPayee: config.tourPayee,
    holds,
    fromDay: config.fromDay,
    nowMs,
    limits: config.limits,
  })
  report.payDay = plan.payDay
  report.skipped = plan.skipped
  report.refundHeld = plan.refundHeld

  for (const d of plan.payees) {
    const base: PayeeReport = {
      payee: d.payee,
      amountUsd: d.totalUsd,
      outcome: d.status === 'ready' ? 'planned' : d.status,
      detail: d.reasons.join('; ') || null,
      feeUsd: null,
      transferId: null,
      lines: d.lines.map((l) => ({ ref: l.ref, part: l.part, label: l.label, name: l.name, amountUsd: l.amountUsd, serviceDay: l.serviceDay })),
      alreadyStamped: [],
    }
    if (d.status !== 'ready' || !live) { report.payees.push(base); continue }
    if (clock() - startedAt > budgetMs) {
      report.payees.push({ ...base, outcome: 'deferred', detail: 'out of time in this run; the next daily run sends it' })
      continue
    }
    report.payees.push(await payPayee(deps, d, plan.payDay, base))
  }

  report.attention =
    live && (
      report.payees.some((d) => d.outcome !== 'planned') ||
      report.earlier.length > 0 ||
      report.holds.length > 0 ||
      report.refundHeld.length > 0
    )
  if (report.attention && deps.notify) {
    try { await deps.notify(report) } catch { /* the run's answer still carries everything */ }
  }
  return report
}

/** Pays one recipient: claim, recipient, quote, requirements, transfer, fund, record. */
async function payPayee(deps: PayoutRunDeps, d: PayeePlan, payDay: string, base: PayeeReport): Promise<PayeeReport> {
  const { store, config } = deps
  const wise = deps.wise as WiseApi
  const recipientId = d.recipientId as number
  const customerTransactionId = randomUUID()
  const items: PayoutItem[] = d.lines.map((l) => ({ booking_id: l.bookingId, part: l.part, amount_usd: l.amountUsd }))

  const payoutId = await store.claim({ payee: d.payee, recipientId, amountUsd: d.totalUsd, payDay, customerTransactionId, items })
  if (!payoutId) return { ...base, outcome: 'taken', detail: 'another run already holds one of these trips' }

  let transfer: WiseTransfer | null = null
  try {
    // 2. The recipient.
    const recipient = await definite(() => wise.getRecipient(recipientId))
    if (!recipient.active) throw new Definite('the Wise recipient is not active')
    if (recipient.currency !== 'USD') throw new Definite(`the Wise recipient takes ${recipient.currency || 'another currency'}, not US dollars`)

    // 3. The quote: exactly what is owed, from the balance; MAPL pays every bank's charge on a wire.
    const payOut = recipient.type === 'swift_code' ? 'SWIFT_OUR' : null
    const quote = await definite(() => wise.createQuote({
      profileId: config.profileId,
      currency: 'USD',
      targetAmount: d.totalUsd,
      targetAccount: recipientId,
      payOut,
      balanceId: config.balanceId,
    }))
    if (quote.status !== 'PENDING') throw new Definite(`Wise's quote is ${quote.status || 'not usable'}`)
    if (Math.abs(quote.targetAmount - d.totalUsd) > 0.005) throw new Definite(`Wise quoted ${fmt(quote.targetAmount)} instead of ${fmt(d.totalUsd)}`)
    if (!quote.option) throw new Definite('Wise offered no way to pay this from the balance')
    if (quote.option.disabled) {
      const why = quote.option.disabledReason ?? 'unavailable'
      throw new Definite(/payInmethod|balance|insufficient/i.test(why) ? 'not enough US dollars in the Wise balance' : `Wise cannot pay this from the balance (${why})`)
    }
    const fee = round2(quote.option.feeTotal)
    if (!(fee >= 0) || fee > config.limits.maxFeeUsd) throw new Definite(`Wise's fee ${fmt(fee)} is over the ${fmt(config.limits.maxFeeUsd)} limit`)
    await store.update(payoutId, { wise_quote_id: quote.id, fee_usd: fee, source_amount_usd: round2(quote.option.sourceAmount) })
    base = { ...base, feeUsd: fee }

    // 4. Requirements: the reference that fits, and nothing else unmet.
    const candidates = referenceCandidates(d.lines)
    const fields = await definite(() => wise.transferRequirements({ targetAccount: recipientId, quoteUuid: quote.id, customerTransactionId, reference: candidates[0] }))
    const unmet = unmetRequirements(fields)
    if (unmet.length) throw new Definite(`Wise needs more for this transfer: ${unmet.join(', ')}`)
    const reference = chooseReference(candidates, fields)
    if (!reference) throw new Definite('no reference fits what Wise allows on this route')

    // 5. The transfer, idempotent on customerTransactionId: one retry if the answer was lost.
    const input = { targetAccount: recipientId, quoteUuid: quote.id, customerTransactionId, reference }
    transfer = await retryOnce(() => wise.createTransfer(input))
    if (transfer.targetAccount && transfer.targetAccount !== recipientId) throw new Unknown('Wise returned a transfer to a different recipient')
    if (transfer.targetValue != null && Math.abs(transfer.targetValue - d.totalUsd) > 0.005) throw new Unknown(`Wise's transfer is for ${fmt(transfer.targetValue)}`)
    await store.update(payoutId, { status: 'created', wise_transfer_id: transfer.id, wise_state: transfer.status })

    // 6 and 7.
    const settled = await fundAndRecord(deps, { id: payoutId, items, transferId: transfer.id })
    return { ...base, outcome: settled.outcome, detail: settled.detail, transferId: transfer.id, alreadyStamped: settled.alreadyStamped }
  } catch (err) {
    if (err instanceof Definite) {
      // Nothing was paid. An unfunded transfer is cancelled before the parts are freed.
      if (transfer) {
        const cancelled = await cancelSafely(wise, transfer.id)
        if (!cancelled) {
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

/** Funds a created transfer once (reading it back before any second attempt) and records the result. */
async function fundAndRecord(
  deps: PayoutRunDeps,
  p: { id: string; items: PayoutItem[]; transferId: number },
): Promise<{ outcome: 'funded' | 'failed' | 'needs_review'; detail: string | null; alreadyStamped: string[] }> {
  const { store, config } = deps
  const wise = deps.wise as WiseApi
  let lastRefusal = ''

  const attempt = async (): Promise<'funded' | 'refused' | 'unknown' | 'waiting'> => {
    try {
      const f = await wise.fundFromBalance(config.profileId, p.transferId, config.balanceId)
      if (f.status === 'COMPLETED') return 'funded'
      if (f.status === 'REJECTED') {
        if (f.errorCode === 'payment.exists') return 'funded' // an earlier attempt went through
        lastRefusal = f.errorCode ?? f.errorMessage ?? 'refused'
        return 'refused'
      }
      return 'unknown' // CREATED: started but not confirmed; read it back
    } catch (err) {
      if (err instanceof WiseApiError && !err.ambiguous) {
        if (err.code === 'payment.exists') return 'funded'
        lastRefusal = err.code ?? `HTTP ${err.status}`
        return 'refused'
      }
      return 'unknown'
    }
  }
  const readBack = async (): Promise<'funded' | 'waiting' | 'cancelled' | 'unknown'> => {
    try {
      const t = await wise.getTransfer(p.transferId)
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
      result = await attempt() // safe: Wise funds a transfer once
      if (result === 'unknown') result = (await readBack()) === 'funded' ? 'funded' : 'unknown'
    }
  }

  if (result === 'funded') return recordFunded(deps, p)
  if (result === 'refused') {
    const why = /insufficient|balance|payment-option-unavailable/i.test(lastRefusal) ? 'not enough US dollars in the Wise balance' : `Wise refused the payment (${lastRefusal})`
    const cancelled = await cancelSafely(wise, p.transferId)
    if (!cancelled) {
      const detail = `${why}; and transfer ${p.transferId} could not be cancelled, so cancel it in Wise before resolving`
      await store.update(p.id, { status: 'needs_review', error: detail })
      return { outcome: 'needs_review', detail, alreadyStamped: [] }
    }
    await store.update(p.id, { status: 'failed', error: why, wise_state: 'cancelled' })
    await store.voidItems(p.id)
    return { outcome: 'failed', detail: why, alreadyStamped: [] }
  }
  const detail = `transfer ${p.transferId} was created but whether it was paid is unknown; check Wise before resolving`
  await store.update(p.id, { status: 'needs_review', error: detail })
  return { outcome: 'needs_review', detail, alreadyStamped: [] }
}

/** The money has left the balance: the payout becomes `funded` and each part is stamped paid in dispatch. */
async function recordFunded(
  deps: PayoutRunDeps,
  p: { id: string; items: PayoutItem[]; transferId: number },
): Promise<{ outcome: 'funded'; detail: string | null; alreadyStamped: string[] }> {
  const { store } = deps
  const iso = new Date(deps.nowMs).toISOString()
  await store.update(p.id, { status: 'funded', funded_at: iso, error: null })
  const via = `wise:${p.transferId}`
  const alreadyStamped: string[] = []
  const stamped: PayoutItem[] = []
  let unstamped = 0
  for (const it of p.items) {
    try {
      if (await store.stamp(it.booking_id, it.part, iso, via)) stamped.push(it)
      else alreadyStamped.push(`${it.booking_id}:${it.part}`)
    } catch {
      unstamped++
    }
  }
  // The driver's "payment sent" email, once per ride half this payout stamped.
  // A half someone had already ticked is left alone (the tick sent its own),
  // and nothing here can change what was recorded above.
  let unmailed = 0
  if (deps.notifyPaid) {
    for (const it of stamped) {
      if (it.part !== 'first' && it.part !== 'second') continue
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const went = await Promise.race([
          deps.notifyPaid(it.booking_id, it.part),
          new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), deps.paidEmailWaitMs ?? PAID_EMAIL_WAIT_MS) }),
        ])
        if (!went) unmailed++
      } catch {
        unmailed++
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
  }
  const notes = [
    alreadyStamped.length ? 'the dispatch console already showed some of these trips as paid: check they were not paid twice' : '',
    unstamped ? `${unstamped} trip(s) could not be marked paid in the dispatch console; the payout itself is recorded` : '',
    unmailed ? `the driver's payment email did not go for ${unmailed} trip(s); the payout itself is recorded` : '',
  ].filter(Boolean)
  return { outcome: 'funded', detail: notes.join('; ') || null, alreadyStamped }
}

/** A payout an earlier run left with a transfer created: fund it if it is still waiting, record it if it was paid. */
async function resumeCreated(deps: PayoutRunDeps, p: PayoutRow): Promise<{ outcome: PayoutStatus; detail: string | null }> {
  const { store } = deps
  const wise = deps.wise as WiseApi
  if (!p.wise_transfer_id) {
    const detail = 'marked created without a transfer id; check Wise before resolving'
    await store.update(p.id, { status: 'needs_review', error: detail })
    return { outcome: 'needs_review', detail }
  }
  let t: WiseTransfer
  try {
    t = await wise.getTransfer(p.wise_transfer_id)
  } catch {
    return { outcome: 'created', detail: 'Wise did not answer; tried again on the next run' }
  }
  const items = await store.items(p.id)
  if (t.status === 'cancelled') {
    await store.update(p.id, { status: 'failed', error: 'the transfer was cancelled before it was paid', wise_state: t.status })
    await store.voidItems(p.id)
    return { outcome: 'failed', detail: 'the transfer was cancelled before it was paid' }
  }
  if (MONEY_MOVED.has(t.status)) {
    // Already paid: recorded, never funded again.
    const settled = await recordFunded(deps, { id: p.id, items, transferId: p.wise_transfer_id })
    return { outcome: settled.outcome, detail: settled.detail }
  }
  if (t.status === 'incoming_payment_waiting') {
    const settled = await fundAndRecord(deps, { id: p.id, items, transferId: p.wise_transfer_id })
    return { outcome: settled.outcome, detail: settled.detail }
  }
  const detail = `the transfer is ${t.status}; check Wise before resolving`
  await store.update(p.id, { status: 'needs_review', error: detail, wise_state: t.status })
  return { outcome: 'needs_review', detail }
}

/** A Wise call whose refusal ends this payout cleanly; an unknown outcome is not a refusal. */
async function definite<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof WiseApiError && !err.ambiguous) throw new Definite(err.message)
    // Reads and quotes change nothing at Wise, so an unknown outcome there is still nothing paid.
    throw new Definite(err instanceof Error ? err.message : 'Wise did not answer')
  }
}

/** For the transfer only: one retry with the same idempotency key when the answer was lost. */
async function retryOnce(fn: () => Promise<WiseTransfer>): Promise<WiseTransfer> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof WiseApiError && !err.ambiguous) throw new Definite(err.message)
    try {
      return await fn()
    } catch (again) {
      if (again instanceof WiseApiError && !again.ambiguous) throw new Unknown(`creating the transfer: first answer lost, then ${again.message}`)
      throw new Unknown('creating the transfer: Wise did not answer twice')
    }
  }
}

async function cancelSafely(wise: WiseApi, transferId: number): Promise<boolean> {
  try {
    const t = await wise.cancelTransfer(transferId)
    return t.status === 'cancelled'
  } catch (err) {
    // Already cancelled counts; anything else, or no answer, does not.
    return err instanceof WiseApiError && /already.*cancel/i.test(err.message)
  }
}
