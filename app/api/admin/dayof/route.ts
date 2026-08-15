import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendDayOf, blockedReason } from '@/lib/dayof'

/**
 * Send the guest their day-of-travel details for one leg of a transfer.
 *
 * The hourly cron at /api/dayof normally does this unattended. This route is
 * the operator's manual override for the cases a schedule cannot judge: a
 * late-assigned driver, a guest who lost the email, a same-day rebooking. Both
 * paths call the same sendDayOf, so they share one idempotency stamp and the
 * guest can never receive two copies.
 *
 * `force: true` resends one the guest lost. It bypasses only the already-sent
 * stamp, never the driver-assigned guard.
 */

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as { bookingId?: string; leg?: 'arrival' | 'departure'; force?: boolean } | null
  const bookingId = body?.bookingId
  const leg: 'arrival' | 'departure' = body?.leg === 'departure' ? 'departure' : 'arrival'
  if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

  const { data: booking } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .eq('id', bookingId)
    .eq('booking_type', 'transfer')
    .maybeSingle()
  if (!booking) return NextResponse.json({ error: 'booking not found' }, { status: 404 })

  const res = await sendDayOf(svc, booking, leg, { force: body?.force === true })
  if (!res.ok) {
    // A guard tripping is a 409 the operator can act on (and override with
    // force); a genuine Resend failure is a 502 they should retry.
    const status = res.skipped ? 409 : 502
    return NextResponse.json({ error: res.skipped ?? res.error, blocked: blockedReason(booking, leg) }, { status })
  }
  return NextResponse.json({ ok: true, sentTo: res.sentTo, leg })
}
