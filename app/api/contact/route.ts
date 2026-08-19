import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { rateLimit, getIp } from '@/lib/rate-limit'
import ContactMessage from '@/emails/ContactMessage'
import ContactAutoReply from '@/emails/ContactAutoReply'

/**
 * Contact form handler.
 *
 * Two emails per submission:
 *   1. Ops alert → contact@mapltours.com  (replyTo = visitor's email,
 *      so hitting "Reply" in their inbox goes straight to the visitor)
 *   2. Branded auto-reply → the visitor, confirming receipt and echoing
 *      their message back.
 *
 * The visitor-side auto-reply is best-effort: if it fails we still
 * accept the submission (the ops alert is the load-bearing one). If the
 * ops alert fails, we return 500 so the form surfaces the error and the
 * visitor can retry rather than think their message vanished.
 */

export const runtime = 'nodejs'

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

interface ContactBody {
  name?: string
  email?: string
  subject?: string
  message?: string
  /** Honeypot, real users never fill this. Bots fill every visible input. */
  website?: string
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (rateLimit(ip, { windowMs: 60_000, max: 3, bucket: 'contact' })) {
    return NextResponse.json(
      { error: 'Too many submissions, please wait a minute and try again.' },
      { status: 429 },
    )
  }

  // 2. Parse + validate.
  let body: ContactBody
  try {
    body = (await req.json()) as ContactBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Honeypot trip, silently accept so the bot thinks it worked, but do
  // nothing. Real submissions never have `website` populated.
  if (body.website && body.website.trim().length > 0) {
    return NextResponse.json({ ok: true })
  }

  const name = (body.name ?? '').trim().slice(0, 120)
  const email = (body.email ?? '').trim().slice(0, 200)
  const subject = (body.subject ?? '').trim().slice(0, 200)
  const message = (body.message ?? '').trim().slice(0, 5000)

  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !EMAIL_RE.test(email))
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!message)
    return NextResponse.json({ error: 'Please include a message.' }, { status: 400 })

  const submittedAt = new Date().toISOString()
  const firstName = name.split(/\s+/)[0]

  // Both messages are sent FROM the contact inbox so visitors see a
  // consistent sender ("MAPL TOURS <contact@mapltours.com>") and any
  // bounce / out-of-office reply lands back in the contact inbox where
  // it can be handled.
  const CONTACT_FROM = 'MAPL TOURS <contact@mapltours.com>'

  // 3. Ops alert, load-bearing. Failure = 500 so the user can retry.
  const opsRes = await sendEmail({
    to: 'contact@mapltours.com',
    from: CONTACT_FROM,
    subject: subject
      ? `MAPL TOURS · Contact · ${subject}`
      : `MAPL TOURS · Contact · message from ${name}`,
    replyTo: email,
    react: ContactMessage({
      name,
      email,
      subject,
      message,
      submittedAt,
      origin: ip !== 'unknown' ? ip : null,
    }),
    tags: [{ name: 'category', value: 'contact_form' }],
  })

  if (!opsRes.ok) {
    console.error('[contact] ops email failed', opsRes.error)
    return NextResponse.json(
      { error: 'We couldn’t deliver your message right now. Please try again or email contact@mapltours.com directly.' },
      { status: 500 },
    )
  }

  // 4. Auto-reply, best effort. Log on failure but still return success
  //    because the message DID reach the team.
  const replyRes = await sendEmail({
    to: email,
    from: CONTACT_FROM,
    subject: 'We got your message, MAPL TOURS',
    react: ContactAutoReply({
      firstName,
      subject: subject || null,
      message,
    }),
    tags: [{ name: 'category', value: 'contact_auto_reply' }],
  })

  if (!replyRes.ok) {
    console.warn('[contact] auto-reply failed (ops alert sent)', replyRes.error)
  }

  return NextResponse.json({ ok: true })
}
