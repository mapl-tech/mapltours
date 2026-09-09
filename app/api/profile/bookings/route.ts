import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { escapeLikePattern } from '@/lib/pg-like'

/**
 * The signed-in user's own bookings for the profile page.
 *
 * Guests can pay without an account, so a booking may have no user_id. Here we
 * return every PAID booking that belongs to the caller either by user_id or by
 * their VERIFIED email, and quietly stamp user_id onto email-matched rows so
 * the link becomes permanent (a narrow write to that one column; no money
 * column, no webhook interaction). Transfers are shaped into the same display
 * rows as tour items so the profile renders both.
 */

export const runtime = 'nodejs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export async function GET() {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const email = user.email_confirmed_at && user.email ? user.email.toLowerCase() : null

  // 'refunded' is included so a booking the traveler just cancelled stays
  // visible (marked refunded) instead of vanishing from the page.
  const query = svc
    .from('bookings')
    .select(
      'id, created_at, paid_at, total_paid, status, refund_amount, refund_state, booking_type, email, user_id, ' +
        // quoteRefund needs both of these to agree with the server. Without
        // them the profile quoted a refund off the whole cart, including the
        // share a gift card paid, which Stripe never captured and would
        // refuse: the guest was shown a number the POST would not honour.
        'gift_card_amount, stripe_payment_id, ' +
        // Migration 009. Gated below; never sent raw.
        'dispatch, driver_name, driver_phone, driver_vehicle, driver_plate, ' +
        'booking_items(*)',
    )
    .in('status', ['paid', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(100)
  // `ilike` runs SQL ILIKE, where % and _ are WILDCARDS, so an unescaped
  // address matched other people's bookings: a guest whose verified email is
  // john_smith@gmail.com also matched johnXsmith@gmail.com, and underscores in
  // email addresses are commonplace. See lib/pg-like.ts for the measurement.
  const { data, error } = email
    ? await query.or(`user_id.eq.${user.id},email.ilike.${escapeLikePattern(email)}`)
    : await query.eq('user_id', user.id)
  // A failed query and an empty result set are different facts, and
  // collapsing them hid a real outage: the select above names refund_amount
  // and refund_state, which were missing from production for months, so every
  // signed-in guest saw "no trips yet" on a page that was actually erroring,
  // and the cancellation flow that the confirmation email points them to was
  // simply unreachable. Say so instead, and let the client show a retry.
  if (error) {
    console.error('[profile-bookings] query failed', { userId: user.id, error })
    return NextResponse.json(
      { error: 'Could not load your bookings. Please refresh, and email contact@mapltours.com if this persists.' },
      { status: 500 },
    )
  }

  // Second lock on ownership, in plain JavaScript, so that what this route
  // returns never depends on how a pattern is parsed. This is the SAME rule
  // /api/bookings/[id]/cancel enforces before it will touch a booking, so the
  // page can no longer show a row that the cancel button would then refuse.
  const rows = ((data ?? []) as Row[]).filter(
    (b) => b.user_id === user.id || (!!email && (b.email ?? '').toLowerCase() === email),
  )

  // Claim guest bookings that match the verified email (first sign-in only).
  const unclaimed = rows.filter((b) => !b.user_id && email && (b.email ?? '').toLowerCase() === email)
  if (unclaimed.length) {
    await svc.from('bookings').update({ user_id: user.id }).in('id', unclaimed.map((b) => b.id)).is('user_id', null)
  }

  const shaped = rows.map((b) => {
    const dispatch = (b.dispatch ?? {}) as Record<string, unknown>
    // The driver is a contractor, and driver_phone is their personal number.
    // Release it on the same schedule the operator does, never ahead of it:
    // name, vehicle and plate once step 3 has recorded them, the phone number
    // only once step 4 has actually sent the customer their confirmation.
    // Before that the page says when the details will arrive, which is a
    // promise we keep, rather than showing an empty block.
    const named = !!dispatch.driver_confirmed && !!b.driver_name
    const released = !!dispatch.customer_confirmed
    const driver = named
      ? {
          name: b.driver_name as string,
          vehicle: (b.driver_vehicle as string) ?? null,
          plate: (b.driver_plate as string) ?? null,
          phone: released ? ((b.driver_phone as string) ?? null) : null,
        }
      : null

    return {
      id: b.id,
      // The same reference the confirmation page and the email print, so a
      // guest can quote one number to support from wherever they are.
      ref: 'MAPL-' + String(b.id).slice(0, 8).toUpperCase(),
      kind: b.booking_type === 'transfer' ? ('transfer' as const) : ('tour' as const),
      created_at: b.created_at,
      // paid_at and status drive the cancellation quote in the UI; the server
      // re-derives both on POST, so these are for display only.
      paid_at: b.paid_at ?? null,
      status: b.status,
      refund_amount: b.refund_amount == null ? null : Number(b.refund_amount),
      refund_state: b.refund_state ?? 'none',
      total_paid: Number(b.total_paid ?? 0),
      // Display is never driven by these two; quoteRefund is.
      gift_card_amount: b.gift_card_amount == null ? null : Number(b.gift_card_amount),
      stripe_payment_id: b.stripe_payment_id ?? null,
      driver,
      booking_items: (b.booking_items ?? []).map((i: Row) =>
        b.booking_type === 'transfer'
          ? {
              title: `Airport transfer${i.trip_type === 'round_trip' ? ' (round trip)' : ''}: MBJ to ${i.hotel ?? i.destination ?? 'your hotel'}`,
              destination: i.hotel ?? i.destination ?? 'Jamaica',
              travelers: i.passengers ?? i.travelers ?? 1,
              // A hotel -> airport one-way has no arrival_at. Deriving the date
              // from it alone left `date: null`, which matched neither the
              // upcoming (>=) nor the past (<) filter, so the booking vanished
              // from the customer's profile — taking its cancel button with it.
              date:
                (i.arrival_at ?? '').slice(0, 10) ||
                (i.departure_at ?? '').slice(0, 10) ||
                i.date ||
                null,
              experience_id: 0,
              // The flight facts the guest actually wants the night before.
              hotel: i.hotel ?? null,
              tripType: i.trip_type ?? null,
              arrivalAt: i.arrival_at ?? null,
              arrivalFlight: i.arrival_flight ?? null,
              departureAt: i.departure_at ?? null,
              departureFlight: i.departure_flight ?? null,
            }
          : {
              title: i.title,
              destination: i.destination,
              travelers: i.travelers ?? 1,
              date: i.date,
              experience_id: i.experience_id,
            }
      ),
    }
  })

  return NextResponse.json({ data: shaped })
}
