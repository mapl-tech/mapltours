import { describe, test, expect, afterEach, vi } from 'vitest'

/**
 * The browser half of the Meta Purchase (lib/analytics trackPurchase). The
 * Conversions API sends the same booking ref as event_id from the Stripe
 * webhook (lib/meta-capi), so the pixel's eventID must be exactly that string,
 * once per booking per browser, and must not depend on GA being present.
 */

type Store = Record<string, string>

// whenFbqReady and whenGtagReady poll for up to 10 s. Tracked so afterEach can
// stop them: a poll left running would fire into a later test's window and
// make its exact call assertions flaky.
const timers: ReturnType<typeof setTimeout>[] = []
const trackedTimeout = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, ms)
  timers.push(t)
  return t
}

function installWindow(opts: { withFbq?: boolean; withGtag?: boolean } = {}) {
  const store: Store = {}
  const fbqCalls: unknown[][] = []
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
    },
    setTimeout: trackedTimeout,
  }
  if (opts.withFbq !== false) win.fbq = (...args: unknown[]) => { fbqCalls.push(args) }
  if (opts.withGtag) win.gtag = () => {}
  ;(globalThis as unknown as { window: unknown }).window = win
  return { store, fbqCalls }
}

async function fresh() {
  vi.resetModules()
  return import('../../lib/analytics')
}

const settle = () => new Promise((r) => setTimeout(r, 20))

