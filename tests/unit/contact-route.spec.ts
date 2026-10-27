import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => false, getIp: () => '203.0.113.9' }))
const sent: { to: string; subject: string; react: ReactElement }[] = []
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (m: { to: string; subject: string; react: ReactElement }) => {
    sent.push({ to: m.to, subject: m.subject, react: m.react })
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

  // Oct 27 2026: the price form's guest reply echoed the team's internal note
  // ("add the property to DESTINATIONS") and guessed a name from the email.
  test('a price request gets the price reply, with no internal note and no guessed name', async () => {
    const r = await POST(req({
      ...ask,
      name: 'guest',
      message: `${ask.message}\n\nReply with a flat quote, and add the property to DESTINATIONS if we serve it.`,
      kind: 'price_request', hotel: 'Villa Test', tripType: 'round_trip', passengers: 2, website: '',
    }))
    expect(r.status).toBe(200)
    expect(sent[1].to).toBe('guest@example.com')
    expect(sent[1].subject).toBe('Your ride price is on its way, MAPL Tours Jamaica')
    const text = await render(sent[1].react, { plainText: true })
    expect(text).toContain('Villa Test')
    expect(text).toContain('Round trip')
    expect(text).toMatch(/usually the same day/)
    expect(text).not.toMatch(/DESTINATIONS|could not find their hotel|Thanks, guest/)
    expect(text).not.toContain('\u2014')
    expect(text).toContain('MAPL Tours Jamaica')
    // The team's own copy keeps the internal note.
    expect(await render(sent[0].react, { plainText: true })).toContain('DESTINATIONS')
  })

  test('a price request from a page loaded before the change is recognised by its subject', async () => {
    await POST(req({
      ...ask,
      subject: 'Unlisted hotel · Villa Old',
      message: 'A visitor could not find their hotel in the transfers picker.\n\nHotel or address: Villa Old\nTrip type: One-way\nPassengers: 3',
      website: '',
    }))
    expect(sent[1].subject).toBe('Your ride price is on its way, MAPL Tours Jamaica')
    const text = await render(sent[1].react, { plainText: true })
    expect(text).toContain('Villa Old')
    expect(text).toContain('One way')
    expect(text).toMatch(/Passengers\s*3/)
  })

  test('the general contact form keeps the general reply', async () => {
    await POST(req({ name: 'Ana', email: 'ana@example.com', subject: 'Question', message: 'Do you do weddings?', website: '' }))
    expect(sent[1].subject).toBe('We got your message, MAPL Tours Jamaica')
    expect(await render(sent[1].react, { plainText: true })).not.toContain('team in Jamaica')
  })

  test('invalid requests send nothing', async () => {
    expect((await POST(req({ ...ask, email: 'nope' }))).status).toBe(400)
    expect((await POST(req({ ...ask, message: '' }))).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})
