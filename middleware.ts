import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { withoutSecretParams } from '@/lib/tracker-gate'
import { PROOF_COOKIE, addProof, clientSecretFor, keepsPaymentProof, proofCookie } from '@/lib/confirm-proof'

// Routes that need auth session refresh
// (/transfers/confirm shows a signed-in guest their own ride, so it needs a live session too)
const AUTH_ROUTES = ['/profile', '/saved', '/checkout', '/transfers/confirm', '/login', '/auth', '/driver']

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // A Stripe redirect return (/checkout/confirm, /transfers/confirm, /gifts)
  // carries the PaymentIntent's client secret in the query, and the Meta
  // pixel, GA and Hotjar all report the page address. Send the browser to the
  // same address without it before the page, or any tag, exists. On a
  // confirmation page or /gifts the secret is kept in an HttpOnly cookie
  // instead, as this browser's proof that it paid (lib/confirm-proof).
  const clean = withoutSecretParams(request.nextUrl.href)
  if (clean) {
    const url = request.nextUrl.clone()
    url.search = clean.search
    const res = NextResponse.redirect(url, 307)
    const secret = keepsPaymentProof(path)
      ? clientSecretFor(
          request.nextUrl.searchParams.get('payment_intent_client_secret'),
          request.nextUrl.searchParams.get('payment_intent'),
        )
      : null
    if (secret) {
      const held = request.cookies.get(PROOF_COOKIE)?.value
      res.cookies.set(proofCookie(addProof(held, secret), request.nextUrl.protocol === 'https:'))
    }
    return res
  }

  // Route folders are case-sensitive in the App Router, so /Transfers, /Blog
  // and /About all 404 while /transfers, /blog and /about are fine. That is
  // invisible until something outside the codebase types a capital: the live
  // Google Ads campaign's final URL is /Transfers/Sandals-Ochi, which returned
  // a 404, costing the click and risking the ad being disapproved for a broken
  // destination.
  //
  // Only the FIRST segment is lowercased, because that is the one that maps to
  // a folder on disk. Deeper segments are dynamic params whose own pages decide
  // how to match them - /transfers/[resort] resolves any casing itself - and
  // lowercasing a slug blindly would break any that is case-sensitive.
  const first = path.split('/')[1] ?? ''
  if (/[A-Z]/.test(first)) {
    const url = request.nextUrl.clone()
    url.pathname = '/' + first.toLowerCase() + path.slice(first.length + 1)
    return NextResponse.redirect(url, 308)
  }

  // Only run Supabase session refresh on routes that need auth
  // Public pages skip the auth check entirely for faster loads
  const needsAuth = AUTH_ROUTES.some((route) => path.startsWith(route))

  if (needsAuth) {
    return await updateSession(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|ico|css|js)$).*)',
  ],
}
