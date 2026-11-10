import { test, expect, vi } from 'vitest'

// The tour email's one-click unsubscribe and its once-only send ride on these
// two options; Resend's own record of a sent email never shows custom headers,
// so this is where they are proved.
const calls = vi.hoisted(() => [] as unknown[][])
vi.mock('resend', () => ({ Resend: class { emails = { send: async (...args: unknown[]) => { calls.push(args); return { data: { id: 'x' }, error: null } } } } }))

test('sendEmail passes headers and the idempotency key to Resend, and nothing extra without them', async () => {
  process.env.RESEND_API_KEY = 'test'
  const { sendEmail } = await import('../../lib/email/send')
  const { createElement } = await import('react')
  const headers = { 'List-Unsubscribe': '<https://mapltours.com/api/trip-tips/unsubscribe?e=x&t=y>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  expect((await sendEmail({ to: 'a@example.com', subject: 's', react: createElement('p', null, 'hi'), headers, idempotencyKey: 'k1' })).ok).toBe(true)
  const [payload, options] = calls[0] as [Record<string, unknown>, Record<string, unknown>]
  expect(payload.headers).toEqual(headers)
  expect(options).toEqual({ idempotencyKey: 'k1' })
  await sendEmail({ to: 'a@example.com', subject: 's', react: createElement('p', null, 'hi') })
  expect(calls[1]).toHaveLength(1)
  expect((calls[1][0] as Record<string, unknown>).headers).toBeUndefined()
})
