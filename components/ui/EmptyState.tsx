import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The one empty state for the whole signed-in area.
 *
 * Lifted out of SavedView, which had the only good one on the site, so the
 * profile stops answering "you have no trips" with a bare grey paragraph and
 * no way forward. An empty state that offers nothing to tap is a dead end,
 * so `action` is required and `secondary` is there for the second real route.
 */
export interface EmptyStateAction {
  label: string
  href: string
}

export function EmptyState({
  emoji, title, body, action, secondary, tone = 'warm', children,
}: {
  emoji: string
  title: string
  body: string
  action: EmptyStateAction
  secondary?: EmptyStateAction
  /** 'warm' sits on the page; 'plain' sits inside a card that already has a border. */
  tone?: 'warm' | 'plain'
  children?: ReactNode
}) {
  return (
    <div
      style={{
        /* A white card, NOT --bg-warm. The page wash runs #FFFDF8 to
           --bg-warm to --bg, so a warm card on it measured 1.00:1 against
           its own background and read as nothing at all. White plus the
           warm shadow ramp is what makes it a surface. */
        border: tone === 'warm' ? '1px solid var(--border)' : 'none',
        borderRadius: 'var(--r-lg)',
        background: tone === 'warm' ? 'var(--card-bg)' : 'transparent',
        boxShadow: tone === 'warm' ? 'var(--shadow-sm)' : 'none',
        padding: tone === 'warm' ? 'clamp(36px, 8vw, 56px) clamp(20px, 5vw, 32px)' : '8px 0 4px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 40, marginBottom: 14, lineHeight: 1 }} aria-hidden>{emoji}</p>
      <h3
        style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 20,
          color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.6,
          color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 24px',
        }}
      >
        {body}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* 44px minimum, set here rather than left to .btn-primary's 42px,
            because these are often the only targets on the screen. */}
        <Link href={action.href} className="btn-primary" style={{ minHeight: 44, padding: '0 24px', fontSize: 15 }}>
          {action.label}
        </Link>
        {secondary && (
          <Link href={secondary.href} className="btn-outline" style={{ minHeight: 44, padding: '0 24px', fontSize: 15 }}>
            {secondary.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

export default EmptyState
