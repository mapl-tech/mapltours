import { createHash } from 'crypto'
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
  /** Extra message headers, e.g. List-Unsubscribe on marketing mail. */
  headers?: Record<string, string>
  /** Resend idempotency key, so a retried send can never deliver twice. */
  idempotencyKey?: string
  /**
   * Names WHAT this email is ("booking-confirmed/<booking id>"), for a send
   * the caller may repeat after an unclear failure: the Stripe webhook is
   * redelivered when a confirmation did not come back as sent, and "did not
   * come back" includes "Resend took it and the answer was lost".
   *
   * It becomes a Resend idempotency key together with a fingerprint of the
   * message itself, so a repeat of the SAME message inside Resend's 24-hour
   * window is delivered once, while a message that changed in between is a
   * new send. (A bare key reused with different content is refused by Resend,
   * which would hold a changed confirmation back for a day.)
   * Ignored when `idempotencyKey` is given.
   */
  dedupe?: string
  /**
   * Stop waiting for Resend after this long and report a failure. Without
   * it a stalled send holds the caller until the platform kills the function,
   * AFTER the caller has claimed the email as sent, so nothing ever retries
   * and the guest never gets it. Use it with `dedupe`, so the retry that
   * follows cannot deliver a second copy of a send that was only slow.
   */
  timeoutMs?: number
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

const TIMED_OUT = Symbol('timed out')

/** A short, stable fingerprint of exactly what is being sent. */
function messageFingerprint(to: string | string[], subject: string, html: string): string {
  return createHash('sha256').update(JSON.stringify([to, subject, html])).digest('hex').slice(0, 32)
}

export async function sendEmail({
  to, subject, react, from, replyTo, tags, bcc, headers, idempotencyKey, dedupe, timeoutMs,
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

    const key = idempotencyKey ?? (dedupe ? `${dedupe}/${messageFingerprint(to, subject, html)}` : undefined)
    const sending = resend.emails.send({
      from: finalFrom,
      to,
      subject,
      html,
      text,
      replyTo: finalReplyTo,
      // Empty arrays are rejected by Resend, so only include when present.
      ...(bcc && (Array.isArray(bcc) ? bcc.length : bcc) ? { bcc } : {}),
      ...(headers && Object.keys(headers).length ? { headers } : {}),
      tags,
    }, ...(key ? [{ idempotencyKey: key }] : []))

    let timer: ReturnType<typeof setTimeout> | undefined
    const outcome = timeoutMs && timeoutMs > 0
      ? await Promise.race([
          sending,
          new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs) }),
        ]).finally(() => clearTimeout(timer))
      : await sending
    if (outcome === TIMED_OUT) {
      // The request may still land. Whoever retries carries the same key, so
      // it cannot become a second delivery. A late rejection is swallowed.
      sending.catch(() => {})
      console.error('[email] send timed out', { subject, to, timeoutMs })
      return { ok: false, error: 'timeout' }
    }
    const { data, error } = outcome

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

/**
 * A real address, not merely a string with an @ in it.
 *
 * Stricter than the pattern normalizeAddress uses, deliberately: the domain is
 * dot-separated labels rather than "anything containing dots", so `a@b..com`
 * and `a@b` are both rejected. This guards a send whose OTHER recipient is the
 * operations inbox, and Resend fails the whole send on one bad address.
 */
const VALID_EMAIL = /^[A-Z0-9._%+-]+@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}$/i

/**
 * Who gets a "new booking" or "new transfer" alert: operations, and the driver
 * who has to run it.
 *
 * The driver is the point of this. Everything he used to receive was a BCC of
 * mail addressed to someone else, so his inbox was a pile of other people's
 * receipts; this is the first message actually addressed to him, arriving the
 * moment a booking lands, with the pickup, the drop-off and the guest's
 * requested collection time laid out for the person driving rather than the
 * person travelling.
 *
 * On disclosure: the alert shows the total paid and the per-line prices, and
 * nothing else financial. Both guest templates suppress the subtotal and the
 * booking fee outright (TransferConfirmed sets showBreakdown to false), so no
 * number here reveals a margin the driver could not already derive from the
 * total and his own agreed rate.
 *
 * Driver resolution is deliberately the same rule used everywhere else, via
 * driverNotifyEmail(): with several drivers on the allowlist and no explicit
 * notify address it returns null and nobody is added, because mailing every
 * driver every guest's details is worse than mailing none.
 *
 * The address is validated properly rather than checked for an '@'. Resend
 * rejects a whole send if ANY recipient is malformed, so a fat-fingered
 * DRIVER_NOTIFY_EMAIL would otherwise take the operations alert down with it,
 * turning a driver's typo into a booking nobody is told about.
 */
export function operatorAlertRecipients(ops: string[]): string[] {
  const driver = driverNotifyEmail()
  return Array.from(
    new Set(
      [...ops, driver]
        .filter((e): e is string => !!e && VALID_EMAIL.test(e.trim()))
        .map((e) => e.trim().toLowerCase()),
    ),
  )
}

/**
 * BCC for the guest's own CONFIRMATION: operations, and nobody else.
 *
 * The driver is deliberately absent. He used to be copied here, which meant
 * every booking reached him twice, once as a blind copy of a letter addressed
 * to someone else. He gets the operator alert instead, which is addressed to
 * him, arrives at the same moment, and is written for the person running the
 * trip rather than for the person taking it. Owner's decision, 2026-08-19.
 *
 * Note this is only the CONFIRMATION. The day-of mail and the manual dispatch
 * send still use opsBcc() and still copy him, because those are the messages
 * about the run itself: the day-of email is largely his own name, vehicle and
 * number, and he should see exactly what the guest was told.
 */
export function confirmationBcc(guestEmail?: string | null): string[] {
  const ops = list(process.env.OPERATIONS_EMAIL ?? 'contact@mapltours.com')
  const guest = (guestEmail ?? '').toLowerCase()
  return Array.from(new Set(ops.map((e) => e.toLowerCase()))).filter((e) => e !== guest)
}

export function opsBcc(guestEmail?: string | null, extra?: (string | null | undefined)[]): string[] {
  const ops = list(process.env.OPERATIONS_EMAIL ?? 'contact@mapltours.com')

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
