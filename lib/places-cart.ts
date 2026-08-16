import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getPlace, type Place } from './places'

/**
 * Places the traveler has added to their itinerary.
 *
 * Deliberately a SEPARATE store from lib/cart.ts. Two reasons, and the first
 * is not stylistic:
 *
 *   • /api/checkout prices every cart line against the experiences catalogue
 *     and throws PricingError('unknown_experience') on anything it cannot
 *     find. A place in the paid cart would fail checkout outright.
 *
 *   • Places carry no price at all. They are settled by the traveler at the
 *     venue. Nothing here may ever reach a total.
 *
 * What a place does carry is TIME, chosen by the traveler, because that is
 * what the driver and the day's routing actually need.
 */

export interface PlaceSelection {
  placeId: string
  /** Hours the traveler wants there, their choice, seeded from the place. */
  hours: number
}

interface PlacesCartStore {
  selections: PlaceSelection[]
  add: (place: Place) => void
  remove: (placeId: string) => void
  setHours: (placeId: string, hours: number) => void
  clear: () => void
  has: (placeId: string) => boolean
  /** Hours for a place, or its suggested default when not added. */
  hoursFor: (placeId: string) => number
  /** Total hours the added places would take. */
  totalHours: () => number
  count: () => number
}

export const usePlacesCart = create<PlacesCartStore>()(
  persist(
    (set, get) => ({
      selections: [],

      add: (place) =>
        set((s) =>
          s.selections.some((x) => x.placeId === place.id)
            ? s
            : { selections: [...s.selections, { placeId: place.id, hours: place.suggestedHours }] },
        ),

      remove: (placeId) =>
        set((s) => ({ selections: s.selections.filter((x) => x.placeId !== placeId) })),

      setHours: (placeId, hours) =>
        set((s) => ({
          selections: s.selections.map((x) =>
            x.placeId === placeId ? { ...x, hours: Math.max(0.5, hours) } : x,
          ),
        })),

      clear: () => set({ selections: [] }),

      has: (placeId) => get().selections.some((x) => x.placeId === placeId),

      hoursFor: (placeId) =>
        get().selections.find((x) => x.placeId === placeId)?.hours ??
        getPlace(placeId)?.suggestedHours ??
        1,

      totalHours: () => get().selections.reduce((sum, x) => sum + x.hours, 0),

      count: () => get().selections.length,
    }),
    {
      name: 'mapl-places',
      // Same reasoning as the cart and language stores: SSR and the first
      // client render must emit identical markup, so the persisted state is
      // loaded after mount (see LayoutShell).
      skipHydration: true,
    },
  ),
)
