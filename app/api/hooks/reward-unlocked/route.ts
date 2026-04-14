import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import RewardUnlocked from '@/emails/RewardUnlocked'

/**
 * Supabase DB webhook target — fires on INSERT to `public.user_rewards`.
 * That table is only written by the `maybe_grant_video_reward` trigger, so
 * receiving a row here means the user just crossed a milestone (5 / 10 / 15
 * approved videos). We send the celebratory "reward unlocked" email.
 *
 * Authenticated with the same shared secret as the video-status hook.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RewardRow {
  id: string
  user_id: string
  kind: string
  percent: number
  milestone: number
  code: string
  status: 'available' | 'used' | 'expired'
  expires_at: string | null
  created_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: RewardRow | null
  old_record: RewardRow | null
}

export async function POST(req: Request) {
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

  if (payload.table !== 'user_rewards' || payload.type !== 'INSERT' || !payload.record) {
    return NextResponse.json({ skipped: 'not_target_event' })
  }

  const record = payload.record
  // Only send for newly-granted video rewards in the `available` state.
  if (record.kind !== 'video_upload_5pct' || record.status !== 'available') {
    return NextResponse.json({ skipped: 'non_matching_reward_kind' })
  }

  const supabase = createServiceClient()
  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(record.user_id)
  if (userErr || !userRes?.user?.email) {
    console.warn('[hook:reward-unlocked] recipient has no email', record.user_id, userErr)
    return NextResponse.json({ skipped: 'no_recipient_email' })
  }

  const meta = userRes.user.user_metadata ?? {}
  const fullName: string | undefined = meta.full_name ?? meta.name
  const firstName = fullName?.split(' ')[0] ?? null

  try {
    await sendEmail({
      to: userRes.user.email,
      subject: `🎉 ${record.percent}% off your next MAPL trip — ${record.code}`,
      react: RewardUnlocked({
        firstName,
        code: record.code,
        percent: record.percent,
        expiresAt: record.expires_at,
        milestone: record.milestone,
      }),
      tags: [
        { name: 'category', value: 'reward_unlocked' },
        { name: 'milestone', value: String(record.milestone) },
      ],
    })
    return NextResponse.json({ ok: true, sent: 'reward_unlocked' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('[hook:reward-unlocked] dispatch failed', msg)
    return NextResponse.json({ ok: false, error: msg })
  }
}
