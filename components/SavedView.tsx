'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { experiences } from '@/lib/experiences'
import { useSaved } from '@/lib/supabase/saved'
import { useAuth } from '@/lib/supabase/auth-context'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'

/**
 * Everything the guest kept for later, in the order they saved it.
 *
 * Deliberately built from ExpCard rather than a bespoke row: the card already
 * carries the add-to-trip control and the save heart, so a saved tour can go
 * into the itinerary from here in one tap, and unsaving is the same gesture
 * that saved it. A second card design would have to re-earn both.
 */
export default function SavedView() {
  const { user, loading: authLoading } = useAuth()
  const { savedIds, loading } = useSaved()

  // Saved order, newest first, and silently skipping ids the catalog no
  // longer sells so a retired tour cannot blank the page.
  const saved = useMemo(
    () => savedIds.map((id) => experiences.find((e) => e.id === id)).filter(Boolean),
    [savedIds]
  )

  if (authLoading) return <Shell />

  if (!user) {
    return (
      <Shell>
        <EmptyState
          emoji="🇯🇲"
          title="Sign in to save tours"
          body="Save any tour you like and it will be here when you come back, ready to drop into your trip."
          action={{ label: 'Sign in', href: '/login?redirect=%2Fsaved' }}
          secondary={{ label: 'Browse tours', href: '/explore' }}
        />
      </Shell>
    )
  }

  if (loading && saved.length === 0) {
    return (
      <Shell>
        <p style={{ fontFamily: 'var(--font-dm-sans)', color: 'var(--text-tertiary)', fontSize: 15 }}>
          Loading your saved tours…
        </p>
      </Shell>
    )
  }

  if (saved.length === 0) {
    return (
      <Shell>
        <EmptyState
          emoji="🌴"
          title="Nothing saved yet"
          body="Tap the heart on any tour and it lands here. Build the shortlist first, decide the dates after."
          action={{ label: 'Browse tours', href: '/explore' }}
        />
      </Shell>
    )
  }

  return (
    <Shell count={saved.length}>
      {/* Same card on desktop, same short on mobile as every other browse
          surface, so a saved tour behaves exactly like a browsed one. */}
      <div className="hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {saved.map((exp) => <ExpCard key={exp!.id} exp={exp!} />)}
      </div>
      <div className="hide-desktop" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        {saved.map((exp) => <MobileShort key={exp!.id} exp={exp!} />)}
      </div>
    </Shell>
  )
}

function Shell({ children, count }: { children?: React.ReactNode; count?: number }) {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'calc(var(--nav-h) + 40px) 24px 96px' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)',
          letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 6,
        }}>
          Saved tours
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: 'var(--text-tertiary)' }}>
          {count
            ? `${count} tour${count === 1 ? '' : 's'} waiting. Add any of them to your trip when you are ready.`
            : 'Your shortlist for Jamaica.'}
        </p>
      </header>
      {children}
    </div>
  )
}

function EmptyState({
  emoji, title, body, action, secondary,
}: {
  emoji: string
  title: string
  body: string
  action: { label: string; href: string }
  secondary?: { label: string; href: string }
}) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
      background: 'var(--bg-warm)', padding: '56px 32px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 40, marginBottom: 14 }} aria-hidden>{emoji}</p>
      <h2 style={{
        fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 20,
        color: 'var(--text-primary)', marginBottom: 8,
      }}>
        {title}
      </h2>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.6,
        color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 24px',
      }}>
        {body}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href={action.href} className="btn-primary" style={{ padding: '12px 24px', fontSize: 15 }}>
          {action.label}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            style={{
              padding: '12px 24px', fontSize: 15, fontWeight: 600,
              fontFamily: 'var(--font-dm-sans)', color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)', borderRadius: 9999,
            }}
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  )
}
