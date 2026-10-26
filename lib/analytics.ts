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
 *      analytics, and a booking reference is not one. The one exception is
 *      the Meta pixel's Purchase, which is given the guest's own contact
 *      details for matching (rememberPurchaseMatch below); the pixel hashes
 *      them before they leave the browser, and GA never sees them. Being
 *      pixel state, they then ride on every later pixel event in that page
 *      until a full reload, which app/privacy/page.tsx says.
 */

import { trackingOptedOut } from './attribution'
import { META_PIXEL_ID, MATCH_KEYS, bookingRefOf, matchFields, type MatchFields, type MatchInput } from './meta-match'

type GtagFn = (command: string, ...args: unknown[]) => void

/**
 * Run something once gtag is genuinely ready, or not at all.
 *
 * Two wrong answers were tried before this one. Calling gtag directly dropped
 * every event, because app/layout.tsx loads both tags with
 * strategy="lazyOnload" and a confirmation page's effect runs long before
 * window.gtag exists. Queueing onto dataLayer instead looked right and was
 * worse: the event landed AHEAD of the tag's own `js` and `config` commands,
 * so gtag.js drained a purchase with no destination configured and silently
 * discarded it. Measured on production, the queue read
 * ["event:purchase","js","config","config"] and the only network call made was
 * page_view.
 *
 * Waiting for window.gtag to exist fixes the ordering for free: the init
 * script defines that function in the same breath as it pushes `js` and
 * `config`, so by the time it is callable those are already in front of us.
 *
 * Gives up after about ten seconds. A lost event is a reporting gap; an event
 * sent into an unconfigured tag is a lie that looks like data.
 */
function whenGtagReady(run: (gtag: GtagFn) => void, attempts = 40): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: GtagFn }
  if (typeof w.gtag === 'function') {
    run(w.gtag)
    return
  }
  if (attempts <= 0) return
  window.setTimeout(() => whenGtagReady(run, attempts - 1), 250)
}

type FbqFn = (command: string, ...args: unknown[]) => void

/**
 * The Meta Pixel counterpart of whenGtagReady. The base snippet in
 * components/Trackers defines `window.fbq` synchronously and queues calls
 * before fbevents.js loads, so unlike gtag it is safe to call the instant it
 * exists; we still poll briefly because the pixel is gated behind the same
 * privacy check and mounts a tick after hydration. A visitor who opted out
 * (no pixel) simply never satisfies this and nothing is sent.
 */
function whenFbqReady(run: (fbq: FbqFn) => void, attempts = 40): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { fbq?: FbqFn }
  if (typeof w.fbq === 'function') {
    run(w.fbq)
    return
  }
  if (attempts <= 0) return
  window.setTimeout(() => whenFbqReady(run, attempts - 1), 250)
}

/** Map cart items to the Meta Pixel `contents` shape. */
function toMetaContents(items: AnalyticsItem[]) {
  return items.map((i) => ({
    id: i.id,
    quantity: Number.isFinite(i.quantity) ? i.quantity : 1,
    item_price: Number.isFinite(i.price) ? Math.round(i.price * 100) / 100 : 0,
  }))
}

/**
 * Claim an event so it is sent at most once, ever, for this browser.
 *
 * localStorage rather than sessionStorage on purpose: a guest who bookmarks
 * the confirmation and opens it next week must not produce a second purchase.
 * Returns false when the claim was already taken, or when storage is
 * unavailable (private mode, storage disabled), which fails CLOSED: a missing
 * event is a reporting gap, a duplicate is wrong revenue.
 *
 * Always called INSIDE whenGtagReady, never before it. Claiming first and then
 * failing to send would burn the only chance this booking had of being
 * reported, and the claim would still be there on the next visit.
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

/**
 * Meta advanced matching for the Purchase, handed from the checkout to the
 * confirmation page inside the guest's own tab.
 *
 * The confirm pages never print the guest's email, phone or country: anyone
 * holding a payment_intent id can open them (see the PRIVACY note in
 * app/transfers/confirm/page.tsx). But the pixel can only match a Purchase on
 * details it is given, and without them the copy Meta keeps, the Conversions
 * API Gateway's relay of the pixel event, carried IP, browser and _fbp and
 * nothing else (Event Match Quality 6.1, Oct 17 2026). So the payment panel
 * keeps what the guest typed, normalised by lib/meta-match, in sessionStorage
 * (this tab only) just before it confirms, tied to that booking's reference.
 * The confirmation page takes it back once, deletes it whether or not it
 * belongs to this booking, and passes it to the pixel. A payment that fails
 * on this page deletes it at once (forgetPurchaseMatch); a retry keeps it
 * again before its own confirm. One that leaves for a bank or wallet
 * redirect and fails there never comes back to the panel, and the confirm
 * page takes nothing on a failed status, so that entry stays in the tab
 * until the next Pay replaces or deletes it or the tab closes; it is only
 * ever used for that same booking.
 *
 * Nothing is kept for a visitor who opted out of tracking, nothing here ever
 * reaches GA, and every step swallows its own errors: a full or blocked
 * storage means an unmatched Purchase, never a failed payment.
 */
