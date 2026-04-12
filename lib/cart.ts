import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Experience } from './experiences'

export interface CartItem extends Experience {
  travelers: number
  date: string
}

// Tour guide rate: ~JMD $555/hr ≈ $4 USD/hr (one guide per experience)
const GUIDE_RATE_USD_PER_HOUR = 4

function parseDurationHours(duration: string): number {
  if (/full\s*day/i.test(duration)) return 8
  if (/half\s*day/i.test(duration)) return 4
  const match = duration.match(/([\d.]+)\s*hr/i)
  return match ? parseFloat(match[1]) : 3
}

interface CartStore {
  items: CartItem[]
  addItem: (exp: Experience) => void
  removeItem: (id: number) => void
  updateTravelers: (id: number, travelers: number) => void
  updateDate: (id: number, date: string) => void
  clearCart: () => void
  isInCart: (id: number) => boolean
  subtotal: () => number
  guideCost: () => number
  fee: () => number
  grandTotal: () => number
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

      clearCart: () => set({ items: [] }),

      isInCart: (id: number) => get().items.some((i) => i.id === id),

      subtotal: () => get().items.reduce((sum, i) => sum + i.price * i.travelers, 0),

      guideCost: () => get().items.reduce((sum, i) => sum + parseDurationHours(i.duration) * GUIDE_RATE_USD_PER_HOUR, 0),

      // Service fee = guide cost + 20% platform fee on (subtotal + guide cost)
      fee: () => {
        const guide = get().guideCost()
        const sub = get().subtotal()
        return Math.round((sub + guide) * 0.20) + guide
      },

      grandTotal: () => get().subtotal() + get().fee(),
    }),
    { name: 'mapl-cart' }
  )
)
