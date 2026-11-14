'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Where a password-reset link ends: one field, the new password.
 *
 * "Forgot password?" used to send a link back to the login page, which had
 * nowhere to type a new password: in the same browser the link signed the
 * guest in without saying so, and anywhere else it did nothing. The link now
 * returns through /auth/callback (which signs them in for this one purpose)
 * and lands here.
 */
const supabase = createClient()
const FONT = 'var(--font-dm-sans)'

export default function ResetPasswordPage() {
  const router = useRouter()
  // null while we find out whether the link signed them in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let live = true
    supabase.auth.getUser().then(({ data }) => { if (live) setSignedIn(!!data.user) }).catch(() => { if (live) setSignedIn(false) })
    return () => { live = false }
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) {
      setError(/session/i.test(err.message) ? 'This reset link has expired. Ask for a new one from the sign-in page.' : err.message)
      return
    }
    setDone(true)
    router.push('/profile')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', background: 'var(--bg-warm)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mapl-logo.svg" alt="MAPL Tours Jamaica" width={185} height={44} style={{ height: 44, width: 'auto', display: 'block' }} />
          </Link>
          <h1 style={{ fontFamily: FONT, fontSize: 'clamp(1.75rem, 2.4vw, 2.25rem)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: 16 }}>
            Choose a new password
          </h1>
        </div>

        <div className="surface-card" style={{ padding: 24, borderRadius: 'var(--r-xl)', border: '1px solid var(--border)', background: 'var(--card-bg)' }}>
          {signedIn === null ? (
            <p role="status" style={{ fontFamily: FONT, fontSize: 15, color: 'var(--text-secondary)' }}>Checking your link…</p>
          ) : signedIn === false ? (
            <>
              <p role="alert" style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                This reset link has expired, or it was opened in a different browser from the one that asked for it.
              </p>
              <p style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)', marginTop: 8 }}>
                Go back to sign in, type your email and tap &ldquo;Forgot password?&rdquo; to get a new one.
              </p>
              <Link href="/login" className="btn-primary" style={{ marginTop: 20, width: '100%', height: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                Back to sign in
              </Link>
            </>
          ) : (
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="reset-password" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: FONT, marginBottom: 6 }}>
                  New password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-password" name="new-password" type={show ? 'text' : 'password'} autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="At least 6 characters"
                    aria-invalid={error ? true : undefined} aria-describedby={error ? 'reset-error' : undefined}
                    style={{
                      width: '100%', height: 48, borderRadius: 'var(--r-md)', border: '1px solid rgba(23,22,20,0.5)',
                      padding: '0 48px 0 14px', fontSize: 16, fontFamily: FONT, color: 'var(--text-primary)', background: '#F1EFEA', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: 1, top: 1, bottom: 1, width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 15, borderRadius: 'var(--r-md)' }}
                  >
                    {show ? '\u{1F648}' : '\u{1F441}'}
                  </button>
                </div>
              </div>
              {error && <p id="reset-error" role="alert" style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.5, color: '#b00020' }}>{error}</p>}
              {done && <p role="status" style={{ fontFamily: FONT, fontSize: 14, color: 'var(--text-secondary)' }}>Password saved. Taking you to your trips.</p>}
              <button type="submit" className="btn-primary" disabled={saving || done} style={{ width: '100%', height: 48, fontSize: 15, opacity: saving || done ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
