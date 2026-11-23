/**
 * Fakes for the payout tests: an in-memory ledger that behaves like
 * migration 038 (one live item per part; claims that meet a live item
 * return null) and the dispatch map's merge_dispatch, and a Wise that keeps
 * transfers, honours customerTransactionId and funds a transfer only once.
 * Synthetic data only.
 */

import { randomUUID } from 'node:crypto'
import { PART_STAMP, type PayPart, type PayoutBooking } from '@/lib/payouts/plan'
import type { ClaimInput, PayoutItem, PayoutPatch, PayoutRow, PayoutStore } from '@/lib/payouts/run'
import type { PayoutEventStore } from '@/lib/payouts/store'
import { WiseApiError, type WiseApi, type WiseQuoteInput, type WiseRecipient, type WiseRequirementField, type WiseTransfer, type WiseTransferInput } from '@/lib/wise/client'

let seq = 0
/** A booking id that is a real UUID and sorts by creation. */
export function bookingId(): string {
  seq++
  return `0000${seq.toString(16)}`.slice(-8) + '-0000-4000-8000-000000000000'
}

export function ride(o: {
  id?: string
  driver?: string | null
  subtotal?: number
  trip?: 'round_trip' | 'one_way'
  arrival?: string | null
  departure?: string | null
  status?: string
  refund_state?: string | null
  refunded_at?: string | null
  dispatch?: Record<string, unknown>
} = {}): PayoutBooking {
  const trip = o.trip ?? 'round_trip'
  return {
    id: o.id ?? bookingId(),
    status: o.status ?? 'paid',
    booking_type: 'transfer',
    subtotal: o.subtotal ?? 147,
    driver_name: o.driver === undefined ? 'Collin' : o.driver,
    dispatch: o.dispatch ?? {},
    refund_state: o.refund_state ?? 'none',
    refunded_at: o.refunded_at ?? null,
    booking_items: [{
      trip_type: trip,
      arrival_at: o.arrival === undefined ? '2026-10-10T14:30:00+00:00' : o.arrival,
      departure_at: o.departure === undefined ? (trip === 'round_trip' ? '2026-10-17T09:00:00+00:00' : null) : o.departure,
    }],
  }
}

/** A paid tour booking: its subtotal is what the operator is owed; one item per tour day. */
export function tour(o: {
  id?: string
  subtotal?: number
  dates?: (string | null)[]
  status?: string
  refund_state?: string | null
  refunded_at?: string | null
  dispatch?: Record<string, unknown>
} = {}): PayoutBooking {
  return {
    id: o.id ?? bookingId(),
    status: o.status ?? 'paid',
    booking_type: 'tour',
    subtotal: o.subtotal ?? 130,
    driver_name: null,
    dispatch: o.dispatch ?? {},
    refund_state: o.refund_state ?? 'none',
    refunded_at: o.refunded_at ?? null,
    booking_items: (o.dates ?? ['2026-10-12']).map((date) => ({ item_type: 'experience', date, trip_type: null, arrival_at: null, departure_at: null })),
  }
}

export type MemPayout = PayoutRow & { fee_usd?: number | null; source_amount_usd?: number | null; updated_at?: string }
export type MemItem = PayoutItem & { payout_id: string; active: boolean }

export interface MemStore extends PayoutStore, PayoutEventStore {
  payouts: Map<string, MemPayout>
  ledger: MemItem[]
  dispatch: Map<string, Record<string, unknown>>
  claims: ClaimInput[]
  writes: string[]
  /** Make the next claim lose a race. */
  loseNextClaim: boolean
  /** Make stamps throw. */
  stampFails: boolean
}

