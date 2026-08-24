/**
 * TikTok Login Kit, used for account LINKING only, never for sign-in.
 * Auth stays the Supabase magic-link flow; this just lets a signed-in guest
 * attach their TikTok username so their clips and comments carry a verified
 * handle. Server-side only: the client secret must never reach the browser.
 *
 * Entirely dormant until configured. Env:
 *   TIKTOK_CLIENT_KEY            client key from developers.tiktok.com
 *   TIKTOK_CLIENT_SECRET         client secret (server only)
 *   TIKTOK_REDIRECT_URI          optional; defaults to
 *                                `${request origin}/api/tiktok/callback`,
 *                                must exactly match the URI registered with
 *                                TikTok
 *   NEXT_PUBLIC_TIKTOK_ENABLED   "1" shows the Connect button in the profile
 *
 * The @username needs the user.info.profile scope, which TikTok approves
 * per app. Until approved, user.info.basic still returns open_id and
 * display name, and the flow stores what it gets.
 *
 * Nothing here touches booking, checkout, payments or webhooks.
 */

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/'
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'
const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/'
const SCOPES = 'user.info.basic,user.info.profile'

export function tiktokConfigured(): boolean {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
}

/** Trusted origin for redirects: the site's canonical URL when configured,
 *  else the request's own origin. Keeps Host-header-derived origins out of
 *  the flow wherever the deployment declares itself. */
export function tiktokOrigin(requestOrigin: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  return site ? site.replace(/\/+$/, '') : requestOrigin
}

export function tiktokRedirectUri(origin: string): string {
  return process.env.TIKTOK_REDIRECT_URI || `${origin}/api/tiktok/callback`
}

export function tiktokAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY!,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export interface TikTokUser {
  openId: string | null
  /** The @handle. Null until the user.info.profile scope is approved. */
  username: string | null
  displayName: string | null
}

/** Exchange the authorization code for an access token. Tokens are used once
 *  here to read the profile and are deliberately not stored. */
export async function exchangeTikTokCode(
  code: string,
  redirectUri: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY!,
      client_secret: process.env.TIKTOK_CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  const token = body?.access_token
  if (!res.ok || !token) {
    return { ok: false, error: body?.error_description || body?.error || `token exchange failed (${res.status})` }
  }
  return { ok: true, accessToken: token }
}

export async function fetchTikTokUser(
  accessToken: string,
): Promise<{ ok: true; user: TikTokUser } | { ok: false; error: string }> {
  const url = `${USER_INFO_URL}?fields=${encodeURIComponent('open_id,username,display_name')}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  const u = body?.data?.user
  if (!res.ok || !u) {
    return { ok: false, error: body?.error?.message || `user info failed (${res.status})` }
  }
  return {
    ok: true,
    user: {
      openId: u.open_id ?? null,
      username: u.username ?? null,
      displayName: u.display_name ?? null,
    },
  }
}
