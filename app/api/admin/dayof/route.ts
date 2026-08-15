import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import TransferDayOf from '@/emails/TransferDayOf'
import { firstLeg, bookingRef, jaDate, jaTime } from '@/lib/dispatch'

/**
 * Send the guest their day-of-travel details for one leg of a transfer.
 *
 * Admin-gated and triggered from the dispatch console rather than fired
 * automatically, because it should only go out once the driver is actually
 * assigned: an email naming no driver is worse than no email. It records the
 * send on the booking's dispatch blob so the console can show it was sent and
 * a double tap does not mail the guest twice.
 */

export const runtime = 'nodejs'

const AIRPORT = 'Sangster International Airport (MBJ), Montego Bay'

export async function POST(request: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as { bookingId?: string; leg?: 'arrival' | 'departure' } | null
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
  if (!booking.email) return NextResponse.json({ error: 'booking has no email' }, { status: 400 })

  const l = firstLeg(booking)
  if (!l) return NextResponse.json({ error: 'booking has no transfer leg' }, { status: 400 })

  const isArrival = leg === 'arrival'
  const at = isArrival ? l.arrivalAt : l.departureAt
  if (!at) return NextResponse.json({ error: `no ${leg} time on this booking` }, { status: 400 })

  const ref = bookingRef(booking.id)
  const res = await sendEmail({
    to: booking.email,
    subject: isArrival
      ? `Today: your MAPL driver at Montego Bay (${ref})`
      : `Today: your ride to the airport (${ref})`,
    react: TransferDayOf({
      bookingRef: ref,
      firstName: booking.first_name,
      leg,
      whenLabel: `${jaDate(at)}, ${jaTime(at)}`,
      pickupLabel: isArrival ? AIRPORT : l.hotel,
      dropoffLabel: isArrival ? l.hotel : AIRPORT,
      flight: (isArrival ? l.arrivalFlight : l.departureFlight) ?? null,
      passengers: l.passengers,
      driverName: booking.driver_name ?? null,
      driverPhone: booking.driver_phone ?? null,
      driverVehicle: booking.driver_vehicle ?? null,
      driverPlate: booking.driver_plate ?? null,
      supportEmail: 'contact@mapltours.com',
    }),
  })
  if (!res?.ok) {
    return NextResponse.json({ error: 'send failed', detail: res?.error ?? null }, { status: 502 })
  }

  // Record it so the console can show the send and avoid mailing twice.
  const dispatch = { ...((booking.dispatch as Record<string, string>) ?? {}) }
  dispatch[isArrival ? 'dayof_arrival_sent' : 'dayof_departure_sent'] = new Date().toISOString()
  await svc.from('bookings').update({ dispatch }).eq('id', booking.id)

  return NextResponse.json({ ok: true, sentTo: booking.email, leg })
}
