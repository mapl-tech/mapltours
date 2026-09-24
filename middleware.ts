import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that need auth session refresh
const AUTH_ROUTES = ['/profile', '/saved', '/checkout', '/login', '/auth', '/driver']

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

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
