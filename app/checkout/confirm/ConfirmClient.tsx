'use client'

import { useEffect } from 'react'
import { useCartStore } from '@/lib/cart'
import { trackPurchase, type AnalyticsItem } from '@/lib/analytics'

/**
 * Client-only work on the success variant of /checkout/confirm: clear the
 * cart, and report the sale.
 *
 * The server component can do neither. It cannot touch localStorage to empty
 * the itinerary, and it cannot call gtag, which only exists in the browser.
 * Both belong here, and both run only when the payment actually succeeded,
 * because the parent renders this component only for status 'succeeded'.
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
  const clearCart = useCartStore((s) => s.clearCart)

  useEffect(() => {
    clearCart()
  }, [clearCart])

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
