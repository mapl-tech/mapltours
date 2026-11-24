import { PART_STAMP, ridePartsOf, tourPartOf, type PayPart, type PayoutBooking } from './payouts/plan'
import { REMITLY_FLAT_USD, REMITLY_FX, round2 } from './dispatch'

/**
 * What sending a booking's payouts costs, for the cash-flow page (owner, Nov
 * 21 2026: "make sure the new pricing is reflected in the cashflow"). Drivers
 * and the tour operator were paid by hand through Remitly until the Wise job
 * went live on Nov 19 2026 (lib/payouts), which costs a fraction of that, so
 * one estimate for every booking had stopped being true.
 *
 * Part by part, the same parts the payout job pays (ridePartsOf, tourPartOf):
 *  - Wise has paid it: Wise's own fee on that payment, shared out over the
 *    trips it carried, in cents that add up to the fee;
 *  - ticked paid by hand in the console (its dispatch stamp carries no Wise
 *    transfer): the Remitly estimate, the rail hand payments went by. The job
 *    skips such a part whatever its day, so the page does too;
 *  - the job will pay it (its day is on or after PAYOUT_FROM): Wise's rate;
 *  - otherwise it was paid by hand before Wise: the Remitly estimate, a flat
 *    fee per send plus the FX spread, rounded once over the booking's hand
 *    sends, exactly as the page always counted it.
 */

/**
 * Wise's fee on a payment the job sends: none since Nov 23 2026, when it began
 * paying Collin's own Wise account (balance to balance; the first, US$81 on
 * Nov 24, was charged US$0). The bank route to his Payoneer account before it
 * cost 0.30% (US$0.49 on US$162, US$0.24 on US$81, Nov 19 and 20), and those
 * payments keep the fee Wise reported. Used only for a payment Wise has not
 * reported a fee for and for parts the job has yet to send.
 */
export const WISE_FEE_RATE = 0

export interface WisePayout { id: string; amountUsd: number; feeUsd: number | null }
export interface WiseItem { payoutId: string; bookingId: string; part: PayPart; amountUsd: number }
export type FeeSource = 'wise' | 'wise_est' | 'remitly_est'
export interface PartFee { part: PayPart; amountUsd: number; feeUsd: number; source: FeeSource }
export interface Share { feeUsd: number; estimated: boolean }

const keyOf = (bookingId: string, part: PayPart) => `${bookingId}|${part}`
const cents = (usd: number) => Math.round(usd * 100)

/**
 * Each Wise-paid part's share of its payment's fee. A payment can carry
 * several trips (one payment per Wise account per run), so its fee is split
 * by amount, the remainder cents going to the largest fractions first, and
 * the shares add up to the fee exactly. A payment whose fee Wise has not
 * reported is estimated at WISE_FEE_RATE.
 */
export function wiseFeeShares(payouts: WisePayout[], items: WiseItem[]): Map<string, Share> {
  const byPayout = new Map<string, WiseItem[]>()
  for (const i of items) {
    const list = byPayout.get(i.payoutId) ?? []
    list.push(i)
    byPayout.set(i.payoutId, list)
  }
  const out = new Map<string, Share>()
  for (const p of payouts) {
    const list = (byPayout.get(p.id) ?? []).slice().sort((a, b) => keyOf(a.bookingId, a.part).localeCompare(keyOf(b.bookingId, b.part)))
    if (!list.length) continue
    const amounts = list.map((i) => cents(i.amountUsd))
    const total = amounts.reduce((s, x) => s + x, 0)
    if (p.feeUsd == null || !Number.isFinite(p.feeUsd) || p.feeUsd < 0 || total <= 0) {
      list.forEach((i) => out.set(keyOf(i.bookingId, i.part), { feeUsd: round2(i.amountUsd * WISE_FEE_RATE), estimated: true }))
      continue
    }
    const fee = cents(p.feeUsd)
    const raw = amounts.map((a) => (fee * a) / total)
    const shares = raw.map((r) => Math.floor(r))
    let left = fee - shares.reduce((s, x) => s + x, 0)
    const order = raw.map((r, idx) => ({ idx, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.idx - b.idx)
    for (const o of order) {
      if (left <= 0) break
      shares[o.idx]++
      left--
    }
    list.forEach((i, idx) => out.set(keyOf(i.bookingId, i.part), { feeUsd: shares[idx] / 100, estimated: false }))
  }
  return out
}

/** The Remitly estimate for one send of this amount, unrounded (lib/dispatch remitlyEstimate, one part at a time). */
const remitlySend = (amountUsd: number) => (amountUsd > 0 ? REMITLY_FLAT_USD + amountUsd * REMITLY_FX : 0)

/** Was this part ticked paid by hand (a stamp with no Wise transfer behind it)? */
function paidByHand(b: PayoutBooking, part: PayPart): boolean {
  const d = (b.dispatch ?? {}) as Record<string, unknown>
  const key = PART_STAMP[part]
  return !!d[key] && !String(d[`${key}_via`] ?? '').startsWith('wise:')
}

/** What sending this booking's payouts cost, or will cost, part by part. `fromDay` is PAYOUT_FROM, or null when the job is not set up. */
export function payoutFees(b: PayoutBooking, shares: Map<string, Share>, fromDay: string | null): { feeUsd: number; parts: PartFee[] } {
  const parts = b.booking_type === 'transfer' ? ridePartsOf(b) : [tourPartOf(b)]
  if (!parts.length) {
    // A ride with no legs on record: one hand payment, as the page always counted it.
    const amountUsd = round2(Number(b.subtotal ?? 0) || 0)
    const feeUsd = round2(remitlySend(amountUsd))
    return { feeUsd, parts: amountUsd > 0 ? [{ part: 'first', amountUsd, feeUsd, source: 'remitly_est' }] : [] }
  }
  let remitlyExact = 0
  const out: PartFee[] = parts.map((p) => {
    const share = shares.get(keyOf(b.id, p.part))
    if (share) return { part: p.part, amountUsd: p.amountUsd, feeUsd: share.feeUsd, source: share.estimated ? 'wise_est' : 'wise' }
    const byHand = paidByHand(b, p.part)
    if (!byHand && fromDay && p.serviceDay && p.serviceDay >= fromDay) {
      // Each Wise payment is charged on its own, so each part is rounded on its own.
      return { part: p.part, amountUsd: p.amountUsd, feeUsd: round2(p.amountUsd * WISE_FEE_RATE), source: 'wise_est' }
    }
    remitlyExact += remitlySend(p.amountUsd)
    return { part: p.part, amountUsd: p.amountUsd, feeUsd: round2(remitlySend(p.amountUsd)), source: 'remitly_est' }
  })
  const wise = out.filter((x) => x.source !== 'remitly_est').reduce((s, x) => s + x.feeUsd, 0)
  // The hand sends are rounded once over the booking, as remitlyEstimate always did.
  return { feeUsd: round2(wise + round2(remitlyExact)), parts: out }
}

/** How a row's payout fee was arrived at, for its label: one source, or "mixed" (a round trip paid half by hand, half by Wise). */
export function feeSourceOf(parts: PartFee[]): FeeSource | 'mixed' | null {
  const kinds = new Set(parts.filter((p) => p.amountUsd > 0).map((p) => p.source))
  if (kinds.size === 0) return null
  return kinds.size === 1 ? Array.from(kinds)[0] : 'mixed'
}
