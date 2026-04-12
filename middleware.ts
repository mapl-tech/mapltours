import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Routes that need auth session refresh
const AUTH_ROUTES = ['/profile', '/checkout', '/login', '/auth']

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

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
