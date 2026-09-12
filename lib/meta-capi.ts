import 'server-only'
import { createHash } from 'node:crypto'
import { bookingRef } from './dispatch'

/**
 * Server-side purchase reporting to Meta (the Conversions API), the exact
 * counterpart of lib/ga4-server for Facebook and Instagram ads.
 *
 * Why it exists, and why it matters more on Meta than on Google: the browser
 * pixel (components/Trackers) is blocked by iOS's tracking prevention, most
 * content blockers, and any guest who never returns from 3DS. On Meta that is
 * the majority of a mobile travel audience, so a pixel-only setup teaches the
 * OUTCOME_SALES optimiser almost nothing. This call fires from the Stripe
 * webhook the moment a booking flips to paid, straight from Meta's servers to
 * ours, so the purchase is counted whatever the browser did.
 *
 * Deduplication: the pixel sends `Purchase` with `eventID` set to the booking
 * reference (lib/analytics), and this sends the same string as `event_id`.
 * Meta collapses the two into one conversion, exactly as GA4 dedupes on
 * transaction_id. So double-firing is safe by construction.
 *
 * Matching: Meta needs identity to attribute a server event to the person who
 * clicked. Unlike GA4 (which forbids PII), the Conversions API is BUILT for
 * hashed identifiers, so we send SHA-256 of the guest's email plus the `_fbp`
 * / `_fbc` browser cookies captured at checkout (lib/attribution). Nothing
 * unhashed and nothing that is not already Meta's own cookie ever leaves here.
 *
 * Never throws, never blocks fulfilment: the webhook awaits it with a short
 * timeout and carries on whatever happens. Dormant until META_PIXEL_ID and
 * META_CAPI_TOKEN are set, so it is a no-op in every environment that has not
 * been given the token.
 */
export interface PurchaseBookingRow {
  id: string
  booking_type?: string | null
  total_paid?: number | string | null
  currency?: string | null
  email?: string | null
  pickup?: string | null
  dropoff?: string | null
  paid_at?: string | null
  attribution?: Record<string, unknown> | null
}

const GRAPH_VERSION = 'v21.0'
const TIMEOUT_MS = 4000

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

/** Meta wants email lowercased and trimmed before hashing; nothing else. */
function hashedEmail(email: unknown): string | undefined {
  if (typeof email !== 'string') return undefined
  const norm = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm) ? sha256(norm) : undefined
}

/**
 * The `_fbc` click cookie, or a faithful reconstruction of it. Meta's format
 * is `fb.1.<unix millis>.<fbclid>`; when the cookie itself was captured we use
 * it verbatim, otherwise we rebuild it from the fbclid and landing timestamp
 * the attribution already stored, which Meta accepts identically.
 */
function metaClickId(attr: Record<string, unknown>): string | undefined {
  const fbc = attr.fbc
  if (typeof fbc === 'string' && /^fb\.\d\.\d+\./.test(fbc)) return fbc
  const fbclid = typeof attr.fbclid === 'string' ? attr.fbclid : undefined
  if (!fbclid) return undefined
  const tsMs = typeof attr.ts === 'string' ? Date.parse(attr.ts) : NaN
  const stamp = Number.isFinite(tsMs) ? tsMs : Date.now()
  return `fb.1.${stamp}.${fbclid}`
}

export function buildPurchaseEvent(
  b: PurchaseBookingRow,
  nowMs: number = Date.now(),
): { url: string; body: Record<string, unknown> } | { skipped: string } {
  const pixelId = process.env.META_PIXEL_ID
  const token = process.env.META_CAPI_TOKEN
  if (!pixelId || !token) return { skipped: 'META_PIXEL_ID/META_CAPI_TOKEN not set' }

  const value = b.total_paid == null || b.total_paid === '' ? NaN : Number(b.total_paid)
  if (!Number.isFinite(value) || value < 0) return { skipped: 'no total_paid' }

  const attr = (b.attribution && typeof b.attribution === 'object' ? b.attribution : {}) as Record<string, unknown>

  // Identity for matching. An event with no identifiers at all cannot be
  // attributed to anyone, so skip it rather than send a phantom conversion
  // that only inflates the account's unattributed purchases.
  const user_data: Record<string, unknown> = {}
  const em = hashedEmail(b.email)
  if (em) user_data.em = [em]
  const fbp = typeof attr.fbp === 'string' && /^fb\.\d\./.test(attr.fbp) ? attr.fbp : undefined
  if (fbp) user_data.fbp = fbp
  const fbc = metaClickId(attr)
  if (fbc) user_data.fbc = fbc
  if (Object.keys(user_data).length === 0) return { skipped: 'no identifiers to match on' }

  const isTransfer = b.booking_type === 'transfer'
  const paidMs = b.paid_at ? Date.parse(b.paid_at) : NaN
  // The Conversions API accepts an event_time up to 7 days back.
  const eventTime = Number.isFinite(paidMs) && paidMs <= nowMs && nowMs - paidMs < 7 * 86_400_000
    ? Math.floor(paidMs / 1000)
    : Math.floor(nowMs / 1000)
  const amount = Math.round(value * 100) / 100

  return {
    url: `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
    body: {
      data: [
        {
          event_name: 'Purchase',
          event_time: eventTime,
          // Same string the pixel sends as eventID, so Meta dedupes the two.
          event_id: bookingRef(b.id),
          action_source: 'website',
          event_source_url: `https://mapltours.com/${isTransfer ? 'transfers/confirm' : 'checkout/confirm'}`,
          user_data,
          custom_data: {
            currency: (b.currency || 'USD').toUpperCase(),
            value: amount,
            order_id: bookingRef(b.id),
            content_type: 'product',
            contents: [
              {
                id: isTransfer ? 'airport-transfer' : 'tour',
                quantity: 1,
                item_price: amount,
              },
            ],
          },
        },
      ],
    },
  }
}

export async function reportMetaPurchase(
  b: PurchaseBookingRow,
  fetchImpl: typeof fetch = fetch,
): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const p = buildPurchaseEvent(b)
    if ('skipped' in p) {
      console.log('[meta-capi] purchase not reported', { booking_id: b.id, reason: p.skipped })
      return 'skipped'
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetchImpl(p.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p.body),
        signal: ctrl.signal,
      })
      if (!r.ok) {
        console.warn('[meta-capi] purchase report rejected', { booking_id: b.id, status: r.status })
        return 'failed'
      }
      return 'sent'
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.warn('[meta-capi] purchase report failed', { booking_id: b.id, error: e instanceof Error ? e.message : String(e) })
    return 'failed'
  }
}
