import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getDriverAccess } from '@/lib/driver-access-server'
import { isFleetManager } from '@/lib/driver-access'
import { rateLimit } from '@/lib/rate-limit'
import { calendarAgain, commitChange, followUpEmail, isBookingId, parseChangeInput, planFor } from '@/lib/dispatch-change-server'

/**
 * Changes from the driver portal (lib/dispatch-change-server says what each
 * does). Fleet managers only, and admins previewing the portal: a regular
 * driver, or anyone else, gets 403 before anything is read.
 *
 *   { mode: 'plan',     bookingId, change }                         what saving would do; writes nothing
 *   { mode: 'commit',   bookingId, change, planKey, email? }        save it, then email or tell the office
 *   { mode: 'email',    changeId, email: 'send' | 'skip' }          a saved change whose email is still open
 *   { mode: 'calendar', changeId }                                  the ops calendar again
 *
 *   change: { kind: 'driver', driverId } | { kind: 'time', leg, at: 'YYYY-MM-DDTHH:MM' } | { kind: 'tour_time', time: 'HH:MM' }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  const gate = await getDriverAccess()
  if (!gate.ok) {
    const status = gate.denied === 'not_signed_in' ? 401 : gate.denied === 'unavailable' ? 503 : 403
    return NextResponse.json({ ok: false, message: status === 503 ? 'Your access could not be checked. Try again.' : 'Only a fleet manager can change rides.' }, { status })
  }
  if (!isFleetManager(gate.access)) {
    return NextResponse.json({ ok: false, message: 'Only a fleet manager can change rides.' }, { status: 403 })
  }
  // Generous for one person working through a day's rides; a stuck button cannot flood the guest or the office.
  if (rateLimit(`user:${gate.userId}`, { bucket: 'driver-change', max: 40, windowMs: 60_000 })) {
    return NextResponse.json({ ok: false, message: 'Too many changes at once. Wait a minute and try again.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  const svc = createServiceClient()
  const now = Date.now()

  if (body.mode === 'plan' || body.mode === 'commit') {
    const change = parseChangeInput(body.change)
    if (!isBookingId(body.bookingId) || !change) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
    if (body.mode === 'plan') {
      const a = await planFor(svc, body.bookingId, change, now)
      return NextResponse.json(a.json, { status: a.status })
    }
    const planKey = typeof body.planKey === 'string' && body.planKey.length <= 4000 ? body.planKey : ''
    if (!planKey) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
    const email = body.email === 'send' || body.email === 'skip' ? body.email : undefined
    const a = await commitChange(svc, gate.access, { bookingId: body.bookingId, change, planKey, email }, now)
    return NextResponse.json(a.json, { status: a.status })
  }

  if (body.mode === 'email') {
    if (typeof body.changeId !== 'string' || !UUID.test(body.changeId) || (body.email !== 'send' && body.email !== 'skip')) {
      return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
    }
    const a = await followUpEmail(svc, gate.access, { changeId: body.changeId, email: body.email }, now)
    return NextResponse.json(a.json, { status: a.status })
  }

  if (body.mode === 'calendar') {
    if (typeof body.changeId !== 'string' || !UUID.test(body.changeId)) return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
    const a = await calendarAgain(svc, body.changeId)
    return NextResponse.json(a.json, { status: a.status })
  }

  return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
}
