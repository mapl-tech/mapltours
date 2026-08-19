import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { firstLeg } from '@/lib/dispatch'
import { isDue, blockedReason, sendDayOf, jaDateKey, jaHour, legInstantMs, type Leg, type DayOfResult } from '@/lib/dayof'

/**
 * Hourly job: send each guest their day-of-travel details.
 *
 * Runs every hour from `netlify/functions/dayof-cron.mjs`. Each run looks at
 * paid transfers with an upcoming leg and mails the ones that are due (see
 * `isDue`). Everything that makes it safe to run unattended lives in
 * `lib/dayof.ts`: it will not mail a booking twice, will not mail before a
 * driver is assigned, and will not mail after the pickup has passed.
 *
 * SAFETY: strictly additive. Reads bookings, writes only the two
 * `dispatch.dayof_*_sent` keys. No money column, booking status, Stripe call or
 * webhook is touched on this path.
 *
 * Auth: shared secret via `?secret=` or `Authorization: Bearer`. Fails closed
 * when CRON_SECRET is unset.
 *
 * `?dry=1` reports exactly what it would send, and sends nothing.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Look-ahead window for candidate rows. `isDue` makes the real decision. */
const HORIZON_DAYS = 2

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  }
  const provided =
    request.nextUrl.searchParams.get('secret') ??
    (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const nowMs = Date.now()
  const svc = createServiceClient()

  // Candidate window, generous and cheap; `isDue` makes the real decision.
  // Compared as instants via legInstantMs, never as strings: Postgres returns
  // `+00:00` where toISOString gives `.000Z`, so a lexical compare would be
  // matching two different formats across two different time frames.
  const from = nowMs - 24 * 3_600_000
  const to = nowMs + HORIZON_DAYS * 24 * 3_600_000

  // Push the window into the query instead of only applying it in the loop.
  //
  // This used to pull `.limit(500)` paid transfers with no filter and no
  // ORDER BY, then discard the ones outside the window in JavaScript. With
  // fewer than 500 paid transfers on the books that is merely wasteful; past
  // 500 it silently stops being correct, because Postgres is free to return
  // any 500 rows and a guest travelling tomorrow can simply not be among
  // them. Nothing would report an error: the run would look healthy and the
  // driver details would never arrive.
  //
  // Leg times are Jamaica wall-clock carrying a Z, so the stored text is the
  // real instant minus five hours. The window is shifted by the same amount
  // to compare like with like. `isDue` still makes the real decision.
  const wall = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString()
  const legIds = new Set<string>()
  for (const col of ['arrival_at', 'departure_at'] as const) {
    const { data: legs } = await svc
      .from('booking_items')
      .select('booking_id')
      .eq('item_type', 'transfer')
      .gte(col, wall(from))
      .lte(col, wall(to))
      .limit(2000)
    for (const l of legs ?? []) if (l.booking_id) legIds.add(l.booking_id as string)
  }

  if (legIds.size === 0) {
    return NextResponse.json({ ok: true, considered: [], sent: 0, failed: 0, results: [] })
  }

  const { data: rows, error } = await svc
    .from('bookings')
    .select('id, email, first_name, status, dispatch, driver_name, driver_phone, driver_vehicle, driver_plate, booking_items(*)')
    .eq('status', 'paid')
    .eq('booking_type', 'transfer')
    .in('id', Array.from(legIds))
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: 'query failed', detail: error.message }, { status: 500 })
  }

  const results: DayOfResult[] = []
  const considered: { bookingId: string; leg: Leg; at: string; reason: string }[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (rows ?? []) as any[]) {
    const l = firstLeg(b)
    if (!l) continue
    for (const leg of ['arrival', 'departure'] as Leg[]) {
      const at = leg === 'arrival' ? l.arrivalAt : l.departureAt
      if (!at) continue
      const atMs = legInstantMs(at)
      if (atMs < from || atMs > to) continue
      if (!isDue(at, nowMs)) {
        considered.push({ bookingId: b.id, leg, at, reason: 'not due yet' })
        continue
      }
      const blocked = blockedReason(b, leg)
      if (blocked) {
        considered.push({ bookingId: b.id, leg, at, reason: blocked })
        continue
      }
      if (dry) {
        results.push({ ok: true, bookingId: b.id, leg, sentTo: `${b.email} (dry run, not sent)` })
        continue
      }
      results.push(await sendDayOf(svc, b, leg))
    }
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok && r.error)
  if (failed.length) {
    console.error('[dayof] some sends failed', failed)
  }

  return NextResponse.json({
    ok: true,
    dry,
    jamaicaDate: jaDateKey(nowMs),
    jamaicaHour: jaHour(nowMs),
    scanned: (rows ?? []).length,
    sent,
    results,
    // Only useful when debugging why nothing went out.
    ...(dry ? { considered } : {}),
  })
}
