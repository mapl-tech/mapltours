'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /**
   * True when the LOAD failed, as distinct from succeeding with nothing.
   * Without this the page told a guest who had saved eight tours that they
   * had saved none, which is the worst possible reading of an outage.
   */
  failed: boolean
  /** Set when a save or unsave could not be written; cleared on the next try. */
  writeError: string | null
}

const SavedContext = createContext<SavedContextValue>({
  savedIds: [],
  isSaved: () => false,
  toggleSave: () => {},
  isLoggedIn: false,
  loading: false,
  failed: false,
  writeError: null,
})

export function SavedProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const inFlight = useRef(new Set<number>())

  const cacheKey = user ? `saved:${user.id}` : null
  const [writeError, setWriteError] = useState<string | null>(null)
  const { data, loading, error, mutate } = useSwrCache<number[]>(
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
      const priorIndex = savedIds.indexOf(id)
      setWriteError(null)
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
        // Restore the ORIGINAL position. Reinserting at 0 silently reordered
        // the guest's shortlist every time a delete failed.
        mutate((prev) => {
          const list = (prev ?? []).filter((n) => n !== id)
          if (!wasSaved) return list
          const restored = [...list]
          restored.splice(Math.min(priorIndex < 0 ? list.length : priorIndex, list.length), 0, id)
          return restored
        })
        setWriteError(
          wasSaved
            ? 'We could not remove that tour. Check your connection and try again.'
            : 'We could not save that tour. Check your connection and try again.',
        )
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
      failed: !!user && !!error,
      writeError,
    }),
    [savedIds, isSaved, toggleSave, user, loading, error, writeError]
  )

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>
}

export function useSaved() {
  return useContext(SavedContext)
}
