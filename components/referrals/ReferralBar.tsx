'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * The referral page's own bar (the shop's navigation is hidden on /referrals,
 * components/LayoutShell): the brand, "Referrals", who is signed in, and Sign
 * out. Signing out goes back to the sign-in page with a full page load, so
 * nothing of the session stays on screen.
 */
export default function ReferralBar({ email }: { email?: string | null }) {
  const [busy, setBusy] = useState(false)
  async function signOut() {
    if (busy) return
    setBusy(true)
    try { await createClient().auth.signOut() } catch { /* the sign-in page shows the state either way */ }
    window.location.assign('/referrals/login')
  }
  return (
    <header className="ref-bar">
      <div className="ref-bar-in">
        <Link href="/" className="ref-brand" aria-label="MAPL Tours Jamaica home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mapl-logo.svg" alt="" width={126} height={30} />
          <span className="ref-tag">Referrals</span>
        </Link>
        {email && (
          <div className="ref-bar-end">
            <span className="ref-who" title={email}>{email}</span>
            <button type="button" className="ref-text-btn" onClick={signOut} aria-disabled={busy || undefined}>
              {busy ? 'Signing out' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
