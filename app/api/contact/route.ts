import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { rateLimit, getIp } from '@/lib/rate-limit'
import ContactMessage from '@/emails/ContactMessage'
import ContactAutoReply from '@/emails/ContactAutoReply'
import PriceRequestAutoReply, { PRICE_REQUEST_REPLY_SUBJECT } from '@/emails/PriceRequestAutoReply'

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
  /** Set by the transfers page's "Ask for a price" form. */
  kind?: string
  hotel?: string
  tripType?: string
  passengers?: number
}

const PRICE_SUBJECT_PREFIX = 'Unlisted hotel · '

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

  // Honeypot. A filled hidden field used to drop the message silently, and on
  // Oct 26 2026 it dropped the owner's own requests: browsers fill hidden
  // fields (autofill, password managers, AI form fillers), so "filled" does
  // not mean "bot". The message is now delivered with a flag in the subject
  // and the field's value inside, and only the auto-reply is skipped, so a
  // bot never gets mail sent to an address it typed. The per-IP rate limit
  // above still caps any flood.
  const hidden = (body.website ?? '').trim().slice(0, 120)
  const trapped = hidden.length > 0
  if (trapped) console.warn('[contact] hidden field filled, delivering flagged')

  const name = (body.name ?? '').trim().slice(0, 120)
  const email = (body.email ?? '').trim().slice(0, 200)
  const subject = (body.subject ?? '').trim().slice(0, 200)
  const message = (body.message ?? '').trim().slice(0, 5000)

  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!email || !EMAIL_RE.test(email))
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!message)
    return NextResponse.json({ error: 'Please include a message.' }, { status: 400 })

  // The transfers page's "Ask for a price" form gets its own auto-reply: the
  // general one echoed the team's internal note to the guest and guessed a
  // first name from the email address. Pages loaded before Oct 27 2026 send
  // only the subject and message, so the subject also identifies the form.
  const legacy = subject.startsWith(PRICE_SUBJECT_PREFIX)
  const priceRequest =
    body.kind === 'price_request' || legacy
      ? {
          hotel: (typeof body.hotel === 'string' && body.hotel.trim()
            ? body.hotel
            : legacy ? subject.slice(PRICE_SUBJECT_PREFIX.length) : ''
          ).trim().slice(0, 200),
          tripType: (body.tripType === 'one_way' || (!body.tripType && /Trip type: One-way/.test(message))
            ? 'one_way'
            : 'round_trip') as 'one_way' | 'round_trip',
          passengers: Math.min(50, Math.max(1, Math.round(
            Number(body.passengers) || Number(message.match(/Passengers: (\d+)/)?.[1]) || 1,
          ))),
        }
      : null

  const submittedAt = new Date().toISOString()
  const firstName = name.split(/\s+/)[0]

  // Both messages are sent FROM the contact inbox so visitors see a
  // consistent sender ("MAPL Tours <contact@mapltours.com>") and any
  // bounce / out-of-office reply lands back in the contact inbox where
  // it can be handled.
  const CONTACT_FROM = 'MAPL Tours <contact@mapltours.com>'

  // 3. Ops alert, load-bearing. Failure = 500 so the user can retry.
  const opsRes = await sendEmail({
    to: 'contact@mapltours.com',
    from: CONTACT_FROM,
    subject:
      (trapped ? '[Check: hidden field filled] ' : '') +
      (subject
        ? `MAPL Tours Jamaica · Contact · ${subject}`
        : `MAPL Tours Jamaica · Contact · message from ${name}`),
    replyTo: email,
    react: ContactMessage({
      name,
      email,
      subject,
      message: trapped
        ? `Check this one: the form's hidden anti-spam field came back filled with "${hidden}". ` +
          `That is either a bot or the visitor's browser filling a hidden field, so read it before replying.\n\n${message}`
        : message,
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
  //    because the message DID reach the team. Never to a flagged message.
  if (trapped) return NextResponse.json({ ok: true })
  const replyRes = priceRequest?.hotel
    ? await sendEmail({
        to: email,
        from: CONTACT_FROM,
        subject: PRICE_REQUEST_REPLY_SUBJECT,
        react: PriceRequestAutoReply(priceRequest),
        tags: [{ name: 'category', value: 'price_request_auto_reply' }],
      })
    : await sendEmail({
        to: email,
        from: CONTACT_FROM,
        subject: 'We got your message, MAPL Tours Jamaica',
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
