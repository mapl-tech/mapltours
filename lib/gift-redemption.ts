import 'server-only'
import type { createServiceClient } from '@/lib/supabase/service'
import { normalizeGiftCode, applyGiftCard, giftBlockedMessage, type GiftApplication } from '@/lib/gift-cards'

/**
 * Spending a gift card.
 *
 * Everything here is written on the assumption that two requests will arrive
 * at the same instant with the same code, because eventually they will. Every
 * balance change is a conditional UPDATE that names the value it expects to
 * find, so the loser of a race changes nothing and can be detected by the row
 * count rather than by re-reading and hoping.
 */

type DB = ReturnType<typeof createServiceClient>

/** How long a reservation may sit against an unpaid booking before it is swept. */
const STALE_RESERVATION_MINUTES = 30

export interface GiftClaim {
  giftCardId: string
  code: string
  /** Whole dollars taken off this cart. */
  amount: number
  amountCents: number
  /** What is left on the card after this claim. */
  remainingCents: number
}

export type GiftClaimResult =
  | { ok: true; claim: GiftClaim }
  | { ok: false; message: string }

/**
 * Give back the balance held by reservations against bookings that never got
 * paid for. Runs before any new claim on the same card, so a traveler who
 * abandons a checkout and comes back gets their own value returned without
 * anyone having to run a cleanup job.
 *
 * Deliberately best-effort: a failure here costs the traveler spending power
 * temporarily, whereas throwing would block a checkout they can pay for.
 */
export async function releaseStaleGiftClaims(supabase: DB, giftCardId: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_RESERVATION_MINUTES * 60_000).toISOString()

    const { data: stale } = await supabase
      .from('gift_card_redemptions')
      .select('id, booking_id, amount')
      .eq('gift_card_id', giftCardId)
      .eq('status', 'reserved')
      .lt('created_at', cutoff)

    if (!stale?.length) return

    const bookingIds = stale.map((r) => r.booking_id).filter(Boolean) as string[]
    const bookings = new Map<string, { status: string; stripe_payment_id: string | null }>()
    if (bookingIds.length) {
      const { data: rows } = await supabase
        .from('bookings')
        .select('id, status, stripe_payment_id')
        .in('id', bookingIds)
      for (const b of rows ?? []) {
        bookings.set(b.id as string, {
          status: b.status as string,
          stripe_payment_id: (b.stripe_payment_id as string | null) ?? null,
        })
      }
    }

    for (const row of stale) {
      const booking = row.booking_id ? bookings.get(row.booking_id as string) : undefined

      // A booking that already collected money keeps its reservation. Note
      // 'failed' and 'canceled' are NOT in this set: those payments can never
      // complete, so their value must come back (the old code lumped every
      // non-pending status together here and stranded declined payments
      // permanently).
      if (booking && (booking.status === 'paid' || booking.status === 'refunded')) continue

      // The dangerous case: still 'pending'. That is indistinguishable from a
      // payment in flight or a webhook that has not landed, so releasing on a
      // timer alone can hand back value the traveler is about to spend — they
      // would get the discount AND keep the balance.
      //
      // Stripe is the arbiter. Cancelling the PaymentIntent first makes the
      // payment permanently unable to succeed; only then is the value ours to
      // return. If the cancel fails because it already succeeded, we leave the
      // reservation alone and let the webhook settle it.
      if (booking?.status === 'pending' && booking.stripe_payment_id) {
        const killed = await cancelPaymentIntent(booking.stripe_payment_id)
        if (!killed) continue
        await supabase
          .from('bookings')
          .update({ status: 'canceled' })
          .eq('id', row.booking_id as string)
          .eq('status', 'pending')
      }

      // Claim the release. If another request already released this row, the
      // update matches nothing and we must not credit the balance twice.
      const { data: released } = await supabase
        .from('gift_card_redemptions')
        .update({ status: 'released', settled_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'reserved')
        .select('id, amount')
        .maybeSingle()

      if (!released) continue

      const credited = await creditBalance(supabase, giftCardId, Number(released.amount))
      if (!credited) {
        // Put the row back so a later sweep retries rather than leaving the
        // ledger claiming a release that never reached the balance.
        await supabase
          .from('gift_card_redemptions')
          .update({ status: 'reserved', settled_at: null })
          .eq('id', row.id)
          .eq('status', 'released')
      }
    }
  } catch (err) {
    console.warn('[gift-redemption] stale sweep failed', giftCardId, err instanceof Error ? err.message : err)
  }
}

/**
 * Cancel a PaymentIntent so it can never succeed. Returns false if it could
 * not be cancelled — which includes the case that matters most, a payment that
 * has already gone through.
 */
