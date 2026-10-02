/**
 * hashTransferCart moved out of app/api/transfers/checkout/route.ts. It keys
 * every pending transfer row, so it must hash exactly as the original did.
 * The original is kept here, verbatim, as the reference.
 */
import crypto from 'crypto'
import { describe, expect, test } from 'vitest'
import { hashTransferCart } from '@/lib/transfer-cart-hash'

interface TransferItemIn { destinationId: string; tripType: string; passengers: number; fromAirport?: boolean; arrivalAt?: string; arrivalFlight?: string; departureAt?: string; departureFlight?: string }
function originalHashCart(items: TransferItemIn[], amountCents: number, email: string, giftCode = '', couponCode = ''): string {
  const payload = JSON.stringify({
    items: items
      .map(
        (i) =>
          `${i.destinationId}:${i.tripType}:${i.fromAirport === false ? 'to-mbj' : 'from-mbj'}:${i.passengers}:${i.arrivalAt ?? ''}:${i.departureAt ?? ''}`,
      )
      .sort(),
    cents: amountCents,
    email: (email ?? '').toLowerCase().trim(),
    gift: giftCode,
    coupon: couponCode,
  })
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}

let seed = 20261001
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]

describe('hashTransferCart is the route\'s original hash', () => {
  test('5,000 random carts hash identically', () => {
    for (let n = 0; n < 5000; n++) {
      const items: TransferItemIn[] = Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => ({
        destinationId: pick(['riu-negril', 'sandals-negril', 'deja-resort', 'moon-palace-jamaica']),
        tripType: pick(['round_trip', 'one_way']),
        passengers: 1 + Math.floor(rnd() * 7),
        ...(rnd() < 0.7 ? { fromAirport: rnd() < 0.5 } : {}),
        ...(rnd() < 0.8 ? { arrivalAt: `2027-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}T1${Math.floor(rnd() * 9)}:30` } : {}),
        ...(rnd() < 0.5 ? { departureAt: '2027-12-12T12:35', departureFlight: 'AA1' } : {}),
      }))
      const cents = 2200 + Math.floor(rnd() * 30000)
      const email = pick(['A@B.co', ' a@b.co ', 'x@example.com', ''])
      const gift = pick(['', 'GIFT-1'])
      const coupon = pick(['', 'JAMAICA5'])
      expect(hashTransferCart(items, cents, email, gift, coupon)).toBe(originalHashCart(items, cents, email, gift, coupon))
    }
  })
})
