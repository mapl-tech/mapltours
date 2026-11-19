/**
 * Payouts by Wise: the run's database, over Supabase (service role).
 *
 * Tables driver_payouts and driver_payout_items and the function
 * claim_driver_payout are migration 038. Until it is applied every read here
 * fails, and the run stops before anything is sent.
 *
 * The only writes outside those two tables are the dispatch stamps, through
 * merge_dispatch (an atomic jsonb merge, migration 012): `paid_first` /
 * `paid_second` on a ride (what the dispatch console and the driver portal
 * read), `paid_tour` on a tour booking, and `<stamp>_via` beside each (which
 * payout set it, so the webhook can take back only its own stamp). Never a
 * money column, a booking status or Stripe.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { PART_STAMP, type PayPart, type PayoutBooking } from './plan'
import type { ClaimInput, PayoutItem, PayoutPatch, PayoutRow, PayoutStore } from './run'

/** The booking columns the planner reads. refund_state: migration 017. */
export const PAYOUT_BOOKING_SELECT =
  'id, status, booking_type, subtotal, driver_name, dispatch, refund_state, refunded_at, booking_items(trip_type, arrival_at, departure_at, date, item_type)'

/** Paid bookings older than this are not read (a trip is booked at most about a year ahead). */
export const PAYOUT_LOOKBACK_DAYS = 400
/**
 * Reads are paged: PostgREST answers at most 1,000 rows a request whatever
 * `limit` asks for, so a single read could come back short without saying so.
 * A read that reaches this many pages stops the run rather than pay from half
 * a list.
 */
export const PAYOUT_PAGE_SIZE = 1000
export const PAYOUT_MAX_PAGES = 50

export const PAYOUT_COLUMNS =
  'id, payee, recipient_id, amount_usd, status, customer_transaction_id, wise_quote_id, wise_transfer_id, wise_state, wise_state_at, pay_day, error, created_at, funded_at, sent_at, resolved_at'

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

type Page = (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/** Every row, a page at a time, in a stable order; refuses a list it cannot read to the end. */
export async function readAll<T>(page: Page, what: string, size = PAYOUT_PAGE_SIZE, maxPages = PAYOUT_MAX_PAGES): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < maxPages; i++) {
    const rows = must(await page(i * size, i * size + size - 1), what) as T[]
    out.push(...rows)
    if (rows.length < size) return out
  }
  throw new Error(`${what}: the read may be incomplete`)
}

const toRow = (r: Record<string, unknown>): PayoutRow => ({
  ...(r as unknown as PayoutRow),
  recipient_id: Number(r.recipient_id),
  amount_usd: Number(r.amount_usd),
  wise_transfer_id: r.wise_transfer_id == null ? null : Number(r.wise_transfer_id),
})

/** What the webhook needs (app/api/webhooks/wise). */
export interface PayoutEventStore {
  findByTransfer(transferId: number): Promise<PayoutRow | null>
  update(id: string, patch: PayoutPatch): Promise<void>
  voidItems(payoutId: string): Promise<void>
  items(payoutId: string): Promise<PayoutItem[]>
  stamp(bookingId: string, part: PayPart, iso: string, via: string): Promise<boolean>
  unstamp(bookingId: string, part: PayPart, via: string): Promise<void>
}

export function supabasePayoutStore(svc: SupabaseClient, nowMs: number): PayoutStore & PayoutEventStore {
  return {
    async loadBookings() {
      const since = new Date(nowMs - PAYOUT_LOOKBACK_DAYS * 86_400_000).toISOString()
      return readAll<PayoutBooking>(
        (from, to) => svc
          .from('bookings')
          .select(PAYOUT_BOOKING_SELECT)
          .in('booking_type', ['transfer', 'tour'])
          .eq('status', 'paid')
          .gte('paid_at', since)
          .order('id', { ascending: true })
          .range(from, to),
        'bookings',
      )
    },

    async activeItemKeys() {
      const rows = await readAll<{ booking_id: string; part: string }>(
        (from, to) => svc.from('driver_payout_items').select('booking_id, part').eq('active', true).order('id', { ascending: true }).range(from, to),
        'driver_payout_items',
      )
      return new Set(rows.map((r) => `${r.booking_id}:${r.part}`))
    },

    async openPayouts() {
      const rows = must(
        await svc
          .from('driver_payouts')
          .select(PAYOUT_COLUMNS)
          .or('status.in.(claimed,created),and(status.in.(needs_review,returned),resolved_at.is.null)')
          .order('created_at', { ascending: true }),
        'driver_payouts',
      ) as Record<string, unknown>[]
      return rows.map(toRow)
    },

    async claim(input: ClaimInput) {
      const { data, error } = await svc.rpc('claim_driver_payout', {
        p_payee: input.payee,
        p_recipient: input.recipientId,
        p_amount: input.amountUsd,
        p_pay_day: input.payDay,
        p_ctid: input.customerTransactionId,
        p_items: input.items,
      })
      if (error) throw new Error(`claim_driver_payout: ${error.message}`)
      return (data as string | null) ?? null
    },

    async update(id, patch) {
      must(await svc.from('driver_payouts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id), 'driver_payouts update')
    },

    async voidItems(payoutId) {
      must(await svc.from('driver_payout_items').update({ active: false }).eq('payout_id', payoutId), 'driver_payout_items void')
    },

    async items(payoutId) {
      const rows = must(
        await svc.from('driver_payout_items').select('booking_id, part, amount_usd').eq('payout_id', payoutId),
        'driver_payout_items',
      ) as { booking_id: string; part: PayPart; amount_usd: number | string }[]
      return rows.map((r) => ({ booking_id: r.booking_id, part: r.part, amount_usd: Number(r.amount_usd) }))
    },

    async stamp(bookingId, part, iso, via) {
      const k = PART_STAMP[part]
      const { data, error } = await svc.rpc('merge_dispatch', {
        p_booking_id: bookingId,
        p_patch: { [k]: iso, [`${k}_via`]: via },
        p_only_if_absent: k,
      })
      if (error) throw new Error(`merge_dispatch: ${error.message}`)
      return Array.isArray(data) && data.length > 0
    },

    async unstamp(bookingId, part, via) {
      const k = PART_STAMP[part]
      const row = must(await svc.from('bookings').select('dispatch').eq('id', bookingId).maybeSingle(), 'bookings dispatch') as
        | { dispatch: Record<string, unknown> | null }
        | null
      if (!row || (row.dispatch ?? {})[`${k}_via`] !== via) return // somebody else's stamp: left alone
      const { error } = await svc.rpc('merge_dispatch', { p_booking_id: bookingId, p_remove: [k, `${k}_via`] })
      if (error) throw new Error(`merge_dispatch: ${error.message}`)
    },

    async findByTransfer(transferId) {
      const row = must(
        await svc.from('driver_payouts').select(PAYOUT_COLUMNS).eq('wise_transfer_id', transferId).maybeSingle(),
        'driver_payouts',
      ) as Record<string, unknown> | null
      return row ? toRow(row) : null
    },
  }
}
