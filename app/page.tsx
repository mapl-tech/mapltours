import type { Metadata } from 'next'
import FeedView from '@/components/FeedView'

export const metadata: Metadata = {
  alternates: { canonical: 'https://mapltours.com' },
}

export default function Home() {
  return <FeedView />
}
