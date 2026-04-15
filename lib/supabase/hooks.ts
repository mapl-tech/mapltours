'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from './client'
import { useAuth } from './auth-context'
import { useSwrCache } from '@/lib/swr-cache'
import type { Comment } from '@/lib/experiences'

const supabase = createClient()

// ── Re-export useAuth as useUser for backward compat ──
export function useUser() {
  return useAuth().user
}

// ── Experience Likes ──
interface LikeSnapshot { liked: boolean; count: number }

export function useExperienceLike(experienceId: number) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)

  // Cache key includes user id so logging in/out doesn't show a stale "liked"
  // state. For anonymous visitors we still cache the public count.
  const cacheKey = `like:${experienceId}:${user?.id ?? 'anon'}`
  const { data, mutate } = useSwrCache<LikeSnapshot>(
    cacheKey,
    async () => {
      const [countRes, likeRes] = await Promise.all([
        supabase
          .from('experience_likes')
          .select('id', { count: 'exact', head: true })
          .eq('experience_id', experienceId),
        user
          ? supabase
              .from('experience_likes')
              .select('id')
              .eq('experience_id', experienceId)
              .eq('user_id', user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      return {
        liked: !!likeRes.data,
        count: countRes.count ?? 0,
      }
    }
  )

  const liked = data?.liked ?? false
  const likeCount = data?.count ?? 0

  const toggleLike = useCallback(async () => {
    if (loading) return
    if (!user) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)
      return
    }

    setLoading(true)
    const wasLiked = liked

    // Optimistic update — paints instantly and persists to cache
    mutate((prev) => ({
      liked: !wasLiked,
      count: Math.max(0, (prev?.count ?? 0) + (wasLiked ? -1 : 1)),
    }))

    try {
      if (wasLiked) {
        await supabase
          .from('experience_likes')
          .delete()
          .eq('experience_id', experienceId)
          .eq('user_id', user.id)
      } else {
        await supabase
          .from('experience_likes')
          .insert({ experience_id: experienceId, user_id: user.id })
      }
    } catch {
      // Roll back on failure
      mutate((prev) => ({
        liked: wasLiked,
        count: Math.max(0, (prev?.count ?? 0) + (wasLiked ? 1 : -1)),
      }))
    }

    setLoading(false)
  }, [user, liked, experienceId, loading, mutate])

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

    if (liked) {
      setLiked(false)
      setLikeCount((c) => Math.max(0, c - 1))
      await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', user.id)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await supabase
        .from('comment_likes')
        .insert({ comment_id: commentId, user_id: user.id })
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
}

export interface DisplayComment extends Comment {
  supabaseId?: string
  isOwn?: boolean
  parentId?: string | null
  replies?: DisplayComment[]
  replyToUser?: string
  /** Real user profile image URL (null for guests / hardcoded seed comments) */
  avatarUrl?: string | null
}

const COMMENTS_LIMIT = 20

export function useComments(experienceId: number) {
  const { user } = useAuth()
  const [replyingTo, setReplyingTo] = useState<{ id: string; user: string } | null>(null)

  // Cached per-experience so revisiting a reel paints comments from last load
  // while a fresh fetch resolves in the background.
  const { data, loading, mutate } = useSwrCache<SupabaseComment[]>(
    `comments:${experienceId}`,
    async () => {
      const { data } = await supabase
        .from('comments')
        .select('id, experience_id, user_id, text, created_at, parent_id')
        .eq('experience_id', experienceId)
        .order('created_at', { ascending: true })
        .limit(COMMENTS_LIMIT)

      if (!data || data.length === 0) return []

      const userIds = Array.from(new Set(data.map((c) => c.user_id)))
      const { data: users } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds)

      const userMap = new Map(users?.map((u) => [u.id, u]) || [])
      return data.map((c) => ({
        ...c,
        user_name: userMap.get(c.user_id)?.name || 'Anonymous',
        user_avatar: userMap.get(c.user_id)?.avatar_url || null,
      }))
    }
  )
  const comments = data ?? []

  const addComment = useCallback(async (text: string, parentId?: string) => {
    if (!user || !text.trim()) return null

    const insertData: Record<string, unknown> = {
      experience_id: experienceId,
      user_id: user.id,
      text: text.trim(),
    }
    if (parentId) insertData.parent_id = parentId

    const { data, error } = await supabase
      .from('comments')
      .insert(insertData)
      .select('id, experience_id, user_id, text, created_at, parent_id')
      .single()

    if (data && !error) {
      const newComment: SupabaseComment = {
        ...data,
        user_name: user.user_metadata?.full_name || user.user_metadata?.name || 'You',
        user_avatar: user.user_metadata?.avatar_url || null,
      }
      mutate((prev) => [...(prev ?? []), newComment])
      setReplyingTo(null)
      return newComment
    }

    return null
  }, [user, experienceId, mutate])

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
    const allDisplay: DisplayComment[] = comments.map((c) => ({
      id: parseInt(c.id.replace(/-/g, '').slice(0, 8), 16) || Date.now(),
      supabaseId: c.id,
      parentId: c.parent_id,
      user: c.user_name || 'Anonymous',
      avatar: c.user_avatar ? '👤' : '🧑🏽', // legacy fallback for places still using emoji
      avatarUrl: c.user_avatar || null,
      text: c.text,
      time: getRelativeTime(c.created_at),
      likes: 0,
      isOwn: c.user_id === user?.id,
      replies: [],
    }))

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
