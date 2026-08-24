'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from './client'
import { useAuth } from './auth-context'
import { useSwrCache } from '@/lib/swr-cache'
import { useSaved } from './saved'
import { guestLabel, normalizeSocialHandle } from '@/lib/social-handle'
import type { Comment } from '@/lib/experiences'

const supabase = createClient()

// ── Re-export useAuth as useUser for backward compat ──
export function useUser() {
  return useAuth().user
}

// ── Experience Likes ──
/**
 * The heart on the detail page: whether THIS guest saved the tour, plus how
 * many people have.
 *
 * "Saved" is owned by SavedProvider, not fetched here. Both this heart and
 * the one on every browse card write the same `experience_likes` row, so two
 * independent caches would disagree the moment a guest used one and then the
 * other — save from a card, open the tour, and the heart would show empty.
 * Only the public count is fetched locally, and it is display-only.
 */
interface LikeSnapshot { liked: boolean; count: number }

export function useExperienceLike(experienceId: number, enabled = true) {
  const { user } = useAuth()
  const { isSaved, toggleSave } = useSaved()

  // `enabled` lets feed surfaces defer the fetch until a reel is actually
  // shown; one load of the reel page was firing 22 count queries at once.
  const cacheKey = `like:${experienceId}:${user?.id ?? 'anon'}`
  const { data, mutate } = useSwrCache<LikeSnapshot>(
    cacheKey,
    async () => {
      // Read from the aggregate view, not the table. Saved rows are private
      // (migration 021), so counting them directly would return only this
      // guest's own row — every tour would show a count of 0 or 1.
      const { data } = await supabase
        .from('experience_like_counts')
        .select('like_count')
        .eq('experience_id', experienceId)
        .maybeSingle()
      return { liked: false, count: data?.like_count ?? 0 }
    },
    { enabled }
  )

  const liked = isSaved(experienceId)
  const likeCount = data?.count ?? 0

  const toggleLike = useCallback(() => {
    // Signed-out routing to /login lives in toggleSave, so there is one
    // answer to "what happens when a logged-out guest taps a heart".
    const wasSaved = isSaved(experienceId)
    if (user) {
      // Display-only nudge so the number moves with the heart; the next
      // revalidation reconciles it with the real count either way.
      mutate((prev) => ({
        liked: !wasSaved,
        count: Math.max(0, (prev?.count ?? 0) + (wasSaved ? -1 : 1)),
      }))
    }
    toggleSave(experienceId)
  }, [user, experienceId, isSaved, toggleSave, mutate])

  return { liked, likeCount, toggleLike, isLoggedIn: !!user }
}

// ── Comment Likes ──
export function useCommentLike(commentId: string) {
  const { user } = useAuth()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)

  useEffect(() => {
    async function fetch() {
      const [countRes, likeRes] = await Promise.all([
        supabase
          .from('comment_likes')
          .select('id', { count: 'exact', head: true })
          .eq('comment_id', commentId),
        user
          ? supabase
              .from('comment_likes')
              .select('id')
              .eq('comment_id', commentId)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (countRes.count !== null) setLikeCount(countRes.count)
      if (likeRes.data) setLiked(true)
    }
    fetch()
  }, [commentId, user])

  const toggleLike = useCallback(async () => {
    if (!user) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
      return
    }

    const wasLiked = liked
    // Optimistic flip.
    setLiked(!wasLiked)
    setLikeCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)))
    const { error } = wasLiked
      ? await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id)
      : await supabase
          .from('comment_likes')
          .insert({ comment_id: commentId, user_id: user.id })
    if (error) {
      // Roll back on failure (Supabase returns { error }, never throws).
      setLiked(wasLiked)
      setLikeCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)))
    }
  }, [user, liked, commentId])

  return { liked, likeCount, toggleLike }
}

// ── Comments for an experience ──
export interface SupabaseComment {
  id: string
  experience_id: number
  user_id: string
  text: string
  created_at: string
  parent_id: string | null
  user_name: string | null
  user_avatar: string | null
  /** Normalized social handle (migration 026); null when unset or before the
   *  migration has run in this environment. */
  user_handle: string | null
}

export interface DisplayComment extends Comment {
  supabaseId?: string
  isOwn?: boolean
  parentId?: string | null
  replies?: DisplayComment[]
  replyToUser?: string
  /** Real user profile image URL (null for guests / hardcoded seed comments) */
  avatarUrl?: string | null
  /** True when `user` is a social handle and should render with an @ prefix;
   *  false when it is a first name, which must render bare. */
  isHandle?: boolean
}

