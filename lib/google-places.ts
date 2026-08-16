import 'server-only'

/**
 * Google Places API (New) — real ratings and real photos for the venues in
 * lib/places.ts.
 *
 * This is the only source that supplies both without contacting each
 * business, and Google's terms permit displaying them provided the
 * attribution comes with them. So attribution is not optional here: every
 * photo carries its authorAttributions through to the UI, and the sections
 * carry the "Powered by Google" line.
 *
 * SERVER ONLY. `server-only` makes an accidental client import a build
 * error, because GOOGLE_PLACES_API_KEY must never reach the browser. Photos
 * are served through /api/places/photo, which proxies the bytes so the key
 * stays here.
 *
 * DEGRADES CLEANLY. With no key configured — or on any API failure — every
 * function returns null and the cards fall back to the licensed placeholder
 * image with no rating chip, exactly as they render today. A missing key
 * must never take the homepage down.
 *
 * CACHING. Google's terms allow caching place ids indefinitely but cap how
 * long other fields may be held at 30 days. The page revalidates monthly,
 * which is both the cheapest cadence and the limit of what is permitted.
 */

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText'

/** Only what the cards actually display, to keep the billed field mask small. */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.rating',
  'places.userRatingCount',
  'places.googleMapsUri',
  'places.photos',
].join(',')

export interface GooglePhoto {
  /** Resource name, passed to /api/places/photo. */
  name: string
  /** Required by Google's terms wherever the photo is shown. */
  attributions: string[]
}

export interface GooglePlaceData {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  rating: number | null
  userRatingCount: number | null
  googleMapsUri: string | null
  photo: GooglePhoto | null
}

export function googlePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function shape(place: any): GooglePlaceData | null {
  if (!place?.id) return null
  const photo = Array.isArray(place.photos) && place.photos.length ? place.photos[0] : null
  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? null,
    formattedAddress: place.formattedAddress ?? null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    googleMapsUri: place.googleMapsUri ?? null,
    photo: photo?.name
      ? {
          name: photo.name,
          attributions: (photo.authorAttributions ?? [])
            .map((a: any) => a?.displayName)
            .filter(Boolean),
        }
      : null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Resolve one venue by name + location text.
 *
 * Text search rather than a stored place id: the seed data is maintained by
 * hand, and a human-readable query ("Scotchies, Montego Bay, Jamaica") is far
 * easier to keep correct than an opaque id. The trade-off is one lookup per
 * venue, which the page's revalidate window amortises.
 */
export async function lookupPlace(
  query: string,
  revalidateSeconds = 2_592_000,
): Promise<GooglePlaceData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return null

  try {
    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        // Bias to Jamaica so a same-named venue elsewhere cannot win.
        locationBias: {
          circle: {
            center: { latitude: 18.1096, longitude: -77.2975 },
            radius: 120_000,
          },
        },
      }),
      next: { revalidate: revalidateSeconds },
    })

    if (!res.ok) {
      console.warn('[google-places] lookup failed', query, res.status)
      return null
    }
    const json = await res.json()
    const first = json?.places?.[0]
    return first ? shape(first) : null
  } catch (err) {
    console.warn('[google-places] lookup threw', query, err instanceof Error ? err.message : 'unknown')
    return null
  }
}

/** Resolve many venues concurrently; failures come back as null. */
export async function lookupPlaces(
  queries: { id: string; query: string }[],
  revalidateSeconds = 2_592_000,
): Promise<Record<string, GooglePlaceData>> {
  if (!googlePlacesConfigured()) return {}
  const results = await Promise.all(
    queries.map(async ({ id, query }) => [id, await lookupPlace(query, revalidateSeconds)] as const),
  )
  const out: Record<string, GooglePlaceData> = {}
  for (const [id, data] of results) if (data) out[id] = data
  return out
}

/** URL the browser requests for a photo; the key stays server-side. */
export function photoProxyUrl(photoName: string, maxWidthPx = 900): string {
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&w=${maxWidthPx}`
}
