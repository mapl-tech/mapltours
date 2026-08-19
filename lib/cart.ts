import { tourPrice, experiences } from './experiences'
import { bestInsertIndex, bestSlotForStop, canMoveItem, fitStopAfter, fitTourToDay, movedOrder } from './day-route'
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
  /**
   * Where the stop sits: after the cart item with this id, or before the first
   * tour of the day when null. A stop is never free-floating — it hangs off
   * the tour order — which is what keeps a cart of nothing but restaurants
   * from being bookable. See lib/day-route.ts for the rules this field exists
   * to make expressible.
   */
  afterId: number | null
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
  addStop: (stop: Omit<FoodStop, 'afterId'> & { afterId?: number | null }) => void
  removeStop: (name: string) => void
  isStopAdded: (name: string) => boolean
  /** Move one tour a single place earlier or later in the day. */
  moveItem: (id: number, direction: -1 | 1) => void
  /** Names of stops dropped because the tour they sat with was removed. */
  droppedStops: string[]
  clearDroppedStops: () => void
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

/**
 * Give every stored stop a tour to sit behind, and drop the ones that cannot
 * have one.
 *
 * Stops predate the rule that ties them to a tour, so a cart saved a week ago
 * holds stops with no `afterId` at all; a cart saved this morning can hold one
 * whose tour has since left the catalog. Rehydrating either as-is would
 * restore a day the store itself would refuse to build — one that opens with
 * lunch, or stacks two stops in a row.
 */