afterEach(() => {
  for (const t of timers.splice(0)) clearTimeout(t)
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('pixel Purchase', () => {
  test('carries the booking ref as eventID, the value paid and USD', async () => {
    const { fbqCalls } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({
      transactionId: 'MAPL-9A93BC39',
      value: 87.4,
      currency: 'usd',
      items: [{ id: 'azul', name: 'Airport transfer, Azul', price: 92, quantity: 1, category: 'transfer one way' }],
    })
    await settle()
    expect(fbqCalls).toEqual([[
      'track', 'Purchase',
      { value: 87.4, currency: 'USD', content_type: 'product', contents: [{ id: 'azul', quantity: 1, item_price: 92 }] },
      { eventID: 'MAPL-9A93BC39' },
    ]])
  })

  test('fires once per booking per browser: a reload or a second tab sends nothing', async () => {
    const w = installWindow()
    const { trackPurchase } = await fresh()
    const input = { transactionId: 'MAPL-ONCE0001', value: 10, currency: 'USD', items: [] }
    trackPurchase(input)
    await settle()
    // A reload is a fresh module against the same localStorage.
    const again = await fresh()
    again.trackPurchase(input)
    await settle()
    expect(w.fbqCalls.filter((c) => c[1] === 'Purchase')).toHaveLength(1)
    expect(Object.keys(w.store)).toContain('mapl-ga:purchase-meta:MAPL-ONCE0001')
  })

  test('GA being blocked does not suppress the pixel', async () => {
    const { fbqCalls } = installWindow({ withGtag: false })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-NOGA0001', value: 10, currency: 'USD', items: [] })
    await settle()
    expect(fbqCalls).toHaveLength(1)
  })

  test('GA being present does not suppress the pixel either (the live page has both)', async () => {
    const w = installWindow({ withGtag: true })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-BOTH0001', value: 10, currency: 'USD', items: [] })
    await settle()
    expect(w.fbqCalls.filter((c) => c[1] === 'Purchase')).toHaveLength(1)
  })

  test('a pixel that mounts after the call still gets the Purchase (Trackers mounts after ConfirmClient)', async () => {
    const w = installWindow({ withFbq: false })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-LATE0001', value: 10, currency: 'USD', items: [] })
    await settle()
    ;(globalThis as unknown as { window: Record<string, unknown> }).window.fbq = (...args: unknown[]) => { w.fbqCalls.push(args) }
    await new Promise((r) => setTimeout(r, 300))
    expect(w.fbqCalls.filter((c) => c[1] === 'Purchase')).toEqual([
      ['track', 'Purchase', { value: 10, currency: 'USD', content_type: 'product', contents: [] }, { eventID: 'MAPL-LATE0001' }],
    ])
  })

  test('an opted-out visitor (no pixel on the page) sends nothing and burns no claim', async () => {
    const w = installWindow({ withFbq: false })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-OPTOUT01', value: 10, currency: 'USD', items: [] })
    await settle()
    expect(w.fbqCalls).toHaveLength(0)
    expect(Object.keys(w.store).some((k) => k.includes('purchase-meta'))).toBe(false)
  })
})

/**
 * Advanced matching (lib/analytics rememberPurchaseMatch). The payment panel
 * keeps the guest's details in sessionStorage just before it confirms; the
 * confirmation page hands them to the pixel with a second init, once, and
 * deletes them. The confirm pages themselves never print contact details.
 */
describe('pixel advanced matching for the Purchase', () => {
  const BOOKING_ID = 'c067affe-1234-4abc-9def-000000000000'
  const REF = 'MAPL-C067AFFE'
  const GUEST = { email: ' Guest@Gmail.com ', phone: '876-555-0123', firstName: 'Ann', lastName: 'Lee' }

  function installSession(opts: { storageThrows?: boolean; optedOut?: boolean; withGtag?: boolean } = {}) {
    const local: Store = {}
    const session: Store = {}
    const fbqCalls: unknown[][] = []
    const gtagCalls: unknown[][] = []
    const boom = () => { throw new Error('storage blocked') }
    const win: Record<string, unknown> = {
      localStorage: {
        getItem: (k: string) => (k in local ? local[k] : null),
        setItem: (k: string, v: string) => { local[k] = v },
      },
      sessionStorage: opts.storageThrows
        ? { getItem: boom, setItem: boom, removeItem: boom }
        : {
            getItem: (k: string) => (k in session ? session[k] : null),
            setItem: (k: string, v: string) => { session[k] = v },
            removeItem: (k: string) => { delete session[k] },
          },
      setTimeout: trackedTimeout,
      fbq: (...args: unknown[]) => { fbqCalls.push(args) },
    }
    if (opts.optedOut) win.doNotTrack = '1'
    if (opts.withGtag) win.gtag = (...args: unknown[]) => { gtagCalls.push(args) }
    ;(globalThis as unknown as { window: unknown }).window = win
    return { session, fbqCalls, gtagCalls }
  }

  const purchase = { transactionId: REF, value: 75, currency: 'usd', items: [] }

  test('the details kept at Pay reach the pixel right before the Purchase, then leave the tab', async () => {
    const w = installSession()
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    expect(Object.keys(w.session)).toEqual(['mapl-meta-match'])
    trackPurchase(purchase)
    await settle()
    expect(w.fbqCalls).toEqual([
      // The phone with a leading +, so fbevents never prefixes the Gateway's
      // alternate copy with the browser locale's country code.
      ['init', '1607953960710055', { em: 'guest@gmail.com', external_id: 'guest@gmail.com', ph: '+18765550123', fn: 'ann', ln: 'lee' }],
      ['track', 'Purchase', { value: 75, currency: 'USD', content_type: 'product', contents: [] }, { eventID: REF }],
    ])
    expect(w.session).toEqual({})
  })

  test('details kept for another booking are deleted and never used', async () => {
    const w = installSession()
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    rememberPurchaseMatch('aaaaaaaa-0000-4000-8000-000000000000', GUEST)
    trackPurchase(purchase)
    await settle()
    expect(w.fbqCalls.map((c) => c[0])).toEqual(['track'])
    expect(w.session).toEqual({})
  })

  test('stale details are deleted and never used', async () => {
    const w = installSession()
    const { trackPurchase } = await fresh()
    w.session['mapl-meta-match'] = JSON.stringify({ ref: REF, at: Date.now() - 7 * 3_600_000, fields: { em: 'guest@gmail.com' } })
    trackPurchase(purchase)
    await settle()
    expect(w.fbqCalls.map((c) => c[0])).toEqual(['track'])
    expect(w.session).toEqual({})
  })

  test('only known keys are read back from storage', async () => {
    const w = installSession()
    const { trackPurchase } = await fresh()
    w.session['mapl-meta-match'] = JSON.stringify({ ref: REF, at: Date.now(), fields: { em: 'guest@gmail.com', zz: 'x', ph: 5 } })
    trackPurchase(purchase)
    await settle()
    expect(w.fbqCalls[0]).toEqual(['init', '1607953960710055', { em: 'guest@gmail.com' }])
  })

  test('a visitor who opted out of tracking keeps nothing', async () => {
    const w = installSession({ optedOut: true })
    const { rememberPurchaseMatch } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    expect(w.session).toEqual({})
  })

  test('details with neither an email nor a phone are not kept', async () => {
    const w = installSession()
    const { rememberPurchaseMatch } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, { firstName: 'Ann', lastName: 'Lee', phone: '07911 123456' })
    rememberPurchaseMatch(null, GUEST)
    expect(w.session).toEqual({})
  })

  test('a reload sends no second init and no second Purchase, and the details are gone', async () => {
    const w = installSession()
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    trackPurchase(purchase)
    await settle()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    trackPurchase(purchase)
    await settle()
    expect(w.fbqCalls.map((c) => c[0])).toEqual(['init', 'track'])
    expect(w.session).toEqual({})
  })

  test('blocked storage never throws, and the Purchase still goes, unmatched', async () => {
    const w = installSession({ storageThrows: true })
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    expect(() => rememberPurchaseMatch(BOOKING_ID, GUEST)).not.toThrow()
    expect(() => trackPurchase(purchase)).not.toThrow()
    await settle()
    expect(w.fbqCalls.map((c) => c[0])).toEqual(['track'])
  })

  test('Google Analytics never receives the details', async () => {
    const w = installSession({ withGtag: true })
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    trackPurchase(purchase)
    await settle()
    // Exactly the purchase event, nothing else: no plain or hashed detail,
    // no gtag('set', 'user_data', ...).
    expect(w.gtagCalls).toEqual([['event', 'purchase', { transaction_id: REF, value: 75, currency: 'USD', items: [] }]])
  })

  test('a payment that did not go through forgets them, and forgetting never throws', async () => {
    const w = installSession()
    const { rememberPurchaseMatch, forgetPurchaseMatch } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    forgetPurchaseMatch()
    expect(w.session).toEqual({})
    installSession({ storageThrows: true })
    expect(() => forgetPurchaseMatch()).not.toThrow()
  })

  test('an invalid amount still clears the details from the tab', async () => {
    const w = installSession()
    const { rememberPurchaseMatch, trackPurchase } = await fresh()
    rememberPurchaseMatch(BOOKING_ID, GUEST)
    trackPurchase({ ...purchase, value: Number.NaN })
    await settle()
    expect(w.fbqCalls).toEqual([])
    expect(w.session).toEqual({})
  })
})
