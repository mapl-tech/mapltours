import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found',
  description: "We couldn't find that page. Head back to the feed and discover Jamaica.",
  robots: { index: false, follow: false },
}

export default function NotFound() {
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
            color: 'var(--gold-text, #6E5A1C)',
            margin: 0,
            fontFamily: 'var(--font-dm-sans)',
          }}
        >
          404
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontWeight: 700,
            fontSize: 36,
            lineHeight: 1.15,
            margin: '12px 0 16px',
            color: 'var(--text-primary, #1a1a1a)',
          }}
        >
          We couldn&rsquo;t find that page.
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
          The link may be old or the page may have moved. Head back to the feed and discover what locals are
          loving in Jamaica today.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" className="btn-primary" style={{ textDecoration: 'none' }}>
            <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>&larr;</span>
            Back to feed
          </Link>
          <Link href="/explore" className="btn-outline" style={{ textDecoration: 'none' }}>
            Browse experiences
          </Link>
        </div>
      </div>
    </main>
  )
}
