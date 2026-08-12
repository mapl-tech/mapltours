/**
 * In-process per-IP rate limiter.
 *
 * Single-instance is fine for what we need this to defend against, bot
 * scraping, brute spam, accidental fetch-loops in client code, not a
 * coordinated DDOS (that's CDN/edge territory). Netlify Functions recycle
 * warm containers often enough that the in-memory counter naturally
 * resets, which is exactly the leak-towards-permissive behaviour we want
 * if we're ever wrong about a legitimate user.
 *
 * Usage:
 *   if (rateLimit(getIp(req), { windowMs: 60_000, max: 5, bucket: 'checkout' }))
 *     return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

interface Bucket {
  windowMs: number
  max: number
  bucket: string
}

const hits = new Map<string, number[]>()

/** Returns true if the caller has exceeded the bucket's quota. */
export function rateLimit(ip: string, opts: Bucket): boolean {
  const now = Date.now()
  const cutoff = now - opts.windowMs
  const key = `${opts.bucket}:${ip}`
  const arr = (hits.get(key) ?? []).filter((t) => t > cutoff)
  if (arr.length >= opts.max) {
    hits.set(key, arr)
    return true
  }
  arr.push(now)
  hits.set(key, arr)
  return false
}

/** Extract the caller IP from common proxy headers, falling back to "unknown". */
export function getIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}
