'use client'

import { useEffect } from 'react'
import { useCartStore } from '@/lib/cart'

/**
 * Client-only effect that clears the cart on the success variant of
 * /checkout/confirm. The server component cannot touch localStorage, and
 * a confirmed booking should leave the itinerary panel empty.
 */
export default function ConfirmClient() {
  const clearCart = useCartStore((s) => s.clearCart)
  useEffect(() => {
    clearCart()
  }, [clearCart])
  return null
}
