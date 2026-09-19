'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Check, Copy, X } from 'lucide-react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { getStoredAttribution, trackingOptedOut } from '@/lib/attribution'
import { trackLead } from '@/lib/analytics'
import { HERO_POSTER, HERO_POSTER_PHONE } from '@/lib/images'
import {
  POPUP_CODE,
  POPUP_DELAY_MS,
  POPUP_PERCENT,
  popupPathEligible,
  shouldShowPopup,
  useCouponPopupStore,
} from '@/lib/coupon-popup'

/**
 * The 5% code popup on the home and explore pages.
 *
 * One ask, one email. The guest types an address, the code arrives by email
 * and appears on screen with a Copy button, and that is the whole exchange:
 * no newsletter unless they ask, no "no thanks, I like paying more" dismiss.
 * The rules for when it may open live in lib/coupon-popup; this component
 * adds the courtesies the rules cannot see: it waits while the tab is
 * hidden, while another dialog is open, or while the guest is typing in a
 * field, and tries again a couple of seconds later.
 *
 * A bottom sheet on phones, a two-panel card on wider screens, both portaled
 * to <body> for the same reason the tour sheets are: inside the page's
 * scroll containers a fixed overlay is capped by their stacking context.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RETRY_MS = 2000
const CLOSE_MS = 180

type Phase = 'idle' | 'busy' | 'done'

export default function CouponPopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const place: 'home' | 'explore' = pathname === '/explore' ? 'explore' : 'home'

  useEffect(() => {
    if (!popupPathEligible(pathname)) return
    let cancelled = false
    let timer = 0
    const attempt = () => {
      if (cancelled) return
      const store = useCouponPopupStore.getState()
      const cameFromBio = getStoredAttribution()?.source === 'bio'
      if (!shouldShowPopup({ pathname, memory: store, now: Date.now(), cameFromBio })) return
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')
      const otherDialog = document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      if (document.hidden || typing || otherDialog) {
        timer = window.setTimeout(attempt, RETRY_MS)
        return
      }
      store.markShown(Date.now())
      setOpen(true)
    }
    timer = window.setTimeout(attempt, POPUP_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pathname])

  const requestClose = useCallback(() => {
    setClosing(true)
    window.setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, CLOSE_MS)
  }, [])

  if (!open) return null
  return <Sheet place={place} closing={closing} onClose={requestClose} />
}

function Sheet({ place, closing, onClose }: { place: 'home' | 'explore'; closing: boolean; onClose: () => void }) {
  const titleId = useId()
  const descId = useId()
  const errorId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrimPress = useRef(false)
  useFocusTrap(panelRef, onClose)

  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [code, setCode] = useState(POPUP_CODE)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // On a desktop pointer the field takes focus at once, one click saved. On
  // phones it must not: the keyboard would rise over the sheet before the
  // guest has read the offer.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 720px) and (pointer: fine)').matches
    if (desktop) inputRef.current?.focus({ preventScroll: true })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (phase === 'busy') return
    const value = email.trim().toLowerCase()
    if (!EMAIL.test(value)) {
      setError('That does not look like an email address. Check it and try again.')
      inputRef.current?.focus()
      return
    }
    setError(null)
    setPhase('busy')
    const eventId = trackingOptedOut() ? undefined : safeUuid()
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, website, place, page: window.location.href, eventId }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string }
      if (!r.ok || !j.ok) {
        setError(j.error || 'We could not send it just now. Try again in a moment.')
        setPhase('idle')
        return
      }
      if (j.code) setCode(j.code)
      useCouponPopupStore.getState().markDone(Date.now())
      trackLead(place === 'home' ? 'popup_home' : 'popup_explore', eventId)
      setPhase('done')
    } catch {
      setError('We could not send it just now. Try again in a moment.')
      setPhase('idle')
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const el = document.createElement('textarea')
      el.value = code
      el.setAttribute('readonly', '')
      el.style.position = 'absolute'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      try { document.execCommand('copy') } catch { /* nothing to do */ }
      document.body.removeChild(el)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return createPortal(
    <div
      className={`cpop-scrim${closing ? ' closing' : ''}`}
      onPointerDown={(e) => { scrimPress.current = e.target === e.currentTarget }}
      onClick={(e) => {
        if (scrimPress.current && e.target === e.currentTarget) onClose()
        scrimPress.current = false
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className="cpop-panel"
        data-phase={phase}
      >
        {/* The home hero's own posters (49 KB phone, 120 KB desktop), so on
            the home page this costs nothing and on explore it is small. */}
        <div className="cpop-photo" aria-hidden="true">
          <picture>
            <source media="(min-width: 720px)" srcSet={HERO_POSTER} type="image/webp" />
            <img src={HERO_POSTER_PHONE} alt="" width={720} height={540} decoding="async" loading="eager" />
          </picture>
          <span className="cpop-pill">{POPUP_PERCENT}% off</span>
        </div>
        <button type="button" className="cpop-close" onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden />
        </button>

        <div className="cpop-body">
          {phase !== 'done' ? (
            <>
              <p className="cpop-kicker">MAPL Tours Jamaica</p>
              <h2 id={titleId} className="cpop-title">{POPUP_PERCENT}% off your first ride or tour.</h2>
              <p id={descId} className="cpop-sub">One email with your code. No newsletter unless you ask.</p>
              <form onSubmit={submit} noValidate className="cpop-form">
                <label htmlFor={`${titleId}-email`} className="visually-hidden">Email address</label>
                <input
                  ref={inputRef}
                  id={`${titleId}-email`}
                  className="field-input cpop-input"
                  type="email"
                  name="email"
                  inputMode="email"
                  enterKeyHint="send"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  disabled={phase === 'busy'}
                />
                {/* Honeypot: bots fill every field. Off screen, off the tab order, off the reader. */}
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="cpop-hp"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
                {error && (
                  <p id={errorId} role="alert" className="cpop-error">{error}</p>
                )}
                <button type="submit" className="btn-primary cpop-cta" disabled={phase === 'busy'} aria-busy={phase === 'busy'}>
                  {phase === 'busy' ? 'Sending your code…' : 'Send my code'}
                </button>
              </form>
              <p className="cpop-trust">Applied at checkout. Once per email, no expiry.</p>
              <button type="button" className="cpop-later" onClick={onClose}>Not now</button>
            </>
          ) : (
            <div aria-live="polite">
              <p className="cpop-kicker">Your code</p>
              <h2 id={titleId} className="cpop-title">It is on its way to {email.trim().toLowerCase()}.</h2>
              <p id={descId} className="cpop-sub">Type it in the code box at checkout. It takes {POPUP_PERCENT}% off a private tour or an airport ride.</p>
              <div className="cpop-codebox">
                <span className="cpop-code">{code}</span>
                <button type="button" className="cpop-copy" onClick={copy}>
                  {copied ? <><Check size={16} aria-hidden /> Copied</> : <><Copy size={16} aria-hidden /> Copy</>}
                </button>
              </div>
              <span className="visually-hidden" aria-live="polite">{copied ? `${code} copied to the clipboard` : ''}</span>
              {place === 'home' ? (
                <Link href="/explore" className="btn-primary cpop-cta" onClick={onClose}>Choose a tour</Link>
              ) : (
                <button type="button" className="btn-primary cpop-cta" onClick={onClose}>Keep browsing</button>
              )}
              <p className="cpop-trust">Not in your inbox in a minute? Check the promotions or spam folder.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function safeUuid(): string | undefined {
  try {
    return crypto.randomUUID()
  } catch {
    return `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}
