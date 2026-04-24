'use client'

import { useEffect } from 'react'
import { useTransfersCart } from '@/lib/transfers-cart'

/** Clears the transfers cart after a successful confirmation redirect. */
export default function ConfirmClient() {
  const clearCart = useTransfersCart((s) => s.clearCart)
  useEffect(() => {
    clearCart()
  }, [clearCart])
  return null
}
