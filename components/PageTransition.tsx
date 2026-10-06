'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/*
 * Fades the page in when the guest moves to another page. Never on the
 * first load: there the server HTML shows as it arrives. It used to fade in
 * from opacity 0, and fade again from 0 when React hydrated, and Chrome does
 * not count anything painted at opacity 0 as the page's content (Oct 6
 * 2026): the home poster was skipped, so the hero clip, a second later,
 * became the largest paint, and text only counted once the fonts or the
 * scripts repainted it.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  // The page on screen. A ref, not a mounted flag, so a repeated effect
  // (React's strict mode in development) does not count as a navigation.
  const shown = useRef(pathname)

  useEffect(() => {
    if (shown.current === pathname) return
    shown.current = pathname
    setVisible(false)
    const timer = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(timer)
  }, [pathname])

  // The floor is the DYNAMIC viewport (.page-shell, with a 100vh fallback
  // for browsers without dvh). It was 100vh, which on iPhone Safari is the
  // taller toolbars-hidden viewport: with the toolbars showing that left
  // about 100px of document below the reel's 100dvh stage, and whenever
  // iOS nudged the page into that slack (keyboard, a drag on the fixed bar,
  // a toolbar transition) the reel slid up, the fixed Checkout bar stayed,
  // and a white band showed between them. With dvh the document is exactly
  // one viewport on that route in every toolbar state, so there is nothing
  // to scroll into.
  return (
    <div className={`page-shell${visible ? ' page-enter' : ''}`}>
      {children}
    </div>
  )
}
