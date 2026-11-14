import { createClient } from '@/lib/supabase/server'
import { getSafeRedirect } from '@/lib/safe-redirect'
import { siteOrigin } from '@/lib/site-origin'
import { NextResponse } from 'next/server'

/**
 * Where Google sign-in, the sign-up confirmation link and the password-reset
 * link come back to. The one-time code is exchanged for a session (cookies on
 * this response), then the browser is sent on.
 *
 * Every redirect names the public site (lib/site-origin): built from the
 * request's own URL they pointed at Netlify's per-deploy host, where the
 * guest has no cookies and so looked signed out the moment they signed in.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = siteOrigin(url)
  const code = url.searchParams.get('code')
  const redirect = getSafeRedirect(url.searchParams.get('redirect'))

  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // A password-reset link: the guest is signed in for this one purpose,
      // and goes to the form that sets the new password. `type` is our own
      // marker on the link the login page asks Supabase to send.
      if (url.searchParams.get('type') === 'recovery') {
        return NextResponse.redirect(`${origin}/login/reset`)
      }
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // The link was used already, has expired, or was opened in a different
  // browser from the one that asked for it. The login page says so.
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