function rehomeStops(items: CartItem[], stops: FoodStop[] | undefined): FoodStop[] {
  if (items.length === 0 || !stops?.length) return []
  const kept: FoodStop[] = []
  for (const stop of stops) {
    const ctx = { items, stops: kept }
    const slotExists =
      stop.afterId === null || items.some((i) => i.id === stop.afterId)
    if (slotExists && stop.afterId !== undefined && fitStopAfter(stop, stop.afterId, ctx).allowed) {
      kept.push(stop)
      continue
    }
    const slot = bestSlotForStop(stop, ctx)
    if (slot) kept.push({ ...stop, afterId: slot.afterId })
  }
  return kept
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
      /**
       * A food stop rides along a tour day; it is never the day itself. It
       * joins by attaching to one tour — the caller may name it, otherwise
       * the best legal host is chosen — and the attachment is what enforces
       * the shape of a day: it cannot land before the first tour, it cannot
       * land beside another stop (one host, one stop), and it cannot land
       * more than half an hour from what it would sit between. All three are
       * checked here so no caller can route around them; see lib/day-route.
       *
       * Refusal is silent by design — every surface that offers a stop asks
       * fitCandidateStop() first and explains the rule in place, so a refusal
       * here means something got past the UI, not that a guest is ignored.
       */
      addStop: (stop) => set((state) => {
        if (state.stops.some((s) => s.name === stop.name)) return state
        const ctx = { items: state.items, stops: state.stops }
        const slot = stop.afterId !== undefined
          ? { afterId: stop.afterId, fit: fitStopAfter(stop, stop.afterId, ctx) }
          : bestSlotForStop(stop, ctx)
        if (!slot || !slot.fit.allowed) return state
        return {
          stops: [...state.stops, { ...stop, afterId: slot.afterId }],
          droppedStops: [],
        }
      }),
      removeStop: (name) => set((state) => ({ stops: state.stops.filter((s) => s.name !== name) })),

      /**
       * Reorder the day by hand, one place at a time.
       *
       * Refused when the new order would strand a food stop — the guest owns
       * the order, but only among orders a driver could actually run. The UI
       * disables the arrow and says which stop would break, so this guard is
       * the floor rather than the explanation.
       */
      moveItem: (id, direction) => set((state) => {
        const ctx = { items: state.items, stops: state.stops }
        if (!canMoveItem(ctx, id, direction).ok) return state
        const next = movedOrder(state.items, id, direction)
        return next ? { items: next } : state
      }),

      droppedStops: [],
      clearDroppedStops: () => set({ droppedStops: [] }),
      isStopAdded: (name) => get().stops.some((s) => s.name === name),

      addItem: (exp: Experience) => {
        const { items } = get()
        if (items.some((i) => i.id === exp.id)) return
        // A ready-made package day and a self-built day are two different
        // ways to buy, and an itinerary is one or the other. Mixing them
        // double-books attractions (every package bundles activities also
        // sold singly) and makes the day impossible to sequence. Adding
        // either kind therefore clears the other kind.
        //
        // Two PACKAGES can also collide with each other, which the kind test
        // alone never caught: five pairs in the current catalogue bundle the
        // same activity (Zipline + ATV and Triple Pack share both the zipline
        // and the ATV). Holding both charged the guest twice for one ride and
        // sent the operator a day with the same attraction on it twice, so an
        // incoming item also evicts anything it overlaps with.
        const incoming = new Set<number>([exp.id, ...(exp.includes ?? [])])
        const kept = items.filter(
          (i) =>
            i.kind === exp.kind &&
            ![i.id, ...(i.includes ?? [])].some((id) => incoming.has(id)),
        )
        // Join the day that already exists rather than resetting it.
        //
        // A checkout is ONE day with ONE party size, and the review step
        // enforces that by collapsing every line onto items[0]. Seeding a new
        // line from constants therefore did not just give that line the
        // defaults, it imposed them on the whole cart: bestInsertIndex often
        // places the new tour first, so a guest who set four travelers on
        // 1 October and then added a second tour had their cart silently
        // rewritten to one traveler on the default date, and was quoted and
        // dispatched for one person.
        const line = {
          ...exp,
          travelers: kept[0]?.travelers ?? 1,
          date: kept[0]?.date || defaultDate(),
        }
        // A day's tours have to be drivable between — see MAX_TOUR_GAP_MIN.
        // Every surface that offers a tour asks fitTourToDay() first and says
        // so on the button, and this is the floor under that.
        if (!fitTourToDay(line, { items: kept, stops: get().stops }).allowed) return
        // Slot it where it adds the least driving rather than at the end. Tap
        // order has nothing to do with geography, and the day is read top to
        // bottom as a route; the guest can still move it at checkout.
        const at = bestInsertIndex(kept, line)
        const next = [...kept]
        next.splice(at, 0, line)
        set({ items: next, droppedStops: [] })
      },

      /**
       * Cart items this experience would replace if added now.
       *
       * Must agree with addItem's own filter, or the confirmation dialog
       * promises to keep a package that addItem is about to drop.
       */
      conflictsInCart: (exp: Experience) => {
        const incoming = new Set<number>([exp.id, ...(exp.includes ?? [])])
        return get().items.filter(
          (i) =>
            i.id !== exp.id &&
            (i.kind !== exp.kind ||
              [i.id, ...(i.includes ?? [])].some((id) => incoming.has(id))),
        )
      },

      removeItem: (id: number) => {
        const state = get()
        const items = state.items.filter((i) => i.id !== id)

        // Losing the last tour dissolves the day, and free food stops cannot
        // outlive it: nothing is sold, nothing is charged, and no driver is
        // dispatched for lunch alone.
        if (items.length === 0) {
          set({ items, stops: [], droppedStops: state.stops.map((s) => s.name) })
          return
        }

        // A stop whose host tour just left needs a new one. Re-home it to the
        // best tour that can legally take it; if no tour can, the stop goes,
        // because the alternative is an itinerary that breaks its own rules.
        // Either way the names are recorded so the UI can say what happened
        // rather than letting a chosen stop quietly disappear.
        const dropped: string[] = []
        const stops: FoodStop[] = []
        for (const stop of state.stops) {
          if (stop.afterId !== id) {
            stops.push(stop)
            continue
          }
          const slot = bestSlotForStop(stop, { items, stops })
          if (slot) stops.push({ ...stop, afterId: slot.afterId })
          else dropped.push(stop.name)
        }
        set({ items, stops, droppedStops: dropped })
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

      clearCart: () => set({ items: [], stops: [], pickup: '', dropoff: '', pickupTime: '', droppedStops: [] }),

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
      version: 3,
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
        // v3: a stop now names the tour it follows.
        return { ...state, items, stops: rehomeStops(items, state.stops) } as CartStore
      },
      // A cart line is a REFERENCE to a tour, not a copy of it. addItem spreads
      // the whole Experience into the cart, so the saved line is a snapshot of
      // the catalog as it stood the day it was added — an edit to a price, a
      // description or the what-to-bring list never reached anyone holding a
      // cart, because migrate only re-runs on a version bump. Rebuilding every
      // line from the live catalog on each rehydration means the only thing
      // localStorage genuinely owns is what the GUEST chose: which tour, how
      // many travelers, which date. Tours pulled from the catalog drop out.
      merge: (persisted, current) => {
        const state = (persisted ?? {}) as Partial<CartStore>
        const items = (state.items ?? []).flatMap((i) => {
          const live = experiences.find((e: Experience) => e.id === i.id)
          if (!live) return []
          return [{ ...live, travelers: i.travelers ?? 1, date: i.date ?? '' }]
        })
        const stops = rehomeStops(items, state.stops)
        return { ...current, ...state, items, stops, droppedStops: [] }
      },
    }
  )
)
