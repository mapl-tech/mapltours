import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getIp } from '@/lib/rate-limit'
import { reportMetaLead } from '@/lib/meta-capi'

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
 */
export const runtime = 'nodejs'

const UPSTREAM = process.env.LEAD_UPSTREAM_URL || 'https://bio.mapltours.com/api/lead'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PLACES = new Set(['home', 'explore'])
const FALLBACK_CODE = 'JAMAICA5'
const GENERIC = 'We could not send it just now. Try again in a moment.'

interface LeadBody {
  email?: string
  /** Honeypot; a real guest never fills it. */
  website?: string
  place?: string
  page?: string
  eventId?: string
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (rateLimit(ip, { windowMs: 60_000, max: 5, bucket: 'lead' })) {
    return NextResponse.json({ error: 'Too many tries. Give it a minute and try again.' }, { status: 429 })
  }

  let body: LeadBody
  try {
    body = (await req.json()) as LeadBody
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (body.website && body.website.trim()) return NextResponse.json({ ok: true, code: FALLBACK_CODE })

  const email = (body.email ?? '').trim().toLowerCase().slice(0, 200)
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address. Check it and try again.' }, { status: 400 })
  }
  const place = PLACES.has(String(body.place)) ? String(body.place) : 'home'
  const page = typeof body.page === 'string' && /^https?:\/\//.test(body.page) ? body.page.slice(0, 300) : ''
  const eventId = typeof body.eventId === 'string' && /^[\w-]{8,64}$/.test(body.eventId) ? body.eventId : null

  let upstream: Response
  try {
    upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source: `popup-${place}`, page, channel: 'site' }),
      signal: AbortSignal.timeout(9000),
    })
  } catch (e) {
    console.warn('[lead] upstream unreachable', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: GENERIC }, { status: 502 })
  }
  const j = (await upstream.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string }
  if (!upstream.ok || !j.ok) {
    // 400 and 502 from the bio carry a sentence written for the guest
    // (a bad address, an address the provider refuses); anything else is
    // ours to explain generically.
    const message = (upstream.status === 400 || upstream.status === 502) && typeof j.error === 'string' ? j.error : GENERIC
    console.warn('[lead] upstream refused', { status: upstream.status })
    return NextResponse.json({ error: message }, { status: upstream.status === 400 ? 400 : 502 })
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

  return NextResponse.json({ ok: true, code: typeof j.code === 'string' && j.code ? j.code : FALLBACK_CODE })
}
