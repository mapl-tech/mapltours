/**
 * One counted lock on page scrolling, shared by everything that needs the
 * page still behind it (the reel, the sheets and dialogs, the menu, the
 * coupon popup).
 *
 * Each of them used to remember `body.style.overflow` when it mounted and
 * write that value back when it unmounted. Two of them at once broke it: the
 * reel page locks the body and remembers '', a sheet opened on it remembers
 * 'hidden', and when the route changes with the sheet still open React runs
 * the page's cleanup first, so the page restores '' and then the sheet writes
 * 'hidden' back. Nothing ever undid that: the guest arrived on /checkout (the
 * clips sheet's "In your trip" link) or back on /explore with a page that
 * could not scroll until a full reload.
 *
 * Counted, the order of release does not matter: the first lock remembers what
 * was there, and the page gets it back when the LAST lock lets go.
 * Tested in tests/unit/scroll-lock.spec.ts.
 */
let held = 0
let before = ''

/** Stop the page scrolling. Returns the release; calling it twice is harmless. */
export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (held === 0) before = document.body.style.overflow
  held += 1
  document.body.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    held = Math.max(0, held - 1)
    if (held === 0) document.body.style.overflow = before
  }
}
