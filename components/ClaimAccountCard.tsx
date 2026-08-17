'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mail, Check, ShieldCheck } from 'lucide-react'

const supabase = createClient()

/**
 * Turn a completed booking into an account, without ever standing between the
 * guest and the payment.
 *
 * A signup wall in front of checkout costs bookings, so guests pay first and
 * their booking carries only an email address. This offers the account
 * afterwards, when they have every reason to want one: /api/profile/bookings
 * already returns every paid booking matching the caller's VERIFIED email and
 * stamps user_id onto those rows, so signing in with the same address they
 * booked under adopts the booking automatically. Nothing needs to be passed
 * across; the email IS the link.
 *
 * A magic link is used rather than a password because the guest has just typed
 * this address into the booking form: it is the one credential we know is
 * theirs, and asking them to invent a password here is another wall.
 */
export default function ClaimAccountCard({ email }: { email: string | null }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!email) return null

  async function send() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email!,
      options: {
        emailRedirectTo: `${window.location.origin}/profile`,
        // The address came from a completed booking, so this is a real person
        // we have already transacted with; let the link create the account.
        shouldCreateUser: true,
      },
    })
    setBusy(false)
    if (error) {
      setError('We could not send that link. Please try again, or email contact@mapltours.com.')
      return
    }
    setSent(true)
  }

  return (
    <div
      style={{
        marginTop: 28,
        padding: '20px 22px',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        background: '#fff',
        textAlign: 'left',
        maxWidth: 520,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {sent ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span
            aria-hidden
            style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'var(--emerald-dim)', color: 'var(--emerald)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Check size={17} strokeWidth={2.5} />
          </span>
          <div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              Check your inbox
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              We sent a sign-in link to <strong>{email}</strong>. Open it and your trip is waiting,
              with your itinerary, your details and your cancellation option.
            </p>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Keep track of this trip
          </p>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            Set up your account with one tap and you can see this booking and every future one,
            check your day-by-day itinerary, update your details, and cancel within 48 hours of
            booking. No password to invent.
          </p>
          <button
            className="btn-primary"
            onClick={send}
            disabled={busy}
            style={{ height: 46, padding: '0 20px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Mail size={15} />
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          {error && (
            <p role="alert" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12.5, color: '#c00', marginTop: 10 }}>
              {error}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={12} color="var(--emerald)" />
            Your booking is already confirmed either way. This only saves you looking up the email later.
          </p>
        </>
      )}
    </div>
  )
}