const COMMENTS_LIMIT = 20

export function useComments(experienceId: number) {
  const { user } = useAuth()
  const [replyingTo, setReplyingTo] = useState<{ id: string; user: string } | null>(null)

  // Cached per-experience so revisiting a reel paints comments from last load
  // while a fresh fetch resolves in the background.
  const { data, loading, mutate, refresh } = useSwrCache<SupabaseComment[]>(
    `comments:${experienceId}`,
    async () => {
      let { data: rows, error: commentsErr } = await supabase
        .from('comments')
        .select('id, experience_id, user_id, text, created_at, parent_id')
        .eq('experience_id', experienceId)
        .order('created_at', { ascending: true })
        .limit(COMMENTS_LIMIT)

      // Graceful degradation: if the reply-support migration (002, which
      // adds comments.parent_id) hasn't been applied, Postgres returns
      // 42703 "column does not exist". Rather than failing ALL comments,
      // retry without parent_id and treat every comment as top-level.
      if (commentsErr && (commentsErr.code === '42703' || /parent_id/.test(commentsErr.message ?? ''))) {
        const retry = await supabase
          .from('comments')
          .select('id, experience_id, user_id, text, created_at')
          .eq('experience_id', experienceId)
          .order('created_at', { ascending: true })
          .limit(COMMENTS_LIMIT)
        rows = retry.data ? retry.data.map((r) => ({ ...r, parent_id: null })) : null
        commentsErr = retry.error
      }

      if (commentsErr) {
        console.error('[comments] select failed', commentsErr)
        throw commentsErr
      }
      if (!rows || rows.length === 0) return []

      // Look up display info. The users table currently has RLS that only
      // allows reading your own row, so for other users this returns nothing
      //, we degrade gracefully to 'Anonymous' rather than crashing.
      const userIds = Array.from(new Set(rows.map((c) => c.user_id)))
      // social_handle arrived in migration 026; environments where it has not
      // run yet must keep rendering names, so retry with the legacy columns
      // rather than letting the whole lookup fail to Anonymous.
      const fullRes = await supabase
        .from('users')
        .select('id, name, avatar_url, social_handle')
        .in('id', userIds)
      const usersRes = fullRes.error
        ? await supabase.from('users').select('id, name, avatar_url').in('id', userIds)
        : fullRes

      if (usersRes.error) {
        console.warn('[comments] users lookup failed (comments will still render)', usersRes.error)
      }

      type ProfileRow = { id: string; name: string | null; avatar_url: string | null; social_handle?: string | null }
      const userMap = new Map((usersRes.data as ProfileRow[] | null)?.map((u) => [u.id, u]) || [])
      return rows.map((c) => ({
        ...c,
        user_name: userMap.get(c.user_id)?.name || 'Anonymous',
        user_avatar: userMap.get(c.user_id)?.avatar_url || null,
        user_handle: userMap.get(c.user_id)?.social_handle || null,
      }))
    }
  )
  // Memoized so the displayComments memo below keys off a stable reference
  // instead of a fresh [] every render while data is null.
  const comments = useMemo(() => data ?? [], [data])

  const addComment = useCallback(async (text: string, parentId?: string) => {
    if (!user) return null
    if (!text.trim()) return null

    // Ensure the user has a row in public.users (required by the comments.
    // user_id foreign key). Idempotent upsert, safe to call every time.
    // The handle column is from migration 026; if this environment does not
    // have it yet, retry without it so the FK row still gets created and the
    // comment still posts.
    const basePayload = {
      id: user.id,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    }
    const metaHandle = normalizeSocialHandle(user.user_metadata?.social_handle)
    let { error: upsertErr } = await supabase
      .from('users')
      .upsert(metaHandle ? { ...basePayload, social_handle: metaHandle } : basePayload, { onConflict: 'id' })
    if (upsertErr && metaHandle) {
      ;({ error: upsertErr } = await supabase.from('users').upsert(basePayload, { onConflict: 'id' }))
    }
    if (upsertErr) console.warn('[comments.hook] users upsert warning', upsertErr)

    // ── Optimistic insert ─────────────────────────────────────────────
    // Paint the comment immediately so the UI always feels responsive.
    // If the server-side insert fails, we roll it back and log the error.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: SupabaseComment = {
      id: tempId,
      experience_id: experienceId,
      user_id: user.id,
      text: text.trim(),
      created_at: new Date().toISOString(),
      parent_id: parentId && isUuid(parentId) ? parentId : null,
      user_name: user.user_metadata?.full_name || user.user_metadata?.name || 'You',
      user_avatar: user.user_metadata?.avatar_url || null,
      user_handle: metaHandle,
    }
    mutate((prev) => [...(prev ?? []), optimistic])
    setReplyingTo(null)

    // ── Real insert ───────────────────────────────────────────────────
    const insertData: Record<string, unknown> = {
      experience_id: experienceId,
      user_id: user.id,
      text: text.trim(),
    }
    if (parentId && isUuid(parentId)) insertData.parent_id = parentId

    const tryInsert = () =>
      supabase
        .from('comments')
        .insert(insertData)
        .select('id, experience_id, user_id, text, created_at, parent_id')
        .single()

    let { data, error } = await tryInsert()

    // Self-heal the most common failure: FK violation because the user's
    // public.users row doesn't exist yet. Force-create it and retry once.
    if (error && /foreign key|user_id/i.test(error.message ?? '')) {
      console.warn('[comments.hook] FK hit, force-creating users row and retrying')
      await supabase.from('users').insert({
        id: user.id,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        avatar_url: user.user_metadata?.avatar_url ?? null,
      })
      const retry = await tryInsert()
      data = retry.data
      error = retry.error
    }

    if (error || !data) {
      // Roll the optimistic row back so a failed insert doesn't masquerade
      // as a posted comment (it would otherwise vanish on reload with no
      // explanation). The caller keeps the user's text so they can retry.
      console.error('[comments.hook] insert failed, rolling back optimistic row', error)
      mutate((prev) => (prev ?? []).filter((c) => c.id !== tempId))
      return null
    }

    // ── Reconcile ─────────────────────────────────────────────────────
    // Replace the optimistic row with the real one (same content, real id).
    const newComment: SupabaseComment = {
      ...data,
      user_name: optimistic.user_name,
      user_avatar: optimistic.user_avatar,
      user_handle: optimistic.user_handle,
    }
    mutate((prev) => (prev ?? []).map((c) => (c.id === tempId ? newComment : c)))
    // Also re-fetch so anything server-derived (e.g. user name via join) lands.
    refresh().catch(() => {})
    return newComment
  }, [user, experienceId, mutate, refresh])

  const deleteComment = useCallback(async (commentId: string) => {
    if (!user) return
    await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id)
    mutate((prev) => (prev ?? []).filter((c) => c.id !== commentId && c.parent_id !== commentId))
  }, [user, mutate])

  const displayComments = useMemo(() => {
    const allDisplay: DisplayComment[] = comments.map((c) => {
      // Byline precedence: social handle (rendered @handle), else first name
      // (rendered bare), else Anonymous.
      const label = guestLabel(c.user_handle, c.user_name, 'Anonymous')
      return {
        id: parseInt(c.id.replace(/-/g, '').slice(0, 8), 16) || Date.now(),
        supabaseId: c.id,
        parentId: c.parent_id,
        user: label.text,
        isHandle: label.isHandle,
        avatar: c.user_avatar ? '👤' : '🧑🏽', // legacy fallback for places still using emoji
        avatarUrl: c.user_avatar || null,
        text: c.text,
        time: getRelativeTime(c.created_at),
        likes: 0,
        isOwn: c.user_id === user?.id,
        replies: [],
      }
    })

    const topLevel: DisplayComment[] = []
    const replyMap = new Map<string, DisplayComment[]>()

    for (const c of allDisplay) {
      if (c.parentId) {
        const existing = replyMap.get(c.parentId) || []
        existing.push(c)
        replyMap.set(c.parentId, existing)
      } else {
        topLevel.push(c)
      }
    }

    for (const c of topLevel) {
      if (c.supabaseId) {
        c.replies = replyMap.get(c.supabaseId) || []
      }
    }

    return topLevel
  }, [comments, user])

  function toDisplayComments(hardcodedComments: Comment[]): DisplayComment[] {
    const hardcoded: DisplayComment[] = hardcodedComments.map((c) => ({
      ...c,
      // Seed comments are authored as handle-style strings; keep their @.
      isHandle: true,
      replies: [],
    }))
    return [...displayComments, ...hardcoded]
  }

  return {
    comments, loading, addComment, deleteComment,
    toDisplayComments, isLoggedIn: !!user, user,
    replyingTo, setReplyingTo,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v: string): boolean { return UUID_RE.test(v) }

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffWeeks < 4) return `${diffWeeks}w ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
