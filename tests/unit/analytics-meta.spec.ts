import { describe, test, expect, afterEach, vi } from 'vitest'

/**
 * The browser half of the Meta Purchase (lib/analytics trackPurchase). The
 * Conversions API sends the same booking ref as event_id from the Stripe
 * webhook (lib/meta-capi), so the pixel's eventID must be exactly that string,
 * once per booking per browser, and must not depend on GA being present.
 */

type Store = Record<string, string>

function installWindow(opts: { withFbq?: boolean; withGtag?: boolean } = {}) {
  const store: Store = {}
  const fbqCalls: unknown[][] = []
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
    },
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
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
