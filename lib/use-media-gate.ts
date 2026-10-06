'use client'

import { useEffect, useState } from 'react'

/*
 * When a page may start its videos.
 *
 * A <video> that starts loading while the page is still coming in holds back
 * the page's first frame: measured Oct 6 2026 in Lighthouse's phone profile,
 * the tour reel, whose clip was in the server HTML, stayed blank until 2.4 s
 * although its HTML, styles, fonts and scripts were all in by 0.5 s; with the
 * clip blocked it painted at 0.7 s. The poster is the clip's first frame, so
 * waiting for it costs nothing to look at.
 */

/** True once the page has painted a frame (two animation frames after mount). */
export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setReady(true)) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [])
  return ready
}

/**
 * True `delayMs` after the window's load event, so the page's images (the
 * largest of which is usually the one being judged) are in and painted first.
 * Capped at `capMs` from mount: a slow third-party request can hold the load
 * event for many seconds on a phone.
 */
export function useAfterLoad(delayMs = 300, capMs = 3000): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let done = false
    const go = () => { if (!done) { done = true; setReady(true) } }
    let afterLoad: ReturnType<typeof setTimeout> | undefined
    const onLoad = () => { afterLoad = setTimeout(go, delayMs) }
    if (document.readyState === 'complete') onLoad()
    else window.addEventListener('load', onLoad, { once: true })
    const cap = setTimeout(go, capMs)
    return () => {
      window.removeEventListener('load', onLoad)
      if (afterLoad) clearTimeout(afterLoad)
      clearTimeout(cap)
    }
  }, [delayMs, capMs])
  return ready
}
