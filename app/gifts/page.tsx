import type { Metadata } from 'next'
import GiftCardsView from '@/components/GiftCardsView'

export const metadata: Metadata = {
  title: 'Gift Cards',
  description: 'Give the gift of Jamaica. MAPL Tours gift cards for authentic Jamaican cultural experiences.',
}

export default function GiftsPage() {
  return <GiftCardsView />
}
