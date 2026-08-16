import type { Metadata } from 'next'
import { Suspense } from 'react'
import ExploreView from '@/components/ExploreView'

export const metadata: Metadata = {
  title: 'Explore Jamaica Tours & Experiences',
  description:
    'Browse Jamaica tours by category and parish: Dunn\'s River, Blue Hole, bamboo rafting, ATV safaris, Rick\'s Cafe. Private transport included, book online.',
  alternates: { canonical: 'https://mapltours.com/explore' },
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreView />
    </Suspense>
  )
}
