import { describe, test, expect, afterEach, vi } from 'vitest'

/**
 * GA4 ecommerce events.
 *
 * Two properties matter more than the payloads. The events must reach gtag
 * even though app/layout.tsx loads it with strategy="lazyOnload", which means
 * window.gtag does not exist when a confirmation page's effect runs; the first
 * implementation checked for the function and gave up, so every purchase was
 * silently dropped on the one page where it matters. And `purchase` must fire
 * at most once per booking, because a refresh, a back-button or a bookmark
 * would otherwise report the same revenue twice.
 */

type Store = Record<string, string>

// whenGtagReady and whenHjReady keep polling for a while when their tag is
// absent. Tracked so afterEach can stop them: a poll left running would fire
// into a later test's window (a later test that installs Hotjar received four
// events from the tests before it).
const timers: ReturnType<typeof setTimeout>[] = []
const trackedTimeout = (fn: () => void, ms: number) => {
  const t = setTimeout(fn, ms)
  timers.push(t)
  return t
}

function installWindow(opts: { withGtag?: boolean; storageThrows?: boolean } = {}) {
  const store: Store = {}
  const dataLayer: unknown[] = []
  const localStorage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error('storage disabled')
      return k in store ? store[k] : null
    },
    setItem: (k: string, v: string) => {
      if (opts.storageThrows) throw new Error('storage disabled')
      store[k] = v
    },
  }
  const win: Record<string, unknown> = {
    dataLayer,
    localStorage,
    // The module waits for gtag via setTimeout; give it the real one, tracked.
    setTimeout: trackedTimeout,
  }
  // gtag defaults to PRESENT now: the interesting case is no longer "queue it
  // anyway" but "wait, and give up if it never arrives".
  if (opts.withGtag !== false) win.gtag = (...args: unknown[]) => { dataLayer.push(args) }
  ;(globalThis as unknown as { window: unknown }).window = win
  return { dataLayer, store }
}

/** The module defers to a ready gtag, so assertions run on the next tick. */
const settle = () => new Promise((r) => setTimeout(r, 20))

/** The events gtag would receive, whether queued or sent directly. */
const sent = (dataLayer: unknown[]) =>
  dataLayer.map((a) => Array.from(a as ArrayLike<unknown>)).filter((a) => a[0] === 'event')

async function fresh() {
  vi.resetModules()
  return import('../../lib/analytics')
}

afterEach(() => {
  for (const t of timers.splice(0)) clearTimeout(t)
  delete (globalThis as unknown as { window?: unknown }).window
})

describe('reaching gtag', () => {
  test('sends once gtag exists', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-B', value: 10, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer)).toHaveLength(1)
  })

  /**
   * The event must NEVER be pushed onto dataLayer ahead of the tag's own
   * config. Measured on production, doing that produced the queue
   * ["event:purchase","js","config"] and gtag.js discarded the purchase
   * because no destination was configured when it drained.
   */
  test('sends NOTHING while gtag is absent, rather than queueing out of order', async () => {
    const { dataLayer } = installWindow({ withGtag: false })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-A', value: 154, currency: 'usd', items: [] })
    await settle()
    expect(dataLayer).toHaveLength(0)
  })

  test('does not burn the once-only claim when the send never happens', async () => {
    const w = installWindow({ withGtag: false })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-RETRY', value: 99, currency: 'USD', items: [] })
    await settle()
    expect(Object.keys(w.store)).toHaveLength(0)
  })

  test('does nothing at all on the server, where there is no window', async () => {
    delete (globalThis as unknown as { window?: unknown }).window
    const { trackPurchase } = await fresh()
    expect(() => trackPurchase({ transactionId: 'X', value: 1, currency: 'USD', items: [] })).not.toThrow()
  })
})

describe('purchase fires once per booking', () => {
  test('a second call for the same booking sends nothing', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    const input = { transactionId: 'MAPL-SAME', value: 154, currency: 'USD', items: [] }
    trackPurchase(input)
    trackPurchase(input)
    trackPurchase(input)
    await settle()
    expect(sent(dataLayer).filter((e) => e[1] === 'purchase')).toHaveLength(1)
  })

  test('a different booking is not blocked by the first', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-ONE', value: 10, currency: 'USD', items: [] })
    trackPurchase({ transactionId: 'MAPL-TWO', value: 20, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer).filter((e) => e[1] === 'purchase')).toHaveLength(2)
  })

  test('fails CLOSED when storage is unavailable, because a duplicate is worse than a gap', async () => {
    const { dataLayer } = installWindow({ storageThrows: true })
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-NOSTORE', value: 10, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer)).toHaveLength(0)
  })
})

