import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { experiences } from '@/lib/experiences'
import { VIDEO_REWARD_MILESTONE } from '@/lib/tour-videos'
import VideoSubmitted from '@/emails/VideoSubmitted'
import VideoApproved from '@/emails/VideoApproved'
import VideoRejected from '@/emails/VideoRejected'

/**
 * Supabase DB webhook target — fires on INSERT and UPDATE to
 * `public.user_tour_videos`. Dispatches the matching transactional email.
 *
 * ── How Supabase DB webhooks call this endpoint ───────────────────────────
 *  {
 *    "type": "INSERT" | "UPDATE",
 *    "table": "user_tour_videos",
 *    "schema": "public",
 *    "record":      { ...new row... },
 *    "old_record":  { ...previous row or null... }
 *  }
 *
 * Authenticated via a shared secret passed in the `x-supabase-secret` header
 * (set in the webhook config AND in Vercel env as SUPABASE_WEBHOOK_SECRET).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface VideoRow {
  id: string
  user_id: string
  experience_id: number
  status: 'pending' | 'approved' | 'rejected' | 'flagged'
  admin_notes: string | null
  caption: string | null
  created_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: VideoRow | null
  old_record: VideoRow | null
}

export async function POST(req: Request) {
  // 1. Secret check — reject anything not originating from Supabase
  const secret = req.headers.get('x-supabase-secret')
  if (!secret || secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: WebhookPayload
  try {
    payload = (await req.json()) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (payload.table !== 'user_tour_videos' || !payload.record) {
    return NextResponse.json({ skipped: 'not_target_table' })
  }

  const record = payload.record
  const prev = payload.old_record

  // 2. Look up the uploader's email + display name via the service client
  const supabase = createServiceClient()
  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(record.user_id)
  if (userErr || !userRes?.user?.email) {
    console.warn('[hook:video-status] uploader has no email', record.user_id, userErr)
    return NextResponse.json({ skipped: 'no_uploader_email' })
  }
  const email = userRes.user.email
  const meta = userRes.user.user_metadata ?? {}
  const fullName: string | undefined = meta.full_name ?? meta.name
  const firstName = fullName?.split(' ')[0] ?? null

  const experience = experiences.find((e) => e.id === record.experience_id)
  const experienceTitle = experience?.title ?? null

  // 3. Dispatch based on type + status transition
  try {
    // INSERT → new upload pending
    if (payload.type === 'INSERT' && record.status === 'pending') {
      await sendEmail({
        to: email,
        subject: 'Your MAPL clip is in review',
        react: VideoSubmitted({ firstName, experienceTitle }),
        tags: [
          { name: 'category', value: 'video_submitted' },
          { name: 'experience_id', value: String(record.experience_id) },
        ],
      })
      return NextResponse.json({ ok: true, sent: 'video_submitted' })
    }

    // UPDATE → only react when status actually changed
    if (payload.type === 'UPDATE' && prev && prev.status !== record.status) {
      if (record.status === 'approved') {
        // Fresh count of approved videos (includes the one that just flipped)
        const { count } = await supabase
          .from('user_tour_videos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', record.user_id)
          .eq('status', 'approved')

        const approvedCount = count ?? 0
        const remainingForReward = approvedCount % VIDEO_REWARD_MILESTONE === 0
          ? 0
          : VIDEO_REWARD_MILESTONE - (approvedCount % VIDEO_REWARD_MILESTONE)
        const rewardJustUnlocked =
          approvedCount > 0 && approvedCount % VIDEO_REWARD_MILESTONE === 0

        await sendEmail({
          to: email,
          subject: rewardJustUnlocked
            ? '🎬 Your clip is live — and you just unlocked 5% off'
            : 'Your MAPL clip is live',
          react: VideoApproved({
            firstName,
            experienceTitle,
            experienceId: record.experience_id,
            approvedCount,
            remainingForReward,
            rewardJustUnlocked,
          }),
          tags: [
            { name: 'category', value: 'video_approved' },
            { name: 'experience_id', value: String(record.experience_id) },
          ],
        })
        return NextResponse.json({ ok: true, sent: 'video_approved', approvedCount })
      }

      if (record.status === 'rejected') {
        await sendEmail({
          to: email,
          subject: "We couldn't publish your MAPL clip",
          react: VideoRejected({
            firstName,
            experienceTitle,
            experienceId: record.experience_id,
            adminNotes: record.admin_notes,
          }),
          tags: [
            { name: 'category', value: 'video_rejected' },
            { name: 'experience_id', value: String(record.experience_id) },
          ],
        })
        return NextResponse.json({ ok: true, sent: 'video_rejected' })
      }

      // `flagged` is an internal triage state — no user-facing email by design.
      if (record.status === 'flagged') {
        return NextResponse.json({ ok: true, skipped: 'flagged_is_internal' })
      }
    }

    return NextResponse.json({ ok: true, skipped: 'no_matching_transition' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[hook:video-status] dispatch failed', msg)
    // We still return 200 so Supabase doesn't retry indefinitely — email
    // failures are logged, not silently dropped, but we don't block the DB.
    return NextResponse.json({ ok: false, error: msg })
  }
}
