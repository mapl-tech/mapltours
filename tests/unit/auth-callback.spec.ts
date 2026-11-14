import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * /auth/callback: where Google sign-in, the sign-up confirmation link and the
 * password-reset link come back to.
 *
 * The bug this pins (found Oct 2026, fixed Nov 13): the redirect was built
 * from the request's own URL, and behind the custom domain a Netlify function
 * sees its per-deploy host. A guest who had just signed in on mapltours.com
 * was sent to <deploy id>--mapltours.netlify.app/profile, where they have no
 * cookies, and saw the login page as if sign-in had failed.
 */
const auth = vi.hoisted(() => ({ fail: false, codes: [] as string[] }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        auth.codes.push(code)
        return { error: auth.fail ? { message: 'invalid grant' } : null }
      },
    },
  }),
}))

import { GET } from '@/app/auth/callback/route'
import { getSafeRedirect } from '@/lib/safe-redirect'
import { siteOrigin } from '@/lib/site-origin'

const DEPLOY = 'https://6914e2f0a1b2c30008d4e5f6--mapltours.netlify.app'
const go = async (path: string) => {
  const res = await GET(new Request(path))
  return { status: res.status, to: res.headers.get('location') }
}

beforeEach(() => { auth.fail = false; auth.codes = [] })

describe('the sign-in callback always returns to the public site', () => {
  test('seen through the per-deploy host, it still sends the guest to mapltours.com', async () => {
    const r = await go(`${DEPLOY}/auth/callback?code=abc&redirect=%2Fprofile`)
    expect(r.status).toBeGreaterThanOrEqual(300)
    expect(r.to).toBe('https://mapltours.com/profile')
    expect(auth.codes).toEqual(['abc'])
  })

  test('the page that asked for sign-in gets the guest back', async () => {
    expect((await go(`${DEPLOY}/auth/callback?code=abc&redirect=%2Fsaved`)).to).toBe('https://mapltours.com/saved')
    expect((await go(`${DEPLOY}/auth/callback?code=abc&redirect=%2Fdriver`)).to).toBe('https://mapltours.com/driver')
    expect((await go(`${DEPLOY}/auth/callback?code=abc&redirect=%2Fadmin%2Fbookings`)).to).toBe('https://mapltours.com/admin/bookings')
    expect((await go(`${DEPLOY}/auth/callback?code=abc`)).to).toBe('https://mapltours.com/profile')
  })

  test('nothing in the address can send the guest off the site', async () => {
    for (const bad of ['%2F%2Fevil.com', 'https%3A%2F%2Fevil.com', '%2F%5Cevil.com', '%2Fprofile%3Fnext%3D%2F%2Fevil.com']) {
      const r = await go(`${DEPLOY}/auth/callback?code=abc&redirect=${bad}`)
      expect(r.to).toBe('https://mapltours.com/profile')
    }
  })

  test('a password-reset link lands on the form that sets the new password', async () => {
    expect((await go(`${DEPLOY}/auth/callback?code=abc&type=recovery`)).to).toBe('https://mapltours.com/login/reset')
  })

  test('a link that does not work goes to the login page, which says so', async () => {
    auth.fail = true
    expect((await go(`${DEPLOY}/auth/callback?code=used&redirect=%2Fprofile`)).to).toBe('https://mapltours.com/login?error=auth')
    expect((await go(`${DEPLOY}/auth/callback`)).to).toBe('https://mapltours.com/login?error=auth')
    // A failed reset link never reaches the new-password form.
    expect((await go(`${DEPLOY}/auth/callback?code=used&type=recovery`)).to).toBe('https://mapltours.com/login?error=auth')
  })

  test('a local dev server keeps its own address', async () => {
    expect((await go('http://localhost:3100/auth/callback?code=abc&redirect=%2Fsaved')).to).toBe('http://localhost:3100/saved')
    expect(siteOrigin(new URL('http://127.0.0.1:3000/x'))).toBe('http://127.0.0.1:3000')
    expect(siteOrigin(new URL('https://mapltours.com/x'))).toBe('https://mapltours.com')
    expect(siteOrigin(new URL('https://deploy-preview-12--mapltours.netlify.app/x'))).toBe('https://mapltours.com')
  })

  test('the driver portal is a place sign-in may return to', () => {
    // The driver login sends redirect=/driver; it used to fall back to /profile.
    expect(getSafeRedirect('/driver')).toBe('/driver')
    expect(getSafeRedirect('/driver/anything')).toBe('/profile')
  })
})
