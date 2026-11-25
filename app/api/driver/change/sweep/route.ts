import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { sweepUnanswered } from '@/lib/dispatch-change-server'

/**
 * The catch-up for driver-portal changes whose guest email nobody settled
 * (lib/dispatch-change-server sweepUnanswered): the person closed the page at
 * the second question, the office alert failed, or the function ran out of
 * time. Each is told to the office once. Called every fifteen minutes by
 * netlify/functions/dispatch-change-sweep-cron.mjs; a run with nothing open
 * finds nothing.
 *
 * Auth: CRON_SECRET in `Authorization: Bearer` only, compared in constant time.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 })
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await sweepUnanswered(createServiceClient(), Date.now())
    console.log('[driver-change/sweep]', JSON.stringify(result))
    return NextResponse.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    // Before migration 043 the table does not exist: say so, and let the next run try.
    console.error('[driver-change/sweep] failed', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ ok: false, error: 'sweep failed' }, { status: 500 })
  }
}
