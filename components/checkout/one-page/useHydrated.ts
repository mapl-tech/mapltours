'use client'

import { useEffect, useState } from 'react'

interface PersistApi {
  hasHydrated: () => boolean
  onFinishHydration: (cb: () => void) => () => void
}

/**
 * True once a persisted Zustand store has loaded from localStorage.
 *
 * The cart store uses skipHydration and is rehydrated by LayoutShell after
 * mount, so for the first paint every cart is empty. The old checkout rendered
 * "Your itinerary is empty" during that window, up to three seconds on a slow
 * connection, and guests who had just tapped "Add to Trip" read it as the add
 * having failed. Render a loading state until this says true.
 *
 * Always false on the first render, on the server and on the client alike:
 * zustand's persist middleware does not attach `store.persist` at all where
 * localStorage is unavailable (so reading it during SSR throws), and a store
 * that hydrates synchronously would otherwise render content on the client's
 * first pass while the server sent the loading state, which React reports as
 * a hydration mismatch. One extra render after mount is the price, and it is
 * invisible.
 */
const HYDRATION_GRACE_MS = 1500

export function useHydrated(store: { persist?: PersistApi }): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const api = store.persist
    // No persist API means the browser refused localStorage: there is nothing
    // to wait for, the store is as loaded as it will ever be (empty).
    if (!api) { setHydrated(true); return }
    if (api.hasHydrated()) {
      setHydrated(true)
      return
    }
    const off = api.onFinishHydration(() => setHydrated(true))
    // A stored value that cannot be read back (cut short, hand-edited) makes
    // zustand abandon the load without ever reporting it finished, and the
    // page sat on "Loading your trip…" for good. After a moment, show the
    // page with whatever the store holds.
    const giveUp = window.setTimeout(() => setHydrated(true), HYDRATION_GRACE_MS)
    return () => { off(); window.clearTimeout(giveUp) }
  }, [store])
  return hydrated
}
