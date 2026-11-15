import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mentionsSecret, recordStop, stopPage, verifyStop, UNSUBSCRIBE_PATH } from '@/lib/mentions-server'

/**
 * The stop link in every mention email, and the List-Unsubscribe target.
 *
 *   GET   a page with one button. Inert, because mail scanners open every
 *         link before the person does; a GET that stopped emails would act
 *         for them.
 *   POST  the button, or a mail client's one-click (RFC 8058): records
 *         notification_prefs.mention_emails = false for that user.
 *
 * The link is ?u=<user id>&t=HMAC(secret, "mentions:v1:stop:" + id). A stop
 * changes nothing but that one switch, and the profile can turn it back on.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const html = (body: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })

function linkFrom(req: NextRequest): { u: string | null; t: string | null } {
  return { u: req.nextUrl.searchParams.get('u'), t: req.nextUrl.searchParams.get('t') }
}

export async function GET(req: NextRequest) {
  const secret = mentionsSecret()
  const { u, t } = linkFrom(req)
  if (!secret || !verifyStop(u, t, secret)) return html(stopPage('invalid'), 400)
  const action = `${UNSUBSCRIBE_PATH}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t!)}`
  return html(stopPage('confirm', action))
}

export async function POST(req: NextRequest) {
  const secret = mentionsSecret()
  const { u, t } = linkFrom(req)
  const oneClick = (await req.text().catch(() => '')).includes('List-Unsubscribe=One-Click')
  if (!secret || !verifyStop(u, t, secret)) {
    return oneClick ? NextResponse.json({ error: 'invalid link' }, { status: 400 }) : html(stopPage('invalid'), 400)
  }
  const ok = await recordStop(createServiceClient(), u.toLowerCase())
  if (oneClick) return ok ? new NextResponse(null, { status: 200 }) : NextResponse.json({ error: 'try again' }, { status: 500 })
  return ok ? html(stopPage('done')) : html(stopPage('invalid'), 500)
}
