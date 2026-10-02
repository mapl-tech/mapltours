import { describe, test, expect } from 'vitest'
import nextConfig from '../../next.config.mjs'

/**
 * The response headers that decide whether Stripe's wallet buttons can work.
 *
 * From Sept 9 to Sept 27 2026 the site sent `Permissions-Policy: payment=(self)`.
 * Stripe's Apple Pay / Google Pay / Link buttons live in an iframe on
 * js.stripe.com, and that header stops the browser delegating the Payment
 * Request API to it, so Google Pay could never appear, whatever the Stripe
 * Dashboard said. Nothing failed loudly; the buttons just were not there.
 */

async function pageHeaders(): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!()
  const html = rules.find((r) => r.source === '/:path*')
  if (!html) throw new Error('no header rule for /:path*')
  return Object.fromEntries(html.headers.map((h) => [h.key.toLowerCase(), h.value]))
}

/** "a=(), payment=(self "x")" -> { a: '()', payment: '(self "x")' } */
function permissions(value: string): Record<string, string> {
  return Object.fromEntries(value.split(/,\s*/).map((m) => {
    const i = m.indexOf('=')
    return [m.slice(0, i).trim(), m.slice(i + 1).trim()]
  }))
}

function csp(value: string): Record<string, string[]> {
  return Object.fromEntries(value.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...sources] = d.split(/\s+/)
    return [name, sources]
  }))
}

describe('Permissions-Policy lets Stripe\'s wallet iframe take payments', () => {
  test('payment is delegated to js.stripe.com, not kept to the page alone', async () => {
    const pp = permissions((await pageHeaders())['permissions-policy'])
    expect(pp.payment).toBeDefined()
    expect(pp.payment).not.toBe('(self)')
    expect(pp.payment).toContain('self')
    expect(pp.payment).toContain('"https://js.stripe.com"')
  })

  test('the features the site never uses stay off', async () => {
    const pp = permissions((await pageHeaders())['permissions-policy'])
    for (const f of ['camera', 'microphone', 'geolocation', 'usb']) expect(pp[f]).toBe('()')
  })
})

describe('the Content-Security-Policy lists every origin Stripe documents', () => {
  // docs.stripe.com/security/guide, "Content Security Policy": the Stripe.js
  // and Link lists. The policy is report-only today; when it is promoted to
  // enforcing, a missing origin here stops guests paying.
  const REQUIRED: Record<string, string[]> = {
    'script-src': ['https://js.stripe.com', 'https://*.js.stripe.com'],
    'frame-src': ['https://js.stripe.com', 'https://*.js.stripe.com', 'https://hooks.stripe.com', 'https://link.com', 'https://*.link.com'],
    'connect-src': [
      'https://api.stripe.com', 'https://link.com', 'https://*.link.com',
      // DeferredPaymentPanel passes Elements a `fonts` cssSrc on this host,
      // and Stripe.js fetches it: "its URL must be allowed by your connect-src".
      'https://fonts.googleapis.com',
    ],
  }

  test.each(Object.entries(REQUIRED))('%s', async (directive, origins) => {
    const h = await pageHeaders()
    const policy = h['content-security-policy'] ?? h['content-security-policy-report-only']
    expect(policy).toBeDefined()
    const sources = csp(policy)[directive]
    expect(sources).toBeDefined()
    for (const o of origins) expect(sources).toContain(o)
  })

  test('Link\'s images are covered', async () => {
    const h = await pageHeaders()
    const img = csp(h['content-security-policy'] ?? h['content-security-policy-report-only'])['img-src']
    // Stripe asks for https://*.link.com; the site already allows any https image.
    expect(img.includes('https:') || img.includes('https://*.link.com')).toBe(true)
  })
})
