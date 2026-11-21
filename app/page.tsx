import type { Metadata } from 'next'
import FeedView from '@/components/FeedView'
import { cheapestFare } from '@/lib/airport-transfers'

export const metadata: Metadata = {
  alternates: { canonical: 'https://mapltours.com' },
}

export default function Home() {
  // Read on the server from the rate card, so the reel's bundle never carries
  // the hotel list just to print one number.
  return <FeedView rideFrom={cheapestFare('one_way')} />
}
