import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * sendEmail's two options for a send that may be repeated (Nov 13 2026).
 *
 * The paid-booking emails are claimed as sent BEFORE they are sent. A send
 * that stalled until the platform killed the function left the claim in place
 * and nothing retried it: a guest who paid and never heard. And a send Resend
 * took whose answer was lost came back "failed", so the retry delivered a
 * second copy. `timeoutMs` bounds the wait; `dedupe` makes the retry of the
 * same message a no-op at Resend.
 */
const mail = vi.hoisted(() => ({
  calls: [] as Array<{ payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  /** How long the fake service takes to answer, in ms. */
  delay: 0,
  answer: { data: { id: 'em_1' }, error: null } as { data: unknown; error: null | { message: string } },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
        mail.calls.push({ payload, options })
        return new Promise((resolve) => setTimeout(() => resolve(mail.answer), mail.delay))
      },
    }
  },
}))

let sendEmail: typeof import('@/lib/email/send').sendEmail
let CONFIRMATION_SEND: typeof import('@/lib/email/confirmation-send').CONFIRMATION_SEND
let p: (text: string) => React.ReactElement

beforeEach(async () => {
  process.env.RESEND_API_KEY = 'test'
  mail.calls = []
  mail.delay = 0
  mail.answer = { data: { id: 'em_1' }, error: null }
  ;({ sendEmail } = await import('@/lib/email/send'))
  ;({ CONFIRMATION_SEND } = await import('@/lib/email/confirmation-send'))
  const { createElement } = await import('react')
  p = (text: string) => createElement('p', null, text)
})

const keyOf = (i: number) => (mail.calls[i].options as { idempotencyKey?: string } | undefined)?.idempotencyKey

describe('a send that may be repeated', () => {
  test('the same message sent twice carries the same key, so the service delivers it once', async () => {
    await sendEmail({ to: 'guest@example.com', subject: 'Booking confirmed', react: p('Your trip is booked.'), dedupe: 'booking-confirmed/b1' })
    await sendEmail({ to: 'guest@example.com', subject: 'Booking confirmed', react: p('Your trip is booked.'), dedupe: 'booking-confirmed/b1' })
    expect(keyOf(0)).toMatch(/^booking-confirmed\/b1\/[0-9a-f]{32}$/)
    expect(keyOf(1)).toBe(keyOf(0))
  })

  test('a message that changed in between is a new send, never one the service refuses for reusing a key', async () => {
    await sendEmail({ to: 'guest@example.com', subject: 'Booking confirmed', react: p('Paid by card $100.00'), dedupe: 'booking-confirmed/b1' })
    await sendEmail({ to: 'guest@example.com', subject: 'Booking confirmed', react: p('Paid by card $60.00'), dedupe: 'booking-confirmed/b1' })
    await sendEmail({ to: 'other@example.com', subject: 'Booking confirmed', react: p('Paid by card $60.00'), dedupe: 'booking-confirmed/b1' })
    expect(new Set([keyOf(0), keyOf(1), keyOf(2)]).size).toBe(3)
  })

  test('two different emails about one booking never share a key', async () => {
    await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), dedupe: 'booking-confirmed/b1' })
    await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), dedupe: 'operator-alert/b1' })
    expect(keyOf(0)).not.toBe(keyOf(1))
  })

  test('an explicit idempotency key wins, and without either option nothing is added', async () => {
    await sendEmail({ to: 'a@example.com', subject: 's', react: p('x'), dedupe: 'ignored/1', idempotencyKey: 'mine' })
    await sendEmail({ to: 'a@example.com', subject: 's', react: p('x') })
    expect(keyOf(0)).toBe('mine')
    expect(mail.calls[1].options).toBeUndefined()
  })
})

describe('a send that stalls', () => {
  test('reports a failure after the limit instead of waiting for ever', async () => {
    mail.delay = 400
    const started = Date.now()
    const res = await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), timeoutMs: 60, dedupe: 'booking-confirmed/b1' })
    expect(res).toEqual({ ok: false, error: 'timeout' })
    expect(Date.now() - started).toBeLessThan(350)
    // The retry that follows carries the same key as the send that stalled.
    mail.delay = 0
    const again = await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), timeoutMs: 60, dedupe: 'booking-confirmed/b1' })
    expect(again.ok).toBe(true)
    expect(keyOf(1)).toBe(keyOf(0))
  })

  test('a send that answers in time is unaffected, success or refusal', async () => {
    mail.delay = 10
    expect(await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), timeoutMs: 500 })).toEqual({ ok: true, id: 'em_1' })
    mail.answer = { data: null, error: { message: 'rate limited' } }
    expect(await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x'), timeoutMs: 500 })).toEqual({ ok: false, error: 'rate limited' })
  })

  test('with no limit set it waits, as every other sender still does', async () => {
    mail.delay = 120
    expect((await sendEmail({ to: 'guest@example.com', subject: 's', react: p('x') })).ok).toBe(true)
  })

  test('the booking emails are bounded well inside the platform\'s 10 seconds', () => {
    expect(CONFIRMATION_SEND.timeoutMs).toBeGreaterThanOrEqual(2000)
    // Two emails, with room left for the paid transition and the calendar sync.
    expect(CONFIRMATION_SEND.timeoutMs * 2).toBeLessThanOrEqual(8000)
  })
})
