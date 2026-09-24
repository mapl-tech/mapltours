import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { reportMetaLead } from '@/lib/meta-capi'
import { tipsConsentValid, type TipsDefault } from '@/lib/trip-tips'
import { countryFromHeaders } from '@/lib/visitor-country'
import { NO_STORE_HEADERS } from '@/lib/no-store'

/**
 * The 5% code popup's submit (components/CouponPopup).
 *
 * The email itself is sent by the bio page's lead function, which already
 * owns the template, the Resend audience and the HubSpot contact, so there is
 * one code email and one nurture list however the address arrived. This
 * route is the site's front door to it: rate limit, honeypot, validation,
 * then a server-to-server call with `channel: 'site'` so the footer, the
 * HubSpot source and the Resend tags say mapltours.com rather than the bio.
 *
 * No event id is forwarded upstream on purpose: the bio function would
 * report the lead to the BIO pixel. This site's pixel gets it instead, here,
 * with the id the browser used, so Meta counts one lead on the right pixel.
 *
 * The trip-tips box travels as the guest left it (`optIn`) and as it looked
 * before they touched it (`optInDefault`), plus the country Netlify placed
 * them in. The country is read here, from this request: the bio function's
 * own geo would be this server's location, and the browser's word for it is
 * not ours to trust. The bio decides and records consent (lib/trip-tips has
 * the same rule); `tips` in the reply only says whether the popup may tell
 * the guest tips are on.
 */
export const runtime = 'nodejs'

const UPSTREAM = process.env.LEAD_UPSTREAM_URL || 'https://bio.mapltours.com/api/lead'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PLACES = new Set(['home', 'explore', 'transfers'])
const FALLBACK_CODE = 'JAMAICA5'
const GENERIC = 'We could not send it just now. Try again in a moment.'

interface LeadBody {
  email?: string
  /** Honeypot; a real guest never fills it. */
  website?: string
  place?: string
  page?: string
  eventId?: string
  optIn?: unknown
  optInDefault?: unknown
}

// Plain JSON for every answer, never cached: each one is about one guest.
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (rateLimit(ip, { windowMs: 60_000, max: 5, bucket: 'lead' })) {
    return reply({ error: 'Too many tries. Give it a minute and try again.' }, 429)
  }

  let body: LeadBody
  try {
    body = (await req.json()) as LeadBody
  } catch {
    return reply({ error: 'Invalid request' }, 400)
  }

  if (body.website && body.website.trim()) return reply({ ok: true, code: FALLBACK_CODE })

  const email = (body.email ?? '').trim().toLowerCase().slice(0, 200)
  if (!EMAIL_RE.test(email)) {
    return reply({ error: 'That does not look like an email address. Check it and try again.' }, 400)
  }
  const place = PLACES.has(String(body.place)) ? String(body.place) : 'home'
  const page = typeof body.page === 'string' && /^https?:\/\//.test(body.page) ? body.page.slice(0, 300) : ''
  const eventId = typeof body.eventId === 'string' && /^[\w-]{8,64}$/.test(body.eventId) ? body.eventId : null
  // Only a literal true is a ticked box. A default we cannot read is taken
  // as 'checked', the value that proves nothing, so a garbled request can
  // never pass for a box the guest ticked themselves.
  const optIn = body.optIn === true
  const optInDefault: TipsDefault = body.optInDefault === 'unchecked' ? 'unchecked' : 'checked'
  const country = countryFromHeaders(req.headers)
  // Netlify should place every real visitor. If this starts firing on the
  // live site, the geo header is not reaching the function and the US
  // pre-tick has quietly stopped (the box then starts unticked for everyone,
  // which is lawful but not what the owner asked for). Which header arrived
  // tells a missing header from an unreadable one; no visitor data is logged.
  if (!country) {
    console.warn('[lead] no geo header', { nfGeo: req.headers.has('x-nf-geo'), xCountry: req.headers.has('x-country') })
  }

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      // The shared secret proves to the bio function that this relay is
      // mapltours.com, so it may trust the country below (the bio cannot see
      // the visitor's own location on a relayed call). Without it the bio
      // records the sign-up as its own, with no country, and a pre-ticked
      // box never counts as consent.
      headers: { 'content-type': 'application/json', ...(process.env.LEAD_RELAY_SECRET ? { 'x-mapl-relay': process.env.LEAD_RELAY_SECRET } : {}) },
      body: JSON.stringify({ email, source: `popup-${place}`, page, channel: 'site', optIn, optInDefault, country }),
      signal: AbortSignal.timeout(9000),
    })
  } catch (e) {
    console.warn('[lead] upstream unreachable', { error: e instanceof Error ? e.message : String(e) })
    return reply({ error: GENERIC }, 502)
  }
  const j = (await upstream.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string; tips?: unknown }
  if (!upstream.ok || !j.ok) {
    // 400 and 502 from the bio carry a sentence written for the guest
    // (a bad address, an address the provider refuses); anything else is
    // ours to explain generically.
    const message = (upstream.status === 400 || upstream.status === 502) && typeof j.error === 'string' ? j.error : GENERIC
    console.warn('[lead] upstream refused', { status: upstream.status })
    return reply({ error: message }, upstream.status === 400 ? 400 : 502)
  }

  if (eventId) {
    await reportMetaLead({
      email,
      eventId,
      ip,
      userAgent: req.headers.get('user-agent'),
      cookie: req.headers.get('cookie'),
      sourceUrl: page,
      contentName: `popup-${place}`,
    })
  }

  // Tips are "on" only when the bio says it recorded them (`tips: true`). A
  // reply without the field is a bio that ignored the box (an older deploy),
  // so it is a no: the popup never claims consent nobody wrote down. The
  // local rule stays as a second check on what the bio accepted.
  const tips = tipsConsentValid({ optIn, defaultShown: optInDefault, country }) && j.tips === true
  return reply({ ok: true, code: typeof j.code === 'string' && j.code ? j.code : FALLBACK_CODE, tips })
}
