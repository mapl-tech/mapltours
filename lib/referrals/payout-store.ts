import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PayoutEventStore } from '@/lib/payouts/store'
import type { PayoutItem, PayoutPatch, PayoutRow } from '@/lib/payouts/run'
import type { PayPart } from '@/lib/payouts/plan'
import { readLedger } from './server'
import type { LedgerRows, ReferralPayoutRow } from './ledger'
import type { ReferralRunStore } from './payout-run'

/**
 * Referral payouts over Supabase (service role, migration 045). The run's
 * store (claims, updates, the late earnings) and the Wise webhook's (the same
 * PayoutEventStore the driver payouts use, so one state machine,
 * lib/payouts/webhook applyTransferState, moves both).
 *
 * A referral payout has no dispatch stamps: its items are the record, so the
 * webhook's stamp and unstamp do nothing here, and money coming back voids
 * the items, which makes those commissions owed again (the referrer is held
 * until a person resolves it on the admin page).
 */

type DB = SupabaseClient

export const FULL_PAYOUT_COLS =
  'id, referrer_id, payee, recipient_id, account_last4, amount_usd, fee_usd, status, customer_transaction_id, wise_quote_id, wise_transfer_id, wise_state, wise_state_at, pay_day, error, created_at, funded_at, sent_at, resolved_at'

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.code ?? res.error.message}`)
  return res.data as T
}

export function supabaseReferralRunStore(svc: DB): ReferralRunStore {
  return {
    loadRows: () => readLedger(svc),

    async openPayouts() {
      return must(
        await svc
          .from('referral_payouts')
          .select(FULL_PAYOUT_COLS)
          .or('status.in.(claimed,created),and(status.in.(needs_review,returned),resolved_at.is.null)')
          .order('created_at', { ascending: true }),
        'referral_payouts',
      ) as unknown as ReferralPayoutRow[]
    },

    async claim(input) {
      const { data, error } = await svc.rpc('claim_referral_payout', {
        p_referrer: input.referrerId,
        p_payee: input.payee,
        p_recipient: input.recipientId,
        p_last4: input.last4,
        p_amount: input.amountUsd,
        p_pay_day: input.payDay,
        p_ctid: input.customerTransactionId,
        p_items: input.items,
      })
      if (error) throw new Error(`claim_referral_payout: ${error.code ?? error.message}`)
      return (data as string | null) ?? null
    },

    async update(id, patch) {
      must(await svc.from('referral_payouts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id), 'referral_payouts update')
    },

    async voidItems(payoutId) {
      must(await svc.from('referral_payout_items').update({ active: false }).eq('payout_id', payoutId), 'referral_payout_items void')
    },

    async recordMissingEarnings(rows: LedgerRows) {
      const codes = new Map(rows.codes.map((c) => [c.code, c]))
      if (!codes.size) return 0
      const percent = new Map(rows.referrers.map((r) => [r.id, r.commission_percent]))
      const known = new Set(rows.earnings.map((e) => e.booking_id))
      const list = Array.from(codes.keys())
      let n = 0
      for (let i = 0; i < list.length; i += 100) {
        const paid = must(
          await svc.from('bookings').select('id, coupon_code').eq('status', 'paid').in('coupon_code', list.slice(i, i + 100)).limit(5000),
          'bookings',
        ) as { id: string; coupon_code: string }[]
        for (const b of paid) {
          if (known.has(b.id)) continue
          const c = codes.get(b.coupon_code)
          if (!c) continue
          const { data, error } = await svc
            .from('referral_earnings')
            .upsert({ booking_id: b.id, referrer_id: c.referrer_id, coupon_id: c.id, code: c.code, commission_percent: percent.get(c.referrer_id) ?? 0, recorded_late: true }, { onConflict: 'booking_id', ignoreDuplicates: true })
            .select('id')
          if (error) throw new Error(`referral_earnings: ${error.code ?? error.message}`)
          if (data && data.length) {
            n++
            known.add(b.id)
            await svc.from('referral_events').insert({ referrer_id: c.referrer_id, kind: 'earning_recorded_late', detail: { booking_id: b.id, code: c.code }, actor: 'payout run' })
          }
        }
      }
      return n
    },
  }
}

const toRow = (r: Record<string, unknown>): PayoutRow => ({
  ...(r as unknown as PayoutRow),
  recipient_id: Number(r.recipient_id),
  amount_usd: Number(r.amount_usd),
  wise_transfer_id: r.wise_transfer_id == null ? null : Number(r.wise_transfer_id),
})

/** What the Wise webhook needs, for a referral payout. */
export function referralEventStore(svc: DB): PayoutEventStore {
  return {
    async findByTransfer(transferId) {
      const res = await svc.from('referral_payouts').select(FULL_PAYOUT_COLS).eq('wise_transfer_id', transferId).maybeSingle()
      // Before migration 045 there is no such table: no referral payout is that transfer. Any other
      // failure throws, so the webhook answers 500 and Wise brings the event back.
      if (res.error && (res.error.code === 'PGRST205' || res.error.code === '42P01')) return null
      const row = must(res, 'referral_payouts') as Record<string, unknown> | null
      return row ? toRow(row) : null
    },
    async update(id, patch: PayoutPatch) {
      must(await svc.from('referral_payouts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id), 'referral_payouts update')
    },
    async voidItems(payoutId) {
      must(await svc.from('referral_payout_items').update({ active: false }).eq('payout_id', payoutId), 'referral_payout_items void')
    },
    async items(payoutId) {
      const rows = must(await svc.from('referral_payout_items').select('booking_id, amount_usd').eq('payout_id', payoutId), 'referral_payout_items') as { booking_id: string; amount_usd: number | string }[]
      // The webhook only passes these back to stamp and unstamp, which do nothing for a referral payout.
      return rows.map((r): PayoutItem => ({ booking_id: r.booking_id, part: 'tour' as PayPart, amount_usd: Number(r.amount_usd) }))
    },
    async stamp() { return true },
    async unstamp() { /* no dispatch stamps on a referral payout */ },
  }
}
