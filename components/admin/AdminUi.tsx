'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Pieces the admin desks share (coupons, gift cards), so a panel closes, a
 * result is reported and a code is copied the same way on every screen.
 * Styles: .adm-toast, .adm-copy and .adm-enter/.adm-leave in app/globals.css.
 */

/** Close a panel after its leave animation; at once under reduced motion. The functions are stable across renders. */
export function useClosing() {
  const [closing, setClosing] = useState<string | null>(null)
  const pending = useRef<(() => void) | null>(null)
  const close = useCallback((key: string, done: () => void) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return }
    pending.current = done
    setClosing(key)
  }, [])
  /** Forget a close in progress (the panel is staying after all). */
  const cancel = useCallback(() => { pending.current = null; setClosing(null) }, [])
  const onEnd = useCallback((e: React.AnimationEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || !pending.current) return
    const done = pending.current
    pending.current = null
    setClosing(null)
    done()
  }, [])
  return { closing, close, cancel, onEnd }
}

/**
 * Which card is busy with which action, card by card: an action on one card
 * never blocks or relabels another while a slow request (an email send) is
 * still on the wire.
 */
export function useBusy() {
  const [busy, setBusy] = useState<Record<string, string>>({})
  const start = useCallback((id: string, action: string) => setBusy((b) => ({ ...b, [id]: action })), [])
  const end = useCallback((id: string) => setBusy((b) => {
    const next = { ...b }
    delete next[id]
    return next
  }), [])
  return { busy, start, end }
}

/**
 * True while focus is still inside the element with this id, or nowhere (the
 * button pressed has gone): only then may an action that just finished move
 * focus. If the owner has moved on to something else meanwhile, it stays put.
 */
export function focusIsWithin(id: string): boolean {
  const a = document.activeElement
  return !a || a === document.body || !!document.getElementById(id)?.contains(a)
}

export interface Note { text: string; bad?: boolean; quiet?: boolean }

/**
 * The result of the last action on a desk. Render `toast` after the list: it
 * sits at the foot of the list and stays in view at the bottom of the screen
 * (position: sticky), so it never pushes the list down under the pointer.
 * A success clears itself (a shown one fades out); a problem stays until the
 * next action; a quiet note is only spoken. Put `keepClear` on the desk's
 * root as onFocus: a control reached by Tab while the toast covers it is
 * scrolled clear (scroll-padding keeps it above the toast).
 */
export function useResultNote() {
  const [note, setNoteRaw] = useState<Note | null>(null)
  const { closing, close, cancel, onEnd } = useClosing()
  const ref = useRef<HTMLParagraphElement>(null)
  const setNote = useCallback((n: Note | null) => { cancel(); setNoteRaw(n) }, [cancel])

  useEffect(() => {
    if (!note || note.bad) return
    const t = window.setTimeout(() => (note.quiet ? setNoteRaw(null) : close('note', () => setNoteRaw(null))), note.quiet ? 2000 : 6000)
    return () => window.clearTimeout(t)
  }, [note, close])

  const keepClear = useCallback((e: React.FocusEvent<HTMLElement>) => {
    const t = ref.current
    if (!t || !t.classList.contains('adm-toast')) return
    const a = e.target.getBoundingClientRect(), b = t.getBoundingClientRect()
    if (a.bottom > b.top && a.top < b.bottom) e.target.scrollIntoView({ block: 'nearest' })
  }, [])

  const toast = (
    <p role="status" ref={ref} onAnimationEnd={onEnd}
      className={!note || note.quiet ? 'visually-hidden' : `adm-note adm-toast ${note.bad ? 'adm-note--bad' : 'adm-note--ok'} ${closing === 'note' ? 'adm-leave' : 'adm-enter'}`}>
      {note?.text ?? ''}
    </p>
  )
  return { note, setNote, keepClear, toast }
}

/** A code's copy button: 44px, named for the code, a tick in place for a moment once copied; the result is spoken through `report`. */
export function CopyButton({ text, report }: { text: string; report: (n: Note) => void }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1600)
    return () => window.clearTimeout(t)
  }, [done])
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      report({ text: `${text} copied.`, quiet: true })
    } catch {
      report({ text: 'Could not copy. Select the code and copy it by hand.', bad: true })
    }
  }
  return (
    <button type="button" className={done ? 'adm-copy is-done' : 'adm-copy'} onClick={() => void copy()} aria-label={`Copy ${text}`}>
      {done ? <Check size={18} strokeWidth={2.5} aria-hidden /> : <Copy size={18} strokeWidth={2.25} aria-hidden />}
    </button>
  )
}
