import { describe, test, expect, vi } from 'vitest'

/**
 * A saved transfers cart follows the live rate table (lib/transfers-cart
 * merge). Only a version bump used to reprice a saved cart, so a fare change
 * stranded it: the page sent the old total, the server priced afresh, and
 * "Cart total mismatch, please reload" came back on every reload. Collin's
 * sheet (Oct 2026) moved the five-to-seven-guest fares for the two Bahia
 * Principe hotels and Iberostar Selection.
 */
const KEY = 'mapl-transfers-cart'

const savedCart = (line: Record<string, unknown>) =>
  JSON.stringify({
    state: {
      items: [{
        id: 'saved-line',
        destinationName: 'An old name',
        parish: 'St. Ann',
        zone: 'D',
        zoneLabel: 'An old zone label',
        zoneDuration: 'An old drive time',
        fromAirport: true,
        arrivalAt: '2026-12-10T14:30',
        arrivalFlight: 'AA123',
        departureAt: '2026-12-17T16:00',
        departureFlight: 'AA456',
        ...line,
      }],
    },
    version: 7,
  })

function installStorage(seed: string | null) {
  const store = new Map<string, string>()
  if (seed) store.set(KEY, seed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

/** A fresh store on a fresh storage: persist binds its storage at module load. */
async function loadStoreWith(seed: string | null) {
  vi.resetModules()
  installStorage(seed)
  const { useTransfersCart } = await import('../../lib/transfers-cart')
  await useTransfersCart.persist.rehydrate()
  return useTransfersCart
}

describe('a rehydrated transfers cart follows the live rate table', () => {
  test('a fare saved before a rate change comes back at the live fare, for the party size', async () => {
    const store = await loadStoreWith(savedCart({ destinationId: 'bahia-principe-escape', tripType: 'round_trip', passengers: 6, priceUsd: 264 }))
    const { getTransferPrice, getDestination, ZONES } = await import('../../lib/airport-transfers')
    const item = store.getState().items[0]
    const live = getTransferPrice('bahia-principe-escape', 'round_trip', 6)
    expect(live).not.toBe(264)
    expect(item.priceUsd).toBe(live)
    expect(store.getState().grandTotal()).toBe(live)
    // The name and zone are the live ones too.
    expect(item.destinationName).toBe(getDestination('bahia-principe-escape')!.name)
    expect(item.zoneLabel).toBe(ZONES.D.label)
    expect(item.zoneDuration).toBe(ZONES.D.duration)
  })

  test("the guest's choices are kept as they were", async () => {
    const store = await loadStoreWith(savedCart({ destinationId: 'iberostar-selection-rose-hall', tripType: 'one_way', passengers: 7, priceUsd: 62 }))
    const item = store.getState().items[0]
    expect(item).toMatchObject({
      id: 'saved-line', destinationId: 'iberostar-selection-rose-hall', tripType: 'one_way', passengers: 7, fromAirport: true,
      arrivalAt: '2026-12-10T14:30', arrivalFlight: 'AA123',
    })
  })

  test('a hotel no longer listed drops out instead of keeping a fare the server will refuse', async () => {
    const store = await loadStoreWith(savedCart({ destinationId: 'a-hotel-that-closed', tripType: 'one_way', passengers: 2, priceUsd: 40 }))
    expect(store.getState().items).toEqual([])
  })
})
