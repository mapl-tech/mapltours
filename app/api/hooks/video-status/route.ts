import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail, type SendEmailResult } from '@/lib/email/send'
import { experiences } from '@/lib/experiences'
import VideoSubmitted from '@/emails/VideoSubmitted'
import NewClipAlert from '@/emails/NewClipAlert'
import { BRAND_FROM, SUPPORT_EMAIL } from '@/lib/contact'
import { guestNames } from '@/lib/guest-name'

/**
 * Supabase DB webhook target, fires on INSERT and UPDATE to
 * `public.user_tour_videos` (trigger `video_status`, made to fire on INSERT
 * by migration 034). A new clip emails us and the guest at once; a review
 * (approved or rejected) sends nothing here: the evening email
 * (app/api/clip-digest, migration 036) tells each guest about all of the
 * day's reviews in one.
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
 * (set in the webhook config AND in Netlify env as SUPABASE_WEBHOOK_SECRET).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A signed-in account can insert clip rows directly, and an address is not
// confirmed at sign-up, so a new clip is worth a capped number of emails.
// Past either cap in an hour the clip still waits in /admin/videos, but
// nobody is emailed about it, us or the guest: the sender is the one booking
// confirmations use, and a loop of inserts (from one account or many) must
// never spend its quota, flood the inbox or mail strangers. The counts hold
// because uploaders cannot delete their clips (migration 034).
const CLIP_MAILS_PER_UPLOADER_PER_HOUR = 5
const CLIP_MAILS_PER_HOUR = 20

interface VideoRow {
  id: string
  user_id: string
  experience_id: number
  status: 'pending' | 'approved' | 'rejected' | 'flagged'
  admin_notes: string | null
  caption: string | null
  thumbnail_path?: string | null
  duration_seconds?: number | null
  created_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: VideoRow | null
  old_record: VideoRow | null
}

export async function POST(req: Request) {
  // 1. Secret check, reject anything not originating from Supabase
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
  const email = userErr ? null : userRes?.user?.email ?? null
  const { fullName, firstName } = guestNames(userRes?.user?.user_metadata)

  const experience = experiences.find((e) => e.id === record.experience_id)
  const experienceTitle = experience?.title ?? null

  // 3. A new upload: tell us, and tell the guest it is in review.
  if (payload.type === 'INSERT' && record.status === 'pending') {
    // Counted before anything is sent; a count that cannot be read lets the
    // email through (an attacker cannot make the count fail).
    const [mine, all] = await Promise.all([recentClips(supabase, record.user_id), recentClips(supabase)])
    const allowed = (mine === null || mine <= CLIP_MAILS_PER_UPLOADER_PER_HOUR) && (all === null || all <= CLIP_MAILS_PER_HOUR)
    if (!allowed) console.warn('[hook:video-status] clip emails capped', { user: record.user_id, mine, all })
    // The clip waits hidden in /admin/videos until someone reviews it, and
    // nothing else says it arrived. Sent whether or not the uploader has an
    // address, and alongside the guest's email rather than before it, so the
    // two stay well inside the trigger's 5 s timeout.
    const [owner, guest] = await Promise.all([
      allowed ? notifyNewClip(supabase, record, experienceTitle, fullName, email) : null,
      email && allowed
        ? safeSend({
            to: email,
            from: BRAND_FROM,
            subject: 'Your MAPL Tours Jamaica clip is in review',
            react: VideoSubmitted({ firstName, experienceTitle, experienceId: record.experience_id }),
            tags: [
              { name: 'category', value: 'video_submitted' },
              { name: 'experience_id', value: String(record.experience_id) },
            ],
          })
        : null,
    ])
    const ownerStatus = owner === null ? 'capped' : owner ? 'sent' : 'failed'
    if (!email) {
      console.warn('[hook:video-status] uploader has no email', record.user_id, userErr)
      return NextResponse.json({ skipped: 'no_uploader_email', owner: ownerStatus })
    }
    if (!allowed) return NextResponse.json({ ok: true, skipped: 'capped', owner: ownerStatus })
    if (!guest?.ok) console.error('[hook:video-status] video_submitted not sent', guest?.error)
    return NextResponse.json({
      ok: !!guest?.ok,
      sent: guest?.ok ? 'video_submitted' : null,
      owner: ownerStatus,
    })
  }

  if (!email) {
    console.warn('[hook:video-status] uploader has no email', record.user_id, userErr)
    return NextResponse.json({ skipped: 'no_uploader_email' })
  }

  // 4. A review: emailed in the evening, one email per guest for the whole
  // day (app/api/clip-digest), so five clips approved in one sitting are one
  // email, and a clip approved and then rejected is reported once, as it ended.
  if (payload.type === 'UPDATE' && prev && prev.status !== record.status) {
    if (record.status === 'approved' || record.status === 'rejected') {
      return NextResponse.json({ ok: true, skipped: 'emailed_in_evening_digest' })
    }
    // `flagged` is an internal triage state, no user-facing email by design.
    if (record.status === 'flagged') {
      return NextResponse.json({ ok: true, skipped: 'flagged_is_internal' })
    }
  }

  return NextResponse.json({ ok: true, skipped: 'no_matching_transition' })
}

/** sendEmail, but a throw becomes a failed result like any other. */
async function safeSend(input: Parameters<typeof sendEmail>[0]): Promise<SendEmailResult> {
  try {
    return await sendEmail(input)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

// The note to us may hold the webhook this long at most. Resend has no
// timeout of its own, and the trigger gives the whole request 5 s.
const NEW_CLIP_NOTE_TIMEOUT_MS = 3_000

/** Clips posted in the last hour, by one uploader or by everyone; null if unreadable. */
async function recentClips(supabase: ReturnType<typeof createServiceClient>, userId?: string): Promise<number | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  let query = supabase
    .from('user_tour_videos')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (userId) query = query.eq('user_id', userId)
  const { count, error } = await query
  return error ? null : count ?? 0
}

/**
 * Tell us a guest posted a clip, at the public inbox where every other alert
 * lands. Not the operations list: reviewing clips is our job, not the
 * operator's. A reply goes to the guest. Best-effort by contract, it never
 * throws and is time-boxed, so the guest's own email never waits on it. True
 * when Resend accepted it.
 */
async function notifyNewClip(
  supabase: ReturnType<typeof createServiceClient>,
  record: VideoRow,
  experienceTitle: string | null,
  uploaderName: string | null,
  uploaderEmail: string | null,
): Promise<boolean> {
  const tour = experienceTitle ?? `a tour no longer listed (#${record.experience_id})`
  const caption = record.caption?.trim().slice(0, 300) || null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // The row is the guest's to write, so only a plausible length is shown,
    // and the poster is the public bucket's URL for the path, never a host.
    const secs = record.duration_seconds
    const durationSeconds = typeof secs === 'number' && Number.isFinite(secs) && secs > 0 && secs <= 600 ? secs : null
    const posterUrl = typeof record.thumbnail_path === 'string' && record.thumbnail_path
      ? supabase.storage.from('tour-videos').getPublicUrl(record.thumbnail_path).data.publicUrl
      : null
    const timedOut = new Promise<SendEmailResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'timeout' }), NEW_CLIP_NOTE_TIMEOUT_MS)
    })
    const res = await Promise.race([
      safeSend({
        to: SUPPORT_EMAIL,
        from: BRAND_FROM,
        ...(uploaderEmail ? { replyTo: uploaderEmail } : {}),
        subject: `New guest clip to review: ${tour}`,
        react: NewClipAlert({
          tour,
          name: uploaderName,
          email: uploaderEmail,
          caption,
          clipId: record.id,
          posterUrl,
          durationSeconds,
        }),
        tags: [
          { name: 'category', value: 'new_clip' },
          { name: 'experience_id', value: String(record.experience_id) },
        ],
      }),
      timedOut,
    ])
    if (!res.ok) console.error('[hook:video-status] new clip note not sent', res.error)
    return res.ok
  } catch (err) {
    console.error('[hook:video-status] new clip note threw', err instanceof Error ? err.message : err)
    return false
  } finally {
    clearTimeout(timer)
  }
}
