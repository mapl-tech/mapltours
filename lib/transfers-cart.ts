import { getTransferPrice } from '@/lib/airport-transfers'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { TransferQuote, TransferTripType } from './airport-transfers'

/**
 * Transfers cart, separate from the tour cart (`mapl-cart`) so the two
 * flows never step on each other's state. The checkout screens and the
 * pay-button wiring at `/transfers/checkout` only read from this store.
 */

export interface TransferCartItem {
  /** Stable id built from destination + trip type, makes addItem idempotent. */
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
        // Idempotent, if the same destination + trip type already exists,
        // update the passenger count instead of adding a duplicate.
        if (items.some((i) => i.id === id)) {
          // Refresh the PRICE as well as the passenger count: re-adding a line
          // must never leave a stale fare behind (it would fail checkout).
          set({
            items: items.map((i) =>
              i.id === id
                ? { ...i, passengers: quote.passengers, priceUsd: quote.priceUsd }
                : i,
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

      // Prices from lib/airport-transfers are ALL-IN: the driver's rate, MAPL's
      // margin and card processing are already inside the number quoted to the
      // customer, so there is no separate fee line at checkout. The server
      // still records the driver-cost / margin split on the booking.
      subtotal: () => get().items.reduce((sum, i) => sum + i.priceUsd, 0),

      fee: () => 0,

      grandTotal: () => get().subtotal(),
    }),
    {
      name: 'mapl-transfers-cart',
      // v2: prices became ALL-IN (driver cost + margin + card processing) and
      // are per destination rather than per zone. A cart persisted under v1
      // holds retired fares, which the server rejects as a total mismatch and
      // which a reload alone can never clear. Re-derive every line from the
      // live rate table, dropping any destination that no longer exists.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { items?: TransferCartItem[] } | undefined
        if (!state || version >= 2) return state as TransfersCartStore
        const items = (state.items ?? []).flatMap((i) => {
          const priceUsd = getTransferPrice(i.destinationId, i.tripType)
          return priceUsd === null ? [] : [{ ...i, priceUsd }]
        })
        return { ...state, items } as TransfersCartStore
      },
    },
  ),
)
