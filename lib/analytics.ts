'use client'

/**
 * GA4 ecommerce events.
 *
 * The site has loaded gtag since launch and has never sent a single event, so
 * GA4 has recorded pageviews and nothing else: no revenue, no funnel, and no
 * way to tell which tour was bought. The Google Ads tag (AW-18126709990) is
 * configured on the same gtag instance, which means it has never had a
 * conversion to count either, so any Ads spend has been optimising against an
 * empty signal.
 *
 * It also cost real attribution. A ChatGPT session on 14 August walked
 * /transfers to /transfers/checkout to /transfers/confirm and paid, and the
 * only way to know that was to reconstruct it by hand from page paths and
 * payment timestamps. With `purchase` firing, GA attributes it by itself, and
 * Ads can import the conversion rather than needing its own label.
 *
 * THREE RULES, because this runs on the page a guest reaches after paying:
 *
 *   1. It can never throw. Every function is wrapped, and a failure here must
 *      not take down a confirmation page a guest has already been charged for.
 *   2. It can never fire twice for one booking. A refresh, a back-button, or a
 *      second tab would otherwise double-count revenue. Every send is claimed
 *      against localStorage first, keyed by the event and the transaction.
 *   3. It sends only what is already on the page. No emails, no names, no
 *      phone numbers: Google's terms forbid personally identifiable data in
 *      analytics, and a booking reference is not one.
 */

type GtagFn = (command: string, ...args: unknown[]) => void

/**
 * Build a real `arguments` object.
 *
 * gtag.js drains dataLayer by reading each entry POSITIONALLY, the way the
 * official snippet enqueues it (`function gtag(){dataLayer.push(arguments)}`).
 * An Arguments exotic object and a plain array are not interchangeable to it,
 * so this produces the former rather than approximating it.
 */
function toArguments(...args: unknown[]): IArguments {
  // eslint-disable-next-line prefer-rest-params
  return (function () { return arguments })(...(args as []))
}

/**
 * Send an event, whether or not gtag.js has finished loading.
 *
 * app/layout.tsx loads both gtag scripts with strategy="lazyOnload", so on a
 * confirmation page the React effect runs LONG before window.gtag exists.
 * Checking for the function and giving up, which is what this did first, meant
 * every purchase event was silently dropped: the one page where the event
 * matters most is the page least likely to have gtag ready.
 *
 * Pushing straight onto dataLayer is the supported answer and is what Google's
 * own snippet does (`function gtag(){dataLayer.push(arguments)}`). Anything
 * queued before gtag.js loads is drained when it does. The site's init script
 * uses `window.dataLayer = window.dataLayer || []`, so it adopts this array
 * rather than replacing it, and nothing is lost either way.
 */
function send(command: string, ...args: unknown[]): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn; dataLayer?: unknown[] }
  if (typeof w.gtag === 'function') {
    w.gtag(command, ...args)
    return
  }
  const queue = (w.dataLayer = w.dataLayer || [])
  // Push an arguments object, exactly as the official snippet does
  // (`function gtag(){dataLayer.push(arguments)}`). gtag.js reads these
  // positionally when it drains the queue, so a plain array is not equivalent.
  // Pushed as an array-of-arguments the same shape gtag.js drains, built
  // without an `arguments` object so the rest parameter is not left unused.
  queue.push(toArguments(command, ...args))
}

/**
 * Claim an event so it is sent at most once, ever, for this browser.
 *
 * localStorage rather than sessionStorage on purpose: a guest who bookmarks
 * the confirmation and opens it next week must not produce a second purchase.
 * Returns false when the claim was already taken, or when storage is
 * unavailable (private mode, storage disabled), which fails CLOSED: a missing
 * event is a reporting gap, a duplicate is wrong revenue.
 */
function claimOnce(key: string): boolean {
  try {
    const k = `mapl-ga:${key}`
    if (window.localStorage.getItem(k)) return false
    window.localStorage.setItem(k, new Date().toISOString())
    return true
  } catch {
    return false
  }
}

export interface AnalyticsItem {
  /** Stable identifier, e.g. a slug or a destination id. */
  id: string
  name: string
  /** Line total in USD, not the per-head price. */
  price: number
  quantity: number
  category?: string
}

function toGaItems(items: AnalyticsItem[]) {
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    item_category: i.category,
    price: Number.isFinite(i.price) ? Math.round(i.price * 100) / 100 : 0,
    quantity: Number.isFinite(i.quantity) ? i.quantity : 1,
  }))
}

/**
 * A completed booking. Fire on the confirmation page, and only when the
 * payment actually succeeded.
 *
 * `transactionId` must be the booking reference, which is stable across
 * refreshes and unique per booking; it is what makes the once-only claim work
 * and what lets GA de-duplicate on its own side as a second line of defence.
 */
export function trackPurchase(input: {
  transactionId: string
  value: number
  currency: string
  items: AnalyticsItem[]
}): void {
  try {
    if (typeof window === 'undefined' || !input.transactionId) return
    if (!Number.isFinite(input.value) || input.value < 0) return
    if (!claimOnce(`purchase:${input.transactionId}`)) return
    send('event', 'purchase', {
      transaction_id: input.transactionId,
      value: Math.round(input.value * 100) / 100,
      currency: (input.currency || 'USD').toUpperCase(),
      items: toGaItems(input.items),
    })
  } catch {
    // Never let reporting break a paid confirmation.
  }
}

/** Reaching the payment step. Fires once per cart shape, not per render. */
export function trackBeginCheckout(input: {
  key: string
  value: number
  currency: string
  items: AnalyticsItem[]
}): void {
  try {
    if (typeof window === 'undefined' || !input.key) return
    if (!Number.isFinite(input.value) || input.value < 0) return
    if (!claimOnce(`begin_checkout:${input.key}`)) return
    send('event', 'begin_checkout', {
      value: Math.round(input.value * 100) / 100,
      currency: (input.currency || 'USD').toUpperCase(),
      items: toGaItems(input.items),
    })
  } catch {
    /* no-op */
  }
}

/**
 * Adding something to the cart.
 *
 * Deliberately NOT claimed once: adding, removing and re-adding a tour is a
 * real signal about hesitation, and unlike revenue there is nothing to
 * double-count.
 */
export function trackAddToCart(input: {
  value: number
  currency: string
  items: AnalyticsItem[]
}): void {
  try {
    if (typeof window === 'undefined') return
    if (!Number.isFinite(input.value) || input.value < 0) return
    send('event', 'add_to_cart', {
      value: Math.round(input.value * 100) / 100,
      currency: (input.currency || 'USD').toUpperCase(),
      items: toGaItems(input.items),
    })
  } catch {
    /* no-op */
  }
}
