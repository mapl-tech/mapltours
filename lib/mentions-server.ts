import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createElement } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { experiences, slugify } from '@/lib/experiences'
import { guestLabel } from '@/lib/social-handle'
import { sendEmail } from '@/lib/email/send'
import MentionNotification, { type MentionEmailPart } from '@/emails/MentionNotification'
import { defuseLinks, isUuid, splitMentions, mentionText, type MentionPerson } from '@/lib/mentions'

/**
 * @mention emails: who gets one, the signed stop link, and the send itself.
 *
 * A mention row (migration 039) starts 'pending'. The poster's browser asks
 * /api/mentions/notify right after the comment lands, and a sweep every ten
 * minutes picks up anything that call missed (a closed tab, a timeout). Both
 * go through claim_mention_emails(), which hands each row to one sender only.
 * Each send carries a Resend idempotency key per mention, so a row claimed
 * twice (a crash after the send, before the stamp) still delivers once.
 *
 * In-app mentions never depend on any of this: the profile badge and list
 * read comment_mentions directly.
 */

export const RECIPIENT_DAILY_CAP = 6
export const PAIR_COOLDOWN_MINUTES = 10
export const QUOTE_MAX_CHARS = 280
export const SITE = 'https://mapltours.com'
export const UNSUBSCRIBE_PATH = '/api/mentions/unsubscribe'
const TOKEN_PREFIX = 'mentions:v1:stop:'

/* ── The stop link ──────────────────────────────────────────────────── */

/** MENTIONS_SECRET when set, else the trip-tips key under its own prefix. */
export function mentionsSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env.MENTIONS_SECRET || env.TRIP_TIPS_SECRET
  return s && s.length >= 16 ? s : null
}

