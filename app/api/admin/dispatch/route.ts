import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { STEPS, type Bk } from '@/lib/dispatch'
import { notifyDriverPaid } from '@/lib/email/driver-paid'

/**
 * Admin-only dispatch mutations for a transfer booking.
 *
 * SAFETY: verifies the caller is an admin (session -> admins allowlist) before
 * any write, and only ever writes the dispatch bookkeeping columns
 * (`dispatch`, `driver_name/phone/vehicle/plate`). It never touches money,
 * status, or Stripe columns, and never creates a charge.
 *
 * Body: { bookingId, step?, done?, driver?: { name?, phone?, vehicle?, plate? } }
 */

export const runtime = 'nodejs'

const STEP_KEYS = new Set(STEPS.map((s) => s.key))

export async function POST(request: NextRequest) {
  // 1) Auth: must be a signed-in admin.
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // 2) Parse + validate.
  let body: {
    bookingId?: string
    step?: string
    done?: boolean
    driver?: { name?: string; phone?: string; vehicle?: string; plate?: string }
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }) }

  const bookingId = (body.bookingId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return NextResponse.json({ error: 'bad_booking_id' }, { status: 400 })

  const { data: current, error: readErr } = await svc
    .from('bookings')
    .select('*, booking_items(*)')
    .eq('id', bookingId)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 3) Build the additive update (dispatch + driver columns only).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {}

  // Step toggles merge atomically (merge_dispatch) rather than rewriting the
  // whole map: review traced real lost-update races where this write could
  // erase a day-of stamp the cron was setting in the same moment, and a lost
  // once-only key means a duplicate email to a real person.
  let stepToggled = false
  if (typeof body.step === 'string') {
    if (!STEP_KEYS.has(body.step)) return NextResponse.json({ error: 'unknown_step' }, { status: 400 })
    const { error: mergeErr } = await svc.rpc('merge_dispatch', body.done === false
      ? { p_booking_id: bookingId, p_remove: [body.step] }
      : { p_booking_id: bookingId, p_patch: { [body.step]: new Date().toISOString() } })
    if (mergeErr) return NextResponse.json({ error: mergeErr.message }, { status: 500 })
    stepToggled = true
  }

  if (body.driver) {
    if ('name' in body.driver) update.driver_name = (body.driver.name ?? '').slice(0, 120) || null
    if ('phone' in body.driver) update.driver_phone = (body.driver.phone ?? '').slice(0, 40) || null
    if ('vehicle' in body.driver) update.driver_vehicle = (body.driver.vehicle ?? '').slice(0, 120) || null
    if ('plate' in body.driver) update.driver_plate = (body.driver.plate ?? '').slice(0, 40) || null
  }

  if (Object.keys(update).length === 0 && !stepToggled) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  if (Object.keys(update).length > 0) {
    const { error: writeErr } = await svc.from('bookings').update(update).eq('id', bookingId)
    if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 })
  }
  const { data: saved, error: rereadErr } = await svc
    .from('bookings')
    .select('dispatch, driver_name, driver_phone, driver_vehicle, driver_plate')
    .eq('id', bookingId)
    .single()
  if (rereadErr) return NextResponse.json({ error: rereadErr.message }, { status: 500 })

  // 4) Checking a pay step notifies the driver by email, at most once.
  // Non-fatal by design: the step tick above is already saved, and a mail
  // outage must not make the operator think the payment record failed. The
  // response says whether the email went, so the console can show it.
  let driverEmailed: boolean | null = null
  const payHalf = body.step === 'paid_first' ? 'first' : body.step === 'paid_second' ? 'second' : null
  const firstCheck = payHalf && body.done !== false && !((current.dispatch as Record<string, string>) ?? {})[body.step!]
  if (payHalf && firstCheck && current.booking_type === 'transfer' && current.status === 'paid') {
    driverEmailed = await notifyDriverPaid(svc, current as Bk, body.step!, payHalf)
  }

  return NextResponse.json({ ok: true, driverEmailed, ...saved })
}