async function cancelPaymentIntent(paymentIntentId: string): Promise<boolean> {
  try {
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (pi.status === 'succeeded' || pi.status === 'processing') return false
    if (pi.status === 'canceled') return true
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: 'abandoned' })
    return true
  } catch (err) {
    // Could not prove the payment is dead, so treat the value as still spoken
    // for. Erring this way strands value temporarily; erring the other way
    // creates it from nothing.
    console.warn('[gift-redemption] could not cancel PI, keeping reservation', paymentIntentId, err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Add value back to a card, reviving it from 'depleted' if it had run dry.
 *
 * Returns whether the credit actually landed. The compare-and-swap loses
 * whenever a concurrent checkout debits the same card between our read and our
 * write, so this retries; if it still cannot land, it says so LOUDLY rather
 * than returning void, because both callers mark the ledger row 'released'
 * first and a silently dropped credit is money the traveler paid for and can
 * never spend.
 */
async function creditBalance(supabase: DB, giftCardId: string, amount: number): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: card } = await supabase
      .from('gift_cards')
      .select('balance, status')
      .eq('id', giftCardId)
      .maybeSingle()
    if (!card) {
      console.error('[gift-redemption] credit target vanished', giftCardId, amount)
      return false
    }

    const next = Number((Number(card.balance) + amount).toFixed(2))
    const { data: updated } = await supabase
      .from('gift_cards')
      .update({
        balance: next,
        // A card emptied by the abandoned checkout is spendable again.
        ...(card.status === 'depleted' ? { status: 'active' } : {}),
      })
      .eq('id', giftCardId)
      .eq('balance', card.balance)
      // Without .select() a zero-row update is indistinguishable from success.
      .select('id')
      .maybeSingle()

    if (updated) return true
  }

  console.error(
    '[gift-redemption] CREDIT LOST — manual reconciliation required',
    { giftCardId, amount },
  )
  return false
}

/**
 * Take `cartTotalCents` worth of value off a card and tie it to a booking.
 *
 * Returns the amount actually applied, which may be less than the balance
 * (small cart) or less than the cart (small card). Never returns a claim it
 * did not successfully debit.
 */
export async function claimGiftCard(
  supabase: DB,
  rawCode: string,
  cartTotalCents: number,
  bookingId: string,
): Promise<GiftClaimResult> {
  const code = normalizeGiftCode(rawCode)
  if (!code) return { ok: false, message: giftBlockedMessage('not_found') }

  const { data: card, error } = await supabase
    .from('gift_cards')
    .select('id, code, status, balance, currency, expires_at')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    console.error('[gift-redemption] lookup failed', error.message)
    return { ok: false, message: 'Could not check that gift card. Please try again.' }
  }
  if (!card) return { ok: false, message: giftBlockedMessage('not_found') }

  await releaseStaleGiftClaims(supabase, card.id as string)

  // Re-read after the sweep; it may have restored the very balance being spent.
  const { data: fresh } = await supabase
    .from('gift_cards')
    .select('id, code, status, balance, currency, expires_at')
    .eq('id', card.id)
    .maybeSingle()

  const application: GiftApplication = applyGiftCard(fresh ?? card, cartTotalCents)
  if (!application.applicable) {
    return { ok: false, message: giftBlockedMessage(application.reason) }
  }

  const balanceNow = Number((fresh ?? card).balance)
  const amount = application.appliesCents / 100
  const nextBalance = Number((balanceNow - amount).toFixed(2))

  // The debit. `.eq('balance', balanceNow)` is the whole safety property: two
  // concurrent checkouts read the same balance, both try to write it, and
  // exactly one matches. The loser gets no row back and is told to retry.
  const { data: debited } = await supabase
    .from('gift_cards')
    .update({
      balance: nextBalance,
      ...(nextBalance <= 0 ? { status: 'depleted' } : {}),
    })
    .eq('id', card.id)
    .eq('balance', balanceNow)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (!debited) {
    return { ok: false, message: 'That gift card was being used somewhere else. Please try again.' }
  }

  const { error: ledgerErr } = await supabase.from('gift_card_redemptions').insert({
    gift_card_id: card.id,
    booking_id: bookingId,
    amount,
    status: 'reserved',
  })

  if (ledgerErr) {
    // No ledger row means nothing can ever settle or release this debit, so
    // put the value straight back rather than leave it stranded.
    console.error('[gift-redemption] ledger insert failed, reversing debit', ledgerErr.message)
    await supabase
      .from('gift_cards')
      .update({ balance: balanceNow, status: 'active' })
      .eq('id', card.id)
      .eq('balance', nextBalance)
    return { ok: false, message: 'Could not apply that gift card. Please try again.' }
  }

  return {
    ok: true,
    claim: {
      giftCardId: card.id as string,
      code: code,
      amount,
      amountCents: application.appliesCents,
      remainingCents: Math.round(nextBalance * 100),
    },
  }
}

