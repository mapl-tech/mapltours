import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import {
  validateGiftAmount, giftAmountMessage, generateGiftCode, giftExpiryFrom,
  classifyGiftBackendError, giftBackendMessage,
} from '@/lib/gift-cards'
import { rateLimit, getIp } from '@/lib/rate-limit'

/**
 * Buy a gift card.
 *
 * Creates the card row as 'pending' with a generated code, then a Stripe
 * PaymentIntent for it. The card only becomes spendable when the webhook
 * confirms payment — see handleGiftPaid in the Stripe webhook. An abandoned
 * checkout therefore leaves an inert pending row, never free credit.
 *
 * The amount is validated SERVER-SIDE from the request and priced here; the
 * client's number is never trusted, exactly as /api/checkout treats a cart.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface Body {
  amount?: number
  recipientName?: string
  recipientEmail?: string
  senderName?: string
  purchaserEmail?: string
  message?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Codes are unique; retry on the vanishingly rare collision. */
async function reserveCode(
  supabase: ReturnType<typeof createServiceClient>,
  attempt = 0,
): Promise<string | null> {
  if (attempt >= 5) return null
  const code = generateGiftCode()
  const { data } = await supabase.from('gift_cards').select('id').eq('code', code).maybeSingle()
  return data ? reserveCode(supabase, attempt + 1) : code
}

export async function POST(req: Request) {
  const ip = getIp(req as never)
  if (rateLimit(ip, { bucket: 'gift-checkout', max: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' }, { status: 429 })
  }

  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const amountCheck = validateGiftAmount(body.amount)
  if (!amountCheck.ok) {
    return NextResponse.json({ error: giftAmountMessage(amountCheck.error) }, { status: 400 })
  }
  const amount = amountCheck.amount

  const recipientEmail = (body.recipientEmail ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json({ error: 'Please enter a valid recipient email address.' }, { status: 400 })
  }
  const purchaserEmail = (body.purchaserEmail ?? '').trim().toLowerCase()
  if (purchaserEmail && !EMAIL_RE.test(purchaserEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email address for yourself.' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const code = await reserveCode(supabase)
  if (!code) {
    console.error('[gift-checkout] could not allocate a unique code')
    return NextResponse.json({ error: 'Could not create the gift card. Please try again.' }, { status: 500 })
  }

  const { data: card, error: insertErr } = await supabase
    .from('gift_cards')
    .insert({
      code,
      initial_amount: amount,
      balance: amount,
      currency: 'USD',
      status: 'pending',
      purchaser_name: (body.senderName ?? '').trim() || null,
      purchaser_email: purchaserEmail || null,
      recipient_name: (body.recipientName ?? '').trim() || null,
      recipient_email: recipientEmail,
      message: (body.message ?? '').trim().slice(0, 500) || null,
      expires_at: giftExpiryFrom().toISOString(),
    })
    .select('id')
    .single()

  if (insertErr || !card) {
    const fault = classifyGiftBackendError(insertErr)
    console.error('[gift-checkout] insert failed', fault, insertErr?.message ?? insertErr)
    // 503 for a deployment that simply has no gift-card storage: it is not the
    // customer's problem and retrying cannot fix it.
    return NextResponse.json(
      { error: giftBackendMessage(fault) },
      { status: fault === 'other' ? 500 : 503 },
    )
  }

  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: amount * 100,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        receipt_email: purchaserEmail || undefined,
        metadata: {
          kind: 'gift_card',
          gift_card_id: card.id,
          recipient_email: recipientEmail,
        },
      },
      // One PaymentIntent per card row, so a double-submit cannot double-charge.
      { idempotencyKey: `gift:${card.id}` },
    )

    await supabase.from('gift_cards').update({ stripe_payment_id: pi.id }).eq('id', card.id)

    return NextResponse.json({ clientSecret: pi.client_secret, giftCardId: card.id, amount })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'stripe_error'
    console.error('[gift-checkout] stripe failed', msg)
    // Leave no half-created card behind.
    await supabase.from('gift_cards').delete().eq('id', card.id).eq('status', 'pending')
    return NextResponse.json({ error: 'Could not reach the payment service. Please try again.' }, { status: 502 })
  }
}
