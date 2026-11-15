import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { processMentionEmails } from '@/lib/mentions-server'

/**
 * The catch-up for mention emails, called every ten minutes by
 * netlify/functions/mention-emails-cron.mjs. Sends what the poster's own
 * notify call missed and retries failed sends (three attempts within 24
 * hours). Rows younger than a minute are left to that call.
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
  const result = await processMentionEmails(createServiceClient(), { limit: 25 })
  console.log('[mentions/sweep]', JSON.stringify(result))
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
}
