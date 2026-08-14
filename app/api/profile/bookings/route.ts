import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

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

  const query = svc
    .from('bookings')
    .select('id, created_at, paid_at, total_paid, booking_type, email, user_id, booking_items(*)')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(100)
  const { data, error } = email
    ? await query.or(`user_id.eq.${user.id},email.ilike.${email}`)
    : await query.eq('user_id', user.id)
  if (error) return NextResponse.json({ data: [] })

  const rows = (data ?? []) as Row[]

  // Claim guest bookings that match the verified email (first sign-in only).
  const unclaimed = rows.filter((b) => !b.user_id && email && (b.email ?? '').toLowerCase() === email)
  if (unclaimed.length) {
    await svc.from('bookings').update({ user_id: user.id }).in('id', unclaimed.map((b) => b.id)).is('user_id', null)
  }

  const shaped = rows.map((b) => ({
    id: b.id,
    created_at: b.created_at,
    total_paid: Number(b.total_paid ?? 0),
    booking_items: (b.booking_items ?? []).map((i: Row) =>
      b.booking_type === 'transfer'
        ? {
            title: `Airport transfer${i.trip_type === 'round_trip' ? ' (round trip)' : ''}: MBJ to ${i.hotel ?? i.destination ?? 'your hotel'}`,
            destination: i.hotel ?? i.destination ?? 'Jamaica',
            travelers: i.passengers ?? i.travelers ?? 1,
            date: (i.arrival_at ?? '').slice(0, 10) || null,
            experience_id: 0,
          }
        : {
            title: i.title,
            destination: i.destination,
            travelers: i.travelers ?? 1,
            date: i.date,
            experience_id: i.experience_id,
          }
    ),
  }))

  return NextResponse.json({ data: shaped })
}
