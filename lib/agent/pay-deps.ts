/**
 * The real side effects behind book_and_pay_transfer (lib/agent/agent-pay):
 * Stripe and the transfer checkout route. Server only.
 *
 * Switched off unless AGENT_PAYMENTS_ENABLED is exactly "1", so the payment
 * tool is not even listed until the owner has created the Stripe profile,
 * accepted Stripe's Agentic Commerce seller terms and the flow has passed in
 * test mode (GO-LIVE.md).
 */
import Stripe from 'stripe'
import { NextRequest } from 'next/server'
import { rateLimit } from '../rate-limit'
import { createServiceClient } from '../supabase/service'
import type { AgentPayDeps, ConfirmOutcome, GrantedToken, IntentLike, RideState } from './agent-pay'
import { agentPaymentsEnabled } from './payments-flag'

/** Shared payment tokens are a Stripe preview API; reading one needs this version. */
export const SPT_API_VERSION = '2026-04-22.preview'

export { agentPaymentsEnabled }

// Every call here is single-try with a short timeout, so the whole tool fits
// in Netlify's 10 s: the confirm gets 3.5 s, the read-back 1.5 s, and the
// tool never STARTS a confirm after CONFIRM_DEADLINE_MS from the request's
// arrival. A timed-out confirm is read back, then reported as unknown.
let stripeClient: Stripe | null = null
const stripe = () => (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 2_500, maxNetworkRetries: 0 }))

/** Intent states that mean money moved, is moving, or waits on the bank. */
const PAID_STATES = new Set(['succeeded', 'requires_capture'])

export function agentPayDeps(origin: string): AgentPayDeps | null {
  if (!agentPaymentsEnabled()) return null
  return {
    // Each lookup below costs a live Stripe call; keep anonymous callers from
    // spending the account's rate limit, which real checkouts share.
    // Two tiers: hosted assistants share addresses, so one connection gets a
    // generous allowance and each traveller (address + email) a tight one.
    tooManyAttempts: (ip, email) =>
      rateLimit(ip || 'unknown', { windowMs: 60_000, max: 60, bucket: 'agent-pay-ip' }) ||
      rateLimit(`${ip || 'unknown'}|${email}`, { windowMs: 60_000, max: 10, bucket: 'agent-pay' }),

    // Paid rows first; then any pending or failed row whose intent Stripe
    // reports paid, processing or waiting on the bank (a late decline webhook
    // can mark a row failed after a retry on the same intent paid).
    findRideState: async (cartHash): Promise<RideState> => {
      const { data, error } = await createServiceClient()
        .from('bookings')
        .select('id, status, stripe_payment_id, created_at')
        .eq('cart_hash', cartHash)
        .eq('booking_type', 'transfer')
        .in('status', ['paid', 'pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw new Error(`ride lookup failed: ${error.message}`)
      const rows = (data ?? []) as Array<{ id: string; status: string; stripe_payment_id: string | null }>
      const paidRow = rows.find((r) => r.status === 'paid')
      if (paidRow) return { kind: 'paid', bookingId: String(paidRow.id) }
      for (const r of rows) {
        if (!r.stripe_payment_id) continue
        const pi = await stripe().paymentIntents.retrieve(r.stripe_payment_id, {}, { timeout: 2_000, maxNetworkRetries: 0 })
        if (PAID_STATES.has(pi.status)) return { kind: 'paid', bookingId: String(r.id) }
        if (pi.status === 'processing') return { kind: 'processing', bookingId: String(r.id) }
        if (pi.status === 'requires_action') {
          return { kind: 'needs_authentication', bookingId: String(r.id), url: pi.next_action?.redirect_to_url?.url ?? null }
        }
      }
      return { kind: 'none' }
    },

    retrieveGrantedToken: async (spt): Promise<GrantedToken | null> => {
      const r = await fetch(`https://api.stripe.com/v1/shared_payment/granted_tokens/${encodeURIComponent(spt)}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': SPT_API_VERSION },
        signal: AbortSignal.timeout(3_000),
      })
      if (r.status === 404) return null
      const j = (await r.json().catch(() => null)) as (GrantedToken & { error?: { code?: string } }) | null
      if (!r.ok) {
        if (j?.error?.code === 'resource_missing') return null
        throw new Error(`granted token lookup failed: ${r.status}`)
      }
      return j
    },

    // The real checkout handler, loaded on first use so the read-only tools
    // never pay for its dependency graph. Same body a browser sends.
    createCheckout: async (body, ip) => {
      const { POST } = await import('@/app/api/transfers/checkout/route')
      const req = new NextRequest(new URL('/api/transfers/checkout', origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || 'unknown' },
        body: JSON.stringify(body),
      })
      const res = await POST(req)
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
      return { status: res.status, json }
    },

    retrievePaymentIntent: async (id, quick): Promise<IntentLike> =>
      (await stripe().paymentIntents.retrieve(id, {}, { timeout: quick ? 1_500 : 2_500, maxNetworkRetries: 0 })) as unknown as IntentLike,

    confirmPaymentIntent: async (id, spt, returnUrl, idempotencyKey): Promise<ConfirmOutcome> => {
      try {
        const pi = await stripe().paymentIntents.confirm(
          id,
          {
            // Not in the SDK's types yet (preview); Stripe clones the
            // traveller's payment method from the token onto this intent.
            payment_method_data: { shared_payment_granted_token: spt } as unknown as Stripe.PaymentIntentConfirmParams.PaymentMethodData,
            return_url: returnUrl,
          },
          { idempotencyKey, timeout: 3_500, maxNetworkRetries: 0 },
        )
        return { intent: pi as unknown as IntentLike }
      } catch (err) {
        if (err instanceof Stripe.errors.StripeCardError) return { error: { kind: 'declined', message: err.message } }
        if (err instanceof Stripe.errors.StripeInvalidRequestError) return { error: { kind: 'invalid', message: err.message } }
        console.error('[agent-pay] confirm failed', err instanceof Error ? err.message : err)
        return { error: { kind: 'unknown', message: 'no answer from the payment processor' } }
      }
    },
  }
}
