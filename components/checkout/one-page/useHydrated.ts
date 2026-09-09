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
export function useHydrated(store: { persist?: PersistApi }): boolean {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    const api = store.persist
    if (!api) return
    if (api.hasHydrated()) {
      setHydrated(true)
      return
    }
    return api.onFinishHydration(() => setHydrated(true))
  }, [store])
  return hydrated
}
