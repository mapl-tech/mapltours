import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { claimEmailChannel, releaseEmailChannel } from '@/lib/email/claim'
import GiftCardDelivered from '@/emails/GiftCardDelivered'
import GiftCardReceipt from '@/emails/GiftCardReceipt'

/**
 * Deliver a paid gift card.
 *
 * Two emails: the card itself to the recipient, and a receipt to the buyer
 * (which repeats the code, so a mistyped recipient address is recoverable —
 * otherwise the buyer has paid for something neither party can produce).
 *
 * Delivery is claimed on `delivered_at` before sending, the same pattern the
 * booking emails use, because the Stripe webhook retries on failure and a
 * duplicate "here is your gift" email is confusing and looks like fraud.
 *
 * Never throws: the payment has already succeeded by this point, and failing
 * the webhook over an email would have Stripe retry a completed charge.
 */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Row = any

const DELIVERY_CHANNEL = 'delivered_at'
const RECEIPT_CHANNEL = 'receipt_sent_at'

export interface GiftEmailResult {
  recipient: 'sent' | 'skipped' | 'failed'
  purchaser: 'sent' | 'skipped' | 'failed'
}

export async function sendGiftCardEmails(giftCardId: string): Promise<GiftEmailResult> {
  const result: GiftEmailResult = { recipient: 'skipped', purchaser: 'skipped' }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('gift_cards')
      .select('id, code, initial_amount, currency, status, recipient_name, recipient_email, purchaser_name, purchaser_email, message, expires_at, delivered_at, receipt_sent_at')
      .eq('id', giftCardId)
      .maybeSingle()

    if (error || !data) {
      console.error('[gift-email] lookup failed', giftCardId, error?.message)
      return { recipient: 'failed', purchaser: 'failed' }
    }

    const card = data as Row

    // Only ever deliver a card that actually got paid for.
    if (card.status !== 'active') {
      console.warn('[gift-email] refusing to deliver a card that is not active', giftCardId, card.status)
      return { recipient: 'skipped', purchaser: 'skipped' }
    }

    const amount = Number(card.initial_amount ?? 0)
    const currency = (card.currency ?? 'USD').toUpperCase()

    // ── The card, to the recipient ──
    if (card.delivered_at) {
      result.recipient = 'skipped'
    } else if (await claimEmailChannel(supabase, giftCardId, DELIVERY_CHANNEL, 'gift_cards')) {
      const res = await sendEmail({
        to: card.recipient_email,
        subject: card.purchaser_name
          ? `${card.purchaser_name} sent you a MAPL TOURS JAMAICA gift card`
          : 'You have a MAPL TOURS JAMAICA gift card',
        react: GiftCardDelivered({
          code: card.code,
          amount,
          currency,
          recipientName: card.recipient_name,
          senderName: card.purchaser_name,
          message: card.message,
          expiresAt: card.expires_at,
        }),
        tags: [{ name: 'type', value: 'gift-card-delivered' }],
      })
      if (res.ok) {
        result.recipient = 'sent'
      } else {
        await releaseEmailChannel(supabase, giftCardId, DELIVERY_CHANNEL, 'gift_cards')
        result.recipient = 'failed'
      }
    }

    // ── Receipt, to the buyer ──
    // Claimed like the delivery is. Stripe redelivers succeeded events, and
    // without a claim the buyer got a fresh "here is the code" email every
    // time — which reads like a duplicate charge.
    if (!card.purchaser_email || card.receipt_sent_at) {
      result.purchaser = 'skipped'
    } else if (!(await claimEmailChannel(supabase, giftCardId, RECEIPT_CHANNEL, 'gift_cards'))) {
      result.purchaser = 'skipped'
    } else {
      const res = await sendEmail({
        to: card.purchaser_email,
        subject: `Your gift card for ${card.recipient_name ?? card.recipient_email}`,
        react: GiftCardReceipt({
          code: card.code,
          amount,
          currency,
          recipientName: card.recipient_name,
          recipientEmail: card.recipient_email,
          expiresAt: card.expires_at,
        }),
        tags: [{ name: 'type', value: 'gift-card-receipt' }],
      })
      if (res.ok) {
        result.purchaser = 'sent'
      } else {
        await releaseEmailChannel(supabase, giftCardId, RECEIPT_CHANNEL, 'gift_cards')
        result.purchaser = 'failed'
      }
    }

    return result
  } catch (err) {
    console.error('[gift-email] threw', giftCardId, err instanceof Error ? err.message : 'unknown')
    return { recipient: 'failed', purchaser: 'failed' }
  }
}
