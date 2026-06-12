'use client'

import { useEffect } from 'react'

/**
 * Lightweight scroll-reveal. Adds `html.js-reveal` (which arms the CSS in
 * globals.css) then observes every `[data-reveal]` element and toggles
 * `.is-in` when it scrolls into view. If JS never runs, the CSS stays
 * inert and all content is visible — so this can only ADD motion, never
 * hide content. Honors prefers-reduced-motion (the global guard collapses
 * the transitions, so elements simply appear).
 */
export default function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return // leave everything visible, no arming

    root.classList.add('js-reveal')

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    )

    const seen = new WeakSet<Element>()
    const scan = () => {
      document.querySelectorAll('[data-reveal]').forEach((el) => {
        if (seen.has(el)) return
        seen.add(el)
        // Anything already above the fold reveals immediately.
        const top = el.getBoundingClientRect().top
        if (top < window.innerHeight * 0.92) el.classList.add('is-in')
        else io.observe(el)
      })
    }

    scan()
    // Re-scan as client-rendered sections mount / route changes paint.
    const mo = new MutationObserver(() => scan())
    mo.observe(document.body, { childList: true, subtree: true })

    return () => { io.disconnect(); mo.disconnect() }
  }, [])

  return null
}
