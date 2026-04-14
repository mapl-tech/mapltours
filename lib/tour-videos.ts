'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from './supabase/client'
import { useAuth } from './supabase/auth-context'
import { useSwrCache } from './swr-cache'

/**
 * ============================================================================
 *  MAPL — User Tour Videos + Rewards (client library)
 * ============================================================================
 *  • `validateVideoFile`  — client-side guardrails before touching the network
 *  • `uploadTourVideo`    — hash → storage upload → DB row insert (pending)
 *  • `useExperienceVideos(expId)`  — public approved-only gallery feed
 *  • `useMyVideoProgress()`        — my approved count + active rewards
 *  • `useAvailableReward()`        — the reward to auto-apply at checkout
 *  • `consumeReward(id, bookingId)`— marks a reward as used on a booking
 *
 *  Everything here is client-only. The actual approval + reward grant happen
 *  server-side via RLS + the SQL trigger in migration 003.
 */

// ── Upload constraints (mirrored in the UI copy and enforced client-side) ──
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024 // 100 MB
export const VIDEO_MAX_DURATION_SEC = 60         // keep clips short-form
export const VIDEO_ALLOWED_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov (iPhone)
  'video/webm',
] as const
export const VIDEO_REWARD_MILESTONE = 5

// ── Data shapes ─────────────────────────────────────────────────────────────
export type VideoStatus = 'pending' | 'approved' | 'rejected' | 'flagged'

export interface TourVideoRow {
  id: string
  user_id: string
  experience_id: number
  video_path: string
  thumbnail_path: string | null
  duration_seconds: number | null
  size_bytes: number | null
  content_hash: string | null
  caption: string | null
  status: VideoStatus
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface TourVideo extends TourVideoRow {
  /** Public streaming URL resolved from the storage bucket */
  video_url: string
  thumbnail_url: string | null
  uploader_name: string | null
  uploader_avatar_url: string | null
}

export interface UserRewardRow {
  id: string
  user_id: string
  kind: string
  percent: number
  milestone: number
  code: string
  status: 'available' | 'used' | 'expired'
  used_on_booking_id: string | null
  used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface VideoProgress {
  approved: number
  pending: number
  rejected: number
  /** videos toward the *next* milestone (0..5) */
  towardNext: number
  /** available discount rewards, newest first */
  availableRewards: UserRewardRow[]
  /** all rewards including used ones (for history) */
  allRewards: UserRewardRow[]
}

// ── Client handle (memoised by Supabase SDK) ────────────────────────────────
const supabase = createClient()

// ────────────────────────────────────────────────────────────────────────────
//  Validation
// ────────────────────────────────────────────────────────────────────────────
export interface ValidationResult {
  ok: boolean
  error?: string
}

export function validateVideoFile(file: File): ValidationResult {
  if (!file) return { ok: false, error: 'No file selected' }
  if (!VIDEO_ALLOWED_TYPES.includes(file.type as typeof VIDEO_ALLOWED_TYPES[number])) {
    return { ok: false, error: 'Only MP4, MOV, or WebM videos are supported' }
  }
  if (file.size > VIDEO_MAX_BYTES) {
    const mb = Math.round(file.size / (1024 * 1024))
    return { ok: false, error: `File is ${mb} MB — maximum is 100 MB` }
  }
  if (file.size < 50_000) {
    return { ok: false, error: 'Video is too short or empty' }
  }
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────────────
//  Upload
// ────────────────────────────────────────────────────────────────────────────
export interface UploadResult {
  ok: boolean
  videoId?: string
  error?: string
}

/**
 * Hashes the file, uploads it to the `tour-videos` bucket scoped to the
 * user's uid, then inserts a row with status='pending'. Duplicate uploads
 * (same user + same hash) are rejected by the unique index.
 */
export async function uploadTourVideo({
  experienceId,
  file,
  caption,
  durationSeconds,
}: {
  experienceId: number
  file: File
  caption?: string
  durationSeconds?: number
}): Promise<UploadResult> {
  const validation = validateVideoFile(file)
  if (!validation.ok) return { ok: false, error: validation.error }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in to upload' }

  // Hash: blocks identical re-uploads at the DB layer.
  let hash: string | null = null
  try {
    hash = await sha256Hex(file)
  } catch {
    // Some older browsers may not expose SubtleCrypto — still allow upload,
    // but duplicate detection will just be relaxed.
  }

  if (hash) {
    const { data: existing } = await supabase
      .from('user_tour_videos')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('content_hash', hash)
      .maybeSingle()
    if (existing) {
      return { ok: false, error: 'You’ve already submitted this video' }
    }
  }

  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const path = `${user.id}/${experienceId}-${Date.now()}.${ext}`

  const { error: uploadErr } = await supabase
    .storage
    .from('tour-videos')
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })
  if (uploadErr) return { ok: false, error: uploadErr.message || 'Upload failed' }

