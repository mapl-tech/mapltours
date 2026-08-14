'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Leaf } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Driver sign-in: Google only. The portal itself re-checks the email against
 * DRIVER_ALLOWED_EMAILS server-side, so this page is purely the front door -
 * signing in with a non-approved Google account bounces back here with a
 * clear message.
 */

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'

export default function DriverLoginPage() {
  return (
    <Suspense>
      <DriverLoginContent />
    </Suspense>
  )
}

function DriverLoginContent() {
  const searchParams = useSearchParams()
  const notAllowed = searchParams.get('error') === 'not_allowed'

  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent('/driver')}` },
    })
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F4F1EB', fontFamily: dm, color: ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <main style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Leaf size={21} strokeWidth={2.5} color="#fff" />
          </span>
          <h1 style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', margin: '14px 0 0' }}>Driver portal</h1>
          <p style={{ fontSize: 14, color: soft, margin: '6px 0 0', lineHeight: 1.5 }}>
            MAPL Tours Jamaica. Your trips, guests, flights and pay in one place.
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E7E1D6', borderRadius: 16, padding: 24 }}>
          {notAllowed && (
            <p role="alert" style={{
              fontSize: 13.5, lineHeight: 1.5, margin: '0 0 16px', padding: '10px 13px', borderRadius: 10,
              background: '#FCEDEA', border: '1px solid rgba(176,28,12,0.25)', color: '#B01C0C',
            }}>
              That Google account is not approved for the driver portal. Sign in with the Gmail address MAPL Tours approved, or contact contact@mapltours.com.
            </p>
          )}
          <button
            type="button" onClick={signIn}
            style={{
              width: '100%', minHeight: 50, borderRadius: 12, border: '1px solid #D8D2C6', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: dm, fontSize: 15, fontWeight: 600, color: ink, cursor: 'pointer',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <p style={{ fontSize: 12.5, color: '#6E6A62', lineHeight: 1.55, margin: '14px 0 0', textAlign: 'center' }}>
            Access is limited to approved MAPL drivers.
          </p>
        </div>
      </main>
    </div>
  )
}
