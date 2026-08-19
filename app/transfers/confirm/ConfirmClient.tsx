'use client'

import { useEffect } from 'react'
import { useTransfersCart } from '@/lib/transfers-cart'
import { trackPurchase, type AnalyticsItem } from '@/lib/analytics'

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
