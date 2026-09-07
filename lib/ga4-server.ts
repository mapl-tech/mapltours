import 'server-only'
import { GA4_MEASUREMENT_ID } from './attribution'
import { bookingRef } from './dispatch'

/**
 * Server-side purchase reporting to GA4 (Measurement Protocol), so Google Ads
 * learns which click paid even when the guest never returns from 3DS or
 * closes the tab before the confirm page fires its client-side event.
 *
 * Why the same transaction id as the confirm page: GA4 dedupes purchases on
 * transaction_id, so a guest who does reach the confirm page is counted once.
 * Why the client and session ids: without them the event would land on a
 * phantom user with no source and no Google Ads click, which would inflate
 * "direct" revenue while teaching Ads nothing. So a booking with no GA ids
 * (cookies blocked, or a WebMCP agent that never loaded gtag) is skipped,
 * not guessed at. The checkout stores the ids in bookings.attribution
 * (lib/attribution readGaIds) at the moment it POSTs.
 *
 * Never throws and never blocks fulfilment: the webhook awaits it with a
 * short timeout and carries on whatever happens.
 */
export interface PurchaseBookingRow {
  id: string
  booking_type?: string | null
  total_paid?: number | string | null
  currency?: string | null
  pickup?: string | null
  dropoff?: string | null
  paid_at?: string | null
  attribution?: Record<string, unknown> | null
}

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect'
const TIMEOUT_MS = 4000

export function buildPurchasePayload(b: PurchaseBookingRow, nowMs: number = Date.now()): { url: string; body: Record<string, unknown> } | { skipped: string } {
  const secret = process.env.GA4_API_SECRET
  if (!secret) return { skipped: 'GA4_API_SECRET not set' }
  const attr = (b.attribution && typeof b.attribution === 'object' ? b.attribution : {}) as Record<string, unknown>
  const clientId = typeof attr.ga_client_id === 'string' && /^\d+\.\d+$/.test(attr.ga_client_id) ? attr.ga_client_id : null
  if (!clientId) return { skipped: 'no GA client id on the booking' }
  const sessionId = typeof attr.ga_session_id === 'string' && /^\d+$/.test(attr.ga_session_id) ? attr.ga_session_id : undefined
  const value = b.total_paid == null || b.total_paid === '' ? NaN : Number(b.total_paid)
  if (!Number.isFinite(value) || value < 0) return { skipped: 'no total_paid' }
  const isTransfer = b.booking_type === 'transfer'
  const route = isTransfer && b.pickup && b.dropoff ? `: ${String(b.pickup)} to ${String(b.dropoff)}`.slice(0, 90) : ''
  const paidMs = b.paid_at ? Date.parse(b.paid_at) : NaN
  // MP accepts a timestamp up to 72 hours back; anything else falls back to "now".
  const timestampMicros = Number.isFinite(paidMs) && paidMs <= nowMs && nowMs - paidMs < 72 * 3_600_000 ? paidMs * 1000 : undefined
  return {
    url: `${MP_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${encodeURIComponent(secret)}`,
    body: {
      client_id: clientId,
      ...(timestampMicros ? { timestamp_micros: timestampMicros } : {}),
      events: [{
        name: 'purchase',
        params: {
          transaction_id: bookingRef(b.id),
          value: Math.round(value * 100) / 100,
          currency: (b.currency || 'USD').toUpperCase(),
          items: [{
            item_id: isTransfer ? 'airport-transfer' : 'tour',
            item_name: isTransfer ? `Airport transfer${route}` : 'Tour booking',
            item_category: isTransfer ? 'transfer' : 'tour',
            price: Math.round(value * 100) / 100,
            quantity: 1,
          }],
          ...(sessionId ? { session_id: sessionId } : {}),
          engagement_time_msec: 1,
          source: 'stripe-webhook',
        },
      }],
    },
  }
}

export async function reportServerPurchase(b: PurchaseBookingRow, fetchImpl: typeof fetch = fetch): Promise<'sent' | 'skipped' | 'failed'> {
  try {
    const p = buildPurchasePayload(b)
    if ('skipped' in p) {
      console.log('[ga4-server] purchase not reported', { booking_id: b.id, reason: p.skipped })
      return 'skipped'
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetchImpl(p.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p.body), signal: ctrl.signal })
      if (!r.ok) {
        console.warn('[ga4-server] purchase report rejected', { booking_id: b.id, status: r.status })
        return 'failed'
      }
      return 'sent'
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    console.warn('[ga4-server] purchase report failed', { booking_id: b.id, error: e instanceof Error ? e.message : String(e) })
    return 'failed'
  }
}
