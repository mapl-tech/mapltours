import type { Metadata } from 'next'
import FeedView from '@/components/FeedView'
import type { LivePlaces } from '@/components/PlacesSection'
import { photoProxyUrl } from '@/lib/google-places-shared'
import synced from '@/lib/places-google.json'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://mapltours.com',
  },
  openGraph: {
    url: 'https://mapltours.com',
  },
}

interface SyncedPlace {
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  photoName: string | null
  photoAttributions: string[]
}

/**
 * Google data is read from lib/places-google.json, refreshed by
 * `npm run sync:places`. Nothing is fetched while rendering, so a build costs
 * zero API calls and can never exhaust the project's daily quota — which is
 * exactly what happened when this ran per-render (44 calls a render against a
 * 100/day cap on a new project).
 *
 * Re-run the sync monthly: Google permits holding this data for 30 days.
 */
export default function Home() {
  const places = (synced.places ?? {}) as Record<string, SyncedPlace>

  const livePlaces: LivePlaces = {}
  for (const [id, d] of Object.entries(places)) {
    livePlaces[id] = {
      rating: d.rating ?? null,
      userRatingCount: d.userRatingCount ?? null,
      photoUrl: d.photoName ? photoProxyUrl(d.photoName) : null,
      photoAttributions: d.photoAttributions ?? [],
      googleMapsUri: d.googleMapsUri ?? null,
    }
  }

  return <FeedView livePlaces={livePlaces} />
}
