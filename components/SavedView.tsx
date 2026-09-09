'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { experiences } from '@/lib/experiences'
import { useSaved } from '@/lib/supabase/saved'
import { useAuth } from '@/lib/supabase/auth-context'
import EmptyState from './ui/EmptyState'
import ExpCard from './ExpCard'
import MobileShort from './MobileShort'

/**
 * Everything the guest kept for later, in the order they saved it.
 *
 * Deliberately built from ExpCard rather than a bespoke row: the card already
 * carries the add-to-trip control and the save heart, so a saved tour can go
 * into the itinerary from here in one tap, and unsaving is the same gesture
 * that saved it. A second card design would have to re-earn both.
 *
 * The states are the hard part of this page, not the grid. Removing a tour
 * destroys the element that had focus, and a failed load looks exactly like
 * an empty shortlist unless the page is told the difference, so both are
 * handled explicitly below.
 */
export default function SavedView() {
  const { user, loading: authLoading } = useAuth()
  const { savedIds, loading, failed, writeError } = useSaved()

  // Saved order, newest first, silently skipping ids the catalog no longer
  // sells so a retired tour cannot blank the page.
  const saved = useMemo(
    () => savedIds.map((id) => experiences.find((e) => e.id === id)).filter(Boolean),
    [savedIds],
  )

  /* Announce what changed. Removing a tour deletes the button that removed
     it, so without this a screen reader user gets silence and a keyboard user
     gets dropped to <body>. */
  const [announcement, setAnnouncement] = useState('')
  const prevCount = useRef<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const n = saved.length
    const was = prevCount.current
    prevCount.current = n
    if (was === null || was === n) return
    setAnnouncement(
      n === 0
        ? 'Removed. Nothing saved now.'
        : `${was > n ? 'Removed' : 'Saved'}. ${n} tour${n === 1 ? '' : 's'} saved.`,
    )
    // Focus fell to <body> when the card holding it was unmounted. Put it on
    // the nearest surviving card instead, so the guest keeps their place.
    if (was > n && n > 0) {
      const next = gridRef.current?.querySelector<HTMLElement>('button, a')
      next?.focus({ preventScroll: true })
    }
  }, [saved.length])

  if (authLoading) return <Shell><GridSkeleton /></Shell>

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

  // A dropped request is not an empty shortlist, and saying so is the whole
  // point: this page used to tell a guest with eight saved tours that they
  // had none whenever the request failed.
  if (failed && saved.length === 0) {
    return (
      <Shell>
        <div role="alert" style={{
          border: '1px solid var(--border-strong)', borderRadius: 'var(--r-lg)',
          background: 'var(--card-bg)', padding: 'clamp(28px, 7vw, 44px) 24px', textAlign: 'center',
        }}>
          <p style={{ fontSize: 34, marginBottom: 12, lineHeight: 1 }} aria-hidden>🌴</p>
          <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
            We could not load your saved tours
          </h2>
          <p style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 15, lineHeight: 1.6,
            color: 'var(--text-secondary)', maxWidth: 420, margin: '0 auto 22px',
          }}>
            This is us, not you. Nothing you saved has been lost. Please refresh the page.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary" style={{ minHeight: 44, fontSize: 15 }}>
            Try again
          </button>
        </div>
      </Shell>
    )
  }

  // Skeletons rather than a line of text: the whole content of this page is
  // photographs, so a text line makes the layout jump when they land.
  if (loading && saved.length === 0) return <Shell><GridSkeleton /></Shell>

  if (saved.length === 0) {
    return (
      <Shell>
        <EmptyState
          emoji="🌴"
          title="Nothing saved yet"
          body="Tap the heart on any tour and it lands here. Build the shortlist first, decide the dates after."
          action={{ label: 'Browse tours', href: '/explore' }}
          secondary={{ label: 'Book an airport pickup', href: '/transfers' }}
        />
      </Shell>
    )
  }

  return (
    <Shell count={saved.length} announcement={announcement} writeError={writeError}>
      <div ref={gridRef}>
        {/* Same card on desktop, same short on mobile as every other browse
            surface, so a saved tour behaves exactly like a browsed one. */}
        <div className="hide-mobile saved-grid">
          {saved.map((exp) => <ExpCard key={exp!.id} exp={exp!} />)}
        </div>
        <div className="hide-desktop" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {saved.map((exp) => <MobileShort key={exp!.id} exp={exp!} />)}
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children, count, announcement, writeError }: {
  children?: React.ReactNode
  count?: number
  announcement?: string
  writeError?: string | null
}) {
  return (
    <main className="saved-shell">
      <div className="visually-hidden" role="status" aria-live="polite">{announcement ?? ''}</div>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-dm-sans)', fontWeight: 800, fontSize: 'var(--fs-h1)',
          letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.1,
        }}>
          Saved tours
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: 'var(--text-tertiary)' }}>
          {count
            ? `${count} tour${count === 1 ? '' : 's'} waiting. Add any of them to your trip when you are ready.`
            : 'Your shortlist for Jamaica.'}
        </p>
      </header>
      {writeError && (
        <p role="alert" style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: 14, lineHeight: 1.55, color: '#b00020',
          background: 'rgba(176,0,32,0.06)', border: '1px solid rgba(176,0,32,0.3)',
          borderRadius: 'var(--r-md)', padding: '12px 14px', marginBottom: 20,
        }}>
          {writeError}
        </p>
      )}
      {children}
    </main>
  )
}

/** Holds the page's shape while the shortlist loads. */
function GridSkeleton() {
  return (
    <>
      <div className="hide-mobile saved-grid" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="pf-skel" style={{ aspectRatio: '3 / 4', borderRadius: 'var(--r-lg)' }} />
        ))}
      </div>
      <div className="hide-desktop" style={{ display: 'grid', gap: 10 }} aria-hidden>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="pf-skel" style={{ aspectRatio: '9 / 16', borderRadius: 'var(--r-lg)' }} />
        ))}
      </div>
      <p className="visually-hidden" role="status">Loading your saved tours.</p>
    </>
  )
}
