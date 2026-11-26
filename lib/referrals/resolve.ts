/**
 * Resolving a referral payout that needed a look (`needs_review`: the run could
 * not tell whether the money went). The admin says what Wise shows, "paid" or
 * "not paid", and the transfer's own state at Wise decides whether that answer
 * may be saved. A wrong "not paid" would free the commissions for the next run
 * while the money had gone (paid twice); a wrong "paid" would leave them unpaid
 * for good. So neither is taken on trust when there is a transfer to ask about.
 *
 *   paid      the payout is recorded as sent (or on its way), its commissions
 *             stay with it, and the referrer gets the payout email if they
 *             never had it;
 *   not paid  its commissions are freed and the next run pays them; a transfer
 *             still waiting for our money is cancelled at Wise first.
 *
 * Pure: the admin route (app/api/admin/referrals) reads the transfer and acts.
 */

export type ResolveAnswer = 'paid' | 'not_paid'

export type ResolveDecision =
  | { ok: true; status: 'sent' | 'funded' | 'failed'; cancelFirst: boolean }
  | { ok: false; message: string }

/** Wise transfer states in which the money has left our balance. */
const PAID: Record<string, 'sent' | 'funded'> = {
  outgoing_payment_sent: 'sent',
  processing: 'funded',
  funds_converted: 'funded',
  incoming_payment_initiated: 'funded',
}
/** States in which no money reached the referrer and none is on its way. */
const NOT_PAID = new Set(['cancelled', 'funds_refunded'])
/** Created but never funded: cancelled at Wise before the commissions are freed. */
const UNFUNDED = new Set(['incoming_payment_waiting'])

const LABEL: Record<string, string> = {
  outgoing_payment_sent: 'sent',
  processing: 'processing',
  funds_converted: 'converted and on its way',
  incoming_payment_initiated: 'being funded from our balance',
  cancelled: 'cancelled',
  funds_refunded: 'refunded to our balance',
  incoming_payment_waiting: 'waiting for money from our balance',
}
const label = (state: string) => LABEL[state] ?? `"${state.replace(/_/g, ' ')}"`

/**
 * @param state the transfer's state at Wise, or null when the payout has no
 *   transfer on our side (the run never funded one, so no money left the
 *   balance through it; the admin's answer stands).
 */
export function decideResolution(answer: ResolveAnswer, state: string | null): ResolveDecision {
  if (state === null) return answer === 'paid' ? { ok: true, status: 'sent', cancelFirst: false } : { ok: true, status: 'failed', cancelFirst: false }
  if (answer === 'paid') {
    if (PAID[state]) return { ok: true, status: PAID[state], cancelFirst: false }
    if (NOT_PAID.has(state) || UNFUNDED.has(state)) return { ok: false, message: `Wise shows this transfer ${label(state)}, so it was not paid. Choose It was not paid.` }
  } else {
    if (PAID[state]) return { ok: false, message: `Wise shows this transfer ${label(state)}: the money has gone. Choose It was paid.` }
    if (NOT_PAID.has(state)) return { ok: true, status: 'failed', cancelFirst: false }
    if (UNFUNDED.has(state)) return { ok: true, status: 'failed', cancelFirst: true }
  }
  return { ok: false, message: `Wise shows this transfer as ${label(state)}. Settle it in Wise first, then come back to this payout.` }
}
