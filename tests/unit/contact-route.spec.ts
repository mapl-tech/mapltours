import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'

// The per-IP limit is off; the per-inbox reply limit runs for real only where
// a test turns it on, so the other tests can share one guest address.
const limits = vi.hoisted(() => ({ replies: false }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/rate-limit')>()
  return {
    getIp: () => '203.0.113.9',
    rateLimit: (key: string, opts: { windowMs: number; max: number; bucket: string }) =>
      limits.replies && opts.bucket === 'contact-reply' ? real.rateLimit(key, opts) : false,
  }
})
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

  // Oct 31 2026: bots through Tor, a dot-padded Gmail, nothing typed but a
  // number or random strings. These three are the real ones, as received.
  test('the Oct 31 spam sends nothing, not even to the team, and is told it worked', async () => {
    const spam = [
      { name: 'Opwgqo Fwmufq', email: 'd.u.l.uj.u.z.368@gmail.com', subject: '', message: '9073668193' },
      { name: 'Kathxkzv Buntnsqih', email: 'w.iz.imi.ja.g44.3@gmail.com', subject: '', message: '2033162635' },
      {
        name: 'Rpaz Ihylrye', email: 'w.iz.imi.ja.g44.3@gmail.com',
        subject: 'Partner enquiry · Guided experience or tour · Vcvsjglm LLC',
        message: 'Business / operation: Vcvsjglm LLC\nParish or area: jiOuTbHLjwyCPAoQP\nType: Guided experience or tour\n\njBiOJqqjeEKqpcxfT',
      },
    ]
    for (const body of spam) {
      const r = await POST(req({ ...body, website: '' }))
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true })
    }
    expect(sent).toHaveLength(0)
  })

  test('a real message from a dot-heavy Gmail still arrives and gets its reply', async () => {
    await POST(req({ name: 'Mary', email: 'mary.jane.watson.1990@gmail.com', subject: '', message: 'Can you pick us up at MBJ on Dec 3?', website: '' }))
    expect(sent.map((m) => m.to)).toEqual(['contact@mapltours.com', 'mary.jane.watson.1990@gmail.com'])
  })

  test('one inbox gets two auto-replies an hour, counting Gmail dot and +tag variants as one; the team gets every message', async () => {
    limits.replies = true
    try {
      for (const email of ['jane.doe@gmail.com', 'janedoe@gmail.com', 'j.anedoe@gmail.com', 'JaneDoe+trip@googlemail.com', 'other@example.com']) {
        await POST(req({ name: 'Jane', email, subject: 'Question', message: 'Do you go to Negril?', website: '' }))
      }
    } finally {
      limits.replies = false
    }
    expect(sent.filter((m) => m.to === 'contact@mapltours.com')).toHaveLength(5)
    expect(sent.filter((m) => m.to !== 'contact@mapltours.com').map((m) => m.to)).toEqual(['jane.doe@gmail.com', 'janedoe@gmail.com', 'other@example.com'])
  })

  test('invalid requests send nothing', async () => {
    expect((await POST(req({ ...ask, email: 'nope' }))).status).toBe(400)
    expect((await POST(req({ ...ask, message: '' }))).status).toBe(400)
    expect(sent).toHaveLength(0)
  })
})
