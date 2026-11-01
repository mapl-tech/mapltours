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

const hits = new Map<string, { times: number[]; windowMs: number }>()

/**
 * Drop keys whose entries have all expired.
 *
 * Without this the map grows for every distinct key it ever sees, and the key
 * includes a client-supplied IP — so anyone rotating X-Forwarded-For can grow
 * it without bound. Swept on write, amortised, so there is no timer to leak.
 * Each key expires by its own bucket's window, so a short bucket's sweep
 * never empties a longer one early.
 */
let lastSweep = 0
const SWEEP_INTERVAL_MS = 60_000

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  const dead: string[] = []
  hits.forEach(({ times, windowMs }, key) => {
    if (!times.length || times[times.length - 1] <= now - Math.max(windowMs, SWEEP_INTERVAL_MS)) dead.push(key)
  })
  for (const key of dead) hits.delete(key)
}

/** Returns true if the caller has exceeded the bucket's quota. */
export function rateLimit(ip: string, opts: Bucket): boolean {
  const now = Date.now()
  sweep(now)
  const cutoff = now - opts.windowMs
  const key = `${opts.bucket}:${ip}`
  const times = (hits.get(key)?.times ?? []).filter((t) => t > cutoff)
  if (times.length >= opts.max) {
    hits.set(key, { times, windowMs: opts.windowMs })
    return true
  }
  times.push(now)
  hits.set(key, { times, windowMs: opts.windowMs })
  return false
}

/**
 * The caller's IP.
 *
 * Order matters. `x-nf-client-connection-ip` is set by Netlify's edge and
 * cannot be forged by the client, so it is preferred; `x-forwarded-for` is
 * merely the first entry of a header the client can write itself, which makes
 * it a hint rather than an identity. Anything guarding stored value — gift
 * codes especially — should assume the fallback is spoofable and not rely on
 * the limiter as its only defence.
 */
export function getIp(req: Request): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
