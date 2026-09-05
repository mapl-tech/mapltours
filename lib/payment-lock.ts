/**
 * Set while stripe.confirmPayment is in flight on a checkout page.
 *
 * The WebMCP tools can change the cart from any page, including the payment
 * step. A cart write while the PaymentIntent is settling would desync what
 * the traveller is paying for from what the booking row says. Both checkouts
 * flip this from StripePaymentPanel; the tools refuse cart writes while it is
 * set. Module state, not a store: nothing renders from it.
 */
let inFlight = false

export function setPaymentInFlight(busy: boolean): void {
  inFlight = busy
}

export function isPaymentInFlight(): boolean {
  return inFlight
}