  const { data: inserted, error: insertErr } = await supabase
    .from('user_tour_videos')
    .insert({
      user_id: user.id,
      experience_id: experienceId,
      video_path: path,
      size_bytes: file.size,
      duration_seconds: durationSeconds ?? null,
      content_hash: hash,
      caption: caption?.trim() || null,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertErr) {
    // Roll back the object if the DB insert failed so we don't leak storage.
    await supabase.storage.from('tour-videos').remove([path]).catch(() => {})
    return { ok: false, error: insertErr.message || 'Could not save video' }
  }

  return { ok: true, videoId: inserted?.id }
}

/**
 * Resolve a storage path into a public streaming URL.
 */
export function videoPublicUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('tour-videos').getPublicUrl(path).data.publicUrl
}

// ────────────────────────────────────────────────────────────────────────────
//  Read hooks
// ────────────────────────────────────────────────────────────────────────────

/**
 * Approved videos for a given experience — public, swipe-through feed.
 * Cached by experience id so revisiting a tour paints instantly.
 */
export function useExperienceVideos(experienceId: number | null) {
  const { data, loading, refresh } = useSwrCache<TourVideo[]>(
    experienceId == null ? null : `tour-videos:${experienceId}`,
    async () => {
      if (experienceId == null) return []
      const { data: rows } = await supabase
        .from('user_tour_videos')
        .select('id, user_id, experience_id, video_path, thumbnail_path, duration_seconds, size_bytes, content_hash, caption, status, admin_notes, reviewed_by, reviewed_at, created_at')
        .eq('experience_id', experienceId)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(40)

      if (!rows || rows.length === 0) return []

      // Pull uploader display info so the gallery can render @handle
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
      const { data: users } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', userIds)
      const userMap = new Map(users?.map((u) => [u.id, u]) || [])

      return rows.map((r): TourVideo => ({
        ...(r as TourVideoRow),
        video_url: videoPublicUrl(r.video_path) ?? '',
        thumbnail_url: videoPublicUrl(r.thumbnail_path),
        uploader_name: userMap.get(r.user_id)?.name ?? null,
        uploader_avatar_url: userMap.get(r.user_id)?.avatar_url ?? null,
      }))
    }
  )

  return { videos: data ?? [], loading, refresh }
}

/**
 * The current user's own upload + reward progress (dashboard data).
 */
export function useMyVideoProgress(): VideoProgress & { loading: boolean; refresh: () => Promise<void> } {
  const { user } = useAuth()
  const { data, loading, refresh } = useSwrCache<VideoProgress>(
    user ? `video-progress:${user.id}` : null,
    async () => {
      if (!user) return emptyProgress()

      const [videoRes, rewardsRes] = await Promise.all([
        supabase
          .from('user_tour_videos')
          .select('status')
          .eq('user_id', user.id),
        supabase
          .from('user_rewards')
          .select('id, user_id, kind, percent, milestone, code, status, used_on_booking_id, used_at, expires_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ])

      const statusCounts = (videoRes.data ?? []).reduce(
        (acc, r) => {
          acc[r.status as VideoStatus] = (acc[r.status as VideoStatus] ?? 0) + 1
          return acc
        },
        { pending: 0, approved: 0, rejected: 0, flagged: 0 } as Record<VideoStatus, number>
      )

      const allRewards = (rewardsRes.data ?? []) as UserRewardRow[]
      const availableRewards = allRewards.filter((r) => r.status === 'available')

      return {
        approved: statusCounts.approved,
        pending: statusCounts.pending,
        rejected: statusCounts.rejected,
        towardNext: statusCounts.approved % VIDEO_REWARD_MILESTONE,
        availableRewards,
        allRewards,
      }
    }
  )

  return {
    ...(data ?? emptyProgress()),
    loading,
    refresh,
  }
}

/**
 * The newest unused reward, if any. Used to auto-suggest the discount at
 * checkout. Does not mutate state — apply via `consumeReward`.
 */
export function useAvailableReward(): UserRewardRow | null {
  const { availableRewards } = useMyVideoProgress()
  return availableRewards[0] ?? null
}

/**
 * Mark a reward as used on a specific booking (or standalone if the booking
 * row hasn't been created yet — the client-side checkout flow in this repo
 * doesn't currently persist bookings server-side). Idempotent.
 */
export async function consumeReward(rewardId: string, bookingId?: string | null): Promise<boolean> {
  const { error } = await supabase
    .from('user_rewards')
    .update({
      status: 'used',
      used_on_booking_id: bookingId ?? null,
      used_at: new Date().toISOString(),
    })
    .eq('id', rewardId)
    .eq('status', 'available')
  return !error
}

// ────────────────────────────────────────────────────────────────────────────
//  Admin helpers (used by /admin/videos)
// ────────────────────────────────────────────────────────────────────────────

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user } = useAuth()
  const [state, setState] = useState({ isAdmin: false, loading: true })
  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!user) { if (!cancelled) setState({ isAdmin: false, loading: false }); return }
      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cancelled) setState({ isAdmin: !!data, loading: false })
    }
    check()
    return () => { cancelled = true }
  }, [user])
  return state
}

