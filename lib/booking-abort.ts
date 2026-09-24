import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { releaseGiftClaim } from '@/lib/gift-redemption'

/**
 * Abort a pending booking whose line items could not be (re)written.
 *
 * The reuse path in the transfers checkout refreshes a pending row's items
 * when the same cart is re-POSTed. When that write fails, the fresh-row
 * compensation (delete the row) was skipped for reused rows, which left a
 * row status='pending' with zero booking_items and its previously attached
 * PaymentIntent still live and payable — money could then be captured for a
 * transfer with no legs, no pickup timestamp, and no flight, dispatched to
 * nobody (audit 2026-08-22). This helper makes the reused row die the same
 * death as a fresh one, but with the guards its sibling paths carry:
 *
 *   1. Prove the attached intent is dead (same shape as gift-redemption's
 *      cancelPaymentIntent): a settling intent (processing / succeeded /
 *      requires_capture) means money may be moving, and deleting the row
 *      then would orphan a captured payment — keep the row and let its
 *      webhook settle it. Could-not-retrieve fails closed the same way.
 *   2. CAS-claim the row out of 'pending' on the intent that was READ, like
 *      the supersede flip and the stale-claim sweep: zero rows means a
 *      concurrent request owns the row (it may have attached a fresh,
 *      payable intent) — leave it alone.
 *   3. Hand any reserved gift value back BEFORE the delete: the redemptions
 *      FK is ON DELETE SET NULL, so releasing after the row is gone matches
 *      nothing and the guest's balance sits stranded until the stale sweep.
 *   4. Delete the claimed row so the guest's re-POST builds a coherent
 *      fresh one on the pending unique index.
 *
 * Returns 'aborted' when the row was claimed and removed, 'kept' when it was
 * left for its owner (settling intent, concurrent claimant, or an errored
 * write — money code never deletes on a read it could not prove).
 */

/** The slice of Stripe this module needs; injected so the wiring is testable. */
export interface IntentControls {
  retrieve(id: string): Promise<{ status: string }>
  cancel(id: string, params?: { cancellation_reason?: 'abandoned' | 'duplicate' }): Promise<unknown>
}

export type AbortOutcome = 'aborted' | 'kept'

export async function abortPendingBooking(
  supabase: SupabaseClient,
  intents: IntentControls,
  bookingId: string,
  attachedPaymentId: string | null,
  releaseGift: (id: string) => Promise<void> = (id) => releaseGiftClaim(supabase, id),
): Promise<AbortOutcome> {
  try {
    if (attachedPaymentId) {
      const dead = await proveIntentDead(intents, attachedPaymentId)
      if (!dead) {
        console.warn('[booking-abort] intent not provably dead, keeping row', {
          booking: bookingId,
          pi: attachedPaymentId,
        })
        return 'kept'
      }
    }

    // CAS on the intent state that was READ, sibling of the supersede flip
    // and the stale-sweep claim. The hop through 'canceled' (rather than a
    // direct guarded DELETE) exists so the gift release below still finds
    // the redemption row by booking_id — the FK nulls it on delete.
    const flipQ = supabase
      .from('bookings')
      .update({ status: 'canceled' })
      .eq('id', bookingId)
      .in('status', ['pending', 'failed'])
    const { data: claimed, error: flipErr } = await (attachedPaymentId
      ? flipQ.eq('stripe_payment_id', attachedPaymentId)
      : flipQ.is('stripe_payment_id', null)
    )
      .select('id')
      .maybeSingle()
    if (flipErr || !claimed) {
      console.warn('[booking-abort] row moved or flip failed, leaving it to its owner', {
        booking: bookingId,
        error: flipErr?.message,
      })
      return 'kept'
    }

    // The row is ours and its intent is dead: nothing backs a reserved gift
    // claim any more, and the guest's immediate re-POST needs the balance.
    await releaseGift(bookingId)

    const { error: delErr } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId)
      .eq('status', 'canceled')
    if (delErr) {
      // The row stays 'canceled': off the pending index, intent dead, gift
      // released — coherent, just not tidy.
      console.warn('[booking-abort] delete of claimed row failed', { booking: bookingId, error: delErr.message })
    }
    return 'aborted'
  } catch (err) {
    console.warn('[booking-abort] failed, keeping row', {
      booking: bookingId,
      error: err instanceof Error ? err.message : err,
    })
    return 'kept'
  }
}

/**
 * Same principle as gift-redemption's cancelPaymentIntent: true only when
 * the payment can never succeed. "Could not prove the payment is dead, so
 * treat the value as still spoken for."
 */
async function proveIntentDead(intents: IntentControls, paymentIntentId: string): Promise<boolean> {
  try {
    const pi = await intents.retrieve(paymentIntentId)
    if (pi.status === 'succeeded' || pi.status === 'processing' || pi.status === 'requires_capture') {
      return false
    }
    if (pi.status === 'canceled') return true
    await intents.cancel(paymentIntentId, { cancellation_reason: 'abandoned' })
    return true
  } catch (err) {
    console.warn(
      '[booking-abort] could not cancel PI, keeping booking',
      paymentIntentId,
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