const MATCH_STORAGE_KEY = 'mapl-meta-match'
/**
 * The longest a remembered entry can still be used: long enough for a slow
 * 3DS or bank redirect. Not a lifetime: the entry is deleted when it is used
 * or when a payment fails on the page, and otherwise (a redirect payment that
 * failed at the bank) at the next Pay or when the tab's session ends.
 */
const MATCH_MAX_AGE_MS = 6 * 3_600_000

/** Called by the payment panel immediately before it confirms or leaves for the confirm page. */
export function rememberPurchaseMatch(bookingId: string | null | undefined, input: MatchInput | null | undefined): void {
  try {
    if (typeof window === 'undefined' || !bookingId || !input) return
    if (trackingOptedOut()) return
    const fields = matchFields(input)
    if (!fields.em && !fields.ph) return
    window.sessionStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify({ ref: bookingRefOf(bookingId), at: Date.now(), fields }))
  } catch {
    // Storage full, blocked or absent: the purchase still reports, unmatched.
  }
}

/** Drops the remembered details after a payment attempt that did not go through. */
export function forgetPurchaseMatch(): void {
  try {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(MATCH_STORAGE_KEY)
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** The details remembered for this booking, removed from storage either way. */
function takePurchaseMatch(transactionId: string): MatchFields | null {
  try {
    const raw = window.sessionStorage.getItem(MATCH_STORAGE_KEY)
    if (raw == null) return null
    window.sessionStorage.removeItem(MATCH_STORAGE_KEY)
    const saved = JSON.parse(raw) as { ref?: unknown; at?: unknown; fields?: unknown } | null
    if (!saved || saved.ref !== transactionId) return null
    const age = typeof saved.at === 'number' ? Date.now() - saved.at : NaN
    if (!(age >= -60_000 && age <= MATCH_MAX_AGE_MS)) return null
    const f = saved.fields
    if (!f || typeof f !== 'object') return null
    const out: MatchFields = {}
    for (const k of MATCH_KEYS) {
      const v = (f as Record<string, unknown>)[k]
      if (typeof v === 'string' && v) out[k] = v
    }
    return out.em || out.ph ? out : null
  } catch {
    return null
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
    // Taken before anything can return, so the guest's details never outlive
    // the confirmation page in this tab, whatever happens below.
    const match = takePurchaseMatch(input.transactionId)
    if (!Number.isFinite(input.value) || input.value < 0) return
    whenGtagReady((gtag) => {
      if (!claimOnce(`purchase:${input.transactionId}`)) return
      gtag('event', 'purchase', {
        transaction_id: input.transactionId,
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        items: toGaItems(input.items),
      })
    })
    // Meta Pixel Purchase, deduped against the server-side Conversions API by
    // eventID (the booking ref). Its own once-claim is independent of GA's, so
    // one tracker being blocked never suppresses the other.
    whenFbqReady((fbq) => {
      if (!claimOnce(`purchase-meta:${input.transactionId}`)) return
      // Advanced matching. A second init of the same pixel with the guest's
      // details attaches them, hashed by the pixel, to this Purchase AND to
      // the Gateway's server copy of it. Measured Oct 17 2026 in Chrome
      // against the live pixel config: without this call neither copy
      // carried an email. They stay on the pixel for every later event in
      // this page (its own SPA PageView, ViewContent, AddToCart and so on)
      // until a full reload: fbevents refuses a later init as a duplicate, so
      // they cannot be cleared (measured Oct 18 2026, fbevents 2.9.419). The
      // privacy page says so. Never on a reload: the once-claim returns first.
      // The phone goes in with a leading +. Without one, fbevents also builds
      // an alternate copy for the Gateway with the browser locale's country
      // code put in front ('44' + '18765550123' in an en-GB browser); with
      // it, every copy hashes exactly the digits the server sends (measured
      // Oct 18 2026, fbevents 2.9.419). Storage and lib/meta-match keep the
      // plain digits.
      if (match) fbq('init', META_PIXEL_ID, match.ph ? { ...match, ph: `+${match.ph}` } : match)
      fbq('track', 'Purchase', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        content_type: 'product',
        contents: toMetaContents(input.items),
      }, { eventID: input.transactionId })
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
    whenGtagReady((gtag) => {
      if (!claimOnce(`begin_checkout:${input.key}`)) return
      gtag('event', 'begin_checkout', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        items: toGaItems(input.items),
      })
    })
    whenFbqReady((fbq) => {
      if (!claimOnce(`begin_checkout-meta:${input.key}`)) return
      fbq('track', 'InitiateCheckout', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        content_type: 'product',
        contents: toMetaContents(input.items),
      }, { eventID: `ic:${input.key}` })
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
    whenGtagReady((gtag) => {
      gtag('event', 'add_to_cart', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        items: toGaItems(input.items),
      })
    })
    whenFbqReady((fbq) => {
      fbq('track', 'AddToCart', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        content_type: 'product',
        contents: toMetaContents(input.items),
      })
    })
  } catch {
    /* no-op */
  }
}

/**
 * Looking at one thing that can be bought: a tour's reel, or a transfer fare
 * once a hotel is chosen. GA4 view_item and Meta ViewContent. Not claimed
 * once: looking twice is a real signal, and there is no revenue to double
 * count. Callers debounce so a scroll through the reel does not fire per
 * frame.
 */
export function trackViewItem(input: {
  value: number
  currency: string
  items: AnalyticsItem[]
}): void {
  try {
    if (typeof window === 'undefined') return
    if (!Number.isFinite(input.value) || input.value < 0) return
    whenGtagReady((gtag) => {
      gtag('event', 'view_item', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        items: toGaItems(input.items),
      })
    })
    whenFbqReady((fbq) => {
      fbq('track', 'ViewContent', {
        value: Math.round(input.value * 100) / 100,
        currency: (input.currency || 'USD').toUpperCase(),
        content_type: 'product',
        contents: toMetaContents(input.items),
      })
    })
  } catch {
    /* no-op */
  }
}

