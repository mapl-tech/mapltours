import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { exchangeTikTokCode, fetchTikTokUser, tiktokConfigured, tiktokOrigin, tiktokRedirectUri } from '@/lib/tiktok'
import { normalizeSocialHandle } from '@/lib/social-handle'

/**
 * TikTok sends the guest back here after they authorize (or refuse). On
 * success we read their profile once, store the username on their
 * public.users row, and drop the token. Every exit lands back on /profile
 * with a ?tiktok= status the page can show.
 *
 * Writes touch only the tiktok_* and social_handle columns added by
 * migration 026; booking, payment and webhook tables are never read or
 * written here.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const origin = tiktokOrigin(url.origin)
  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/profile?tiktok=${status}`)
    res.cookies.set('tiktok_oauth_state', '', { path: '/api/tiktok', maxAge: 0 })
    return res
  }

  if (!tiktokConfigured()) return back('unconfigured')

  // The guest tapped "cancel" on TikTok's screen, or TikTok refused.
  if (url.searchParams.get('error')) return back('denied')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = req.cookies.get('tiktok_oauth_state')?.value
  if (!code || !state || !expectedState || state !== expectedState) return back('state')

  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return back('signin')

  const token = await exchangeTikTokCode(code, tiktokRedirectUri(origin))
  if (!token.ok) {
    console.warn('[tiktok] token exchange failed:', token.error)
    return back('error')
  }

  const info = await fetchTikTokUser(token.accessToken)
  if (!info.ok) {
    console.warn('[tiktok] user info failed:', info.error)
    return back('error')
  }

  const username = normalizeSocialHandle(info.user.username)
  const row: Record<string, unknown> = {
    id: user.id,
    tiktok_open_id: info.user.openId,
    tiktok_username: username,
    tiktok_connected_at: new Date().toISOString(),
  }
  // A linked account is the verified source of truth for the handle.
  if (username) row.social_handle = username

  const svc = createServiceClient()
  const { error } = await svc.from('users').upsert(row, { onConflict: 'id' })
  if (error) {
    // Most likely migration 026 has not run in this environment yet.
    console.warn('[tiktok] users upsert failed (migration 026 applied?):', error.message)
    return back('error')
  }

  // Mirror into auth metadata so client surfaces that read metadata agree.
  if (username) {
    await svc.auth.admin.updateUserById(user.id, { user_metadata: { social_handle: username } })
      .catch(() => { /* metadata mirror is best-effort */ })
  }

  return back('connected')
}
