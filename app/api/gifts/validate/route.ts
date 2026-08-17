import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeGiftCode, applyGiftCard, classifyGiftBackendError, giftBackendMessage } from '@/lib/gift-cards'
import { rateLimit, getIp } from '@/lib/rate-limit'

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
 */

// One message for every unusable code, whatever the reason. Distinguishing
// "no such code" from "that code exists but is spent" hands an enumerator a
// hit-detector, which is exactly what this endpoint must not be.
const UNUSABLE = 'That code is not valid for this booking. Check it and try again, or contact us.'

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
  const { data, error } = await supabase
    .from('gift_cards')
    .select('code, status, balance, currency, expires_at')
    .eq('code', code)
    .maybeSingle()

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
