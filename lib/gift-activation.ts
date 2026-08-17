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
): Promise<{ activated: boolean; alreadyActive: boolean }> {
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
  await sendGiftCardEmails(giftCardId)

  return { activated: !alreadyActive, alreadyActive }
}
