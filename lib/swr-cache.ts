'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Stale-while-revalidate cache backed by localStorage.
 *
 * Pattern: read from cache synchronously on mount (instant paint) → kick off
 * a background fetch → write the fresh value back to cache and state. Callers
 * see cached data immediately on repeat visits and the network update lands
 * silently a moment later.
 *
 * Cache entries are versioned + expiry-stamped. Anything older than `maxAge`
 * is still shown (the whole point is "stale-while-revalidate") but a
 * background fetch is guaranteed to run.
 */

const CACHE_PREFIX = 'mapl:cache:v1:'
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000 // 5 min soft TTL

interface CacheEntry<T> {
  data: T
  ts: number
}

function readCache<T>(key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as CacheEntry<T>
  } catch {
    return null
  }
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry<T> = { data, ts: Date.now() }
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Quota exceeded or storage disabled — degrade silently
  }
}

export function clearCache(keyPrefix?: string): void {
  if (typeof window === 'undefined') return
  try {
    const prefix = CACHE_PREFIX + (keyPrefix ?? '')
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) window.localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

interface UseSwrCacheOptions {
  /** Skip running the fetcher (e.g. awaiting auth). Cached data still shows. */
  enabled?: boolean
  /** How long until entries are considered "stale enough" to always revalidate. */
  maxAge?: number
}

export interface SwrCacheResult<T> {
  data: T | null
  /** True only on the *first ever* load with no cache available. */
  loading: boolean
  /** True whenever a background revalidation is in flight. */
  revalidating: boolean
  error: unknown
  /** Force a revalidation bypassing the TTL check. */
  refresh: () => Promise<void>
  /** Optimistically update the cached value (and persist it). */
  mutate: (updater: T | ((prev: T | null) => T)) => void
}

export function useSwrCache<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseSwrCacheOptions = {}
): SwrCacheResult<T> {
  const { enabled = true, maxAge = DEFAULT_MAX_AGE_MS } = options

  // Read cache synchronously during render so the first paint has data.
  const [data, setData] = useState<T | null>(() => (key ? readCache<T>(key)?.data ?? null : null))
  const [loading, setLoading] = useState<boolean>(() => {
    if (!key || !enabled) return false
    return readCache<T>(key) === null
  })
  const [revalidating, setRevalidating] = useState(false)
  const [error, setError] = useState<unknown>(null)

  // Keep the latest fetcher in a ref so the revalidation effect doesn't
  // re-run every render when consumers pass an inline closure.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const revalidate = useCallback(async () => {
    if (!key) return
    setRevalidating(true)
    try {
      const fresh = await fetcherRef.current()
      writeCache(key, fresh)
      setData(fresh)
      setError(null)
    } catch (err) {
      setError(err)
    } finally {
      setRevalidating(false)
      setLoading(false)
    }
  }, [key])

  useEffect(() => {
    if (!key || !enabled) return
    const cached = readCache<T>(key)
    setData(cached?.data ?? null)
    // If cache is empty or older than maxAge, revalidate. Otherwise still
    // revalidate in the background — that's the whole SWR contract.
    const _needsRefresh = !cached || Date.now() - cached.ts > maxAge
    void _needsRefresh // kept for readability; we always revalidate below
    setLoading(cached === null)
    revalidate()
  }, [key, enabled, maxAge, revalidate])

  const mutate = useCallback(
    (updater: T | ((prev: T | null) => T)) => {
      setData((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (p: T | null) => T)(prev)
          : updater
        if (key) writeCache(key, next)
        return next
      })
    },
    [key]
  )

  return { data, loading, revalidating, error, refresh: revalidate, mutate }
}