describe('payloads', () => {
  test('carries the transaction, the value and the currency, uppercased', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({
      transactionId: 'MAPL-B3A324AA',
      value: 154,
      currency: 'usd',
      items: [{ id: 'azul', name: 'Airport transfer, Azul', price: 140, quantity: 1, category: 'transfer round trip' }],
    })
    const params = sent(dataLayer)[0][2] as Record<string, unknown>
    expect(params.transaction_id).toBe('MAPL-B3A324AA')
    expect(params.value).toBe(154)
    expect(params.currency).toBe('USD')
    expect(params.items).toEqual([
      { item_id: 'azul', item_name: 'Airport transfer, Azul', item_category: 'transfer round trip', price: 140, quantity: 1 },
    ])
  })

  test('rounds to cents rather than sending float noise', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-R', value: 10.005 + 0.1, currency: 'USD', items: [] })
    const params = sent(dataLayer)[0][2] as Record<string, number>
    expect(params.value).toBe(10.11)
  })

  test('refuses a value that is not a real number', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: 'MAPL-N1', value: Number.NaN, currency: 'USD', items: [] })
    trackPurchase({ transactionId: 'MAPL-N2', value: -5, currency: 'USD', items: [] })
    trackPurchase({ transactionId: 'MAPL-N3', value: Infinity, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer)).toHaveLength(0)
  })

  test('refuses a booking with no reference, which would break de-duplication', async () => {
    const { dataLayer } = installWindow()
    const { trackPurchase } = await fresh()
    trackPurchase({ transactionId: '', value: 100, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer)).toHaveLength(0)
  })
})

describe('the other two events', () => {
  test('begin_checkout is claimed once per booking id', async () => {
    const { dataLayer } = installWindow()
    const { trackBeginCheckout } = await fresh()
    trackBeginCheckout({ key: 'bk-1', value: 351, currency: 'USD', items: [] })
    trackBeginCheckout({ key: 'bk-1', value: 351, currency: 'USD', items: [] })
    await settle()
    expect(sent(dataLayer).filter((e) => e[1] === 'begin_checkout')).toHaveLength(1)
  })

  test('add_to_cart is NOT deduped, because re-adding is real signal', async () => {
    const { dataLayer } = installWindow()
    const { trackAddToCart } = await fresh()
    const input = { value: 351, currency: 'USD', items: [] }
    trackAddToCart(input)
    trackAddToCart(input)
    await settle()
    expect(sent(dataLayer).filter((e) => e[1] === 'add_to_cart')).toHaveLength(2)
  })
})

/**
 * Where a guest stops inside a checkout. Each step is its own event NAME so it
 * reads straight off GA4's event list, each field a refused Pay names is its
 * own event, Hotjar gets the same names (once it has loaded) for filtering
 * recordings, and nothing a guest typed ever leaves the page.
 */
describe('checkout steps', () => {
  test('a step is sent as checkout_<step> with the checkout it belongs to', async () => {
    const { dataLayer } = installWindow()
    const { trackCheckoutStep } = await fresh()
    trackCheckoutStep('ride', 'flights_ready')
    await settle()
    expect(sent(dataLayer)).toEqual([['event', 'checkout_flights_ready', { checkout: 'ride' }]])
  })

  test('each missing field is its own event, by key only', async () => {
    const { dataLayer } = installWindow()
    const { trackCheckoutMissing } = await fresh()
    trackCheckoutMissing('ride', ['arrivalFlight', 'departureFlight', 'email'])
    await settle()
    expect(sent(dataLayer)).toEqual([
      ['event', 'checkout_missing_arrival_flight', { checkout: 'ride' }],
      ['event', 'checkout_missing_departure_flight', { checkout: 'ride' }],
      ['event', 'checkout_missing_email', { checkout: 'ride' }],
    ])
  })

  test('event names stay inside GA4 limits', async () => {
    installWindow()
    const { checkoutMissingEventName } = await fresh()
    for (const f of ['arrivalFlight', 'departureFlight', 'tripDate', 'waiver', 'dayLimit', 'pickupName', 'aVeryLongFieldNameThatWouldOverflowTheLimit']) {
      const n = checkoutMissingEventName(f)
      expect(n.length).toBeLessThanOrEqual(40)
      expect(n).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  test('Hotjar gets the same names when it is on the page', async () => {
    installWindow()
    const hj: unknown[][] = []
    ;(globalThis as unknown as { window: Record<string, unknown> }).window.hj = (...args: unknown[]) => { hj.push(args) }
    const { trackCheckoutStep, trackCheckoutMissing } = await fresh()
    trackCheckoutStep('tour', 'view')
    trackCheckoutMissing('tour', ['waiver'])
    expect(hj).toEqual([['event', 'checkout_view'], ['event', 'checkout_missing_waiver']])
  })

  test('Hotjar still gets a step sent before it loaded (it loads lazily)', async () => {
    installWindow()
    const { trackCheckoutStep } = await fresh()
    trackCheckoutStep('tour', 'view')
    const hj: unknown[][] = []
    ;(globalThis as unknown as { window: Record<string, unknown> }).window.hj = (...args: unknown[]) => { hj.push(args) }
    await new Promise((r) => setTimeout(r, 300))
    expect(hj).toEqual([['event', 'checkout_view']])
  })

  test('sends nothing at all without gtag or Hotjar (an opted-out guest)', async () => {
    const { dataLayer } = installWindow({ withGtag: false })
    const { trackCheckoutStep } = await fresh()
    expect(() => trackCheckoutStep('tour', 'pay_tap')).not.toThrow()
    await settle()
    expect(sent(dataLayer)).toHaveLength(0)
  })
})
