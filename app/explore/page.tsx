import { Suspense } from 'react'
import ExploreView from '@/components/ExploreView'

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreView />
    </Suspense>
  )
}
