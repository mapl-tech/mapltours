import { useEffect, type RefObject } from 'react'

/**
 * The page's one authored motion: when something is copied, its tick pops in
 * (scale 0.4 to 1.2 to 1 over 280ms, with a little overshoot). Web Animations
 * rather than a stylesheet, because this page adds no CSS; transform and
 * opacity only, and skipped when the visitor asks for less motion. `key`
 * changes on every copy, so a repeat copy pops again.
 */
export function usePop(ref: RefObject<HTMLElement>, on: boolean, key: unknown) {
  useEffect(() => {
    const el = ref.current
    if (!on || !el || typeof el.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { transform: 'scale(0.4)', opacity: 0 },
        { transform: 'scale(1.2)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    )
  }, [ref, on, key])
}
