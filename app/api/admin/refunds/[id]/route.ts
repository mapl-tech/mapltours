import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendCancellationEmails, sendRefundDeclinedEmail } from '@/lib/email/cancellation'
import { refundToGiftCard } from '@/lib/gift-redemption'

/**
 * Admin decision on a pending cancellation request.
 *
 *   POST { action: 'approve' }                  refund via Stripe, cancel the trip
 *   POST { action: 'decline', reason?: string } refuse, booking stays live
 *
 * This is the ONLY route that moves money. The traveler-facing cancel route
 * merely lodges a request.
 *
 * SAFETY: verifies the caller is an admin (session -> admins allowlist)
 * before touching the service-role client, matching /api/admin/dispatch.
 *
 * The amount paid out is the figure QUOTED AT REQUEST TIME and stored on the
 * row. It is not recomputed here: by the time an admin looks, the 48-hour
 * window has often closed, and re-quoting would zero out a request that was
 * perfectly valid when the traveler made it.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

interface PendingRow {
  id: string
  status: string
  refund_state: string | null
  stripe_payment_id: string | null
  total_paid: number | string
  gift_card_id: string | null
  gift_card_amount: number | string | null
  refund_quoted_cash: number | string | null
  refund_quoted_gift: number | string | null
  refund_quoted_amount: number | string | null
  refund_quoted_admin_charge: number | string | null
  currency: string | null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // 1) Auth: must be a signed-in admin.
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: adminRow } = await svc
    .from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 2) Parse the decision.
  let body: { action?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const action = body.action
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json({ error: 'action must be approve or decline' }, { status: 400 })
  }

  // 3) Load the pending request.
  const { data, error } = await svc
    .from('bookings')
    .select('id, status, refund_state, stripe_payment_id, total_paid, gift_card_id, gift_card_amount, refund_quoted_amount, refund_quoted_admin_charge, refund_quoted_cash, refund_quoted_gift, currency')
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const booking = data as unknown as PendingRow
  if (booking.refund_state !== 'requested') {
    return NextResponse.json(
      { error: 'not_pending', message: `This booking is not awaiting a decision (state: ${booking.refund_state ?? 'none'}).` },
      { status: 409 },
    )
  }

  const decidedAt = new Date().toISOString()

  // ── Decline: no money moves, the trip stays live. ──
  if (action === 'decline') {
    const { data: declined, error: declineErr } = await svc
      .from('bookings')
      .update({
        refund_state: 'declined',
        refund_decided_at: decidedAt,
        refund_decided_by: user.id,
        refund_decline_reason: (body.reason ?? '').slice(0, 500) || null,
      })
      .eq('id', booking.id)
      .eq('refund_state', 'requested')
      .select('id')
    if (declineErr || !declined?.length) {
      return NextResponse.json({ error: 'decline_failed' }, { status: 500 })
    }
    const emails = await sendRefundDeclinedEmail(booking.id, body.reason ?? null)
    return NextResponse.json({ ok: true, state: 'declined', emails })
  }

  // ── Approve: refund the stored quote. ──
  const quotedAmount = Number(booking.refund_quoted_amount)
  if (!Number.isFinite(quotedAmount) || quotedAmount <= 0) {
    return NextResponse.json(
      { error: 'no_quote', message: 'This request has no stored refund amount. Refund manually in Stripe.' },
      { status: 409 },
    )
  }
  const refundCents = Math.round(quotedAmount * 100)

  // A refund has two halves: cash back through Stripe, and gift-card value
  // back onto the card. The stored split is authoritative; older rows quoted
  // before gift cards existed fall back to "all cash", which is what they were.
  const giftRefundCents = Math.round(Number(booking.refund_quoted_gift ?? 0) * 100)
  const cashRefundCents = booking.refund_quoted_cash != null
    ? Math.round(Number(booking.refund_quoted_cash) * 100)
    : refundCents - (Number.isFinite(giftRefundCents) ? giftRefundCents : 0)

  // The cap is what Stripe actually CAPTURED, not the cart total. total_paid
  // includes any gift-funded portion that never touched a payment card, so
  // capping on it would let us ask Stripe for more than it took.
  const grossCents = Math.round(Number(booking.total_paid) * 100)
  const giftFundedCents = Math.round(Number(booking.gift_card_amount ?? 0) * 100)
  const storedCapturedCents = Math.max(0, grossCents - (Number.isFinite(giftFundedCents) ? giftFundedCents : 0))

  // Ask STRIPE what is still refundable rather than trusting stored columns.
  // A goodwill refund issued by hand in the Dashboard never reduces any
  // column here, so capping on stored values alone let the full policy
  // refund go out on top of it and paid out more than was ever captured.
  let refundableCents = storedCapturedCents
  if (booking.stripe_payment_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_id, { expand: ['latest_charge'] })
      const charge = pi.latest_charge as Stripe.Charge | null
      if (charge && typeof charge === 'object') {
        refundableCents = Math.max(0, (charge.amount_captured ?? 0) - (charge.amount_refunded ?? 0))
      }
    } catch (err) {
      // Cannot prove what is refundable, so refuse rather than guess: an
      // over-refund is unrecoverable, a retry is free.
      console.error('[admin-refund] could not read live charge state', booking.id, err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'charge_state_unavailable', message: 'Could not confirm the refundable amount with Stripe. Try again.' },
        { status: 503 },
      )
    }
  }

  if (cashRefundCents > Math.min(storedCapturedCents, refundableCents)) {
    return NextResponse.json(
      {
        error: 'quote_exceeds_payment',
        message: `Only ${(Math.min(storedCapturedCents, refundableCents) / 100).toFixed(2)} is still refundable on this charge (a manual refund may already have been issued).`,
      },
      { status: 409 },
    )
  }

  // Only a refund that owes cash needs a PaymentIntent. A booking paid for
  // entirely with a gift card legitimately has none.
  if (cashRefundCents > 0 && !booking.stripe_payment_id) {
    return NextResponse.json({ error: 'no_payment_reference' }, { status: 409 })
  }

  // CLAIM before calling Stripe, same pattern as the rest of the money code:
  // two admins clicking approve at once must not refund twice.
  const { data: claimed, error: claimErr } = await svc
    .from('bookings')
    .update({
      status: 'refunded',
      refund_state: 'approved',
      refund_decided_at: decidedAt,
      refund_decided_by: user.id,
      refunded_at: decidedAt,
      refund_amount: refundCents / 100,
      admin_charge: Math.max(0, grossCents - refundCents) / 100,
    })
    .eq('id', booking.id)
    .eq('refund_state', 'requested')
    .select('id')

  if (claimErr) {
    console.error('[admin-refund] claim failed', booking.id, claimErr.message)
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 })
  }
  if (!claimed?.length) {
    return NextResponse.json({ error: 'already_decided' }, { status: 409 })
  }

  try {
    let refundId: string | null = null
    if (cashRefundCents > 0) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: booking.stripe_payment_id!,
          amount: cashRefundCents,
          reason: 'requested_by_customer',
          metadata: {
            booking_id: booking.id,
            approved_by: user.id,
            policy: 'flexible-48h-of-booking-less-20pct',
          },
        },
        { idempotencyKey: `refund:${booking.id}` },
      )
      refundId = refund.id
    }

    // Put the gift-funded share back on the card. Done AFTER Stripe so a
    // failed cash refund releases the claim without having already credited.
    if (giftRefundCents > 0 && booking.gift_card_id) {
      const credited = await refundToGiftCard(svc, booking.gift_card_id as string, booking.id, giftRefundCents / 100)
      if (!credited) {
        // The cash half already left Stripe, so the booking stays refunded —
        // rolling back here would strand a refunded charge as 'paid'. But the
        // traveler is owed store credit that never landed, and reporting
        // success would bury that forever. refundToGiftCard leaves the
        // redemption row at 'spent', which IS the durable marker that credit
        // is still owed; surface it loudly so ops credits by hand.
        console.error('[admin-refund] CRITICAL: gift credit failed after cash refund', {
          booking: booking.id, gift_card: booking.gift_card_id, owed: giftRefundCents / 100,
        })
        await sendCancellationEmails(booking.id, { source: 'self-serve' })
        return NextResponse.json(
          {
            error: 'gift_credit_failed',
            message: `Cash refund of $${(cashRefundCents / 100).toFixed(2)} succeeded, but $${(giftRefundCents / 100).toFixed(2)} of gift-card credit did NOT land. Credit it manually on card ${booking.gift_card_id}.`,
            cashRefunded: true,
            refundId,
            giftCreditOwedCents: giftRefundCents,
          },
          { status: 500 },
        )
      }
    }

    const emails = await sendCancellationEmails(booking.id, { source: 'self-serve' })
    return NextResponse.json({
      ok: true,
      state: 'approved',
      refundId,
      refundCents,
      cashRefundCents,
      giftRefundCents,
      currency: booking.currency ?? 'usd',
      emails,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'refund_failed'

    // Before releasing, PROVE the refund did not happen. A network timeout or
    // a lost response looks identical to a refusal here, and releasing on the
    // ambiguous case resurrected the booking to 'paid' while the money had
    // already gone: MAPL pays the refund AND still delivers the trip.
    if (booking.stripe_payment_id) {
      try {
        const existing = await stripe.refunds.list({ payment_intent: booking.stripe_payment_id, limit: 10 })
        const landed = existing.data.some(
          (r) => r.status !== 'failed' && r.status !== 'canceled' && r.metadata?.booking_id === booking.id,
        )
        if (landed) {
          console.error('[admin-refund] stripe threw but the refund EXISTS — keeping booking refunded', booking.id, msg)
          await sendCancellationEmails(booking.id, { source: 'self-serve' })
          return NextResponse.json(
            {
              error: 'refund_uncertain_but_landed',
              message: 'Stripe returned an error, but the refund is present on the charge. The booking has been left refunded. Verify in the Stripe Dashboard.',
            },
            { status: 502 },
          )
        }
      } catch (probeErr) {
        // Cannot prove either way. Fail CLOSED: leave the booking refunded
        // rather than resurrecting a trip whose money may already be gone.
        console.error('[admin-refund] refund state unprovable, leaving booking refunded', booking.id, probeErr instanceof Error ? probeErr.message : probeErr)
        return NextResponse.json(
          {
            error: 'refund_state_unknown',
            message: 'Could not confirm with Stripe whether the refund went through. The booking has been left cancelled. Check the Stripe Dashboard before retrying.',
          },
          { status: 502 },
        )
      }
    }

    // RELEASE: proven that Stripe never took the money, so put the request
    // back in the queue rather than stranding a trip as cancelled-unrefunded.
    console.error('[admin-refund] stripe refund provably failed, releasing claim', booking.id, msg)
    await svc
      .from('bookings')
      .update({
        status: 'paid',
        refund_state: 'requested',
        refund_decided_at: null,
        refund_decided_by: null,
        refunded_at: null,
        refund_amount: null,
        admin_charge: null,
      })
      .eq('id', booking.id)
      .eq('refund_state', 'approved')

    return NextResponse.json(
      { error: 'refund_failed', message: 'Stripe refused the refund. The request has been left pending.' },
      { status: 502 },
    )
  }
}