/**
 * A message that actually reached the inbox: the contact form after the
 * server said it delivered, or a "price my hotel" request. GA4 generate_lead
 * (a key event) and Meta Lead. Only ever call on a confirmed delivery; a
 * GA4 rule used to count every visit to /contact as a lead.
 */
/**
 * A tap on a WhatsApp or email link. Not a lead (nothing has reached the
 * inbox yet); a separate event so the two channels can be compared.
 */
export function trackContactClick(method: 'whatsapp' | 'email', place: string): void {
  try {
    if (typeof window === 'undefined') return
    whenGtagReady((gtag) => {
      gtag('event', 'contact_click', { method, place })
    })
  } catch {
    /* no-op */
  }
}

export function trackLead(
  source: 'contact_form' | 'unlisted_hotel' | 'popup_home' | 'popup_explore' | 'popup_transfers',
  /** Same id the server sends to the Conversions API, so Meta counts one lead. */
  eventId?: string,
): void {
  try {
    if (typeof window === 'undefined') return
    whenGtagReady((gtag) => {
      gtag('event', 'generate_lead', { lead_source: source })
    })
    whenFbqReady((fbq) => {
      if (eventId) fbq('track', 'Lead', { content_name: source }, { eventID: eventId })
      else fbq('track', 'Lead', { content_name: source })
    })
  } catch {
    /* no-op */
  }
}

/**
 * The reel's guest clips: the sheet opened, a clip played, a guest started
 * or finished posting one. Counted so the clips' part in a booking (and
 * whether past guests post at all) is a number before anyone invests more.
 */
export function trackClipsEvent(
  name: 'clips_open' | 'clip_play' | 'clip_post_start' | 'clip_posted',
  slug: string,
): void {
  try {
    if (typeof window === 'undefined') return
    whenGtagReady((gtag) => {
      gtag('event', name, { item_id: slug })
    })
  } catch {
    /* no-op */
  }
}

/**
 * The reel's details sheet opened (the "What's included" tap). Measured so
 * the gap between watching a reel and reading the facts is a number, not a
 * guess, before the phone surface is judged.
 */
