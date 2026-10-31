import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

/**
 * What a confirmation link shows to a browser that did not book it: the
 * booking is confirmed, and the guest's own account is where the trip lives.
 * Nothing about the guest or the trip (lib/confirm-proof), because the link
 * travels in analytics, browser history and forwarded emails.
 *
 * One action, signing in, because that is the only step that gets the real
 * guest to their details on this device. /login sends a signed-in visitor
 * straight on to /profile.
 */
export default function PrivateConfirmation({
  kind,
  bookingRef,
}: {
  kind: 'ride' | 'trip'
  bookingRef: string | null
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--emerald)',
          marginBottom: 14,
        }}
      >
        {kind === 'ride' ? 'Transfer confirmed' : 'Booking confirmed'}
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontWeight: 700,
          fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}
      >
        Your {kind}{' '}
        <span style={{ fontStyle: 'italic', fontWeight: 500 }}>is booked.</span>
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontStyle: 'italic',
          fontSize: 17,
          lineHeight: 1.5,
          color: 'var(--text-secondary)',
          maxWidth: 520,
          margin: '0 auto 24px',
        }}
      >
        To keep your trip private, its details only show on the device you
        booked on, or after you sign&nbsp;in.
      </p>

      {bookingRef && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 22px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-strong)',
            background: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-primary)',
            marginBottom: 28,
          }}
        >
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12, letterSpacing: '0.22em' }}>BOOKING REF</span>
          {bookingRef}
        </div>
      )}

      <section
        aria-labelledby="private-confirmation-signin"
        style={{
          maxWidth: 520,
          margin: '0 auto',
          padding: '24px 24px 22px',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border)',
          background: '#fff',
          boxShadow: 'var(--shadow-sm)',
          textAlign: 'left',
        }}
      >
        <h2
          id="private-confirmation-signin"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          <ShieldCheck aria-hidden size={20} strokeWidth={2.2} style={{ color: 'var(--emerald)', flexShrink: 0 }} />
          See your trip details
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 16,
            lineHeight: 1.55,
            color: 'var(--text-secondary)',
            marginBottom: 20,
          }}
        >
          Sign in with the email you booked with. No account yet? Create one
          with that email and your trip will be waiting.
        </p>
        <Link
          href="/login?redirect=%2Fprofile"
          className="btn-primary"
          style={{ width: '100%', height: 48, fontSize: 16, fontWeight: 600 }}
        >
          Sign in to see my trip
        </Link>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--text-tertiary)',
            marginTop: 14,
          }}
        >
          {kind === 'ride'
            ? 'Your account also shows your driver’s name, vehicle and plate before pickup.'
            : 'Your account keeps every booking in one place.'}
        </p>
      </section>

      <p
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: 15,
          lineHeight: 1.55,
          color: 'var(--text-secondary)',
          maxWidth: 520,
          margin: '24px auto 0',
        }}
      >
        Your confirmation email has every detail too. Questions? Email{' '}
        <a href="mailto:contact@mapltours.com" style={{ color: 'var(--text-primary)', textDecoration: 'underline', fontWeight: 600 }}>
          contact@mapltours.com
        </a>{' '}
        and we will help.
      </p>
    </div>
  )
}
