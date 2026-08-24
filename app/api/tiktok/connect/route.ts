import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tiktokConfigured, tiktokAuthorizeUrl, tiktokOrigin, tiktokRedirectUri } from '@/lib/tiktok'

/**
 * Starts the TikTok account-link flow for the signed-in guest: stamps a CSRF
 * state cookie and forwards to TikTok's authorize page. Display-only feature;
 * no booking, payment or webhook code anywhere near this path.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = tiktokOrigin(new URL(req.url).origin)

  if (!tiktokConfigured()) {
    return NextResponse.redirect(`${origin}/profile?tiktok=unconfigured`)
  }

  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.redirect(`${origin}/profile?tiktok=signin`)

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(tiktokAuthorizeUrl(state, tiktokRedirectUri(origin)))
  res.cookies.set('tiktok_oauth_state', state, {
    httpOnly: true,
    secure: origin.startsWith('https'),
    sameSite: 'lax',
    path: '/api/tiktok',
    maxAge: 600,
  })
  return res
}
