import crypto from 'crypto'

/**
 * The identity of a transfer cart: the key of the pending-booking row
 * (unique on (cart_hash, booking_type) while pending, migration 007) and so of
 * its PaymentIntent. Moved out of app/api/transfers/checkout/route.ts byte for
 * byte so the AI-assistant payment tool (lib/agent/agent-pay) can recognise a
 * ride that is already booked before it starts another; the route imports it
 * from here. Changing it re-keys every pending transfer: don't, without
 * migrating them.
 */
export interface TransferCartLine {
  destinationId: string
  tripType: string
  passengers: number
  fromAirport?: boolean
  arrivalAt?: string
  departureAt?: string
}

export function hashTransferCart(items: TransferCartLine[], amountCents: number, email: string, giftCode = '', couponCode = ''): string {
  const payload = JSON.stringify({
    items: items
      .map(
        (i) =>
          // Direction is part of the cart's identity: two one-ways between
          // the same pair differ only by it, and without it they would share
          // an idempotency key and a pending-booking row.
          `${i.destinationId}:${i.tripType}:${i.fromAirport === false ? 'to-mbj' : 'from-mbj'}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: amountCents,
    email: (email ?? '').toLowerCase().trim(),
    // A transfer paid partly by gift card is a different charge from the same
    // transfer paid in full; it must not reuse the other's PaymentIntent.
    gift: giftCode,
    // Same for a coupon: the net cents above already differ, the code makes
    // the identity explicit.
    coupon: couponCode,
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}