export function signStop(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${TOKEN_PREFIX}${userId.toLowerCase()}`).digest('base64url')
}

export function verifyStop(userId: unknown, token: unknown, secret: string): userId is string {
  if (!isUuid(userId) || typeof token !== 'string' || token.length > 100) return false
  const want = Buffer.from(signStop(userId, secret))
  const got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}

export function stopUrl(userId: string, secret: string, site: string = SITE): string {
  const u = userId.toLowerCase()
  return `${site.replace(/\/$/, '')}${UNSUBSCRIBE_PATH}?u=${u}&t=${signStop(u, secret)}`
}

export function listUnsubscribeHeaders(url: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/* ── The email, built from rows (pure) ──────────────────────────────── */

export interface PersonRow {
  id: string
  name: string | null
  social_handle?: string | null
}

export function personFrom(row: PersonRow | null | undefined): MentionPerson | null {
  if (!row) return null
  const l = guestLabel(row.social_handle ?? null, row.name, '')
  return l.text ? { label: l.text, isHandle: l.isHandle } : null
}

/** "@ana.b" or "Ana", the author as their comments show them (a name that is a web address is not passed on). */
export function authorLine(row: PersonRow | null | undefined): string {
  const p = personFrom(row)
  if (!p) return 'A guest'
  if (p.isHandle) return `@${p.label}`
  return defuseLinks(p.label) === p.label ? p.label : 'A guest'
}

export function tourOf(experienceId: number): { title: string; destination: string | null; slug: string } | null {
  const exp = experiences.find((e) => e.id === experienceId)
  return exp ? { title: exp.title, destination: exp.destination || null, slug: slugify(exp.title) } : null
}

/** The comment for the email: tags spelled out, the reader's own marked, links defused, capped in length. */
export function emailParts(
  text: string,
  people: ReadonlyMap<string, MentionPerson>,
  recipientId: string,
  max: number = QUOTE_MAX_CHARS,
): { parts: MentionEmailPart[]; truncated: boolean } {
  const parts: MentionEmailPart[] = []
  let used = 0
  let truncated = false
  for (const seg of splitMentions(text)) {
    if (used >= max) { truncated = true; break }
    if (seg.kind === 'mention') {
      const p = people.get(seg.id)
      const t = mentionText(p && !p.isHandle && defuseLinks(p.label) !== p.label ? null : p)
      parts.push({ kind: 'mention', text: t, isYou: seg.id === recipientId.toLowerCase() })
      used += t.length
    } else {
      const text = defuseLinks(seg.text)
      const room = max - used
      if (text.length > room) {
        const cut = text.slice(0, room)
        const atSpace = cut.lastIndexOf(' ')
        parts.push({ kind: 'text', text: (atSpace > room * 0.6 ? cut.slice(0, atSpace) : cut).trimEnd() })
        truncated = true
        break
      }
      parts.push({ kind: 'text', text })
      used += text.length
    }
  }
  return { parts, truncated }
}

export function commentLink(slug: string, commentId: string, site: string = SITE): string {
  const q = new URLSearchParams({
    comment: commentId,
    utm_source: 'email',
    utm_medium: 'notification',
    utm_campaign: 'mention',
  })
  return `${site.replace(/\/$/, '')}/experience/${slug}?${q.toString()}`
}

export function subjectFor(author: string, tourTitle: string): string {
  return `${author} tagged you on ${tourTitle}`
}

/* ── Who gets an email (pure) ───────────────────────────────────────── */

export type SkipReason =
  | 'emails-off'
  | 'no-confirmed-email'
  | 'daily-cap'
  | 'pair-cooldown'
  | 'comment-gone'
  | 'no-stop-secret'
  | 'unknown-tour'

export interface PlanInput {
  emailsOn: boolean
  email: string | null
  emailConfirmed: boolean
  sentToRecipientLast24h: number
  sentByAuthorToRecipientLastCooldown: number
  commentExists: boolean
  hasSecret: boolean
  tourKnown: boolean
}

export function planMentionEmail(i: PlanInput): { send: true } | { send: false; reason: SkipReason } {
  if (!i.commentExists) return { send: false, reason: 'comment-gone' }
  if (!i.hasSecret) return { send: false, reason: 'no-stop-secret' }
  if (!i.tourKnown) return { send: false, reason: 'unknown-tour' }
  if (!i.emailsOn) return { send: false, reason: 'emails-off' }
  if (!i.email || !i.emailConfirmed) return { send: false, reason: 'no-confirmed-email' }
  if (i.sentToRecipientLast24h >= RECIPIENT_DAILY_CAP) return { send: false, reason: 'daily-cap' }
  if (i.sentByAuthorToRecipientLastCooldown > 0) return { send: false, reason: 'pair-cooldown' }
  return { send: true }
}

/* ── The send (I/O) ─────────────────────────────────────────────────── */

export interface MentionRow {
  id: string
  comment_id: string
  experience_id: number
  author_id: string
  mentioned_user_id: string
  created_at: string
  email_attempts: number
}

export interface ProcessResult {
  claimed: number
  sent: number
  skipped: number
  failed: number
}

type Svc = SupabaseClient

async function mark(svc: Svc, id: string, status: 'sent' | 'failed' | 'skipped', note: string | null) {
  const patch: Record<string, unknown> = { email_status: status, email_note: note }
  if (status === 'sent') patch.emailed_at = new Date().toISOString()
  const { error } = await svc.from('comment_mentions').update(patch).eq('id', id)
  if (error) console.error('[mentions] could not record outcome', { id, status, error: error.message })
}

/**
 * Claim and email the pending mentions of one comment (commentId), or every
 * due mention (the sweep). Never throws; each row ends sent, skipped or
 * failed (failed is retried by the sweep, up to three attempts in 24 hours).
 */
export async function processMentionEmails(
  svc: Svc,
  opts: { commentId?: string; limit?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, sent: 0, skipped: 0, failed: 0 }
  const env = opts.env ?? process.env
  const { data: claimedRows, error: claimErr } = await svc.rpc('claim_mention_emails', {
    p_comment_id: opts.commentId ?? null,
    p_limit: opts.limit ?? 50,
  })
  if (claimErr) {
    console.error('[mentions] claim failed', claimErr.message)
    return result
  }
  const rows = (claimedRows ?? []) as MentionRow[]
  result.claimed = rows.length
  if (!rows.length) return result

  const secret = mentionsSecret(env)
  const commentIds = Array.from(new Set(rows.map((r) => r.comment_id)))
  const { data: comments } = await svc.from('comments').select('id, text, experience_id, user_id').in('id', commentIds)
  const commentById = new Map((comments ?? []).map((c: { id: string; text: string; experience_id: number; user_id: string }) => [c.id, c]))

  // Everyone the emails name: authors, recipients and anyone tagged in the texts.
  const ids = new Set<string>()
  for (const r of rows) { ids.add(r.author_id); ids.add(r.mentioned_user_id) }
  commentById.forEach((c) => { for (const seg of splitMentions(c.text)) if (seg.kind === 'mention') ids.add(seg.id) })
  const { data: people } = await svc.from('users').select('id, name, social_handle').in('id', Array.from(ids))
  const personRows = new Map((people ?? []).map((p: PersonRow) => [p.id, p]))
  const personMap = new Map<string, MentionPerson>()
  personRows.forEach((row, id) => { const p = personFrom(row); if (p) personMap.set(id, p) })

  const recipients = Array.from(new Set(rows.map((r) => r.mentioned_user_id)))
  const { data: prefs } = await svc.from('notification_prefs').select('user_id, mention_emails').in('user_id', recipients)
  const emailsOff = new Set((prefs ?? []).filter((p: { mention_emails: boolean }) => p.mention_emails === false).map((p: { user_id: string }) => p.user_id))

  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString()
  const cooldownAgo = new Date(Date.now() - PAIR_COOLDOWN_MINUTES * 60_000).toISOString()

  for (const row of rows) {
    try {
      const comment = commentById.get(row.comment_id)
      const tour = tourOf(row.experience_id)
      let email: string | null = null
      let confirmed = false
      const { data: authUser } = await svc.auth.admin.getUserById(row.mentioned_user_id)
      if (authUser?.user) {
        email = authUser.user.email ?? null
        confirmed = !!authUser.user.email_confirmed_at
      }
      const { count: dayCount } = await svc
        .from('comment_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('mentioned_user_id', row.mentioned_user_id)
        .eq('email_status', 'sent')
        .gte('emailed_at', dayAgo)
      const { count: pairCount } = await svc
        .from('comment_mentions')
        .select('id', { count: 'exact', head: true })
        .eq('mentioned_user_id', row.mentioned_user_id)
        .eq('author_id', row.author_id)
        .eq('email_status', 'sent')
        .gte('emailed_at', cooldownAgo)

      const plan = planMentionEmail({
        emailsOn: !emailsOff.has(row.mentioned_user_id),
        email,
        emailConfirmed: confirmed,
        sentToRecipientLast24h: dayCount ?? 0,
        sentByAuthorToRecipientLastCooldown: pairCount ?? 0,
        commentExists: !!comment,
        hasSecret: !!secret,
        tourKnown: !!tour,
      })
      if (!plan.send) {
        await mark(svc, row.id, 'skipped', plan.reason)
        result.skipped += 1
        continue
      }

      const author = authorLine(personRows.get(row.author_id))
      const { parts, truncated } = emailParts(comment!.text, personMap, row.mentioned_user_id)
      const stop = stopUrl(row.mentioned_user_id, secret!)
      const sent = await sendEmail({
        to: email!,
        subject: subjectFor(author, tour!.title),
        react: createElement(MentionNotification, {
          authorLabel: author,
          tourTitle: tour!.title,
          destination: tour!.destination,
          parts,
          truncated,
          commentUrl: commentLink(tour!.slug, row.comment_id),
          stopUrl: stop,
        }),
        headers: listUnsubscribeHeaders(stop),
        tags: [{ name: 'type', value: 'mention' }],
        // A key plus a fingerprint of the message (see sendEmail): a repeat of
        // the same email inside Resend's window delivers once.
        dedupe: `mention/${row.id}`,
        timeoutMs: 4000,
      })
      if (sent.ok) {
        await mark(svc, row.id, 'sent', sent.id ?? null)
        result.sent += 1
      } else {
        await mark(svc, row.id, 'failed', (sent.error || 'send failed').slice(0, 200))
        result.failed += 1
      }
    } catch (err) {
      await mark(svc, row.id, 'failed', (err instanceof Error ? err.message : 'error').slice(0, 200))
      result.failed += 1
    }
  }
  return result
}

/* ── The stop page ──────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function stopPage(kind: 'confirm' | 'done' | 'invalid', action?: string): string {
  const body =
    kind === 'confirm'
      ? `<h1>Stop mention emails?</h1>
         <p>You will no longer get an email when someone tags you in a comment. New mentions will still show on your profile.</p>
         <form method="post" action="${esc(action ?? UNSUBSCRIBE_PATH)}"><button type="submit">Stop these emails</button></form>
         <p class="small"><a href="${SITE}/profile">Go to my profile</a></p>`
      : kind === 'done'
        ? `<h1>Done. No more mention emails.</h1>
           <p>New mentions will still show on your profile, and you can switch emails back on there any time.</p>
           <p><a class="btn" href="${SITE}/profile">Go to my profile</a></p>`
        : `<h1>This link has expired or is not complete.</h1>
           <p>You can switch mention emails off on your profile instead.</p>
           <p><a class="btn" href="${SITE}/profile">Go to my profile</a></p>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Mention emails | MAPL Tours Jamaica</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #F4F1EB; color: #1A1714; font: 16px/1.6 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 520px; margin: 0 auto; padding: 48px 20px; }
  .card { background: #fff; border: 1px solid #E7E1D6; border-radius: 16px; padding: 28px 24px; border-top: 3px solid #B7873A; }
  .brand { margin: 0 0 18px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 13px; color: #7A5A08; }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 12px; }
  p { margin: 0 0 16px; color: #3D3A35; }
  button, .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 24px; border-radius: 9999px; border: 0; background: #1A1714; color: #fff; font-weight: 600; font-size: 16px; line-height: 1; font-family: inherit; text-decoration: none; cursor: pointer; }
  button:focus-visible, a:focus-visible { outline: 3px solid #7A5A08; outline-offset: 3px; }
  .small { font-size: 14px; margin-top: 18px; }
  .small a { color: #1A1714; }
</style></head>
<body><main><div class="card"><p class="brand">MAPL Tours Jamaica</p>${body}</div></main></body></html>`
}

/** Records a stop. Returns false when it could not be written. */
export async function recordStop(svc: Svc, userId: string): Promise<boolean> {
  const { error } = await svc
    .from('notification_prefs')
    .upsert({ user_id: userId, mention_emails: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[mentions] stop not recorded', error.message)
  return !error
}
