'use client'

// Root-level error boundary. Catches errors that escape the root layout
// itself — when this fires, RootLayout has crashed, so we render a full
// HTML document with inline styles only (no shared CSS / font variables
// are guaranteed to be available).

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      console.error('[global-error]', error)
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          background: '#FFFEFB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: '#1a1a1a',
        }}
      >
        <div style={{ maxWidth: 480, padding: '64px 24px', textAlign: 'center' }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#C39A48',
              margin: 0,
            }}
          >
            MAPL Tours
          </p>
          <h1 style={{ fontWeight: 700, fontSize: 28, lineHeight: 1.2, margin: '14px 0 12px' }}>
            Something broke on our end.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#525252', margin: '0 0 28px' }}>
            We&rsquo;ve been notified and will fix it as soon as we can. Please refresh the page or try again
            in a moment.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: '#9a9a9a', margin: '0 0 20px' }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              padding: '12px 26px',
              background: '#1a1a1a',
              color: '#fff',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
