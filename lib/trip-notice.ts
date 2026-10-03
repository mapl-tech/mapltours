import { create } from 'zustand'

/**
 * The one "it worked" message for adding a tour, wherever the add happened
 * (the reel, the home rail, a tour card): what it did, the day the tour landed
 * on, and Undo. Rendered once, by components/TripNotice in the layout. Not
 * persisted: it lives for five seconds.
 */
export interface TripNotice {
  id: number
  text: string
  undo?: () => void
  /** Offer Checkout in the notice; off where a checkout button already sits on screen. */
  checkout: boolean
  /**
   * Phones: near the top, so it never covers the card or button just
   * tapped; on the reel ('reel') lower, under its close and counter. Wider
   * screens: bottom right, clear of the reel column and the page.
   */
  placement: 'reel' | 'page'
}

interface TripNoticeStore {
  notice: TripNotice | null
  show: (notice: Omit<TripNotice, 'id'>) => void
  clear: () => void
}

let seq = 0

export const useTripNotice = create<TripNoticeStore>((set) => ({
  notice: null,
  show: (notice) => set({ notice: { ...notice, id: ++seq } }),
  clear: () => set({ notice: null }),
}))