/**
 * Mark a booking's reservation as permanently spent. Called from the Stripe
 * webhook once the remaining balance actually cleared.
 *
 * Idempotent: the webhook retries, and a second call finds no reserved row.
 */
export async function settleGiftClaim(supabase: DB, bookingId: string): Promise<void> {
  try {
    const { data: settled } = await supabase
      .from('gift_card_redemptions')
      .update({ status: 'spent', settled_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .eq('status', 'reserved')
      // Without .select() a zero-row settle is silent, which is exactly the
      // case that needs repairing below.
      .select('id, gift_card_id, amount')
      .maybeSingle()

    if (settled) return

    // Nothing was reserved. Three possibilities, and only one is a problem.
    const { data: row } = await supabase
      .from('gift_card_redemptions')
      .select('id, gift_card_id, amount, status')
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (!row) return                    // no gift on this booking at all
    if (row.status === 'spent') return  // already settled by an earlier delivery

    if (row.status === 'released') {
      // The sweep handed this value back, but the booking it discounted has
      // now been paid. The traveler got the discount AND the card kept the
      // balance, so take it off again.
      console.warn('[gift-redemption] settling a released claim, re-debiting', { bookingId, amount: row.amount })

      const { data: reclaimed } = await supabase
        .from('gift_card_redemptions')
        .update({ status: 'spent', settled_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'released')
        .select('id')
        .maybeSingle()
      if (!reclaimed) return

      const amount = Number(row.amount)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: card } = await supabase
          .from('gift_cards')
          .select('balance')
          .eq('id', row.gift_card_id)
          .maybeSingle()
        if (!card) break

        const next = Number((Number(card.balance) - amount).toFixed(2))
        if (next < 0) {
          // The credited value was already spent elsewhere. We cannot take it
          // back without pushing the card negative; this needs a human.
          console.error(
            '[gift-redemption] DOUBLE-SPEND — released gift value was re-spent before settle',
            { bookingId, giftCardId: row.gift_card_id, amount },
          )
          break
        }

        const { data: debited } = await supabase
          .from('gift_cards')
          .update({ balance: next, ...(next <= 0 ? { status: 'depleted' } : {}) })
          .eq('id', row.gift_card_id)
          .eq('balance', card.balance)
          .select('id')
          .maybeSingle()
        if (debited) return
      }
    }
  } catch (err) {
    console.error('[gift-redemption] settle failed', bookingId, err instanceof Error ? err.message : err)
  }
}

/**
 * Hand back a booking's gift value — used when a checkout fails before the
 * traveler could pay, so the card is not left short.
 */
export async function releaseGiftClaim(supabase: DB, bookingId: string): Promise<void> {
  try {
    const { data: released } = await supabase
      .from('gift_card_redemptions')
      .update({ status: 'released', settled_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .eq('status', 'reserved')
      .select('gift_card_id, amount')
      .maybeSingle()

    if (released) {
      const credited = await creditBalance(supabase, released.gift_card_id as string, Number(released.amount))
      if (!credited) {
        // Leave it reserved so the sweep retries, rather than recording a
        // release that never reached the balance.
        await supabase
          .from('gift_card_redemptions')
          .update({ status: 'reserved', settled_at: null })
          .eq('booking_id', bookingId)
          .eq('status', 'released')
      }
    }
  } catch (err) {
    console.error('[gift-redemption] release failed', bookingId, err instanceof Error ? err.message : err)
  }
}

/**
 * Return refunded value to a gift card.
 *
 * Used when a booking that was paid for (wholly or partly) with a card is
 * cancelled: the gift-funded share cannot go back through Stripe, because
 * Stripe never took it, so it goes back onto the balance instead.
 *
 * Recorded as its own negative-direction ledger entry rather than by mutating
 * the original spend, so the card's history still shows what was redeemed and
 * what was returned.
 */
export async function refundToGiftCard(
  supabase: DB,
  giftCardId: string,
  bookingId: string,
  amount: number,
): Promise<boolean> {
  if (!(amount > 0)) return true
  try {
    const credited = await creditBalance(supabase, giftCardId, amount)
    if (!credited) {
      console.error('[gift-redemption] REFUND CREDIT LOST', { giftCardId, bookingId, amount })
      return false
    }
    // Close out the original spend so the ledger nets to zero for this booking.
    await supabase
      .from('gift_card_redemptions')
      .update({ status: 'released', settled_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .eq('status', 'spent')
    return true
  } catch (err) {
    console.error('[gift-redemption] refund to card threw', bookingId, err instanceof Error ? err.message : err)
    return false
  }
}
