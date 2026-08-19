'use client'

// Root-level error boundary. Catches errors that escape the root layout
// itself, when this fires, RootLayout has crashed, so we render a full
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
            MAPL TOURS
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
            className="ge-reload"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '13px 30px',
              background: '#171614',
              color: '#fff',
              borderRadius: 9999,
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14,
              boxShadow: '0 4px 16px rgba(23,22,20,0.18)',
              transition: 'transform 0.15s ease, box-shadow 0.2s ease, background 0.15s ease',
            }}
          >
            Reload
          </button>
          <style
            dangerouslySetInnerHTML={{
              __html:
                '.ge-reload:hover{background:#2A2926;box-shadow:0 6px 22px rgba(23,22,20,0.26);transform:translateY(-1px)}.ge-reload:active{transform:scale(0.98)}',
            }}
          />
        </div>
      </body>
    </html>
  )
}
