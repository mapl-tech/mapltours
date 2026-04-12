import type { Metadata } from 'next'
import HelpCenter from '@/components/HelpCenter'

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Get help with your MAPL Tours Jamaica booking. FAQs, cancellations, refunds, and 24/7 support.',
}

export default function HelpPage() {
  return <HelpCenter />
}
