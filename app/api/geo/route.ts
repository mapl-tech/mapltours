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
  const forwarded =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''

  // x-forwarded-for is a REQUEST HEADER, so any caller can set it to anything.
  // It used to be interpolated straight into the upstream path, which let a
  // caller steer this server's outbound fetch with input like "../..". Only a
  // literal IPv4 or IPv6 address is ever forwarded now; anything else falls
  // back to letting ipapi resolve by connecting address.
  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  const IPV6 = /^[0-9A-Fa-f:]{2,45}$/
  const ip = IPV4.test(forwarded) || (forwarded.includes(':') && IPV6.test(forwarded)) ? forwarded : ''

  const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/'

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
        // PRIVATE, not s-maxage. This answer is derived from the caller's own
        // IP, but the URL is the same for everybody and carries no Vary, so a
        // shared CDN cache would hand one visitor's country to every visitor
        // for the next ten minutes and flip the whole storefront's language.
        // Browser-only caching keeps the upstream call rate down without ever
        // letting one visitor's answer be served to another.
        headers: { 'Cache-Control': 'private, max-age=600' },
      },
    )
  } catch {
    return NextResponse.json({ country_code: null }, { status: 200 })
  }
}
