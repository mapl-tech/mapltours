import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeGiftCode, applyGiftCard, classifyGiftBackendError, giftBackendMessage } from '@/lib/gift-cards'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { releaseStaleGiftClaims, STALE_RESERVATION_MINUTES } from '@/lib/gift-redemption'

/**
 * Check a gift card code and report its balance, so checkout can show the
 * traveler what it is worth before they commit.
 *
 * This endpoint is the one place an attacker could enumerate codes, so it is
 * rate limited hard and never distinguishes "no such code" from "code exists
 * but is not spendable" in a way that would confirm a hit — both return the
 * same shape and a generic message.
 *
 * It reserves nothing. The balance is only actually spent in /api/checkout,
 * under a conditional update, because anything reserved here would need
 * releasing on abandonment and would strand value.
 *
 * It does give value BACK first. A card smaller than the cart is debited in
 * full when the guest taps Pay, and reads 'depleted' from then on. If that
 * payment was never finished (a declined card, a closed tab), the only code
 * that returned the value was the stale sweep inside claimGiftCard, and the
 * checkout page never reached it: it asks this endpoint first, this endpoint
 * read the depleted row and said no, and the page then never sent the code.
 * The card stayed at $0 on a dead booking for good. So the same sweep runs
 * here before the balance is read: it only touches reservations older than
 * STALE_RESERVATION_MINUTES on bookings nobody paid for, and it cancels each
 * booking's PaymentIntent before it returns a cent (lib/gift-redemption).
 */

// One message for every unusable code, whatever the reason. Distinguishing
// "no such code" from "that code exists but is spent" hands an enumerator a
// hit-detector, which is exactly what this endpoint must not be.
// It also says, to everyone alike, when a held card frees up: the one case
// where the code is right and waiting is the fix.
const UNUSABLE = `That code cannot be used right now. Check it and try again. A gift card applied to a checkout that was not finished frees up again ${STALE_RESERVATION_MINUTES} minutes later. Still stuck? Write to contact@mapltours.com.`

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ip = getIp(req as never)
  // Tight: a legitimate traveler types one code, maybe twice.
  if (rateLimit(ip, { bucket: 'gift-validate', max: 8, windowMs: 60_000 })) {
    return NextResponse.json(
      { valid: false, message: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 },
    )
  }

  let raw = ''
  try {
    raw = String((await req.json())?.code ?? '')
  } catch {
    return NextResponse.json({ valid: false, message: 'Invalid request.' }, { status: 400 })
  }

  const code = normalizeGiftCode(raw)
  if (!code) {
    return NextResponse.json({ valid: false, message: UNUSABLE })
  }

  const supabase = createServiceClient()
  const CARD = 'id, code, status, balance, currency, expires_at'
  const first = await supabase
    .from('gift_cards')
    .select(CARD)
    .eq('code', code)
    .maybeSingle()
  const error = first.error
  let data = first.data

  // Value held by a checkout that was never paid for comes back before the
  // card is judged (see the note at the top). Best-effort inside the sweep;
  // the row is read again afterwards because the sweep may have restored the
  // very balance being asked about.
  if (!error && data?.id) {
    await releaseStaleGiftClaims(supabase, data.id as string)
    const again = await supabase.from('gift_cards').select(CARD).eq('id', data.id).maybeSingle()
    if (!again.error && again.data) data = again.data
  }

  if (error) {
    const fault = classifyGiftBackendError(error)
    console.error('[gift-validate] lookup failed', fault, error.message)
    return NextResponse.json(
      { valid: false, message: giftBackendMessage(fault) },
      { status: fault === 'other' ? 500 : 503 },
    )
  }

  // Balance of 0 is passed as the cart total purely to reuse the same rules;
  // the caller only needs to know whether it is spendable and for how much.
  const check = applyGiftCard(data ?? null, Number.MAX_SAFE_INTEGER)
  if (!check.applicable) {
    return NextResponse.json({ valid: false, message: UNUSABLE })
  }

  return NextResponse.json({
    valid: true,
    code,
    balanceCents: check.appliesCents,
    currency: (data?.currency ?? 'USD').toUpperCase(),
    expiresAt: data?.expires_at ?? null,
  })
}