export function memStore(bookings: PayoutBooking[], nowMs = Date.parse('2026-11-01T14:30:00Z')): MemStore {
  const dispatch = new Map<string, Record<string, unknown>>(bookings.map((b) => [b.id, { ...(b.dispatch ?? {}) }]))
  const s: MemStore = {
    payouts: new Map(),
    ledger: [],
    dispatch,
    claims: [],
    writes: [],
    loseNextClaim: false,
    stampFails: false,
    async loadBookings() {
      return bookings.map((b) => ({ ...b, dispatch: { ...(dispatch.get(b.id) ?? {}) } }))
    },
    async activeItemKeys() {
      return new Set(s.ledger.filter((i) => i.active).map((i) => `${i.booking_id}:${i.part}`))
    },
    async openPayouts() {
      return Array.from(s.payouts.values())
        .filter((p) => p.status === 'claimed' || p.status === 'created' || ((p.status === 'needs_review' || p.status === 'returned') && !p.resolved_at))
        .map((p) => ({ ...p }))
    },
    async claim(input) {
      s.claims.push(input)
      if (s.loseNextClaim) { s.loseNextClaim = false; return null }
      const total = Math.round(input.items.reduce((t, i) => t + i.amount_usd, 0) * 100) / 100
      if (total !== input.amountUsd) throw new Error('claim_driver_payout: items do not add up')
      if (input.items.some((it) => s.ledger.some((l) => l.active && l.booking_id === it.booking_id && l.part === it.part))) return null
      const id = randomUUID()
      s.payouts.set(id, {
        id,
        payee: input.payee,
        recipient_id: input.recipientId,
        amount_usd: input.amountUsd,
        status: 'claimed',
        customer_transaction_id: input.customerTransactionId,
        wise_quote_id: null,
        wise_transfer_id: null,
        wise_state: null,
        wise_state_at: null,
        pay_day: input.payDay,
        error: null,
        created_at: new Date(nowMs).toISOString(),
        funded_at: null,
        sent_at: null,
        resolved_at: null,
      })
      for (const it of input.items) s.ledger.push({ ...it, payout_id: id, active: true })
      s.writes.push(`claim ${input.payee}`)
      return id
    },
    async update(id, patch: PayoutPatch) {
      const p = s.payouts.get(id)
      if (!p) throw new Error('no such payout')
      Object.assign(p, patch)
      s.writes.push(`update ${patch.status ?? '-'}`)
    },
    async voidItems(payoutId) {
      for (const i of s.ledger) if (i.payout_id === payoutId) i.active = false
      s.writes.push('void')
    },
    async items(payoutId) {
      return s.ledger.filter((i) => i.payout_id === payoutId).map(({ booking_id, part, amount_usd }) => ({ booking_id, part, amount_usd }))
    },
    async stamp(bookingId, part: PayPart, iso, via) {
      if (s.stampFails) throw new Error('db down')
      const d = dispatch.get(bookingId) ?? {}
      const k = PART_STAMP[part]
      if (d[k]) return false
      d[k] = iso
      d[`${k}_via`] = via
      dispatch.set(bookingId, d)
      s.writes.push(`stamp ${k}`)
      return true
    },
    async unstamp(bookingId, part: PayPart, via) {
      const d = dispatch.get(bookingId) ?? {}
      const k = PART_STAMP[part]
      if (d[`${k}_via`] !== via) return
      delete d[k]
      delete d[`${k}_via`]
      s.writes.push(`unstamp ${k}`)
    },
    async findByTransfer(transferId) {
      const p = Array.from(s.payouts.values()).find((x) => x.wise_transfer_id === transferId)
      return p ? { ...p } : null
    },
  }
  return s
}

type Step = 'recipient' | 'quote' | 'requirements' | 'transfer' | 'fund' | 'get' | 'cancel'

export interface FakeWise extends WiseApi {
  calls: string[]
  transfers: Map<number, WiseTransfer & { ctid: string; funded: boolean }>
  quotes: WiseQuoteInput[]
  transferInputs: WiseTransferInput[]
  /** Wise's fee on every quote. */
  fee: number
  /** US dollars in the balance; a quote over it comes back disabled. */
  balance: number
  recipient: WiseRecipient
  requirements: WiseRequirementField[]
  /** Wise's delivery estimate on every quote (an ISO instant), or null when it gives none. */
  estimate: string | null
  /** Queued failures by step: each is used once, in order. */
  fail: Partial<Record<Step, (WiseApiError | 'reject-insufficient' | 'created-unconfirmed' | 'went-through-then-lost' | 'stale-waiting')[]>>
}

export const ambiguous = (what = 'no answer') => new WiseApiError(what, 0, null, true)
export const refused = (code = 'invalid', status = 422) => new WiseApiError(`refused ${code}`, status, code, false)

