import { describe, test, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { isTrackedHost, withoutSecretParams } from '../../lib/tracker-gate'
import { middleware } from '../../middleware'

// The /checkout session refresh needs Supabase; these tests are about redirects only, so the
// page a redirect chain ends on answers "go on" without one.
vi.mock('@/lib/supabase/middleware', async () => {
  const { NextResponse } = await import('next/server')
  return { updateSession: async () => NextResponse.next() }
})

describe('only the live site feeds the live pixel and GA', () => {
  test.each(['mapltours.com', 'www.mapltours.com', 'MAPLTOURS.COM'])('%s is tracked', (h) => {
    expect(isTrackedHost(h)).toBe(true)
  })
  test.each([
    'localhost', '127.0.0.1', 'bio.mapltours.com',
    '6ac51fe429617e00085ea824--mapltours.netlify.app', 'mapltours.netlify.app',
    'mapltours.com.evil.example', '',
  ])('%s is not', (h) => {
    expect(isTrackedHost(h)).toBe(false)
  })
})

describe("Stripe's client secret never reaches a tag", () => {
  test('withoutSecretParams drops the secrets and keeps what the confirm page reads', () => {
    const u = withoutSecretParams('https://mapltours.com/transfers/confirm?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_x&redirect_status=succeeded')
    expect(u?.pathname + (u?.search ?? '')).toBe('/transfers/confirm?payment_intent=pi_1&redirect_status=succeeded')
    const s = withoutSecretParams('https://mapltours.com/checkout/confirm?setup_intent=seti_1&setup_intent_client_secret=s')
    expect(s?.search).toBe('?setup_intent=seti_1')
  })

  test('nothing to remove, or junk, is null and never throws', () => {
    expect(withoutSecretParams('https://mapltours.com/checkout/confirm?payment_intent=pi_1&redirect_status=succeeded')).toBeNull()
    expect(withoutSecretParams('not a url')).toBeNull()
    expect(withoutSecretParams(undefined as unknown as string)).toBeNull()
  })

  test.each([
    ['/transfers/confirm?payment_intent=pi_1&payment_intent_client_secret=pi_1_secret_x&redirect_status=succeeded', '/transfers/confirm?payment_intent=pi_1&redirect_status=succeeded'],
    // /checkout is an auth route: the redirect comes before the session refresh.
    ['/checkout/confirm?payment_intent=pi_2&payment_intent_client_secret=pi_2_secret_y&redirect_status=succeeded', '/checkout/confirm?payment_intent=pi_2&redirect_status=succeeded'],
    ['/gifts?payment_intent=pi_3&payment_intent_client_secret=pi_3_secret_z&redirect_status=succeeded', '/gifts?payment_intent=pi_3&redirect_status=succeeded'],
  ])('the middleware sends %s to the same page without the secret', async (from, to) => {
    const res = await middleware(new NextRequest(`https://mapltours.com${from}`))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(`https://mapltours.com${to}`)
  })

  // Follow the middleware's redirects the way a browser would, at most `limit` hops.
  async function follow(href: string, limit = 5) {
    const hops: Array<{ status: number; to: string }> = []
    let url = href
    for (let i = 0; i < limit; i++) {
      const res = await middleware(new NextRequest(url))
      const loc = res.headers.get('location')
      if (!loc) break
      url = new URL(loc, url).href
      hops.push({ status: res.status, to: url })
    }
    return { hops, end: url }
  }

  test('with a capital in the path too, the secret goes first and the case fix second: two hops, then the page', async () => {
    const { hops, end } = await follow('https://mapltours.com/Checkout/confirm?payment_intent=pi_2&payment_intent_client_secret=s&redirect_status=succeeded')
    expect(hops.map((h) => h.status)).toEqual([307, 308])
    expect(hops[0].to).toBe('https://mapltours.com/Checkout/confirm?payment_intent=pi_2&redirect_status=succeeded')
    expect(end).toBe('https://mapltours.com/checkout/confirm?payment_intent=pi_2&redirect_status=succeeded')
  })

  test.each([
    '/transfers/confirm?payment_intent=pi_1&payment_intent_client_secret=a&payment_intent_client_secret=b&redirect_status=succeeded',
    '/transfers/confirm?payment_intent=pi_1&payment%5Fintent%5Fclient%5Fsecret=a&redirect_status=failed',
    '/checkout/confirm?payment_intent=pi_1&payment_intent_client_secret&redirect_status=succeeded',
    '/checkout/confirm?setup_intent=seti_1&setup_intent_client_secret=x&redirect_status=succeeded',
    '/Gifts?payment_intent_client_secret=only',
  ])('%s ends within two hops with no secret left and nothing else lost', async (from) => {
    const { hops, end } = await follow(`https://mapltours.com${from}`)
    expect(hops.length).toBeGreaterThan(0)
    expect(hops.length).toBeLessThanOrEqual(2)
    const after = new URL(end)
    expect(after.searchParams.has('payment_intent_client_secret')).toBe(false)
    expect(after.searchParams.has('setup_intent_client_secret')).toBe(false)
    const before = new URL(`https://mapltours.com${from}`).searchParams
    before.forEach((v, k) => {
      if (k !== 'payment_intent_client_secret' && k !== 'setup_intent_client_secret') expect(after.searchParams.getAll(k)).toContain(v)
    })
  })

  test('a return without a secret passes straight through', async () => {
    const res = await middleware(new NextRequest('https://mapltours.com/transfers/confirm?payment_intent=pi_1&redirect_status=succeeded'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })
})

describe('Trackers asks the gate', () => {
  test('the host check runs before any tag is allowed', () => {
    const src = readFileSync('components/Trackers.tsx', 'utf8')
    const gate = src.indexOf('if (!isTrackedHost(window.location.hostname)) return')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(src.indexOf('setAllowed(true)'))
  })
})
