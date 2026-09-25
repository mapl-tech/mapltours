import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The 5% code popup: when it may appear, and the memory that decides it.
 *
 * The rules, as the owner set them (Sept 2026): only on the home page, the
 * explore page and the transfers page, only after ten seconds on the page, at most once a day,
 * and once it has been shown not again for seven days. The seven-day rest
 * already guarantees the once-a-day rule, so one timestamp carries both.
 * A guest who took the code never sees it again: they have it.
 *
 * Everything that decides is pure and takes `now`, so the tests can walk the
 * calendar. The store only remembers two moments; the component asks these
 * functions what to do with them.
 */
export const POPUP_DELAY_MS = 10_000
export const POPUP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
export const POPUP_CODE = 'JAMAICA5'
export const POPUP_PERCENT = 5

export interface PopupMemory {
  /** When the popup last opened, epoch ms. Null: never. */
  lastShownAt: number | null
  /** When the guest received the code, epoch ms. Null: not yet. */
  doneAt: number | null
}

/** Only the three pages the owner asked for; nothing else, ever. The transfers
 *  checkout and confirm pages are not "the transfers page". */
export function popupPathEligible(pathname: string): boolean {
  return pathname === '/' || pathname === '/explore' || pathname === '/transfers'
}

export function shouldShowPopup(input: {
  pathname: string
  memory: PopupMemory
  now: number
  /** The visit started on the bio page, which hands out the same code. */
  cameFromBio?: boolean
}): boolean {
  const { pathname, memory, now, cameFromBio } = input
  if (!popupPathEligible(pathname)) return false
  if (cameFromBio) return false
  if (memory.doneAt != null) return false
  if (memory.lastShownAt == null) return true
  // A timestamp from the future is a clock that moved; treat it as shown
  // rather than show the popup twice.
  if (memory.lastShownAt > now) return false
  return now - memory.lastShownAt >= POPUP_COOLDOWN_MS
}

/**
 * One tick of the popup's timer, once the rules above say yes. `busy` is the
 * guest typing, another dialog open, or the tab hidden: wait and ask again.
 * After a busy spell it waits one more quiet tick before opening, because
 * the tap that ends the typing is often the tap that leaves the page (Book
 * on the fare finder), and the address changes only a few hundred
 * milliseconds after that tap. A page that is no longer the one the timer
 * started on, or not an eligible one, stops it for good.
 */
export type PopupStep = 'open' | 'wait' | 'stop'
export function nextPopupStep(input: { startedOn: string; pathNow: string; busy: boolean; wasBusy: boolean }): PopupStep {
  if (input.pathNow !== input.startedOn || !popupPathEligible(input.pathNow)) return 'stop'
  if (input.busy || input.wasBusy) return 'wait'
  return 'open'
}

/**
 * A popup that the page left within this long of opening was never really
 * seen (it opened on a page the guest was already leaving), so its showing
 * does not start the seven-day rest.
 */
export const POPUP_UNSEEN_MS = 3000
export function popupWasUnseen(openedAt: number, closedAt: number): boolean {
  return closedAt >= openedAt && closedAt - openedAt < POPUP_UNSEEN_MS
}

interface PopupStore extends PopupMemory {
  markShown: (now?: number) => void
  markDone: (now?: number) => void
}

/**
 * Persisted under its own key so clearing the cart never resets the popup
 * and the popup never touches the cart. Hydrates on creation: the component
 * reads it only inside the ten-second timer, long after localStorage has
 * loaded, and renders nothing before that, so server and client HTML agree.
 */
export const useCouponPopupStore = create<PopupStore>()(
  persist(
    (set) => ({
      lastShownAt: null,
      doneAt: null,
      markShown: (now = Date.now()) => set({ lastShownAt: now }),
      markDone: (now = Date.now()) => set({ doneAt: now }),
    }),
    {
      name: 'mapl-coupon-popup',
      version: 1,
      partialize: (s) => ({ lastShownAt: s.lastShownAt, doneAt: s.doneAt }),
    },
  ),
)
