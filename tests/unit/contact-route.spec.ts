import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
const sent: { to: string; subject: string }[] = []
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (m: { to: string; subject: string }) => {
    sent.push({ to: m.to, subject: m.subject })
    return { ok: true, id: 'test' }
  },
}))

import { POST } from '@/app/api/contact/route'

const req = (body: Record<string, unknown>) =>
  new NextRequest('https://mapltours.com/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const ask = {
  name: 'guest',
  email: 'guest@example.com',
  subject: 'Unlisted hotel · Villa Test',
  message: 'A visitor could not find their hotel in the transfers picker.',
}

describe('contact route', () => {
  beforeEach(() => { sent.length = 0 })

  test('a normal request reaches the inbox and the visitor gets the auto-reply', async () => {
    const r = await POST(req({ ...ask, website: '' }))
    expect(r.status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['contact@mapltours.com', 'guest@example.com'])
    expect(sent[0].subject).toBe('MAPL Tours Jamaica · Contact · Unlisted hotel · Villa Test')
  })

  // Oct 26 2026: browsers filled the hidden field for real people and their
  // requests vanished. A filled field is now flagged, never dropped.
  test('a filled hidden field still reaches the inbox, flagged, with no auto-reply', async () => {
    const r = await POST(req({ ...ask, website: 'https://example.com' }))
    expect(r.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('contact@mapltours.com')
    expect(sent[0].subject).toBe('[Check: hidden field filled] MAPL Tours Jamaica · Contact · Unlisted hotel · Villa Test')
  })

  test('invalid requests send nothing', async () => {
    expect((await POST(req({ ...ask, email: 'nope' }))).status).toBe(400)
    expect((await POST(req({ ...ask, message: '' }))).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})
