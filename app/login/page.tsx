'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getSafeRedirect } from '@/lib/safe-redirect'
import { DESTINATION_IMAGES } from '@/lib/experiences'

// One module-level client, don't recreate on every render.
const supabase = createClient()

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = getSafeRedirect(searchParams.get('redirect'))

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Check your email for a confirmation link.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setError(error.message)
      } else {
        router.push(redirect)
        router.refresh()
      }
    }

    setLoading(false)
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    })
    if (error) setError(error.message)
  }

  async function handleForgotPassword() {
    if (!email) return
    setError('')
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a reset link.')
    }
  }

  return (
    <div className="login-shell">
      {/* Back to home, icon-only on mobile so it never covers the logo */}
      <Link
        href="/"
        aria-label="Back to home"
        className="login-back-btn"
        style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          fontFamily: 'var(--font-dm-sans)',
          borderRadius: 9999,
          background: 'var(--card-bg)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.15s ease',
          zIndex: 3,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
        <span className="login-back-label">Back to Home</span>
      </Link>

      {/* Left atmosphere panel, decorative, desktop only */}
      <aside className="login-aside" aria-hidden="true">
        <div className="login-aside-overlay" />
        <div className="login-aside-text">
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 11,
            letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold-warm)',
          }}>
            MAPL TOURS · Jamaica
          </span>
          <h2 style={{
            fontFamily: 'var(--font-dm-sans)', fontStyle: 'italic', fontWeight: 500,
            fontSize: 'clamp(2rem, 2.8vw, 3.1rem)', lineHeight: 1.05, color: '#fff',
            marginTop: 18, maxWidth: 440, letterSpacing: '-0.01em',
            textShadow: '0 2px 24px rgba(0,0,0,0.45)',
          }}>
            Discover Jamaica<br />beyond the resort.
          </h2>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 14.5, lineHeight: 1.6,
            color: 'rgba(255,255,255,0.82)', marginTop: 16, maxWidth: 380,
            textShadow: '0 1px 12px rgba(0,0,0,0.4)',
          }}>
            Sign in to build your itinerary, save the experiences you love, and pick up where you left off.
          </p>
        </div>
      </aside>

      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          position: relative;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
        }
        .login-aside {
          position: relative;
          overflow: hidden;
          background-image: url('${DESTINATION_IMAGES['Negril']}');
          background-size: cover;
          background-position: center;
          display: flex;
          align-items: flex-end;
        }
        .login-aside-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(160deg, rgba(8,8,6,0.35) 0%, rgba(8,8,6,0.55) 55%, rgba(8,8,6,0.82) 100%);
        }
        .login-aside-text {
          position: relative; z-index: 1;
          padding: clamp(40px, 5vw, 72px);
        }
        .login-formcol {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: var(--bg-warm);
          min-height: 100vh;
        }
        /* :global because these target a <Link>. styled-jsx only adds its
           scoping class to native elements, so a component-rendered <a> never
           matched the scoped rule and the button rendered with no padding at
           all (20x20 on mobile instead of 40x40). */
        :global(.login-back-btn) { padding: 10px 18px 10px 14px; }
        .login-back-label { display: inline; }
        @media (max-width: 900px) {
          .login-shell { grid-template-columns: 1fr; }
          .login-aside { display: none; }
        }
        @media (max-width: 480px) {
          :global(.login-back-btn) {
            padding: 0; width: 40px; height: 40px; justify-content: center;
          }
          .login-back-label { display: none; }
        }
      `}</style>

      <div className="login-formcol">
      <div style={{
        width: '100%',
        maxWidth: 420,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/mapl-logo.svg"
              alt="MAPL TOURS JAMAICA"
              width={185}
              height={44}
              style={{ height: 44, width: 'auto', display: 'block' }}
            />
          </Link>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 'clamp(1.75rem, 2.4vw, 2.25rem)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            marginTop: 16,
          }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Card */}
        <div className="surface-card animate-fade-up" style={{
          padding: 32,
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          background: 'var(--card-bg)',
        }}>
          {/* OAuth buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <button
              onClick={() => handleOAuth('google')}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-warm)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'white' }}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-strong)',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'var(--font-dm-sans)',
                color: 'var(--text-primary)',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth('apple')}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-warm)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.background = 'white' }}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-strong)',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'var(--font-dm-sans)',
                color: 'var(--text-primary)',
                transition: 'all 0.2s ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </div>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-dm-sans)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'signup' && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-dm-sans)',
                  marginBottom: 6,
                }} htmlFor="login-name">
                  Full name
                </label>
                <input
                  id="login-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Wanderlust"
                  required
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-strong)',
                    padding: '0 14px',
                    fontSize: 15,
                    fontFamily: 'var(--font-dm-sans)',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-warm)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            <div>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-dm-sans)',
                marginBottom: 6,
              }} htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-strong)',
                  padding: '0 14px',
                  fontSize: 15,
                  fontFamily: 'var(--font-dm-sans)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-warm)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-dm-sans)',
                marginBottom: 6,
              }} htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : ''}
                required
                minLength={6}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-strong)',
                  padding: '0 14px',
                  fontSize: 15,
                  fontFamily: 'var(--font-dm-sans)',
                  color: 'var(--text-primary)',
                  background: 'var(--bg-warm)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={!email}
                style={{
                  alignSelf: 'flex-end',
                  marginTop: -6,
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'var(--font-dm-sans)',
                  color: email ? 'var(--gold-text)' : 'var(--text-tertiary)',
                  cursor: email ? 'pointer' : 'not-allowed',
                }}
              >
                Forgot password?
              </button>
            )}

            {error && (
              <p style={{
                fontSize: 13,
                color: '#DC2626',
                fontFamily: 'var(--font-dm-sans)',
                padding: '8px 12px',
                background: 'rgba(220,38,38,0.06)',
                borderRadius: 'var(--r-sm)',
              }}>
                {error}
              </p>
            )}

            {message && (
              <p style={{
                fontSize: 13,
                color: 'var(--emerald)',
                fontFamily: 'var(--font-dm-sans)',
                padding: '8px 12px',
                background: 'var(--emerald-dim)',
                borderRadius: 'var(--r-sm)',
              }}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                height: 46,
                fontSize: 14,
                fontWeight: 600,
                marginTop: 4,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading
                ? 'Loading...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </div>

        {/* Toggle mode */}
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-dm-sans)',
          marginTop: 20,
        }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--gold-text)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 13,
            }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
      </div>
    </div>
  )
}
