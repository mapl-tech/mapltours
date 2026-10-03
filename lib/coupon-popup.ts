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

/**
 * A browser driven by software (navigator.webdriver): an AI agent booking for
 * someone (Meta's Muse, ChatGPT's agent...) or a test runner. Not a person,
 * so the popup would only interrupt the booking it is making and put an
 * agent's address on the list. `?popup=show` overrides it, for checks of the
 * popup itself.
 */
export function isAutomatedVisit(nav: { webdriver?: boolean } | undefined, search: string): boolean {
  if (new URLSearchParams(search).get('popup') === 'show') return false
  return nav?.webdriver === true
}

export function shouldShowPopup(input: {
  pathname: string
  memory: PopupMemory
  now: number
  /** The visit started on the bio page, which hands out the same code. */
  cameFromBio?: boolean
  /** isAutomatedVisit: an agent's or a test runner's browser. */
  automated?: boolean
}): boolean {
  const { pathname, memory, now, cameFromBio, automated } = input
  if (!popupPathEligible(pathname)) return false
  if (automated) return false
  if (cameFromBio) return false
  if (memory.doneAt != null) return false
  if (memory.lastShownAt == null) return true
  // A timestamp from the future is a clock that moved; treat it as shown
  // rather than show the popup twice.
  if (memory.lastShownAt > now) return false
  return now - memory.lastShownAt >= POPUP_COOLDOWN_MS
}

/**
 * One tick of the popup's timer, once the rules above say yes. `busy` is
 * popupBusy below (the guest filling a form, another dialog open, or the tab
 * hidden): wait and ask again.
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
 * How long after the guest last typed, tapped or clicked in a booking form
 * (the fare finder, a hotel or tour search) the popup keeps waiting.
 *
 * Focus alone was not enough. Between two steps of filling the fare finder
 * focus sits on a button (Round trip, Add passenger) or on nothing, and the
 * popup opened over the form mid-booking: on a phone it covered the widget
 * and swallowed the next tap, and on a desktop it took focus from the hotel
 * box, which clears what was typed. People pause for a few seconds between
 * fields and browsing agents for longer (each step is a read and a think),
 * so the window is generous. A guest who has stopped for this long is
 * hesitating, which is when 5% off is worth showing.
 */
export const POPUP_FORM_QUIET_MS = 15_000

/**
 * How long after ANY tap or click the popup keeps waiting. A visitor tapping
 * a tour card or a video when it opened had the tap land on the popup's
 * scrim instead (measured Oct 2 2026 on the home page): it must arrive in a
 * pause, never under a finger.
 */
export const POPUP_TAP_QUIET_MS = 3_000

const within = (now: number, at: number | null | undefined, ms: number) =>
  at != null && Math.abs(now - at) < ms

/**
 * True while the popup must not open: the tab is hidden, another dialog is
 * open, focus is in a field or an open list of options, the guest used a
 * booking form within POPUP_FORM_QUIET_MS, or tapped anything within
 * POPUP_TAP_QUIET_MS. A timestamp from the future is a clock that moved; it
 * counts only if it is within the window either way, so a clock set back an
 * hour cannot hold the popup for an hour.
 */
export function popupBusy(input: {
  hidden: boolean
  otherDialog: boolean
  focusInField: boolean
  /** When the guest last typed, tapped or clicked in a booking form, epoch ms. Null: never on this visit. */
  lastFormActivityAt: number | null
  /** When the guest last tapped or clicked anything, epoch ms. Null or absent: never on this visit. */
  lastTapAt?: number | null
  now: number
}): boolean {
  if (input.hidden || input.otherDialog || input.focusInField) return true
  return within(input.now, input.lastFormActivityAt, POPUP_FORM_QUIET_MS)
    || within(input.now, input.lastTapAt, POPUP_TAP_QUIET_MS)
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
