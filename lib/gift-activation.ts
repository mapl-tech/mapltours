import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import { sendGiftCardEmails } from '@/lib/email/gift-card'

/**
 * Turn a paid-for gift card into a spendable one, and deliver it.
 *
 * Two callers, deliberately: the Stripe webhook, and the buyer's own browser
 * landing back on /gifts after payment. Webhooks can be slow, dropped, or (in
 * local development) not configured at all, and a buyer staring at a
 * confirmation screen that cannot show them their code is the worst failure
 * this feature has. Either path activates; whoever gets there first wins.
 *
 * Safe to call repeatedly. The flip is conditional on `status = 'pending'`, so
 * a second call changes nothing, and the delivery email has its own claim on
 * `delivered_at`.
 */
export async function activateGiftCard(
  giftCardId: string,
  paymentIntentId: string,
): Promise<{ activated: boolean; alreadyActive: boolean; delivered: boolean }> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('gift_cards')
    .update({ status: 'active', paid_at: new Date().toISOString(), stripe_payment_id: paymentIntentId })
    .eq('id', giftCardId)
    .eq('status', 'pending')
    .select('id')

  if (error) throw new Error(`gift activation failed: ${error.message}`)

  const alreadyActive = !data?.length

  // Attempt delivery either way: if a previous run activated the card but the
  // email failed, the claim column is still NULL and this retry sends it.
  //
  // The RESULT is now returned rather than dropped. "This retry sends it" was
  // only true if something called this function again, and nothing did: the
  // webhook calls it once and answers Stripe 200, which means the event is
  // never redelivered. A single transient Resend failure therefore lost the
  // delivery permanently, and the recipient of a paid gift card simply never
  // received their code. The caller decides what to do about it; the webhook
  // now fails the event so Stripe retries, exactly as the booking
  // confirmation path already does.
  const email = await sendGiftCardEmails(giftCardId)

  return {
    activated: !alreadyActive,
    alreadyActive,
    delivered: email.recipient !== 'failed',
  }
}
