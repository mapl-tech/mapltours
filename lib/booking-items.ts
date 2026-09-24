import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Atomically replace a booking's line items.
 *
 * The reuse path in both checkout routes refreshes a pending booking's items
 * when the same cart is re-POSTed. Done as two auto-committed statements
 * (DELETE then INSERT), concurrent same-cart requests can interleave and
 * leave doubled or zero item rows under a still-payable PaymentIntent
 * (audit findings, 2026-08-22). Migration 025's replace_booking_items RPC
 * collapses both into one transaction so concurrent replacements serialize.
 *
 * Deploy-ahead-of-migration doctrine (see lib/checkout-schema.ts): if the
 * function does not exist in the live schema yet, degrade to the legacy
 * two-statement path — racy, but exactly as racy as the code being replaced,
 * so shipping this is safe in either order. PostgREST reports the missing
 * function as PGRST202; Postgres itself as 42883.
 */
export async function replaceBookingItems(
  supabase: SupabaseClient,
  bookingId: string,
  rows: Record<string, unknown>[],
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('replace_booking_items', {
    p_booking_id: bookingId,
    p_items: rows,
  })
  if (!error) return { error: null }

  if (error.code === 'PGRST202' || error.code === '42883') {
    console.warn(
      '[booking-items] replace_booking_items RPC missing (migration 025 not applied); using legacy two-statement fallback',
    )
    const del = await supabase.from('booking_items').delete().eq('booking_id', bookingId)
    if (del.error) return { error: del.error.message }
    const ins = await supabase.from('booking_items').insert(rows)
    if (ins.error) return { error: ins.error.message }
    return { error: null }
  }

  return { error: error.message }
}
