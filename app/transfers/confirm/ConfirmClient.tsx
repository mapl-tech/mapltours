'use client'

import { useEffect } from 'react'
import { useTransfersCart } from '@/lib/transfers-cart'
import { trackPurchase, type AnalyticsItem } from '@/lib/analytics'
import { firstTime } from '@/lib/once'

/**
 * Clears the transfers cart after a successful confirmation redirect, and
 * reports the sale. Rendered only for status 'succeeded', so reaching this
 * component is itself the proof that money moved.
 */
export default function ConfirmClient({
  bookingRef,
  totalPaid,
  currency,
  items,
}: {
  bookingRef?: string | null
  totalPaid?: number | null
  currency?: string | null
  items?: AnalyticsItem[]
}) {
  const clearCart = useTransfersCart((s) => s.clearCart)

  // Once per booking, not once per visit: a guest who pays, builds a second
  // trip and comes back to this page (Back, or a phone reloading the tab)
  // used to have the new cart emptied by the old confirmation.
  useEffect(() => {
    if (bookingRef && !firstTime(`cart-cleared:${bookingRef}`)) return
    clearCart()
  }, [clearCart, bookingRef])

  useEffect(() => {
    if (!bookingRef || totalPaid == null) return
    trackPurchase({
      transactionId: bookingRef,
      value: totalPaid,
      currency: currency || 'USD',
      items: items ?? [],
    })
  }, [bookingRef, totalPaid, currency, items])

  return null
}
