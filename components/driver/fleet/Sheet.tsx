'use client'

import { useEffect, useRef } from 'react'

/**
 * The fleet manager's dialogs (driver portal, Nov 24 2026): a native modal
 * <dialog>, so the page behind is inert, focus stays inside, and Escape is
 * the platform's own. A sheet from the bottom of a phone, a centred card from
 * 640px (styles: the `.fm` block in globals.css).
 *
 * Closing hands focus back to whatever opened it. While `busy` (a change is
 * being saved) nothing closes it: not Escape, not a tap outside.
 */
export default function Sheet({ open, onClose, labelledBy, describedBy, busy, alert, returnTo, children }: {
  open: boolean
  /** Where focus goes back to on close. Safari gives a tapped button no focus, so the opener is passed in. */
  returnTo?: HTMLElement | null
  onClose: () => void
  labelledBy: string
  describedBy?: string
  busy?: boolean
  /** A dialog that is only a question from the moment it opens (retiring a driver) is an alertdialog. */
  alert?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const busyRef = useRef(!!busy)
  busyRef.current = !!busy
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      opener.current = returnTo ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null)
      d.showModal()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open, returnTo])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      if (!busyRef.current) closeRef.current()
    }
    const onClosed = () => {
      const el = opener.current
      opener.current = null
      if (el && el.isConnected) el.focus({ preventScroll: true })
    }
    d.addEventListener('cancel', onCancel)
    d.addEventListener('close', onClosed)
    return () => {
      d.removeEventListener('cancel', onCancel)
      d.removeEventListener('close', onClosed)
      if (d.open) d.close()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="fm-sheet"
      role={alert ? 'alertdialog' : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      // A tap on the shade around the card (the dialog itself, not its content) closes it.
      onClick={(e) => { if (e.target === ref.current && !busyRef.current) closeRef.current() }}
    >
      <div className="fm-sheet-in">{children}</div>
    </dialog>
  )
}
