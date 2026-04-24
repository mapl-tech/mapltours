import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TransferQuote, TransferTripType } from './airport-transfers'

/**
 * Transfers cart — separate from the tour cart (`mapl-cart`) so the two
 * flows never step on each other's state. The checkout screens and the
 * pay-button wiring at `/transfers/checkout` only read from this store.
 */

export interface TransferCartItem {
  /** Stable id built from destination + trip type — makes addItem idempotent. */
  id: string
  destinationId: string
  destinationName: string
  parish: string
  zone: string
  zoneLabel: string
  zoneDuration: string
  tripType: TransferTripType
  passengers: number
  priceUsd: number
  /** ISO "YYYY-MM-DDTHH:MM" (datetime-local input format). */
  arrivalAt?: string
  arrivalFlight?: string
  departureAt?: string
  departureFlight?: string
}

function makeId(destinationId: string, tripType: TransferTripType): string {
  return `xfer-${destinationId}-${tripType}`
}

interface TransfersCartStore {
  items: TransferCartItem[]
  addQuote: (quote: TransferQuote) => void
  removeItem: (id: string) => void
  updateItem: (id: string, patch: Partial<TransferCartItem>) => void
  clearCart: () => void
  subtotal: () => number
  fee: () => number
  grandTotal: () => number
}

export const useTransfersCart = create<TransfersCartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addQuote: (quote) => {
        const id = makeId(quote.destinationId, quote.tripType)
        const { items } = get()
        // Idempotent — if the same destination + trip type already exists,
        // update the passenger count instead of adding a duplicate.
        if (items.some((i) => i.id === id)) {
          set({
            items: items.map((i) =>
              i.id === id ? { ...i, passengers: quote.passengers } : i,
            ),
          })
          return
        }
        const item: TransferCartItem = {
          id,
          destinationId: quote.destinationId,
          destinationName: quote.destinationName,
          parish: quote.parish,
          zone: quote.zone,
          zoneLabel: quote.zoneLabel,
          zoneDuration: quote.zoneDuration,
          tripType: quote.tripType,
          passengers: quote.passengers,
          priceUsd: quote.priceUsd,
        }
        set({ items: [...items, item] })
      },

      removeItem: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

      updateItem: (id, patch) => {
        set({
          items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })
      },

      clearCart: () => set({ items: [] }),

      subtotal: () => get().items.reduce((sum, i) => sum + i.priceUsd, 0),

      // Transfers already include a driver rate, so the platform service fee
      // is leaner than tours — 5% flat. Keeps flat-rate transparency intact.
      fee: () => Math.round(get().subtotal() * 0.05),

      grandTotal: () => get().subtotal() + get().fee(),
    }),
    { name: 'mapl-transfers-cart', version: 1 },
  ),
)
