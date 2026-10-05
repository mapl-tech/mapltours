import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { BRAND_FROM } from '@/lib/contact'
import { guestNames } from '@/lib/guest-name'
import { siteUrl } from '@/emails/_Layout'
import ClipReviewDigest from '@/emails/ClipReviewDigest'
import { buildClipDigest, clipDigestSubject, type DigestReward, type ReviewedClip } from '@/lib/clip-digest'
import { VIDEO_REWARD_MILESTONE } from '@/lib/video-rules'

/**
 * The evening clip-review email: one per guest, about every clip reviewed
 * since their last one (approved, or not published with the reviewer's note),
 * with the 5% reward when one of the approvals unlocked it. Replaces the email
 * per review the video-status webhook used to send. Run nightly by
 * netlify/functions/clip-digest-cron.mjs; idempotent, so an extra run only
 * finds nothing due.
 *
 * Each guest's due clips are claimed in one statement (claim_clip_reviews,
 * migration 036), so overlapping runs never email the same review twice; a
 * send that fails, or a guest whose details could not be read, is released
 * for the next run. A synchronous Netlify function is cut off at 10 s, so no
 * guest is claimed after DEADLINE_MS: the ones left are reported as deferred
 * and the cron calls again for them.
 *
 * Auth: CRON_SECRET as `Authorization: Bearer`, compared in constant time.
 * `?dry=1` reads and counts, and claims and sends nothing.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** No guest is claimed after this, so the last send still ends inside 10 s. */
const DEADLINE_MS = 5_500
/** The send gives up after this; the clips are released and tried next run. */
const SEND_TIMEOUT_MS = 2_500

type Client = ReturnType<typeof createServiceClient>
/** A clip as the claim returns it, with the mark it set. */
type ClaimedClip = ReviewedClip & { review_emailed_at: string }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Whether the request carries the cron secret as a Bearer token. */
function authorized(request: NextRequest, secret: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!m) return false
  const got = Buffer.from(m[1])
  const want = Buffer.from(secret)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const secret = process.env.CRON_SECRET
  if (!secret || !authorized(request, secret)) return json({ error: 'Unauthorized' }, 401)
  const dry = request.nextUrl.searchParams.get('dry') === '1'

  let supabase: Client
  try {
    supabase = createServiceClient()
  } catch {
    return json({ error: 'Database is not configured.' }, 500)
  }

  // Reviewed in the last 30 days and not yet emailed in that state. PostgREST
  // cannot compare two columns, so "reviewed after the last email" is checked
  // here, and again, atomically, by the claim.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('user_tour_videos')
    .select('id, user_id, reviewed_at, review_emailed_at')
    .in('status', ['approved', 'rejected'])
    .gte('reviewed_at', since)
    .limit(2000)
  if (error) {
    console.error('[clip-digest] read failed', error.code ?? '', error.message ?? '')
    return json({ error: 'Could not read clips.' }, 500)
  }
  const due = (data ?? []).filter((r) => r.reviewed_at
    && (!r.review_emailed_at || Date.parse(r.reviewed_at) > Date.parse(r.review_emailed_at)))
  const users = Array.from(new Set(due.map((r) => r.user_id as string)))
  const report = { dry, due: due.length, guests: users.length, sent: 0, failed: 0, noEmail: 0, deferred: 0 }
  if (dry) return json({ ok: true, ...report })

  for (let i = 0; i < users.length; i++) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      report.deferred = users.length - i
      break
    }
    const userId = users[i]
    const stamp = new Date().toISOString()
    const { data: claimed, error: claimErr } = await supabase.rpc('claim_clip_reviews', { p_user: userId, p_stamp: stamp })
    if (claimErr) {
      console.error('[clip-digest] claim failed', claimErr.code ?? '', claimErr.message ?? '')
      report.failed++
      continue
    }
    const rows = (claimed ?? []) as ClaimedClip[]
    if (rows.length === 0) continue // another run took them
    const outcome = await sendDigest(supabase, userId, rows)
    if (outcome === 'sent') report.sent++
    else if (outcome === 'no_email') report.noEmail++
    else {
      report.failed++
      await release(supabase, rows)
    }
  }
  console.log('[clip-digest]', JSON.stringify(report))
  return json({ ok: true, ...report })
}

