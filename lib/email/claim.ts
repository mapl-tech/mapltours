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
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bookings')
    .update({ [column]: new Date().toISOString() })
    .eq('id', bookingId)
    .is(column, null)
    .select('id')
  if (error) {
    console.error('[email-claim] claim failed', { bookingId, column, error: error.message })
    return false
  }
  return (data?.length ?? 0) > 0
}

/** Hand the channel back after a failed send, so a retry can try again. */
export async function releaseEmailChannel(
  supabase: ServiceClient,
  bookingId: string,
  column: string,
): Promise<void> {
  await supabase.from('bookings').update({ [column]: null }).eq('id', bookingId)
}
