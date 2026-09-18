'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Renders its children only once the box is within `rootMargin` of the
 * viewport, and keeps them from then on.
 *
 * Why not `loading="lazy"`: Chrome widens its lazy-load distance on slow
 * connections (several screens on 3G-class links), so on exactly the phones
 * that need help, every poster on the home page starts downloading with the
 * hero and the hero lands last. An observer with a fixed margin keeps the
 * first bytes for what is on screen.
 *
 * Sized to fill its positioned parent so a `fill` Image inside it behaves as
 * before. Without IntersectionObserver the children render at once.
 */
export default function InView({ children, rootMargin = '480px 0px', style, className }: {
  children: ReactNode
  rootMargin?: string
  style?: CSSProperties
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect() }
    }, { rootMargin })
    io.observe(el)
    return () => io.disconnect()
  }, [seen, rootMargin])
  return (
    <div ref={ref} className={className} style={{ position: 'absolute', inset: 0, ...style }}>
      {seen ? children : null}
    </div>
  )
}
