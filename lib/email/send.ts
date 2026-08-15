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

const FROM_FALLBACK = 'MAPL Tours <contact@mapltours.com>'
const REPLY_TO_FALLBACK = 'contact@mapltours.com'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

/**
 * Normalize an `EMAIL_FROM` / `EMAIL_SUPPORT` env value into one of the two
 * formats Resend accepts:
 *   • `email@example.com`
 *   • `Display Name <email@example.com>`
 *
 * Repairs a handful of common env-config mistakes that otherwise produce a
 * `validation_error: Invalid \`from\` field` from Resend with no further
 * useful detail:
 *   • Wrapping quotes (`"MAPL <…>"`)
 *   • Smart unicode angle brackets (`MAPL ‹…›`)
 *   • Missing angle brackets (`MAPL Tours contact@mapltours.com`)
 *   • Stray internal whitespace (`MAPL Tours <  trips@…  >`)
 *
 * Anything we can't repair cleanly falls back to a known-good default so
 * a misconfigured env never blocks a paid transaction.
 */
function normalizeAddress(raw: string | undefined, fallback: string, label: string): string {
  if (!raw || !raw.trim()) return fallback
  let s = raw.trim()

  // Strip wrapping quotes.
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }

  // Replace smart / fullwidth angle brackets with ASCII < >.
  s = s.replace(/[‹⟨〈＜]/g, '<').replace(/[›⟩〉＞]/g, '>')

  const emailRe = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  const bareValid = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
  const namedValid = /^[^<>]+<\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*>$/i

  if (bareValid.test(s)) return s
  if (namedValid.test(s)) {
    // Normalize the spacing inside the angle brackets.
    return s.replace(
      /<\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*>/i,
      '<$1>',
    )
  }

  // Recovery, pull out the email and rewrap it cleanly.
  const match = s.match(emailRe)
  if (match) {
    const email = match[0]
    const namePart = s.replace(email, '').replace(/[<>"']/g, '').trim()
    const repaired = namePart ? `${namePart} <${email}>` : email
    console.warn(`[email] normalized malformed ${label} env value`, {
      raw,
      repaired,
    })
    return repaired
  }

  console.warn(`[email] ${label} env value couldn't be parsed; using fallback`, {
    raw,
    fallback,
  })
  return fallback
}

export interface SendEmailInput {
  to: string | string[]
  subject: string
  react: React.ReactElement
  /** Override the default sender (EMAIL_FROM) for category-specific outboxes,
   *  e.g. the contact form sending from `contact@mapltours.com`. */
  from?: string
  /** Override the default reply-to (support@…) for category-specific inboxes */
  replyTo?: string
  /** Optional Resend tags for filtering in their dashboard */
  tags?: { name: string; value: string }[]
  /** Blind copies. Used so operations and the driver receive exactly what the
   *  guest received, without either address appearing in the guest's headers. */
  bcc?: string | string[]
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail({
  to, subject, react, from, replyTo, tags, bcc,
}: SendEmailInput): Promise<SendEmailResult> {
  if (!resend) {
    // Dev convenience, no Resend key means we only log.
    console.warn('[email] RESEND_API_KEY not set, would have sent:', subject, 'to', to)
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  const defaultFrom = normalizeAddress(process.env.EMAIL_FROM, FROM_FALLBACK, 'EMAIL_FROM')
  const finalFrom = from
    ? normalizeAddress(from, defaultFrom, 'from')
    : defaultFrom
  const fallbackReplyTo = normalizeAddress(
    process.env.EMAIL_SUPPORT,
    REPLY_TO_FALLBACK,
    'EMAIL_SUPPORT',
  )
  const finalReplyTo = replyTo
    ? normalizeAddress(replyTo, fallbackReplyTo, 'replyTo')
    : fallbackReplyTo

  try {
    const html = await render(react)
    const text = await render(react, { plainText: true })

    const { data, error } = await resend.emails.send({
      from: finalFrom,
      to,
      subject,
      html,
      text,
      replyTo: finalReplyTo,
      // Empty arrays are rejected by Resend, so only include when present.
      ...(bcc && (Array.isArray(bcc) ? bcc.length : bcc) ? { bcc } : {}),
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

const list = (v: string | undefined): string[] =>
  (v ?? '').split(',').map((e) => e.trim()).filter((e) => e.includes('@'))

/**
 * Who gets a blind copy of guest-facing operational mail: MAPL operations and
 * the driver, so both hold exactly what the guest holds.
 *
 * The driver copy resolves from DRIVER_NOTIFY_EMAIL, or from
 * DRIVER_ALLOWED_EMAILS only while that names EXACTLY ONE driver. With a
 * second driver on the allowlist we cannot tell from an address list which one
 * is on this trip, and copying all of them would hand every driver every
 * guest's name, hotel and flight. So it copies none and says so: a missing BCC
 * is recoverable, a leak is not.
 */
/**
 * The driver's own inbox, for mail addressed TO the driver (payment notices).
 * DRIVER_NOTIFY_EMAIL wins; a single-entry allowlist is unambiguous enough to
 * use; with several drivers and no explicit notify address we return null and
 * the caller skips the send, because guessing means mailing the wrong driver.
 */
export function driverNotifyEmail(): string | null {
  const notify = list(process.env.DRIVER_NOTIFY_EMAIL)
  if (notify.length) return notify[0]
  const allowed = list(process.env.DRIVER_ALLOWED_EMAILS)
  return allowed.length === 1 ? allowed[0] : null
}

export function opsBcc(guestEmail?: string | null, extra?: (string | null | undefined)[]): string[] {
  const ops = list(process.env.OPERATIONS_EMAIL ?? 'tech@mapltech.com')

  const notify = list(process.env.DRIVER_NOTIFY_EMAIL)
  const allowed = list(process.env.DRIVER_ALLOWED_EMAILS)
  let drivers: string[] = notify
  if (!notify.length) {
    if (allowed.length === 1) drivers = allowed
    else if (allowed.length > 1) {
      console.warn('[email] %d drivers on the allowlist, so no driver was BCCed. Set DRIVER_NOTIFY_EMAIL.', allowed.length)
    }
  }

  const all = [...ops, ...drivers, ...(extra ?? [])]
    .filter((e): e is string => !!e && e.includes('@'))
    .map((e) => e.toLowerCase())
  const guest = (guestEmail ?? '').toLowerCase()
  return Array.from(new Set(all)).filter((e) => e !== guest)
}
