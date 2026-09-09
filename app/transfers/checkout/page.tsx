import type { Metadata } from 'next'
import OnePageTransfersCheckout from '@/components/transfers/one-page/OnePageTransfersCheckout'

export const metadata: Metadata = {
  title: 'Airport Transfer Checkout',
  description: 'Confirm and pay for your Jamaica airport transfer.',
  robots: { index: false, follow: false },
}

export default function TransfersCheckoutPage() {
  return <OnePageTransfersCheckout />
}
