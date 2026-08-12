import type { Metadata } from 'next'
import { Suspense } from 'react'
import ExploreView from '@/components/ExploreView'

export const metadata: Metadata = {
  title: 'Explore Jamaica Tours & Experiences | MAPL Tours',
  description:
    'Browse and filter authentic Jamaica tours and experiences by category and parish, cliff diving in Negril, reggae sessions in Kingston, coffee treks in the Blue Mountains, and more.',
  alternates: { canonical: 'https://mapltours.com/explore' },
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreView />
    </Suspense>
  )
}
