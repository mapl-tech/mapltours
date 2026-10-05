'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check } from 'lucide-react'
import { useTripNotice } from '@/lib/trip-notice'
import { isKeyOrReaderClick } from '@/lib/press'

/**
 * What the last add or swap did (lib/add-to-trip), with Checkout and Undo,
 * for five seconds. One instance in the layout serves every surface, so the
 * reel, the home rail and the tour cards answer an add the same way: before
 * this the rail's "Add to Trip" turned green and left no visible way on to
 * checkout.
 */
export default function TripNotice() {
  const notice = useTripNotice((s) => s.notice)
  const clear = useTripNotice((s) => s.clear)
  const pathname = usePathname()
  // Held open while a pointer is over it or focus is inside it: a keyboard
  // user tabbing to Undo used to watch it vanish under them (WCAG 2.2.1).
  const [held, setHeld] = useState(false)
  useEffect(() => { setHeld(false) }, [notice?.id])
  // Pointer clicks on it do nothing for its first 700 ms: on a wide screen it
  // can open under the pointer, and the second click of a double click on
  // Add landed on Undo or Checkout. It still takes them (letting them through
  // opened the tour under it), and a key press works at once.
  const noticeId = notice?.id
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    setArmed(false)
    if (noticeId == null) return
    const t = window.setTimeout(() => setArmed(true), 700)
    return () => window.clearTimeout(t)
  }, [noticeId])
  // Where focus came from when it entered the notice: Escape goes back there.
  const cameFrom = useRef<HTMLElement | null>(null)

  // Five seconds, restarted by each new notice and after it is let go.
  useEffect(() => {
    if (!notice || held) return
    const t = window.setTimeout(clear, 5000)
    return () => window.clearTimeout(t)
  }, [notice, clear, held])

  // A notice belongs to the page it was raised on.
  useEffect(() => {
    clear()
  }, [pathname, clear])

  if (!notice) return null
  const showCheckout = notice.checkout && pathname !== '/checkout'

  return (
    <div
      role="status"
      aria-live="polite"
      // Where it sits is CSS (globals.css .trip-notice): on the reel under
      // its counter and left of its rail at every width; elsewhere phones at
      // the top, wider screens bottom right. Above the details sheet (2200),
      // which an add from inside it used to leave covering the notice.
      className={`trip-notice trip-notice--${notice.placement}`}
      onClickCapture={(e) => { if (!armed && !isKeyOrReaderClick(e)) { e.preventDefault(); e.stopPropagation() } }}
      // Nor does the press take focus there: it stayed on Undo, and fell to
      // the page when the notice went.
      onMouseDownCapture={(e) => { if (!armed) e.preventDefault() }}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={(e) => {
        setHeld(true)
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) cameFrom.current = e.relatedTarget as HTMLElement | null
      }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false) }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        const back = cameFrom.current
        clear()
        if (back?.isConnected) back.focus()
      }}
      style={{
        position: 'fixed', zIndex: 2300,
        // The buttons drop under the words once the words would have less
        // than 120px beside them: at 320 they stood one or two to a line,
        // eight lines deep.
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 8,
        padding: '8px 8px 8px 14px', borderRadius: 16,
        background: 'rgba(8, 8, 10, 0.94)',
        border: '1px solid rgba(255, 179, 0, 0.35)',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        color: 'white', fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <span aria-hidden style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        background: 'var(--gold, #FFB300)', color: '#08080A',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={14} strokeWidth={3} />
      </span>
      <span style={{ flex: '1 1 120px', minWidth: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{notice.text}</span>
      {(showCheckout || notice.undo) && (
        <span style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          {showCheckout && (
            <Link
              href="/checkout"
              onClick={clear}
              style={{
                minHeight: 44, padding: '0 16px', borderRadius: 9999, flexShrink: 0,
                background: 'var(--gold)', color: 'var(--gold-ink)',
                fontSize: 14, fontWeight: 700, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              Checkout
            </Link>
          )}
          {notice.undo && (
            <button
              type="button"
              onClick={() => {
                notice.undo?.()
                clear()
              }}
              style={{
                minHeight: 44, minWidth: 60, padding: '0 12px', borderRadius: 9999, flexShrink: 0,
                background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.24)',
                color: 'white', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-dm-sans)',
                cursor: 'pointer',
              }}
            >
              Undo
            </button>
          )}
        </span>
      )}
    </div>
  )
}
