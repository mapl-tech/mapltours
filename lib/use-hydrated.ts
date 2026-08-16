'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * True only after hydration has completed for THIS component.
 *
 * Why not a mounted-flag effect: route content inside a Suspense boundary
 * (e.g. /explore via useSearchParams) hydrates AFTER the layout shell's
 * effects have run. By then LayoutShell has already rehydrated the cart
 * store, so a boundary component's hydration render can read a non-empty
 * cart while the server HTML was rendered empty, and React discards the
 * whole boundary ("Switched to client rendering"). useSyncExternalStore's
 * server snapshot is used for the hydration render itself, so this returns
 * false exactly when the markup must match SSR, regardless of hydration
 * order.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
