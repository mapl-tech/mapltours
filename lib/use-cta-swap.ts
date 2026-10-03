'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * An add button and the "In your trip" link that replaces it are two
 * elements, so without help:
 *   - keyboard focus fell to <body> when one replaced the other (measured on
 *     the reel after Add, and after the notice's Undo);
 *   - a replacement of a different width reflowed the row beside it, and on a
 *     bottom-anchored overlay that moved the button under the thumb.
 *
 * `press(el)` is called from the press handler, before the cart changes: it
 * notes whether the control had focus and how wide it was. Whatever renders
 * next takes the focus (via `ref`) and never gets narrower (`minWidth`).
 * `afterUndo` hands focus back to the control when the notice's Undo button
 * that held it has gone.
 */
export function useCtaSwap(inCart: boolean) {
  const el = useRef<HTMLElement | null>(null)
  const refocus = useRef(false)
  const width = useRef(0)

  const press = useCallback((target: HTMLElement) => {
    refocus.current = document.activeElement === target
    width.current = Math.max(width.current, target.getBoundingClientRect().width)
  }, [])

  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    el.current?.focus({ preventScroll: true })
  }, [inCart])

  const afterUndo = useCallback(() => {
    // After React commits the cart change and the notice has unmounted.
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body) el.current?.focus({ preventScroll: true })
    })
  }, [])

  const ref = useCallback((node: HTMLElement | null) => { el.current = node }, [])

  return { ref, press, minWidth: width.current, afterUndo }
}
