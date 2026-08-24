import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { driveConfigured, uploadClipToDrive, deleteDriveFile } from '@/lib/google-drive'
import { experiences } from '@/lib/experiences'

/**
 * POST: copy one uploaded guest clip into the Google Drive marketing
 * folder, named "<sequence> - <tour name>.<ext>" where the sequence is the
 * clip's position among all clips submitted for that tour. Fired by the
 * upload flow right after the clip row lands; fire-and-forget from the
 * client and best-effort here: any failure leaves the clip intact in
 * Supabase storage and simply skips the archive copy.
 *
 * DELETE: remove a clip's archive copy again, fired by moderation when a
 * clip is rejected or flagged, so the folder only accumulates content that
 * survives review.
 *
 * Only the clip's owner (or an admin, for backfills) may call either.
 * Idempotency is an atomic claim on drive_file_id ("sync:<iso>" while in
 * flight, the Drive file id after), so concurrent calls cannot duplicate
 * files and a crashed sync self-heals when the claim goes stale. Nothing
 * here reads or writes booking, payment, or webhook data; the row updates
 * never change `status`, which the video-status webhook requires before it
 * sends any email.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Clips run up to 100 MB; the per-step timeouts below keep the whole
// pipeline inside this cap with margin for the Supabase calls.
export const maxDuration = 60

/** Mirrors VIDEO_MAX_BYTES in lib/tour-videos.ts (a 'use client' module
 *  this server route must not import). The client cap is advisory; this is
 *  the enforced boundary. */
const MAX_SYNC_BYTES = 100 * 1024 * 1024
/** A claim older than this is a crashed sync and may be retaken. */
const CLAIM_TTL_MS = 10 * 60_000

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

const claimValue = () => `sync:${new Date().toISOString()}`
const isClaim = (v: string | null) => !!v && v.startsWith('sync:')
const claimIsStale = (v: string) => {
  const t = Date.parse(v.slice(5))
  return !Number.isFinite(t) || Date.now() - t > CLAIM_TTL_MS
}

interface VideoRow {
  id: string
  user_id: string
  experience_id: number
  video_path: string
  size_bytes: number | null
  created_at: string
  drive_file_id: string | null
}

/** Load the row and confirm the caller may act on it. */
async function authorize(req: NextRequest, videoId: string | null) {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return { status: 401 as const, error: 'unauthorized' }

  if (!videoId || !/^[0-9a-f-]{36}$/i.test(videoId)) {
    return { status: 400 as const, error: 'bad_request' }
  }

  const svc = createServiceClient()
  // drive_file_id is migration 027; where it has not run, skip rather than
  // syncing without an idempotency record.
  const { data: video, error } = await svc
    .from('user_tour_videos')
    .select('id, user_id, experience_id, video_path, size_bytes, created_at, drive_file_id')
    .eq('id', videoId)
    .maybeSingle()
  if (error) {
    console.warn('[drive-sync] select failed (migration 027 applied?)', error.message)
    return { status: 200 as const, skipped: 'migration' }
  }
  if (!video) return { status: 404 as const, error: 'not_found' }

  if (video.user_id !== user.id) {
    const { data: admin } = await svc.from('admins').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!admin) return { status: 403 as const, error: 'forbidden' }
  }
  return { status: 0 as const, svc, video: video as VideoRow }
}

