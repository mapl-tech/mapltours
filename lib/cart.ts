import { tourPrice, experiences } from './experiences'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Experience } from './experiences'

export interface CartItem extends Experience {
  travelers: number
  date: string
}

/**
 * A free food stop the guest wants Collins to work into the route. Stops
 * carry NO price and are deliberately invisible to subtotal(), fee() and
 * grandTotal(); at checkout they ride along as note text only, so the
 * money flow cannot be affected by them.
 */
export interface FoodStop {
  name: string
  town: string
  parish: string
  knownFor: string
  image: string
  mapsQuery: string
}

/**
 * Maximum tour hours allowed per single travel day. Beyond this, the user
 * must either remove experiences or move them to a different date.
 */
/**
 * Time a free food stop takes out of the day.
 *
 * A stop costs MAPL nothing and the guest pays the venue directly, but it
 * absolutely costs the DAY — parking, sitting down, eating, getting back on
 * the road. Counting it as zero let a guest fill eight hours with tours and
 * then add three lunches, producing an itinerary no driver could actually run.
 *
 * Real stops run one to two hours; the midpoint is banked. Nobody is hurried
 * out of Scotchies at the sixty-minute mark, and budgeting the full two would
 * make a day with two stops look impossible when it usually is not.
 */
export const STOP_HOURS = 1.5

export const DAILY_HOUR_LIMIT = 8

export function parseDurationHours(duration: string): number {
  if (/full\s*day/i.test(duration)) return 8
  if (/half\s*day/i.test(duration)) return 4
  const match = duration.match(/([\d.]+)\s*hr/i)
  return match ? parseFloat(match[1]) : 3
}

interface CartStore {
  items: CartItem[]
  stops: FoodStop[]
  pickup: string
  dropoff: string
  /**
   * When the day starts, as 'HH:MM'. Dispatch information only — the refund
   * window deliberately still runs off the midnight-Jamaica assumption in
   * lib/booking-window.ts, so capturing a real start time cannot quietly
   * shorten anyone's right to cancel.
   */
  pickupTime: string
  addItem: (exp: Experience) => void
  conflictsInCart: (exp: Experience) => CartItem[]
  removeItem: (id: number) => void
  addStop: (stop: FoodStop) => void
  removeStop: (name: string) => void
  isStopAdded: (name: string) => boolean
  updateTravelers: (id: number, travelers: number) => void
  updateDate: (id: number, date: string) => void
  setPickup: (location: string) => void
  setPickupTime: (time: string) => void
  setDropoff: (location: string) => void
  clearCart: () => void
  isInCart: (id: number) => boolean
  subtotal: () => number
  fee: () => number
  grandTotal: () => number
  /** Total tour hours per booking date, e.g. { '2026-05-01': 7, '2026-05-02': 4 }. */
  hoursByDate: () => Record<string, number>
  /** The largest single day's tour-hours, the one that would hit the 8-hr cap. */
  maxDailyHours: () => number
  /** True if any date exceeds DAILY_HOUR_LIMIT. */
  isDayOverLimit: () => boolean
  /** Hours still available on the *least loaded* day that has any items; 8 when cart is empty. */
  remainingHoursToday: () => number
}

function defaultDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      stops: [],
      pickup: '',
      pickupTime: '',
      dropoff: '',
      addStop: (stop) => set((state) => (
        state.stops.some((s) => s.name === stop.name)
          ? state
          : { stops: [...state.stops, stop] }
      )),
      removeStop: (name) => set((state) => ({ stops: state.stops.filter((s) => s.name !== name) })),
      isStopAdded: (name) => get().stops.some((s) => s.name === name),

      addItem: (exp: Experience) => {
        const { items } = get()
        if (items.some((i) => i.id === exp.id)) return
        // A ready-made package day and a self-built day are two different
        // ways to buy, and an itinerary is one or the other. Mixing them
        // double-books attractions (every package bundles activities also
        // sold singly) and makes the day impossible to sequence. Adding
        // either kind therefore clears the other kind.
        const kept = items.filter((i) => i.kind === exp.kind)
        set({ items: [...kept, { ...exp, travelers: 1, date: defaultDate() }] })
      },

      /** Cart items this experience would replace if added now. */
      conflictsInCart: (exp: Experience) => get().items.filter((i) => i.kind !== exp.kind),

      removeItem: (id: number) => {
        set({ items: get().items.filter((i) => i.id !== id) })
      },

      updateTravelers: (id: number, travelers: number) => {
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, travelers: Math.max(1, Math.min(12, travelers)) } : i
          ),
        })
      },

      updateDate: (id: number, date: string) => {
        set({
          items: get().items.map((i) => (i.id === id ? { ...i, date } : i)),
        })
      },

      setPickup: (location: string) => set({ pickup: location }),
      setPickupTime: (time: string) => set({ pickupTime: time }),
      setDropoff: (location: string) => set({ dropoff: location }),

      clearCart: () => set({ items: [], stops: [], pickup: '', dropoff: '', pickupTime: '' }),

      isInCart: (id: number) => get().items.some((i) => i.id === id),

      // Tours are quoted ALL-IN from the operator's group-tier rate card:
      // the price already covers MAPL's margin and card processing, and a
      // group tour charges one price for the whole party (1..tierMax).
      subtotal: () =>
        get().items.reduce(
          (sum, i) => sum + tourPrice(i.pricing, i.travelers),
          0,
        ),

      // Flat 20% service fee on subtotal, covers platform costs, support,
      // and the tour-guide rate bundled into the per-experience price.
      fee: () => 0,

      grandTotal: () => get().subtotal(),

      hoursByDate: () => {
        const { items, stops } = get()
        const map: Record<string, number> = {}
        for (const item of items) {
          const key = item.date || 'unset'
          map[key] = (map[key] ?? 0) + parseDurationHours(item.duration)
        }
        // Food stops have no date of their own — they belong to the day being
        // built, which is now a single date per checkout. Charge them to the
        // day that has experiences on it; with an empty cart they land on
        // 'unset', which is the same bucket the UI already reads.
        const extra = stops.length * STOP_HOURS
        if (extra > 0) {
          const dayKeys = Object.keys(map)
          const key = dayKeys.length === 1 ? dayKeys[0] : (items[0]?.date || 'unset')
          map[key] = (map[key] ?? 0) + extra
        }
        return map
      },

      maxDailyHours: () => {
        const by = get().hoursByDate()
        const values = Object.values(by)
        return values.length ? Math.max(...values) : 0
      },

      isDayOverLimit: () => {
        const by = get().hoursByDate()
        return Object.values(by).some((h) => h > DAILY_HOUR_LIMIT)
      },

      remainingHoursToday: () => {
        const by = get().hoursByDate()
        const values = Object.values(by)
        if (values.length === 0) return DAILY_HOUR_LIMIT
        // Use the busiest day as the reference, that's the one that will
        // overflow next. Clamp at 0 when the cap is already met/exceeded.
        return Math.max(0, DAILY_HOUR_LIMIT - Math.max(...values))
      },
    }),
    {
      name: 'mapl-cart',
      // Don't read localStorage during render. SSR and the first client
      // render both start empty (identical HTML → no hydration mismatch);
      // LayoutShell calls .persist.rehydrate() after mount to load the cart.
      skipHydration: true,
      // v1: the catalog was replaced and Experience gained `pricing`. A cart
      // saved before that holds items with no `pricing` (and ids that now map
      // to different tours), which would throw inside tourPrice() during
      // render of the cart drawer, i.e. on every page. Re-hydrate each line
      // from the live catalog and drop anything that no longer exists.
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as { items?: CartItem[]; stops?: FoodStop[] } | undefined
        if (!state) return persisted as CartStore
        const items = (state.items ?? []).flatMap((i) => {
          const current = experiences.find((e: Experience) => e.id === i.id)
          if (!current) return []
          return [{ ...current, travelers: i.travelers ?? 1, date: i.date ?? '' }]
        })
        void version
        // v2: food stops joined the cart; older persisted carts have none.
        return { ...state, items, stops: state.stops ?? [] } as CartStore
      },
    }
  )
)
