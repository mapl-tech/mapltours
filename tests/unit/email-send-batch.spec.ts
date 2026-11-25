import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * sendEmailBatch (lib/email/send): several separate emails in one Resend
 * request, for the travel party's copies (Nov 24 2026). Resend allows 10
 * requests a second, so a party of up to 12 sent one request each, right after
 * the booker's email, could have its last copies refused.
 *
 * Each email in the batch is still its own: one recipient, its own words and
 * headers, never a CC or BCC. One refused address must not hold back the rest
 * (permissive validation), each result must land on the right person, and a
 * slow or failed request must report every copy as not sent.
 */
const mail = vi.hoisted(() => ({
  calls: [] as Array<{ payload: Array<Record<string, unknown>>; options?: Record<string, unknown> }>,
  delay: 0,
  answer: { data: { data: [] as { id: string }[], errors: [] as { index: number; message: string }[] }, error: null } as {
    data: unknown
    error: null | { message: string }
  },
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: () => Promise.reject(new Error('single sends are not used here')) }
    batch = {
      send: (payload: Array<Record<string, unknown>>, options?: Record<string, unknown>) => {
        mail.calls.push({ payload, options })
        return new Promise((resolve) => setTimeout(() => resolve(mail.answer), mail.delay))
      },
    }
  },
}))

let sendEmailBatch: typeof import('@/lib/email/send').sendEmailBatch
let p: (text: string) => React.ReactElement

beforeEach(async () => {
  process.env.RESEND_API_KEY = 'test'
  process.env.EMAIL_FROM = 'MAPL Tours Jamaica <trips@mapltours.com>'
  process.env.EMAIL_SUPPORT = 'contact@mapltours.com'
  mail.calls = []
  mail.delay = 0
  mail.answer = { data: { data: [{ id: 'em_1' }, { id: 'em_2' }, { id: 'em_3' }], errors: [] }, error: null }
  ;({ sendEmailBatch } = await import('@/lib/email/send'))
  const { createElement } = await import('react')
  p = (text: string) => createElement('p', null, text)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const three = () => [
  { to: 'a@example.com', subject: 'One', react: p('for a'), headers: { 'List-Unsubscribe': '<https://mapltours.com/stop?a>' }, tags: [{ name: 'type', value: 'travel_party_review' }] },
  { to: 'b@example.com', subject: 'One', react: p('for b'), headers: { 'List-Unsubscribe': '<https://mapltours.com/stop?b>' } },
  { to: 'c@example.com', subject: 'One', react: p('for c') },
]

describe('sendEmailBatch', () => {
  test('one request; each email its own recipient, words and headers; never a CC or BCC', async () => {
    const res = await sendEmailBatch(three(), { idempotencyKey: 'travel-party-batch/abc', timeoutMs: 2500 })
    expect(res).toEqual({ ok: true, results: [{ ok: true, id: 'em_1' }, { ok: true, id: 'em_2' }, { ok: true, id: 'em_3' }] })
    expect(mail.calls).toHaveLength(1)
    const { payload, options } = mail.calls[0]
    expect(options).toEqual({ idempotencyKey: 'travel-party-batch/abc', batchValidation: 'permissive' })
    expect(payload.map((e) => e.to)).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
    for (const e of payload) {
      expect(typeof e.to).toBe('string')
      expect(e).not.toHaveProperty('cc')
      expect(e).not.toHaveProperty('bcc')
      // The same sender and reply line as every other email.
      expect(e.from).toBe('MAPL Tours Jamaica <trips@mapltours.com>')
      expect(e.replyTo).toBe('contact@mapltours.com')
      // HTML and a plain-text alternative, each the person's own words.
      expect(String(e.html)).toContain(`for ${String(e.to)[0]}`)
      expect(String(e.text)).toContain(`for ${String(e.to)[0]}`)
    }
    expect(payload[0].headers).toEqual({ 'List-Unsubscribe': '<https://mapltours.com/stop?a>' })
    expect(payload[0].tags).toEqual([{ name: 'type', value: 'travel_party_review' }])
    // Nothing empty is sent: Resend refuses empty arrays and objects.
    expect(payload[2]).not.toHaveProperty('headers')
    expect(payload[2]).not.toHaveProperty('tags')
  })

  test('one refused address does not hold back the others, and each result lands on its own person', async () => {
    mail.answer = { data: { data: [{ id: 'em_a' }, { id: 'em_c' }], errors: [{ index: 1, message: 'Invalid `to` field' }] }, error: null }
    const res = await sendEmailBatch(three(), { idempotencyKey: 'k' })
    expect(res.ok).toBe(true)
    expect(res.results).toEqual([{ ok: true, id: 'em_a' }, { ok: false, error: 'Invalid `to` field' }, { ok: true, id: 'em_c' }])
  })

  test('a refused or failed request: every copy is reported as not sent', async () => {
    mail.answer = { data: null, error: { message: 'rate_limit_exceeded' } }
    const res = await sendEmailBatch(three(), { idempotencyKey: 'k' })
    expect(res.ok).toBe(false)
    expect(res.results).toHaveLength(3)
    expect(res.results.every((r) => !r.ok && r.error === 'rate_limit_exceeded')).toBe(true)
  })

  test('a slow request stops waiting at its limit and reports every copy as not sent', async () => {
    mail.delay = 200
    const t0 = Date.now()
    const res = await sendEmailBatch(three(), { idempotencyKey: 'k', timeoutMs: 40 })
    expect(Date.now() - t0).toBeLessThan(180)
    expect(res).toMatchObject({ ok: false, error: 'timeout' })
    expect(res.results.every((r) => !r.ok)).toBe(true)
  })

  test('nothing to send is not a request; more than 100 is refused before any request', async () => {
    expect(await sendEmailBatch([], { idempotencyKey: 'k' })).toEqual({ ok: true, results: [] })
    const many = Array.from({ length: 101 }, (_, i) => ({ to: `p${i}@example.com`, subject: 's', react: p('x') }))
    const res = await sendEmailBatch(many, { idempotencyKey: 'k' })
    expect(res.ok).toBe(false)
    expect(res.results).toHaveLength(101)
    expect(mail.calls).toHaveLength(0)
  })
})
