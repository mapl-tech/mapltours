/**
 * True the first time this browser asks about `key`, false every time after.
 *
 * For work a page must do once per booking however often it is opened: the
 * confirmation page empties the cart that was just paid for, and a guest who
 * then builds a second trip and comes back to that confirmation (the Back
 * button, a phone reloading a tab it had put to sleep) must not lose the new
 * cart to the old page.
 *
 * Where the browser refuses storage this answers true: nothing is remembered
 * there, the carts included, so doing the work again costs nothing.
 */
export function firstTime(key: string): boolean {
  try {
    const k = `mapl-once:${key}`
    if (window.localStorage.getItem(k)) return false
    window.localStorage.setItem(k, new Date().toISOString())
    return true
  } catch {
    return true
  }
}
