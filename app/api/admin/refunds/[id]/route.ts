import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendCancellationEmails, sendRefundDeclinedEmail } from '@/lib/email/cancellation'

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
    .select('id, status, refund_state, stripe_payment_id, total_paid, refund_quoted_amount, refund_quoted_admin_charge, currency')
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
  if (!booking.stripe_payment_id) {
    return NextResponse.json({ error: 'no_payment_reference' }, { status: 409 })
  }
  const quotedAmount = Number(booking.refund_quoted_amount)
  if (!Number.isFinite(quotedAmount) || quotedAmount <= 0) {
    return NextResponse.json(
      { error: 'no_quote', message: 'This request has no stored refund amount. Refund manually in Stripe.' },
      { status: 409 },
    )
  }
  const refundCents = Math.round(quotedAmount * 100)
  const grossCents = Math.round(Number(booking.total_paid) * 100)
  if (refundCents > grossCents) {
    // Never pay out more than was captured, whatever the row says.
    return NextResponse.json({ error: 'quote_exceeds_payment' }, { status: 409 })
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
    const refund = await stripe.refunds.create(
      {
        payment_intent: booking.stripe_payment_id,
        amount: refundCents,
        reason: 'requested_by_customer',
        metadata: {
          booking_id: booking.id,
          approved_by: user.id,
          policy: 'flexible-48h-of-booking-less-20pct',
        },
      },
      { idempotencyKey: `refund:${booking.id}` },
    )

    const emails = await sendCancellationEmails(booking.id, { source: 'self-serve' })
    return NextResponse.json({
      ok: true,
      state: 'approved',
      refundId: refund.id,
      refundCents,
      currency: booking.currency ?? 'usd',
      emails,
    })
  } catch (err) {
    // RELEASE: Stripe never took the money, so put the request back in the
    // queue rather than stranding a trip as cancelled-but-unrefunded.
    const msg = err instanceof Error ? err.message : 'refund_failed'
    console.error('[admin-refund] stripe refund failed, releasing claim', booking.id, msg)
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
