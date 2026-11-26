import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { withoutSecretParams } from '@/lib/tracker-gate'
import { PROOF_COOKIE, addProof, bookingProofShape, clientSecretFor, keepsBookingProof, keepsPaymentProof, proofCookie } from '@/lib/confirm-proof'

// Routes that need auth session refresh
// (/transfers/confirm and /travel-party show a signed-in guest their own booking, so they need a live session too)
const AUTH_ROUTES = ['/profile', '/saved', '/checkout', '/transfers/confirm', '/travel-party', '/login', '/auth', '/driver', '/referrals']

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
    // The travel party link in a booker's confirmation email carries their
    // booking proof; kept the same way, on that page only (lib/confirm-proof).
    const tripProof = keepsBookingProof(path) ? bookingProofShape(request.nextUrl.searchParams.get('trip_proof')) : null
    if (secret || tripProof) {
      let held = request.cookies.get(PROOF_COOKIE)?.value
      if (secret) held = addProof(held, secret)
      if (tripProof) held = addProof(held, tripProof)
      res.cookies.set(proofCookie(held ?? '', request.nextUrl.protocol === 'https:'))
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
