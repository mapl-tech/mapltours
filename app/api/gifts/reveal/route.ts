import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'
import { activateGiftCard } from '@/lib/gift-activation'
import { rateLimit, getIp } from '@/lib/rate-limit'

/**
 * Show the buyer the code they just paid for.
 *
 * This exists because every other route the code could take out of the system
 * can fail: the recipient's address may be mistyped, the buyer's receipt is
 * only as good as the address they gave, and a webhook can be slow or (in
 * development) absent entirely. Without this, a customer can be charged for a
 * card whose code exists only in a database row nobody can reach.
 *
 * Authorisation is the PaymentIntent itself. The caller must present a
 * PaymentIntent id that (a) Stripe reports as succeeded, and (b) carries this
 * exact gift card in its metadata. Someone who did not complete the payment
 * has no such id, and a PaymentIntent id for a different purchase resolves to
 * a different card. That is the same standard the booking confirmation page
 * uses, applied to a secret that is worth money.
 *
 * It also ACTIVATES the card if the webhook has not arrived yet, so the
 * confirmation screen is never ahead of reality.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const ip = getIp(req as never)
  if (rateLimit(ip, { bucket: 'gift-reveal', max: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' }, { status: 429 })
  }

  let paymentIntentId = ''
  try {
    paymentIntentId = String((await req.json())?.paymentIntentId ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
    return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 })
  }

  let pi: Stripe.PaymentIntent
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch {
    return NextResponse.json({ error: 'We could not find that payment.' }, { status: 404 })
  }

  if (pi.metadata?.kind !== 'gift_card') {
    return NextResponse.json({ error: 'That payment is not a gift card.' }, { status: 400 })
  }
  const giftId = typeof pi.metadata?.gift_card_id === 'string' ? pi.metadata.gift_card_id : null
  if (!giftId) {
    return NextResponse.json({ error: 'That payment is not linked to a gift card.' }, { status: 400 })
  }

  if (pi.status !== 'succeeded') {
    // Not paid for, so there is nothing to reveal. Report the status so the UI
    // can distinguish "still processing" from "it failed".
    return NextResponse.json({ ready: false, status: pi.status })
  }

  // The PaymentIntent id is NOT a secret, and this route hands back a bearer
  // instrument. Stripe appends `payment_intent` to the return URL, so the id
  // sits in /gifts?payment_intent=pi_... and from there it reaches the browser
  // history, any shared link, and Google Analytics and Ads, because gtag's
  // default page_view sends the whole location and nothing overrides
  // page_location. Anyone who can read those reports could replay the id here
  // and walk off with a spendable code plus the recipient's email address.
  //
  // The legitimate buyer arrives within seconds of paying. Nobody else needs
  // this endpoint at all: the card is emailed to the recipient, and the
  // purchaser gets their own copy. So the reveal is bound to a short window
  // after the charge, which removes the permanent exposure without changing
  // anything the real buyer experiences.
  const REVEAL_WINDOW_MIN = 30
  const ageMin = (Date.now() / 1000 - pi.created) / 60
  if (ageMin > REVEAL_WINDOW_MIN) {
    return NextResponse.json(
      {
        error:
          'For security we only show a gift code right after purchase. Check the email we sent, or contact contact@mapltours.com and we will resend it.',
      },
      { status: 410 },
    )
  }

  // Paid. Make sure the card is live even if the webhook has not landed —
  // idempotent, and it also (re)attempts the delivery emails.
  try {
    await activateGiftCard(giftId, pi.id)
  } catch (err) {
    console.error('[gift-reveal] activation failed', giftId, err instanceof Error ? err.message : err)
    // Fall through: the code is still worth showing, and the webhook retries.
  }

  const supabase = createServiceClient()
  const { data: card } = await supabase
    .from('gift_cards')
    .select('code, initial_amount, balance, currency, status, recipient_email, expires_at, delivered_at')
    .eq('id', giftId)
    .maybeSingle()

  if (!card) {
    return NextResponse.json({ error: 'We could not find that gift card.' }, { status: 404 })
  }

  return NextResponse.json({
    ready: true,
    code: card.code,
    amount: Number(card.initial_amount),
    currency: (card.currency ?? 'USD').toUpperCase(),
    recipientEmail: card.recipient_email,
    expiresAt: card.expires_at,
    delivered: !!card.delivered_at,
  })
}
