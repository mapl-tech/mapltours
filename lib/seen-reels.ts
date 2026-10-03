import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Tours this visitor has watched on the reel, kept on their own device so the
 * home row (components/ReelStories) can show which videos are new to them: a
 * dimmed ring once watched, as stories rows do. Nothing leaves the device.
 *
 * skipHydration, like the cart: the server and the first client paint render
 * every ring as new, and LayoutShell rehydrates after mount.
 */
interface SeenReels {
  seen: number[]
  markSeen: (id: number) => void
}

export const useSeenReels = create<SeenReels>()(
  persist(
    (set, get) => ({
      seen: [],
      markSeen: (id) => {
        const { seen } = get()
        if (!seen.includes(id)) set({ seen: [...seen, id].slice(-100) })
      },
    }),
    { name: 'mapl-seen-reels', skipHydration: true },
  ),
)