export interface AdminVideo extends TourVideo {
  uploader_email: string | null
}

export function useAdminVideoQueue(filter: VideoStatus | 'all' = 'pending') {
  const { isAdmin } = useIsAdmin()
  const [rows, setRows] = useState<AdminVideo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!isAdmin) { setRows([]); setLoading(false); return }
    setLoading(true)
    let q = supabase
      .from('user_tour_videos')
      .select('id, user_id, experience_id, video_path, thumbnail_path, duration_seconds, size_bytes, content_hash, caption, status, admin_notes, reviewed_by, reviewed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(80)
    if (filter !== 'all') q = q.eq('status', filter)

    const { data: vids } = await q
    if (!vids) { setRows([]); setLoading(false); return }

    const userIds = Array.from(new Set(vids.map((r) => r.user_id)))
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_url')
      .in('id', userIds)
    const userMap = new Map(users?.map((u) => [u.id, u]) || [])

    setRows(vids.map((r): AdminVideo => ({
      ...(r as TourVideoRow),
      video_url: videoPublicUrl(r.video_path) ?? '',
      thumbnail_url: videoPublicUrl(r.thumbnail_path),
      uploader_name: userMap.get(r.user_id)?.name ?? null,
      uploader_avatar_url: userMap.get(r.user_id)?.avatar_url ?? null,
      uploader_email: null, // email is on auth.users; not exposed via RLS here
    })))
    setLoading(false)
  }, [isAdmin, filter])

  useEffect(() => { load() }, [load])

  return { videos: rows, loading, refresh: load }
}

export async function moderateVideo(id: string, next: VideoStatus, notes?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('user_tour_videos')
    .update({
      status: next,
      admin_notes: notes ?? null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
  return !error
}

// ────────────────────────────────────────────────────────────────────────────
//  Utilities
// ────────────────────────────────────────────────────────────────────────────

function emptyProgress(): VideoProgress {
  return {
    approved: 0,
    pending: 0,
    rejected: 0,
    towardNext: 0,
    availableRewards: [],
    allRewards: [],
  }
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Read video duration client-side so we can store it with the row and reject
 * clips that are absurdly long before uploading.
 */
export async function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.src = url
    v.onloadedmetadata = () => {
      const seconds = Math.round(v.duration || 0)
      URL.revokeObjectURL(url)
      resolve(isFinite(seconds) && seconds > 0 ? seconds : null)
    }
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
  })
}