export async function POST(req: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ ok: true, skipped: 'unconfigured' })

  const body = await req.json().catch(() => null)
  const auth = await authorize(req, typeof body?.videoId === 'string' ? body.videoId : null)
  if (auth.status === 200) return NextResponse.json({ ok: true, skipped: auth.skipped })
  if (auth.status !== 0) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { svc, video } = auth

  // Enforced server-side: the client-side 100 MB cap is advisory, and both
  // size_bytes and video_path are client-written. The Content-Length check
  // at download time below is the load-bearing half of this guard.
  if (!video.size_bytes || video.size_bytes > MAX_SYNC_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 })
  }
  // A clip may only be synced from its owner's own storage folder.
  if (!video.video_path.startsWith(`${video.user_id}/`)) {
    return NextResponse.json({ error: 'bad_path' }, { status: 400 })
  }

  // ── Atomic claim ────────────────────────────────────────────────────
  if (video.drive_file_id && !isClaim(video.drive_file_id)) {
    return NextResponse.json({ ok: true, already: true })
  }
  if (video.drive_file_id && !claimIsStale(video.drive_file_id)) {
    return NextResponse.json({ ok: true, inProgress: true })
  }
  const claim = claimValue()
  let claimQuery = svc.from('user_tour_videos').update({ drive_file_id: claim }).eq('id', video.id)
  claimQuery = video.drive_file_id
    ? claimQuery.eq('drive_file_id', video.drive_file_id) // retake the stale claim only
    : claimQuery.is('drive_file_id', null)
  const { data: claimed, error: claimErr } = await claimQuery.select('id')
  if (claimErr || !claimed?.length) {
    // Someone else claimed it between our read and write.
    return NextResponse.json({ ok: true, inProgress: true })
  }
  const releaseClaim = async () => {
    await svc.from('user_tour_videos').update({ drive_file_id: null })
      .eq('id', video.id).eq('drive_file_id', claim)
  }

  // Position among every clip submitted for this tour; created_at ordering
  // keeps the number stable across retries (pending-clip deletions can
  // still shift later numbers, which is acceptable for a folder listing).
  const { count } = await svc
    .from('user_tour_videos')
    .select('id', { count: 'exact', head: true })
    .eq('experience_id', video.experience_id)
    .lte('created_at', video.created_at)
  const sequence = String(count || 1).padStart(4, '0')

  const title = experiences.find((e) => e.id === video.experience_id)?.title
    ?? `Experience ${video.experience_id}`
  const ext = (video.video_path.split('.').pop() || 'mp4').toLowerCase()
  const name = `${sequence} - ${title}.${ext}`
  const contentType = CONTENT_TYPES[ext] ?? 'video/mp4'

  const { data: pub } = svc.storage.from('tour-videos').getPublicUrl(video.video_path)
  if (!pub?.publicUrl) {
    await releaseClaim()
    return NextResponse.json({ error: 'no_source' }, { status: 500 })
  }

  let bytes: ArrayBuffer
  try {
    const source = await fetch(pub.publicUrl, { signal: AbortSignal.timeout(20_000), cache: 'no-store' })
    if (!source.ok) throw new Error(`source ${source.status}`)
    const declared = Number(source.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_SYNC_BYTES) throw new Error('source too large')
    bytes = await source.arrayBuffer()
    if (bytes.byteLength > MAX_SYNC_BYTES) throw new Error('source too large')
  } catch (err) {
    await releaseClaim()
    console.warn('[drive-sync] source download failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'download_failed' }, { status: 502 })
  }

  const result = await uploadClipToDrive({ name, contentType, bytes })
  if (!result.ok || !result.fileId) {
    await releaseClaim()
    console.warn('[drive-sync] drive upload failed', result.error)
    return NextResponse.json({ error: 'drive_failed' }, { status: 502 })
  }

  // Record the copy. Leaves `status` untouched, so the video-status
  // webhook sends nothing for it.
  const { error: updateErr } = await svc
    .from('user_tour_videos')
    .update({ drive_file_id: result.fileId })
    .eq('id', video.id)
    .eq('drive_file_id', claim)
  if (updateErr) console.warn('[drive-sync] drive_file_id save failed', updateErr.message)

  return NextResponse.json({ ok: true, driveFileId: result.fileId, name })
}

export async function DELETE(req: NextRequest) {
  if (!driveConfigured()) return NextResponse.json({ ok: true, skipped: 'unconfigured' })

  const body = await req.json().catch(() => null)
  const auth = await authorize(req, typeof body?.videoId === 'string' ? body.videoId : null)
  if (auth.status === 200) return NextResponse.json({ ok: true, skipped: auth.skipped })
  if (auth.status !== 0) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { svc, video } = auth

  if (!video.drive_file_id) return NextResponse.json({ ok: true, already: true })

  // A stuck claim has no Drive file to remove; just release it.
  if (!isClaim(video.drive_file_id)) {
    const removed = await deleteDriveFile(video.drive_file_id)
    if (!removed) return NextResponse.json({ error: 'drive_failed' }, { status: 502 })
  }
  await svc.from('user_tour_videos').update({ drive_file_id: null })
    .eq('id', video.id).eq('drive_file_id', video.drive_file_id)

  return NextResponse.json({ ok: true })
}
