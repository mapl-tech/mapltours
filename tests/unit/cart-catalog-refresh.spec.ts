import { describe, test, expect, vi } from 'vitest'

/**
 * A saved cart line is a REFERENCE to a tour, not a copy of it.
 *
 * addItem spreads the whole Experience into the cart and persist writes that
 * to localStorage, so a saved line is a snapshot of the catalog as it stood
 * the day it was added. Before `merge` re-hydrated from the catalog, editing a
 * tour never reached anyone already holding a cart: the tour-details accordion
 * at checkout rendered empty for them because their stored line predated the
 * `about` / `included` / `bring` content, and migrate only re-runs on a
 * version bump. These guard that a cart always shows the LIVE catalog while
 * still keeping the only things the guest actually chose.
 */

const STALE_KEY = 'mapl-cart'

/** A cart saved before the tours carried any detail content. */
const staleCart = (id: number, travelers: number, date: string) =>
  JSON.stringify({
    state: {
      items: [{
        id,
        title: 'An old title the catalog has since changed',
        price: 1,
        duration: '2 hrs',
        travelers,
        date,
      }],
      stops: [],
      pickup: '',
      dropoff: '',
      pickupTime: '',
    },
    version: 2,
  })

/**
 * A fresh store bound to a fresh storage. persist captures its storage when
 * the module is first evaluated, so the module has to be reset per test or
 * every case would read the first test's localStorage.
 */
async function loadStoreWith(seed: string | null) {
  vi.resetModules()
  installStorage(seed)
  const { useCartStore } = await import('../../lib/cart')
  await useCartStore.persist.rehydrate()
  return useCartStore
}

function installStorage(seed: string | null) {
  const store = new Map<string, string>()
  if (seed) store.set(STALE_KEY, seed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

describe('a rehydrated cart follows the live catalog', () => {
  test('a line saved before the detail content was written gets it back', async () => {
    const useCartStore = await loadStoreWith(staleCart(2, 3, '2026-09-14'))
    const { experiences } = await import('../../lib/experiences')

    const item = useCartStore.getState().items[0]
    const live = experiences.find((e) => e.id === 2)!

    // The catalog wins on everything that describes the tour.
    expect(item.title).toBe(live.title)
    expect(item.price).toBe(live.price)
    expect(item.bring).toEqual(live.bring)
    expect(item.included).toEqual(live.included)
    expect(item.ages).toBe(live.ages)
    expect(item.about).toBe(live.about)
  })

  test('what the guest chose survives the refresh', async () => {
    const useCartStore = await loadStoreWith(staleCart(2, 3, '2026-09-14'))

    const item = useCartStore.getState().items[0]
    expect(item.travelers).toBe(3)
    expect(item.date).toBe('2026-09-14')
  })

  test('a tour pulled from the catalog drops out instead of throwing', async () => {
    const useCartStore = await loadStoreWith(staleCart(9999, 2, '2026-09-14'))

    expect(useCartStore.getState().items).toHaveLength(0)
  })
})
