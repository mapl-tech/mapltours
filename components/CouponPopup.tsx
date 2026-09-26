'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Check, Copy, X } from 'lucide-react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { getStoredAttribution, trackingOptedOut } from '@/lib/attribution'
import { trackLead } from '@/lib/analytics'
import {
  POPUP_CODE,
  POPUP_DELAY_MS,
  POPUP_PERCENT,
  nextPopupStep,
  popupPathEligible,
  popupWasUnseen,
  shouldShowPopup,
  useCouponPopupStore,
} from '@/lib/coupon-popup'
import { TIPS_LABEL, TIPS_ON_LINE, tipsDefaultFor, type TipsDefault } from '@/lib/trip-tips'

/**
 * The 5% code popup on the home and explore pages.
 *
 * One ask, one email. The guest types an address, the code arrives by email
 * and appears on screen with a Copy button, and that is the whole exchange:
 * no "no thanks, I like paying more" dismiss. Trip tips (a newsletter) come
 * only with the box under the field, which starts ticked for US visitors
 * alone; lib/trip-tips has the rule and why.
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
type Place = 'home' | 'explore' | 'transfers'

export default function CouponPopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const place: Place = pathname === '/explore' ? 'explore' : pathname === '/transfers' ? 'transfers' : 'home'
  // The address as of the latest render, for the timer's closure to compare.
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  // What this showing replaced, so a showing nobody saw can be taken back.
  const shown = useRef<{ at: number; before: number | null } | null>(null)

  useEffect(() => {
    if (!popupPathEligible(pathname)) return
    let cancelled = false
    let timer = 0
    let wasBusy = false
    const attempt = () => {
      if (cancelled) return
      const store = useCouponPopupStore.getState()
      const cameFromBio = getStoredAttribution()?.source === 'bio'
      if (!shouldShowPopup({ pathname, memory: store, now: Date.now(), cameFromBio })) return
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')
      const otherDialog = document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      const busy = document.hidden || typing || otherDialog
      const step = nextPopupStep({ startedOn: pathname, pathNow: pathnameRef.current, busy, wasBusy })
      wasBusy = busy
      if (step === 'stop') return
      if (step === 'wait') {
        timer = window.setTimeout(attempt, RETRY_MS)
        return
      }
      const now = Date.now()
      shown.current = { at: now, before: store.lastShownAt }
      store.markShown(now)
      setOpen(true)
    }
    timer = window.setTimeout(attempt, POPUP_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [pathname])

  // The popup belongs to the page that asked for it. If the address moves to
  // a page it may not appear on (a Book tap that landed as it opened, or
  // Back), it closes at once rather than sit over checkout, and a showing
  // that lasted only a moment does not start the seven-day rest.
  useEffect(() => {
    if (!open || popupPathEligible(pathname)) return
    setOpen(false)
    setClosing(false)
    const s = shown.current
    if (s && popupWasUnseen(s.at, Date.now())) useCouponPopupStore.setState({ lastShownAt: s.before })
    shown.current = null
  }, [open, pathname])

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

function Sheet({ place, closing, onClose }: { place: Place; closing: boolean; onClose: () => void }) {
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
  // Once the field has had focus on a phone the card moves to the top of the
  // screen, so the keyboard rising from the bottom never covers it, and it
  // stays there. It must never drop back on blur: the blur fires on the
  // pointerdown of the tap on "Send my code", and a card that moved then
  // pulled the button out from under the finger before the click landed, so
  // the first tap did nothing (measured on a 390px touch profile). The lift
  // itself waits a tick for the same reason: the tap that focused the field
  // resolves before anything moves.
  const [lifted, setLifted] = useState(false)
  // The trip-tips box starts unticked and stays that way until /api/geo
  // answers; a US answer ticks it, but only if the guest has not touched it.
  // `tipsDefault` is what the box showed before they did, sent with the
  // submit so the bio can tell a pre-tick from a tick.
  const [optIn, setOptIn] = useState(false)
  const [tipsDefault, setTipsDefault] = useState<TipsDefault>('unchecked')
  const [tipsOn, setTipsOn] = useState(false)
  const boxTouched = useRef(false)

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

  useEffect(() => {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 4000)
    fetch('/api/geo', { cache: 'no-store', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { country?: string | null } | null) => {
        if (boxTouched.current) return
        const on = tipsDefaultFor(j?.country)
        setOptIn(on)
        setTipsDefault(on ? 'checked' : 'unchecked')
      })
      // No answer: the box stays unticked, which is always lawful.
      .catch(() => {})
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
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
    // The box as submitted is the box they saw; a late geo answer must not
    // flip it under them if this send fails and they try again.
    boxTouched.current = true
    const eventId = trackingOptedOut() ? undefined : safeUuid()
    try {
      const r = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, website, place, page: window.location.href, eventId, optIn, optInDefault: tipsDefault }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; tips?: boolean }
      if (!r.ok || !j.ok) {
        setError(j.error || 'We could not send it just now. Try again in a moment.')
        setPhase('idle')
        return
      }
      if (j.code) setCode(j.code)
      setTipsOn(j.tips === true)
      useCouponPopupStore.getState().markDone(Date.now())
      trackLead(place === 'home' ? 'popup_home' : place === 'explore' ? 'popup_explore' : 'popup_transfers', eventId)
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
      className={`cpop-scrim${closing ? ' closing' : ''}${lifted ? ' cpop-scrim--lifted' : ''}`}
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
        {/* The Martha Brae raft (public/tours/bamboo-rafting.webp): the captain
            poling past the raft-village umbrellas. Two cuts, both starting
            below the sunshade at the top of the original so its logo is never
            in frame: a 1.8:1 band for phones (33 KB) and a 3:5 panel for the
            desktop card (44 KB), the background softened around a sharp
            captain to keep them light. The offer sits on it in display type.
            It is fetched when the card mounts, so it asks for high priority
            rather than queue behind the home page's video, and it fades in
            when it lands: about 0.2 s after the card on fast 4G, 0.8 s on
            slow 4G, where it used to snap in over the placeholder. */}
        <div className="cpop-photo" aria-hidden="true">
          <picture>
            <source media="(min-width: 720px)" srcSet="/media/popup/raft-tall.webp" type="image/webp" />
            <img
              src="/media/popup/raft-wide.webp"
              alt=""
              width={660}
              height={367}
              decoding="async"
              loading="eager"
              fetchPriority="high"
              onLoad={(e) => { e.currentTarget.dataset.loaded = 'true' }}
            />
          </picture>
          <span className="cpop-offer"><b>{POPUP_PERCENT}%</b><span>off</span></span>
        </div>
        <button type="button" className="cpop-close" onClick={onClose} aria-label="Close">
          <X size={18} aria-hidden />
        </button>

        <div className="cpop-body">
          {phase !== 'done' ? (
            <>
              <p className="cpop-kicker">MAPL Tours Jamaica</p>
              <h2 id={titleId} className="cpop-title">{POPUP_PERCENT}% off your first ride or tour.</h2>
              {/* This line is the dialog's description, read out on open, and it
                  sits over a box that starts ticked in the US: it has to be
                  true with the box either way. */}
              <p id={descId} className="cpop-sub">Your code comes by email in a minute.</p>
              <form onSubmit={submit} noValidate className="cpop-form">
                {/* A floating label: visible at rest and while typing (a placeholder
                    alone vanishes on the first keystroke), and it needs no extra row,
                    so the short-phone fit of the card is unchanged. */}
                <div className="cpop-field">
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
                  placeholder=" "
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (error) setError(null) }}
                  onFocus={() => { if (!lifted) window.setTimeout(() => setLifted(true), 0) }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  disabled={phase === 'busy'}
                />
                <label htmlFor={`${titleId}-email`} className="cpop-field-label">Email address</label>
                </div>
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
                {/* A real checkbox wrapped in its label, so the whole row is the target. */}
                <label className="cpop-tips">
                  <input
                    type="checkbox"
                    name="tips"
                    value="yes"
                    checked={optIn}
                    onChange={(e) => { boxTouched.current = true; setOptIn(e.target.checked) }}
                    disabled={phase === 'busy'}
                  />
                  <span>{TIPS_LABEL}</span>
                </label>
                <button type="submit" className="cpop-cta" disabled={phase === 'busy'} aria-busy={phase === 'busy'}>
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
              {tipsOn && (
                <p className="cpop-tips-on"><Check size={16} aria-hidden />{TIPS_ON_LINE}</p>
              )}
              {place === 'home' ? (
                <Link href="/explore" className="cpop-cta" onClick={onClose}>Choose a tour</Link>
              ) : (
                <button type="button" className="cpop-cta" onClick={onClose}>Keep browsing</button>
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
