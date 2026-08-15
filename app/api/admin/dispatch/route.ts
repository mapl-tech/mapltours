import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { STEPS, firstLeg, moneyBlock, money, round2, bookingRef, jaDate, jaTime, type Bk } from '@/lib/dispatch'
import { sendEmail, opsBcc, driverNotifyEmail } from '@/lib/email/send'
import DriverPaid from '@/emails/DriverPaid'

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

/**
 * Email the driver that a payment was sent, with an atomic once-only claim.
 *
 * The claim key (`paid_first_notified` / `paid_second_notified`) lives in the
 * same dispatch map as everything else, and the conditional update means two
 * operators double-clicking in two tabs produce exactly one email. Unchecking
 * and re-checking the step does NOT resend: the claim survives, because a
 * second "payment sent" email for the same half would be a false record.
 * Amounts come from moneyBlock, the same figures the console shows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyDriverPaid(svc: any, b: Bk, step: string, half: 'first' | 'second'): Promise<boolean> {
  const to = driverNotifyEmail()
  if (!to) {
    console.warn('[dispatch] pay step checked but no driver email configured (DRIVER_NOTIFY_EMAIL)')
    return false
  }
  const l = firstLeg(b)
  if (!l) return false

  const m = moneyBlock(b, null)
  // A zero or negative amount is a data problem, never an email. Checked
  // BEFORE the claim, so a fixed subtotal can still notify later.
  const firstAmount = m.driverPerLeg
  const secondAmount = round2(m.driverTotal - m.driverPerLeg)
  const thisAmount = half === 'second' ? secondAmount : firstAmount
  if (!(thisAmount > 0)) {
    console.warn('[dispatch] pay-step email skipped, non-positive amount', { booking: b.id, half, thisAmount })
    return false
  }

  // Atomic once-only claim. Deliberately NOT released on a failed send: a
  // send can fail on our side after Resend accepted it, and a resend of a
  // money notice is worse than a missing one the console reports.
  const claimKey = `${step}_notified`
  const { data: claimed } = await svc.rpc('merge_dispatch', {
    p_booking_id: b.id,
    p_patch: { [claimKey]: new Date().toISOString() },
    p_only_if_absent: claimKey,
  })
  if (!claimed || claimed.length === 0) return false

  const effectiveHalf: 'first' | 'second' | 'full' = m.isRoundTrip ? half : 'full'
  // First half pays the leg that happens first; for a departure-only one-way
  // that IS the ride to the airport.
  const isArrivalLeg = half === 'first' ? !!l.arrivalAt : false
  const at = isArrivalLeg ? l.arrivalAt : l.departureAt
  const guestName = `${b.first_name ?? ''} ${b.last_name ?? ''}`.trim() || 'Guest'

  const res = await sendEmail({
    to,
    bcc: opsBcc(to),
    subject: `${money(thisAmount)} sent · ${effectiveHalf === 'full' ? 'payment in full' : `${effectiveHalf} half`} · ${bookingRef(b.id)}`,
    react: DriverPaid({
      driverName: b.driver_name?.trim() || 'driver',
      bookingRef: bookingRef(b.id),
      guestName,
      half: effectiveHalf,
      amount: money(thisAmount),
      totalForTrip: money(m.driverTotal),
      tripLabel: isArrivalLeg ? `MBJ Airport → ${l.hotel}` : `${l.hotel} → MBJ Airport`,
      whenLabel: at ? `${jaDate(at)}, ${jaTime(at)}` : 'time to be confirmed',
      passengers: l.passengers,
    }),
    tags: [{ name: 'type', value: 'driver_paid' }],
  })
  if (!res?.ok) {
    console.error('[dispatch] driver payment email failed, claim held to prevent doubles', res?.error)
    return false
  }
  return true
}
