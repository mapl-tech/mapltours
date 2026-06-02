'use client'

// Per-route error boundary. Any error thrown by a server component, layout,
// or page in a non-root segment is caught here and shown as a recoverable
// message instead of crashing the whole tree. `reset()` re-mounts the
// segment so the user can retry without a full page reload.

import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Send the failure to wherever we collect logs (Stripe console / Sentry
    // / Vercel logs all capture this). Keep silent in dev to avoid duplicate
    // noise; Next.js already prints to the terminal.
    if (process.env.NODE_ENV === 'production') {
      console.error('[error-boundary]', error)
    }
  }, [error])

  return (
    <main
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        background: 'var(--bg, #FFFEFB)',
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--gold, #C39A48)',
            margin: 0,
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          Something went wrong
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-syne)',
            fontWeight: 700,
            fontSize: 32,
            lineHeight: 1.18,
            margin: '12px 0 16px',
            color: 'var(--text-primary, #1a1a1a)',
          }}
        >
          We hit an unexpected error.
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-dm-sans)',
            margin: '0 0 28px',
          }}
        >
          Our team has been notified and is on it. You can try again or head back to the feed.
          If you were in the middle of a booking, your itinerary is saved.
        </p>
        {error.digest ? (
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-dm-sans)',
              margin: '0 0 20px',
            }}
          >
            Reference: {error.digest}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              padding: '12px 24px',
              background: '#1a1a1a',
              color: '#fff',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 14,
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'transparent',
              color: '#1a1a1a',
              border: '1px solid var(--border, #e0e0e0)',
              borderRadius: 8,
              textDecoration: 'none',
              fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: 14,
            }}
          >
            Back to feed
          </Link>
        </div>
      </div>
    </main>
  )
}
