'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
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
