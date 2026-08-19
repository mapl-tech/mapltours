import { getTransferPrice, getDestination, ZONES } from '@/lib/airport-transfers'
import { trackAddToCart } from './analytics'
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
  /**
   * True when the ride starts at Sangster. Optional so carts persisted before
   * the direction was asked for still load; the server falls back to the old
   * inference when it is absent.
   */
  fromAirport?: boolean
  /** ISO "YYYY-MM-DDTHH:MM" (datetime-local input format). */
  arrivalAt?: string
  arrivalFlight?: string
  departureAt?: string
  departureFlight?: string
}

/**
 * Direction is part of a one-way's identity. Without it, an airport-to-hotel
 * ride and the hotel-to-airport ride home share an id, so adding the second
 * silently overwrites the first and the guest pays for one leg believing they
 * bought two. A round-trip always starts at the airport, so it needs no suffix.
 */
function makeId(destinationId: string, tripType: TransferTripType, fromAirport = true): string {
  const base = `xfer-${destinationId}-${tripType}`
  return tripType === 'one_way' && !fromAirport ? `${base}-to-airport` : base
}

interface TransfersCartStore {
  items: TransferCartItem[]
  addQuote: (quote: TransferQuote, opts?: { fromAirport?: boolean }) => void
  removeItem: (id: string) => void
  updateItem: (id: string, patch: Partial<TransferCartItem>) => void
  /**
   * Change the route, direction or party size of an existing line.
   *
   * Separate from updateItem because all three inputs change the FARE and two
   * of them change the item's id. A plain patch would leave a stale price on
   * the line, which the server recomputes and rejects as a total mismatch —
   * the guest would see a correct-looking cart that cannot be paid for.
   * Flight details already entered are carried across untouched.
   */
  reviseItem: (
    id: string,
    next: {
      destinationId?: string
      fromAirport?: boolean
      passengers?: number
      tripType?: TransferTripType
    },
  ) => void
  clearCart: () => void
  subtotal: () => number
  fee: () => number
  grandTotal: () => number
}

export const useTransfersCart = create<TransfersCartStore>()(
  persist(
    (set, get) => ({
      items: [],

      /**
       * One transfer at a time. Adding a quote REPLACES whatever was there.
       *
       * A transfer books a specific vehicle and driver against a specific
       * flight. Letting several sit in one cart invited a guest to buy two
       * rides for the same arrival — and because a round-trip is already a
       * single line covering both legs, a second line is nearly always a
       * duplicate rather than a genuine second journey. Someone who truly
       * needs another ride books it separately, which is also what dispatch
       * needs: one booking, one vehicle, one driver.
       */
      addQuote: (quote, opts) => {
        const id = makeId(quote.destinationId, quote.tripType, opts?.fromAirport ?? true)
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
          // A round-trip always begins at the airport; only a one-way can run
          // the other way, so default rather than leaving it undefined.
          fromAirport: opts?.fromAirport ?? true,
        }
        set({ items: [item] })
        trackAddToCart({
          value: item.priceUsd,
          currency: 'USD',
          items: [{
            id: item.destinationId,
            name: `Airport transfer, ${item.destinationName}`,
            category: item.tripType === 'round_trip' ? 'transfer round trip' : 'transfer one way',
            price: item.priceUsd,
            quantity: 1,
          }],
        })
      },

      reviseItem: (id, next) => {
        const { items } = get()
        const current = items.find((i) => i.id === id)
        if (!current) return

        const destinationId = next.destinationId ?? current.destinationId
        const tripType = next.tripType ?? current.tripType
        // A round-trip always begins at the airport, so switching to one
        // settles the direction too.
        const fromAirport =
          tripType === 'round_trip' ? true : next.fromAirport ?? current.fromAirport ?? true
        const passengers = Math.max(1, Math.min(4, next.passengers ?? current.passengers))

        const dest = getDestination(destinationId)
        const priceUsd = getTransferPrice(destinationId, tripType)
        // An unknown destination or a retired fare must not silently blank the
        // price; leave the line exactly as it was and let the guest retry.
        if (!dest || priceUsd === null) return

        const zone = ZONES[dest.zone]
        set({
          items: items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  id: makeId(destinationId, tripType, fromAirport),
                  tripType,
                  // Drop the leg that no longer exists. Leaving a stale
                  // departure time on a one-way out of the airport would fail
                  // the server's flight-number check on a leg the guest is not
                  // actually taking.
                  ...(tripType === 'one_way' && fromAirport
                    ? { departureAt: undefined, departureFlight: undefined }
                    : {}),
                  ...(tripType === 'one_way' && !fromAirport
                    ? { arrivalAt: undefined, arrivalFlight: undefined }
                    : {}),
                  destinationId,
                  destinationName: dest.name,
                  parish: dest.parish,
                  zone: dest.zone,
                  zoneLabel: zone?.label ?? i.zoneLabel,
                  zoneDuration: zone?.duration ?? i.zoneDuration,
                  fromAirport,
                  passengers,
                  priceUsd,
                }
              : i,
          ),
        })
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
      // are per destination rather than per zone.
      // v3: prices grew a 5% Remitly cover. v4: round trips gained Collin's
      // 10% discount. v5: seven estimated rates recalibrated against real
      // geography and one closed resort removed. Any cart persisted under an
      // older version holds retired
      // fares, which the server rejects as a total mismatch and which a
      // reload alone can never clear. Re-derive every line from the live rate
      // table, dropping destinations that no longer exist.
      // v6: removed a duplicate Falmouth destination that differed from the
      // real one by a single letter. Two ids for one hotel meant a guest could
      // hold both in a cart and pay twice for the same ride.
      // v7: one transfer per cart. Carts saved under v6 may hold several, and
      // those are exactly the double-bookings this is meant to prevent, so the
      // migration keeps the most recently added and drops the rest.
      version: 7,
      migrate: (persisted, version) => {
        const state = persisted as { items?: TransferCartItem[] } | undefined
        if (!state || version >= 7) return state as TransfersCartStore
        const repriced = (state.items ?? []).flatMap((i) => {
          const priceUsd = getTransferPrice(i.destinationId, i.tripType)
          return priceUsd === null ? [] : [{ ...i, priceUsd }]
        })
        // Keep the last one added; it is the one the guest was most recently
        // looking at, and silently keeping the FIRST would drop the choice
        // they just made.
        const items = repriced.slice(-1)
        return { ...state, items } as TransfersCartStore
      },
    },
  ),
)
