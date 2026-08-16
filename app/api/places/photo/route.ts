import { NextResponse } from 'next/server'

/**
 * Proxy for Google Places photos.
 *
 * Exists so GOOGLE_PLACES_API_KEY never reaches the browser: the client asks
 * for /api/places/photo?name=..., this route calls Google with the key and
 * streams the bytes back.
 *
 * `skipHttpRedirect` makes Google return JSON containing the signed photo
 * URI instead of a 302, so the fetch here is one hop and the final URI (which
 * is short-lived and key-free) is what gets streamed.
 *
 * Attribution is NOT handled here — it travels with the place data and is
 * rendered next to the image. This route only moves pixels.
 */

export const runtime = 'nodejs'

// Photo bytes are immutable for a given resource name, so they cache hard.
// The surrounding place data (rating) revalidates separately.
const CACHE = 'public, max-age=2592000, stale-while-revalidate=604800'

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return NextResponse.json({ error: 'not_configured' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  const w = Math.min(Math.max(Number(searchParams.get('w')) || 900, 100), 1600)

  // Photo resource names look like "places/<id>/photos/<ref>". Anything else
  // is not ours to fetch — this endpoint must not become an open proxy.
  if (!name || !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: 'bad_name' }, { status: 400 })
  }

  try {
    const metaRes = await fetch(
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true&key=${key}`,
      { next: { revalidate: 2_592_000 } },
    )
    if (!metaRes.ok) return NextResponse.json({ error: 'upstream' }, { status: 502 })

    const { photoUri } = await metaRes.json()
    if (!photoUri) return NextResponse.json({ error: 'no_uri' }, { status: 502 })

    const imgRes = await fetch(photoUri, { next: { revalidate: 2_592_000 } })
    if (!imgRes.ok || !imgRes.body) return NextResponse.json({ error: 'fetch_failed' }, { status: 502 })

    return new NextResponse(imgRes.body, {
      status: 200,
      headers: {
        'Content-Type': imgRes.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': CACHE,
      },
    })
  } catch (err) {
    console.warn('[places-photo] failed', err instanceof Error ? err.message : 'unknown')
    return NextResponse.json({ error: 'error' }, { status: 502 })
  }
}
