import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Experience } from './experiences'

export interface CartItem extends Experience {
  travelers: number
  date: string
}

/**
 * Maximum tour hours allowed per single travel day. Beyond this, the user
 * must either remove experiences or move them to a different date.
 */
export const DAILY_HOUR_LIMIT = 8

export function parseDurationHours(duration: string): number {
  if (/full\s*day/i.test(duration)) return 8
  if (/half\s*day/i.test(duration)) return 4
  const match = duration.match(/([\d.]+)\s*hr/i)
  return match ? parseFloat(match[1]) : 3
}

interface CartStore {
  items: CartItem[]
  pickup: string
  dropoff: string
  addItem: (exp: Experience) => void
  removeItem: (id: number) => void
  updateTravelers: (id: number, travelers: number) => void
  updateDate: (id: number, date: string) => void
  setPickup: (location: string) => void
  setDropoff: (location: string) => void
  clearCart: () => void
  isInCart: (id: number) => boolean
  subtotal: () => number
  fee: () => number
  grandTotal: () => number
  /** Total tour hours per booking date, e.g. { '2026-05-01': 7, '2026-05-02': 4 }. */
  hoursByDate: () => Record<string, number>
  /** The largest single day's tour-hours — the one that would hit the 8-hr cap. */
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
      pickup: '',
      dropoff: '',

      addItem: (exp: Experience) => {
        const { items } = get()
        if (items.some((i) => i.id === exp.id)) return
        set({ items: [...items, { ...exp, travelers: 2, date: defaultDate() }] })
      },

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
      setDropoff: (location: string) => set({ dropoff: location }),

      clearCart: () => set({ items: [], pickup: '', dropoff: '' }),

      isInCart: (id: number) => get().items.some((i) => i.id === id),

      subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.travelers, 0),

      // Flat 20% service fee on subtotal — covers platform costs, support,
      // and the tour-guide rate bundled into the per-experience price.
      fee: () => Math.round(get().subtotal() * 0.20),

      grandTotal: () => get().subtotal() + get().fee(),

      hoursByDate: () => {
        const map: Record<string, number> = {}
        for (const item of get().items) {
          const key = item.date || 'unset'
          map[key] = (map[key] ?? 0) + parseDurationHours(item.duration)
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
        // Use the busiest day as the reference — that's the one that will
        // overflow next. Clamp at 0 when the cap is already met/exceeded.
        return Math.max(0, DAILY_HOUR_LIMIT - Math.max(...values))
      },
    }),
    { name: 'mapl-cart' }
  )
)
