import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { previewDriverUpdate, sendDriverUpdate, testDriverUpdate } from '@/lib/driver-update-send'

/**
 * The dispatch console's driver-update card. Admins only, checked before the
 * service-role client is used for anything else.
 *
 * Body: { bookingId, driverId, leg: 'arrival' | 'departure', mode, to? }
 *   mode 'preview'  { subject, html, told, guestProblem }   writes nothing
 *   mode 'test'     { sentTo }   the email to `to` only, "[Test]" subject
 *   mode 'send'     { sentTo, sentAt, driverColumns }   saves the driver on
 *                   the booking, then emails the guest
 * What each does, and every rule, is in lib/driver-update-send.ts.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const svc = createServiceClient()
  const { data: adminRow } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!adminRow) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null) as { bookingId?: unknown; driverId?: unknown; leg?: unknown; mode?: unknown; to?: unknown } | null
  const bookingId = typeof body?.bookingId === 'string' ? body.bookingId : ''
  const driverId = typeof body?.driverId === 'string' ? body.driverId : ''
  if (!UUID.test(bookingId)) return NextResponse.json({ error: 'bad booking id' }, { status: 400 })
  if (!UUID.test(driverId)) return NextResponse.json({ error: 'Choose a driver.' }, { status: 400 })
  const leg = body?.leg === 'arrival' || body?.leg === 'departure' ? body.leg : null
  if (!leg) return NextResponse.json({ error: 'Choose which ride.' }, { status: 400 })

  const now = Date.now()
  const out = body?.mode === 'preview' ? await previewDriverUpdate(svc, bookingId, leg, driverId, now)
    : body?.mode === 'test' ? await testDriverUpdate(svc, bookingId, leg, driverId, typeof body.to === 'string' ? body.to : '', now)
    : body?.mode === 'send' ? await sendDriverUpdate(svc, bookingId, leg, driverId, now)
    : null
  if (!out) return NextResponse.json({ error: 'unknown mode' }, { status: 400 })
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json(out)
}