/**
 * Puts claimed clips back for the next run: each only where its mark is still
 * the one this claim set, so a review made in between keeps its own state.
 */
async function release(supabase: Client, rows: ClaimedClip[]) {
  const byMark = new Map<string, string[]>()
  for (const r of rows) byMark.set(r.review_emailed_at, [...(byMark.get(r.review_emailed_at) ?? []), r.id])
  for (const [mark, ids] of Array.from(byMark)) {
    const { error } = await supabase
      .from('user_tour_videos')
      .update({ review_emailed_at: null })
      .in('id', ids)
      .eq('review_emailed_at', mark)
    if (error) console.error('[clip-digest] release failed', error.code ?? '', error.message ?? '')
  }
}

/** A deleted account: nothing to send, ever (anything else is tried again). */
function userGone(err: { status?: number; message?: string }): boolean {
  return err.status === 404 || /not.?found/i.test(err.message ?? '')
}

async function sendDigest(supabase: Client, userId: string, rows: ClaimedClip[]): Promise<'sent' | 'failed' | 'no_email'> {
  try {
    const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(userId)
    if (userErr) return userGone(userErr) ? 'no_email' : 'failed'
    const email = userRes?.user?.email ?? null
    // No address, nothing to send: the clips stay marked, not retried forever.
    if (!email) return 'no_email'
    const { firstName } = guestNames(userRes?.user?.user_metadata)

    // Every read below decides what the email says; one that fails is tried
    // again next run rather than sent wrong (a lost count once announced no
    // reward, for good).
    const approvedRows = rows.filter((r) => r.status === 'approved')
    let approvedTotal = 0
    let reward: DigestReward | null = null
    if (approvedRows.length > 0) {
      const { count, error: countErr } = await supabase
        .from('user_tour_videos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'approved')
      if (countErr || count == null) return 'failed'
      approvedTotal = count
      // A reward these approvals unlocked: they carried the guest's total
      // past a milestone (5, 10, ...), and migration 003's trigger granted
      // that milestone's reward. Matched by milestone, not by time, since
      // reviewed_at is the reviewer's clock and created_at the database's;
      // a reward from an earlier evening is never announced again.
      const milestone = Math.floor(approvedTotal / VIDEO_REWARD_MILESTONE) * VIDEO_REWARD_MILESTONE
      if (milestone > 0 && approvedTotal - approvedRows.length < milestone) {
        const { data: granted, error: rewardErr } = await supabase
          .from('user_rewards')
          .select('code, percent, expires_at')
          .eq('user_id', userId)
          .eq('kind', 'video_upload_5pct')
          .eq('status', 'available')
          .eq('milestone', milestone)
          .limit(1)
        if (rewardErr) return 'failed'
        const r = granted?.[0]
        reward = r ? { code: r.code, percent: r.percent, expiresAt: r.expires_at } : null
      }
    }

    const digest = buildClipDigest(rows, approvedTotal, reward, siteUrl())
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<{ ok: false; error: string }>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), SEND_TIMEOUT_MS)
    })
    try {
      const res = await Promise.race([
        sendEmail({
          to: email,
          from: BRAND_FROM,
          subject: clipDigestSubject(digest),
          react: ClipReviewDigest({ firstName, ...digest }),
          tags: [{ name: 'category', value: 'clip_review_digest' }],
        }),
        timedOut,
      ])
      if (!res.ok) console.error('[clip-digest] send failed', res.error)
      return res.ok ? 'sent' : 'failed'
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    console.error('[clip-digest] send threw', err instanceof Error ? err.message : err)
    return 'failed'
  }
}
