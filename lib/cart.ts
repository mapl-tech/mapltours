import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Experience } from './experiences'

export interface CartItem extends Experience {
  travelers: number
  date: string
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

      fee: () => Math.round(get().subtotal() * 0.05),

      grandTotal: () => get().subtotal() + get().fee(),
    }),
    { name: 'mapl-cart' }
  )
)
