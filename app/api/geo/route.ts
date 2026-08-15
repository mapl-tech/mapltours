import { NextResponse } from 'next/server'

// Same-origin proxy for IP-based country detection. The browser-side
// fetch to https://ipapi.co/json/ is blocked by CORS in production
// (Playwright caught: "No 'Access-Control-Allow-Origin' header"), so
// we forward server-side and only return the country code the client
// actually needs for language detection.

export const runtime = 'edge'

export async function GET(request: Request) {
  // Forward the visitor's IP if a proxy/CDN exposed one. ipapi resolves
  // by request IP when no path param is supplied, but Edge runtimes can
  // route through a server IP, pass the explicit address when known.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''

  const url = ip ? `https://ipapi.co/${ip}/json/` : 'https://ipapi.co/json/'

  try {
    const res = await fetch(url, {
      // revalidate 0 = never serve this lookup from the Data Cache. Declared
      // via the `next` option (stripped before the platform fetch runs)
      // rather than `cache: 'no-store'`, which edge runtimes can reject.
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'mapltours/1.0' },
    })
    if (!res.ok) {
      return NextResponse.json({ country_code: null }, { status: 200 })
    }
    const data = await res.json()
    return NextResponse.json(
      { country_code: data.country_code ?? null },
      {
        // Cache at the edge for 10 minutes per IP, language detection
        // doesn't change often and we don't want to hammer the upstream.
        headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600' },
      },
    )
  } catch {
    return NextResponse.json({ country_code: null }, { status: 200 })
  }
}