export function trackReelDetailsOpen(slug: string): void {
  try {
    if (typeof window === 'undefined') return
    whenGtagReady((gtag) => {
      gtag('event', 'details_open', { item_id: slug })
    })
  } catch {
    /* no-op */
  }
}

/**
 * A tap on the reel's Add to Trip button, whatever it did. add_to_cart is
 * reported from the store and only counts a successful add; this counts the
 * taps that removed, were refused by the day-fit rules ('blocked', with the
 * reason the button shows) or were caught before React attached and replayed
 * after hydration. tap minus add is the size of the leak.
 */
export function trackReelCtaTap(
  slug: string,
  // 'swapped': booked in place of a day it could not join; 'undone': the
  // add or swap was taken back from its notice.
  outcome: 'added' | 'removed' | 'blocked' | 'replayed' | 'swapped' | 'undone',
  reason?: string,
): void {
  try {
    if (typeof window === 'undefined') return
    whenGtagReady((gtag) => {
      gtag('event', 'cta_tap', { item_id: slug, outcome, reason })
    })
  } catch {
    /* no-op */
  }
}

/**
 * Where a guest stops inside a checkout.
 *
 * begin_checkout fires only once the server has priced the order, which is
 * after every detail is filled in, so a guest who opened the page and left
 * was invisible: in Sept and Oct 2026 about 36 people reached the ride
 * checkout and 6 got far enough to be saved, with nothing to say which field
 * stopped the other 30. Each step is its own event NAME (checkout_view,
 * checkout_contact_ready, ...) so it reads straight off GA4's event list with
 * no custom dimension to register, and each field a refused Pay names is its
 * own checkout_missing_<field>. The pages send each name at most once per page
 * load, so an event count reads as a count of checkout visits (a wallet tap
 * validates twice, and the sticky bar validates before Pay does). Hotjar gets
 * the same names, so its recordings can be filtered to refused payments.
 *
 * Field KEYS only, never what was typed (rule 3 above).
 */
export type CheckoutStep =
  | 'view'          // the form is on screen with something to book
  | 'trip_ready'    // tour: a bookable date and a pickup place
  | 'times_ready'   // ride: every flight time the ride needs, inside the notice rule
  | 'flights_ready' // ride: every flight number the ride needs
  | 'contact_ready' // a name, a valid email and a phone
  | 'pay_tap'       // Pay, Apple Pay or Continue, with nothing missing
  | 'pay_blocked'   // the same tap, refused by a missing or wrong field

type HjFn = (command: string, ...args: unknown[]) => void

/**
 * The Hotjar counterpart of whenGtagReady. Hotjar loads lazyOnload, after the
 * page's own load, so a checkout_view sent at hydration found no window.hj and
 * was lost. Its snippet defines a queueing hj() the moment it runs, so calling
 * that is safe; an opted-out visitor never gets one and nothing is sent.
 */
function whenHjReady(run: (hj: HjFn) => void, attempts = 80): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { hj?: HjFn }
  if (typeof w.hj === 'function') {
    run(w.hj)
    return
  }
  if (attempts <= 0) return
  window.setTimeout(() => whenHjReady(run, attempts - 1), 250)
}

export function checkoutEventName(step: CheckoutStep): string {
  return `checkout_${step}`
}

/** checkout_missing_arrival_flight from "arrivalFlight"; GA4 caps event names at 40 characters. */
export function checkoutMissingEventName(field: string): string {
  const snake = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/[^a-z0-9_]/g, '')
  return `checkout_missing_${snake}`.slice(0, 40)
}

function sendCheckoutEvent(name: string, params: Record<string, string>): void {
  whenGtagReady((gtag) => {
    gtag('event', name, params)
  })
  whenHjReady((hj) => {
    hj('event', name)
  })
}

export function trackCheckoutStep(checkout: 'tour' | 'ride', step: CheckoutStep): void {
  try {
    if (typeof window === 'undefined') return
    sendCheckoutEvent(checkoutEventName(step), { checkout })
  } catch {
    /* no-op */
  }
}

/** Fields a refused Pay named, one event each. The caller sends each field once per page load. */
export function trackCheckoutMissing(checkout: 'tour' | 'ride', fields: string[]): void {
  try {
    if (typeof window === 'undefined') return
    for (const f of fields) sendCheckoutEvent(checkoutMissingEventName(f), { checkout })
  } catch {
    /* no-op */
  }
}
