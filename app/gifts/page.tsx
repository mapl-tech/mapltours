import type { Metadata } from 'next'
import GiftCardsView from '@/components/GiftCardsView'

export const metadata: Metadata = {
  title: 'Gift Cards',
  description: 'Give the gift of Jamaica. MAPL Tours Jamaica gift cards: good for any private tour, day package or airport transfer on the site.',
  alternates: {
    canonical: 'https://mapltours.com/gifts',
  },
}

export default function GiftsPage() {
  return <GiftCardsView />
}
