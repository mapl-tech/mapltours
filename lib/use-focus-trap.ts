'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keep keyboard focus inside an open dialog, and give it back when the dialog
 * closes.
 *
 * A container marked `aria-modal="true"` is a promise to assistive tech that
 * nothing outside it is reachable. Making that promise without keeping it is
 * worse than not making it: a screen reader stops announcing the page behind
 * the dialog, so a Tab that walks out lands on controls the user is told do
 * not exist. Both tour overlays did exactly that, and Escape closed only one
 * of them.
 *
 * What this does, in the order it matters:
 *   • remembers what was focused, and restores it on close, so the guest ends
 *     up back on the control they opened the dialog from
 *   • moves focus into the container on open (the container itself needs
 *     tabIndex={-1} for this)
 *   • cycles Tab and Shift+Tab between the first and last focusable children
 *   • closes on Escape (SC 2.1.2)
 *
 * Lifted verbatim from ItineraryPanel, which already did all of this
 * correctly, so the drawer and the two sheets now share one implementation
 * rather than one good copy and two absent ones.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) {
  const previous = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    previous.current = document.activeElement as HTMLElement | null
    ref.current?.focus()
    return () => {
      previous.current?.focus?.()
    }
  }, [active, ref])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const container = ref.current
      if (!container) return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === container) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, onClose, ref])
}
