import type { Stripe } from '@stripe/stripe-js'

/**
 * Lazily load the Stripe JS SDK. Calling `getStripe()` at module import
 * time would eagerly pull ~80 KB gz into the bundle on any page that
 * transitively imports checkout code. Deferring behind a function lets
 * callers (e.g. the dynamic-imported StripePaymentPanel) trigger the
 * load only when they actually need it.
 */
let _stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!_stripePromise) {
    _stripePromise = import('@stripe/stripe-js').then((m) =>
      m.loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
    )
  }
  return _stripePromise
}
