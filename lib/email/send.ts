import { Resend } from 'resend'
import { render } from '@react-email/render'

/**
 * Thin Resend wrapper used by every transactional email in the app.
 *
 *  • Always renders a plain-text alternative (Gmail penalises HTML-only mail).
 *  • Pins the "from" and "reply-to" to brand addresses.
 *  • Silent-logs failures so a single bad template doesn't crash the request
 *    that triggered the email (e.g. a Stripe webhook must still ack).
 */

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export interface SendEmailInput {
  to: string | string[]
  subject: string
  react: React.ReactElement
  /** Override the default reply-to (support@…) for category-specific inboxes */
  replyTo?: string
  /** Optional Resend tags for filtering in their dashboard */
  tags?: { name: string; value: string }[]
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail({
  to, subject, react, replyTo, tags,
}: SendEmailInput): Promise<SendEmailResult> {
  if (!resend) {
    // Dev convenience — no Resend key means we only log.
    console.warn('[email] RESEND_API_KEY not set — would have sent:', subject, 'to', to)
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  const from = process.env.EMAIL_FROM ?? 'MAPL Tours <trips@mapltours.com>'
  const fallbackReplyTo = process.env.EMAIL_SUPPORT ?? 'support@mapltours.com'

  try {
    const html = await render(react)
    const text = await render(react, { plainText: true })

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      replyTo: replyTo ?? fallbackReplyTo,
      tags,
    })

    if (error) {
      console.error('[email] send failed', { subject, to, error })
      return { ok: false, error: error.message }
    }
    return { ok: true, id: data?.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[email] render/send threw', { subject, to, err: msg })
    return { ok: false, error: msg }
  }
}
