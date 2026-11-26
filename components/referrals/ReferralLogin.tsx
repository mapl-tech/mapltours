'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * The referral sign-in (/referrals/login). Google first, as the owner asked
 * ("when the user signs in with their gmail"); an invited address that is not
 * a Google account signs in with email instead, through the site's own
 * sign-in, which comes back here. The page itself decides who gets in
 * (lib/referrals/access): this is only the front door, so a refusal arrives
 * as ?error= and is said here in plain words.
 */
export default function ReferralLogin({ message, signedInAs }: { message: string | null; signedInAs: string | null }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function google() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const supabase = createClient()
    // A different Google account than the one signed in: sign out first, so Google asks which account.
    if (signedInAs) { try { await supabase.auth.signOut() } catch { /* carry on */ } }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/referrals')}`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) { setBusy(false); setFailed(true) }
  }

  async function useAnother() {
    try { await createClient().auth.signOut() } catch { /* carry on */ }
    window.location.assign('/referrals/login')
  }

  return (
    <div className="ref-login">
      <div className="ref-login-card">
        <p className="ref-eyebrow">MAPL Tours Jamaica referrals</p>
        <h1 className="ref-h1" style={{ fontSize: 'clamp(1.75rem, 5vw, 2.125rem)' }}>Sign in to your referral page</h1>
        <ul className="ref-login-points">
          <li>Make your own codes for your guests.</li>
          <li>See every booking made with them, and what you earn.</li>
          <li>Get paid every Monday into your Wise account.</li>
        </ul>
        {message && <p className="ref-alert" role="alert">{message}</p>}
        {failed && <p className="ref-alert" role="alert">Google sign-in did not start. Try again in a moment.</p>}
        <button type="button" className="ref-google" onClick={google} aria-disabled={busy || undefined}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy ? 'Opening Google' : 'Continue with Google'}
        </button>
        <p className="ref-login-alt">
          Use the address your invitation was sent to. Not a Google account?{' '}
          <a href="/login?redirect=%2Freferrals">Sign in with email</a>.
        </p>
        {signedInAs && (
          <p className="ref-login-alt">
            Signed in as {signedInAs}.{' '}
            <button type="button" className="ref-text-btn" onClick={useAnother}>Use another account</button>
          </p>
        )}
      </div>
    </div>
  )
}
