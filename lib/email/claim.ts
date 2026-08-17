import type { createServiceClient } from '@/lib/supabase/service'

/**
 * Atomically CLAIM one email channel on a booking before sending.
 *
 * `.is(column, null)` is the concurrency gate: of two duplicate deliveries
 * (a retried Stripe webhook, a double-clicked cancel) only one matches a row
 * and proceeds to send. The loser sees zero rows and skips silently.
 *
 * Extracted from the Stripe webhook so the cancellation path reuses the same
 * proven mechanism rather than reimplementing check-then-act, which under
 * concurrency sends twice.
 */

type ServiceClient = ReturnType<typeof createServiceClient>

export async function claimEmailChannel(
  supabase: ServiceClient,
  bookingId: string,
  column: string,
  // Gift cards claim their delivery on gift_cards.delivered_at, not on a
  // booking. This was hardcoded to 'bookings', so the gift claim updated the
  // wrong table with an id that matched nothing, always returned false, and
  // the recipient's card was never emailed.
  table: 'bookings' | 'gift_cards' = 'bookings',
  opts?: { requireStatus?: string },
): Promise<boolean> {
  let q = supabase
    .from(table)
    .update({ [column]: new Date().toISOString() })
    .eq('id', bookingId)
    .is(column, null)
  // The paid path must never claim a channel for a booking that stopped
  // being paid between its read and this write (a refund racing the
  // handler, caught by adversarial review). The cancellation path runs
  // against non-paid rows, so the guard is opt-in.
  if (opts?.requireStatus) q = q.eq('status', opts.requireStatus)
  const { data, error } = await q.select('id')
  if (error) {
    console.error('[email-claim] claim failed', { table, bookingId, column, error: error.message })
    return false
  }
  return (data?.length ?? 0) > 0
}

/** Hand the channel back after a failed send, so a retry can try again. */
export async function releaseEmailChannel(
  supabase: ServiceClient,
  bookingId: string,
  column: string,
  table: 'bookings' | 'gift_cards' = 'bookings',
): Promise<void> {
  await supabase.from(table).update({ [column]: null }).eq('id', bookingId)
}
