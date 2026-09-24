import { NextResponse } from 'next/server'
import { countryFromHeaders } from '@/lib/visitor-country'
import { NO_STORE_HEADERS } from '@/lib/no-store'

// The visitor's country, for two readers.
//
// `country` is the 5% popup's (components/CouponPopup): it comes ONLY from
// the headers Netlify stamps on the request, the same source /api/lead
// relays to the bio function, so the trip-tips box starts ticked on exactly
// the visitors whose pre-ticked consent the bio will accept (lib/trip-tips).
// Null when Netlify did not say; the box then starts unticked.
//
// `country_code` is the language detector's (lib/i18n): the same answer when
// Netlify gives one, otherwise the old ipapi.co lookup so local dev still
// guesses a language. The browser cannot call ipapi.co itself (no CORS
// headers), which is why this forwards server-side.
//
// Every answer is no-store, browser and CDN alike: the URL is the same for
// everybody and carries no Vary, so any shared cache would hand one
// visitor's country to every visitor after them.

// Node, like /api/lead, so both routes read the Netlify geo header from the
// same kind of request.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const country = countryFromHeaders(request.headers)
  if (country) {
    return NextResponse.json({ country, country_code: country }, { headers: NO_STORE_HEADERS })
  }

  // Forward the visitor's IP if a proxy/CDN exposed one. ipapi resolves
  // by request IP when no path param is supplied, but the function can
  // route through a server IP, so pass the explicit address when known.
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
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'mapltours/1.0' },
    })
    if (!res.ok) {
      return NextResponse.json({ country: null, country_code: null }, { headers: NO_STORE_HEADERS })
    }
    const data = await res.json()
    return NextResponse.json({ country: null, country_code: data.country_code ?? null }, { headers: NO_STORE_HEADERS })
  } catch {
    return NextResponse.json({ country: null, country_code: null }, { headers: NO_STORE_HEADERS })
  }
}