export function fakeWise(): FakeWise {
  let nextTransfer = 50_000_001
  const w: FakeWise = {
    calls: [],
    transfers: new Map(),
    quotes: [],
    transferInputs: [],
    // A US bank transfer to a US receiving account (Payoneer): Wise's 0.30%, about US$0.44 on a US$147 round trip.
    fee: 0.44,
    balance: 10_000,
    recipient: { id: 900001, currency: 'USD', type: 'aba', active: true, name: 'Collin Example' },
    requirements: [{ key: 'reference', required: false, minLength: null, maxLength: 35, validationRegexp: null, valuesAllowed: null }],
    estimate: null,
    fail: {},
    async getRecipient(accountId) {
      w.calls.push('recipient')
      const f = w.fail.recipient?.shift()
      if (f instanceof WiseApiError) throw f
      return { ...w.recipient, id: accountId }
    },
    async createQuote(input) {
      w.calls.push('quote')
      w.quotes.push(input)
      const f = w.fail.quote?.shift()
      if (f instanceof WiseApiError) throw f
      const disabled = w.balance < input.targetAmount + w.fee
      const payOut = input.payOut ?? 'BANK_TRANSFER'
      return {
        id: randomUUID(),
        status: 'PENDING',
        payOut,
        sourceCurrency: input.currency,
        targetCurrency: input.currency,
        targetAmount: input.targetAmount,
        option: {
          payIn: 'BALANCE',
          payOut,
          disabled,
          disabledReason: disabled ? 'error.payInmethod.disabled' : null,
          feeTotal: w.fee,
          sourceAmount: Math.round((input.targetAmount + w.fee) * 100) / 100,
          targetAmount: input.targetAmount,
          estimatedDelivery: w.estimate,
        },
        expirationTime: null,
      }
    },
    async transferRequirements() {
      w.calls.push('requirements')
      const f = w.fail.requirements?.shift()
      if (f instanceof WiseApiError) throw f
      return w.requirements
    },
    async createTransfer(input) {
      w.calls.push('transfer')
      w.transferInputs.push(input)
      const f = w.fail.transfer?.shift()
      const existing = Array.from(w.transfers.values()).find((t) => t.ctid === input.customerTransactionId)
      if (f === 'went-through-then-lost') {
        if (!existing) {
          const id = nextTransfer++
          w.transfers.set(id, { id, status: 'incoming_payment_waiting', targetAccount: input.targetAccount, quoteUuid: input.quoteUuid, sourceValue: null, targetValue: null, targetCurrency: 'USD', reference: input.reference, ctid: input.customerTransactionId, funded: false })
        }
        throw ambiguous('timed out')
      }
      if (f instanceof WiseApiError) throw f
      if (existing) return { ...existing }
      const id = nextTransfer++
      const q = w.quotes[w.quotes.length - 1]
      const t = { id, status: 'incoming_payment_waiting', targetAccount: input.targetAccount, quoteUuid: input.quoteUuid, sourceValue: null, targetValue: q?.targetAmount ?? null, targetCurrency: 'USD', reference: input.reference, ctid: input.customerTransactionId, funded: false }
      w.transfers.set(id, t)
      return { ...t }
    },
    async fundFromBalance(_profileId, transferId) {
      w.calls.push('fund')
      const t = w.transfers.get(transferId)
      if (!t) throw refused('transfer.not-found', 404)
      const f = w.fail.fund?.shift()
      if (f === 'reject-insufficient') return { status: 'REJECTED', errorCode: 'balance.payment-option-unavailable', errorMessage: 'insufficient funds' }
      if (f === 'went-through-then-lost') { t.funded = true; t.status = 'processing'; throw ambiguous('timed out') }
      if (f === 'created-unconfirmed') return { status: 'CREATED', errorCode: null, errorMessage: null }
      if (f instanceof WiseApiError) throw f
      if (t.funded) return { status: 'REJECTED', errorCode: 'payment.exists', errorMessage: null }
      t.funded = true
      t.status = 'processing'
      return { status: 'COMPLETED', errorCode: null, errorMessage: null }
    },
    async getTransfer(transferId) {
      w.calls.push('get')
      const f = w.fail.get?.shift()
      if (f instanceof WiseApiError) throw f
      const t = w.transfers.get(transferId)
      if (!t) throw refused('transfer.not-found', 404)
      // Wise's read lagging behind a funding that did go through.
      if (f === 'stale-waiting') return { ...t, status: 'incoming_payment_waiting' }
      return { ...t }
    },
    async cancelTransfer(transferId) {
      w.calls.push('cancel')
      const f = w.fail.cancel?.shift()
      if (f instanceof WiseApiError) throw f
      const t = w.transfers.get(transferId)
      if (!t) throw refused('transfer.not-found', 404)
      if (t.funded) throw refused('transfer.cancellation.not.allowed', 409)
      t.status = 'cancelled'
      return { ...t }
    },
  }
  return w
}
