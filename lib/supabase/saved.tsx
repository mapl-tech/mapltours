'use client'

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { createClient } from './client'
import { useAuth } from './auth-context'
import { clearCache, useSwrCache } from '@/lib/swr-cache'

const supabase = createClient()

/**
 * The tours a signed-in guest has saved for later.
 *
 * Backed by `experience_likes`, the table the heart on the detail page has
 * always written to — a save and a like were never two different intents
 * here, and the profile has counted that table under a "Saved" stat since it
 * was built. Reusing it means every heart already tapped shows up in the
 * saved list on day one, instead of stranding that history behind a second,
 * near-identical table.
 *
 * The set is fetched ONCE for the whole app rather than per card. A grid of
 * ExpCards mounts twenty-odd save buttons at a time, and a per-button hook
 * would fire twenty-odd identical queries on every browse page — the same
 * pileup that forced the `enabled` flag onto useExperienceLike.
 */
interface SavedContextValue {
  /** Saved experience ids, most recently saved first. */
  savedIds: number[]
  isSaved: (id: number) => boolean
  /** Signed out, this sends the guest to log in and come back here. */
  toggleSave: (id: number) => void
  isLoggedIn: boolean
  /** True only before the first load lands, and only when signed in. */
  loading: boolean
}

const SavedContext = createContext<SavedContextValue>({
  savedIds: [],
  isSaved: () => false,
  toggleSave: () => {},
  isLoggedIn: false,
  loading: false,
})

export function SavedProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const inFlight = useRef(new Set<number>())

  const cacheKey = user ? `saved:${user.id}` : null
  const { data, loading, mutate } = useSwrCache<number[]>(
    cacheKey,
    async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from('experience_likes')
        .select('experience_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((r) => r.experience_id as number)
    },
    { enabled: !!user }
  )

  const savedIds = useMemo(() => data ?? [], [data])

  const isSaved = useCallback((id: number) => savedIds.includes(id), [savedIds])

  const toggleSave = useCallback(
    async (id: number) => {
      if (!user) {
        // Come back to whatever they were browsing, with the save still to make.
        const back = window.location.pathname + window.location.search
        window.location.href = '/login?redirect=' + encodeURIComponent(back)
        return
      }
      // A double-tap on a slow connection would otherwise fire insert+insert
      // (unique violation) or delete+delete.
      if (inFlight.current.has(id)) return
      inFlight.current.add(id)

      const wasSaved = savedIds.includes(id)
      // Optimistic: the heart fills instantly and survives a page change,
      // because mutate writes through to the cache as well as to state.
      mutate((prev) => {
        const list = prev ?? []
        return wasSaved ? list.filter((n) => n !== id) : [id, ...list]
      })

      try {
        // Supabase resolves to { error } rather than throwing, so a bare
        // await would let a failed write leave the heart stuck filled.
        const { error } = wasSaved
          ? await supabase
              .from('experience_likes')
              .delete()
              .eq('experience_id', id)
              .eq('user_id', user.id)
          : await supabase
              .from('experience_likes')
              .insert({ experience_id: id, user_id: user.id })
        if (error) throw error
        // The detail page reads its own per-experience snapshot; drop it so
        // that heart agrees with this one next time it mounts.
        clearCache(`like:${id}:`)
      } catch {
        mutate((prev) => {
          const list = prev ?? []
          return wasSaved ? [id, ...list.filter((n) => n !== id)] : list.filter((n) => n !== id)
        })
      } finally {
        inFlight.current.delete(id)
      }
    },
    [user, savedIds, mutate]
  )

  const value = useMemo(
    () => ({
      savedIds,
      isSaved,
      toggleSave,
      isLoggedIn: !!user,
      loading: !!user && loading,
    }),
    [savedIds, isSaved, toggleSave, user, loading]
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSaved() {
  return useContext(SavedContext)
}
