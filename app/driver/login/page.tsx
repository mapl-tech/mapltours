'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DESTINATION_IMAGES } from '@/lib/experiences'

/**
 * Driver sign-in: Google only, styled to the driver portal's ink + gold
 * identity over Jamaica imagery. The portal itself re-checks the email
 * against DRIVER_ALLOWED_EMAILS server-side, so this page is purely the
 * front door - a non-approved Google account bounces back here with a
 * clear message.
 */

const dm = 'var(--font-dm-sans)'
const ink = '#171614'
const soft = '#57534C'
const goldWarm = '#C4A44A'

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
    <div className="drv-login" style={{ minHeight: '100vh', fontFamily: dm, display: 'flex', flexDirection: 'column' }}>
      {/* Brand lockup, top left */}
      <header style={{ position: 'relative', zIndex: 2, padding: 'max(18px, env(safe-area-inset-top)) clamp(16px, 2.5vw, 28px) 0' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mapl-logo-dark.svg" alt="MAPL Tours Jamaica" style={{ height: 48, width: 'auto', display: 'block', margin: '-8px 0' }} />
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: goldWarm,
            padding: '5px 12px', borderRadius: 9999, border: '1px solid rgba(196,164,74,0.45)', whiteSpace: 'nowrap',
          }}>
            Driver portal
          </span>
        </span>
      </header>

      {/* Centered card */}
      <main style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px 48px' }}>
        <div style={{ width: '100%', maxWidth: 430 }}>
          <div className="animate-fade-up" style={{
            background: '#fff', borderRadius: 20, padding: 'clamp(26px, 5vw, 34px)',
            borderTop: `3px solid ${goldWarm}`,
            boxShadow: '0 18px 60px rgba(0,0,0,0.42), 0 2px 10px rgba(0,0,0,0.25)',
          }}>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(24px, 5vw, 27px)', letterSpacing: '-0.02em', color: ink, margin: 0 }}>
              Good to see you, driver
            </h1>
            <p style={{ fontSize: 14.5, color: soft, margin: '8px 0 0', lineHeight: 1.55 }}>
              Your trips, guests, flight tracking and pay, all in one place.
            </p>

            {notAllowed && (
              <p role="alert" style={{
                fontSize: 13.5, lineHeight: 1.5, margin: '18px 0 0', padding: '11px 14px', borderRadius: 10,
                background: '#FCEDEA', border: '1px solid rgba(176,28,12,0.25)', color: '#B01C0C',
              }}>
                That Google account is not approved for the driver portal. Sign in with the Gmail address MAPL Tours approved, or contact contact@mapltours.com.
              </p>
            )}

            <button
              type="button" onClick={signIn} className="drv-login-btn"
              style={{
                width: '100%', minHeight: 52, borderRadius: 13, border: '1px solid #D8D2C6', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, marginTop: 22,
                fontFamily: dm, fontSize: 15.5, fontWeight: 600, color: ink, cursor: 'pointer',
                transition: 'border-color 0.15s ease, background 0.15s ease, transform 0.12s ease',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div aria-hidden="true" style={{ height: 1, margin: '22px 0 14px', background: 'linear-gradient(90deg, transparent, #E7E1D6 50%, transparent)' }} />
            <p style={{ fontSize: 12.5, color: '#6E6A62', lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
              Access is limited to approved MAPL drivers.
            </p>
          </div>

          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.75)', textAlign: 'center', margin: '20px 0 0', lineHeight: 1.5, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
            MAPL Tours Jamaica · contact@mapltours.com
          </p>
        </div>
      </main>

      <style jsx>{`
        .drv-login {
          position: relative;
          background-image: url('${DESTINATION_IMAGES['Negril']}');
          background-size: cover;
          background-position: center;
          background-color: ${ink};
        }
        .drv-login::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: 1;
          background: linear-gradient(168deg, rgba(23,22,20,0.82) 0%, rgba(23,22,20,0.66) 48%, rgba(23,22,20,0.88) 100%);
        }
        .drv-login::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          z-index: 3;
          background: linear-gradient(90deg, transparent, ${goldWarm} 35%, ${goldWarm} 65%, transparent);
        }
        .drv-login :global(.drv-login-btn:hover) {
          border-color: ${ink};
          background: #FAF8F4;
        }
        .drv-login :global(.drv-login-btn:active) {
          transform: scale(0.985);
        }
        .drv-login :global(.drv-login-btn:focus-visible) {
          outline: 3px solid ${ink};
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .drv-login :global(.drv-login-btn) { transition: none; }
        }
      `}</style>
    </div>
  )
}
