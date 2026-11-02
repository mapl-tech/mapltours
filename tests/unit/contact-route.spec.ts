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

// The team's copy as one line of plain text (the renderer wraps long lines).
const teamText = async (react: ReactElement) => (await render(react, { plainText: true })).replace(/\s+/g, ' ')
const REPLIED = 'the visitor has already been sent an automated confirmation'
const NOT_REPLIED = 'The visitor was not sent an automated confirmation'

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
    const team = await teamText(sent[0].react)
    expect(team).toContain(REPLIED)
    expect(team).not.toContain(NOT_REPLIED)
  })

  // Oct 26 2026: browsers filled the hidden field for real people and their
  // requests vanished. A filled field is now flagged, never dropped.
  test('a filled hidden field still reaches the inbox, flagged, with no auto-reply', async () => {
    const r = await POST(req({ ...ask, website: 'https://example.com' }))
    expect(r.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('contact@mapltours.com')
    expect(sent[0].subject).toBe('[Check: hidden field filled] MAPL Tours Jamaica · Contact · Unlisted hotel · Villa Test')
    const team = await teamText(sent[0].react)
    expect(team).toContain('hidden anti-spam field came back filled with "https://example.com"')
    expect(team).toContain(NOT_REPLIED)
    expect(team).not.toContain(REPLIED)
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

  // Nov 2 2026: the same bot, through Tor, typing only a number under a
  // made-up name from a different ordinary address each time, which the spam
  // rules cannot tell from a guest. The team still sees every post, flagged;
  // the address typed gets nothing. (The addresses here are stand-ins.)
  test('a post with no real words reaches the team flagged, and the address typed gets nothing', async () => {
    const posts = [
      { name: 'Jqvsph Rfrwvkpsz', email: 'one@example.com', message: '9776134824' },
      { name: 'Isinjcg Rlrvisa', email: 'two@example.net', message: '6264464967' },
      { name: 'Ienio Rllcet', email: 'three@example.org', message: '6363537966' },
    ]
    for (const body of posts) {
      const r = await POST(req({ ...body, subject: '', website: '' }))
      expect(r.status).toBe(200)
      expect(await r.json()).toEqual({ ok: true })
    }
    expect(sent.map((m) => m.to)).toEqual(Array(3).fill('contact@mapltours.com'))
    expect(sent[2].subject).toBe('[Check: no words] MAPL Tours Jamaica · Contact · message from Ienio Rllcet')
    const team = await teamText(sent[2].react)
    expect(team).toContain('6363537966')
    expect(team).toContain('three@example.org')
    expect(team).toContain('Check this one: it has no real words in it')
    expect(team).toContain(NOT_REPLIED)
    expect(team).not.toContain(REPLIED)
  })

  test('the partner and price forms with nothing typed but a number are flagged too; one word gets the reply', async () => {
    await POST(req({
      name: 'Rpaz Ihylrye', email: 'four@example.com',
      subject: 'Partner enquiry · General',
      message: 'Business / operation: (not given)\nParish or area: (not given)\nType: (not given)\n\n2033162635',
      website: '',
    }))
    await POST(req({ ...ask, subject: 'Unlisted hotel · 1234', kind: 'price_request', hotel: '1234', tripType: 'one_way', passengers: 2, website: '' }))
    expect(sent.map((m) => m.to)).toEqual(['contact@mapltours.com', 'contact@mapltours.com'])
    expect(sent.every((m) => m.subject.startsWith('[Check: no words] '))).toBe(true)
    sent.length = 0
    await POST(req({ name: 'Ana', email: 'ana@example.com', subject: '', message: 'Call me 8765551234', website: '' }))
    expect(sent.map((m) => m.to)).toEqual(['contact@mapltours.com', 'ana@example.com'])
    expect(sent[0].subject).toBe('MAPL Tours Jamaica · Contact · message from Ana')
  })

  test('a filled hidden field with no words is flagged once in the subject and explained twice', async () => {
    await POST(req({ name: 'Ienio Rllcet', email: 'three@example.org', subject: '', message: '6363537966', website: 'x' }))
    expect(sent).toHaveLength(1)
    expect(sent[0].subject).toBe('[Check: hidden field filled] MAPL Tours Jamaica · Contact · message from Ienio Rllcet')
    const team = await teamText(sent[0].react)
    expect(team).toContain('hidden anti-spam field came back filled')
    expect(team).toContain('it has no real words in it')
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
    // The team's copy says which visitors heard from us.
    const team = await Promise.all(sent.filter((m) => m.to === 'contact@mapltours.com').map((m) => teamText(m.react)))
    expect(team.map((t) => t.includes(REPLIED))).toEqual([true, true, false, false, true])
    expect(team.map((t) => t.includes(NOT_REPLIED))).toEqual([false, false, true, true, false])
  })

  test('invalid requests send nothing', async () => {
    expect((await POST(req({ ...ask, email: 'nope' }))).status).toBe(400)
    expect((await POST(req({ ...ask, message: '' }))).status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  test('a body that is not the form\'s shape is refused, never a crash', async () => {
    expect((await POST(req({ name: 1, email: ['guest@example.com'], message: { a: 1 }, website: 2 }))).status).toBe(400)
    const raw = (body: string) => new NextRequest('https://mapltours.com/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })
    expect((await POST(raw('null'))).status).toBe(400)
    expect((await POST(raw('"hello"'))).status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  // A page on another site can post text/plain without asking (no CORS
  // preflight); JSON makes the browser ask, and this route never says yes.
  test('a post that is not JSON is refused before anything is sent', async () => {
    const r = await POST(new NextRequest('https://mapltours.com/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ name: 'Ana', email: 'ana@example.com', message: 'Do you do weddings?' }),
    }))
    expect(r.status).toBe(415)
    expect(sent).toHaveLength(0)
  })

  // The reply goes to an address nobody verified, so a spammer could have
  // used it to deliver their own words to a stranger from our domain.
  test('the auto-reply says back nothing the visitor typed; the team gets all of it', async () => {
    await POST(req({
      name: 'bit.ly/win Smith',
      email: 'victim@example.com',
      subject: 'Your PayPal account is locked',
      message: 'Call +1 (876) 555-0100 now or visit https://evil.example/claim to keep your account.',
      website: '',
    }))
    expect(sent.map((m) => m.to)).toEqual(['contact@mapltours.com', 'victim@example.com'])
    const reply = await render(sent[1].react, { plainText: true })
    expect(reply).toMatch(/Thanks, there, we got it\./i)
    expect(reply).not.toMatch(/bit\.ly|PayPal|locked|555|evil|claim/i)
    const team = await render(sent[0].react, { plainText: true })
    expect(team).toContain('https://evil.example/claim')
    expect(sent[0].subject).toBe('MAPL Tours Jamaica · Contact · Your PayPal account is locked')
  })

  test('a real first name is still used, and a name or subject cannot add lines to a subject', async () => {
    await POST(req({ name: 'José\r\nBcc: x@example.com', email: 'jose@example.com', subject: 'Hi\nthere', message: 'Do you go to Negril?', website: '' }))
    expect(sent[0].subject).toBe('MAPL Tours Jamaica · Contact · Hi there')
    expect(await render(sent[1].react, { plainText: true })).toMatch(/Thanks, José, we got it\./i)
    sent.length = 0
    await POST(req({ name: 'José Bcc: x@example.com', email: 'jose@example.com', subject: '', message: 'Do you go to Negril?', website: '' }))
    expect(sent[0].subject).toBe('MAPL Tours Jamaica · Contact · message from José Bcc: x@example.com')
  })

  test('a price request names the hotel back only when it reads as a place', async () => {
    const priceReply = async (hotel: string) => {
      sent.length = 0
      await POST(req({ ...ask, subject: `Unlisted hotel · ${hotel}`, kind: 'price_request', hotel, tripType: 'one_way', passengers: 3, website: '' }))
      expect(sent[1].subject).toBe('Your ride price is on its way, MAPL Tours Jamaica')
      return render(sent[1].react, { plainText: true })
    }
    for (const bad of ['evil.com/claim', 'Call 876-555-0100 to keep your booking', 'www.example.org', 'help@example.com', 'https://example.com']) {
      const text = await priceReply(bad)
      expect(text).toMatch(/We.re pricing your ride\./i)
      expect(text).not.toMatch(/evil|555|example|Call /i)
      expect(text).toContain('One way')
    }
    expect(await priceReply('Villa 12, St. James')).toMatch(/pricing your ride to Villa 12, St\. James\./i)
  })
})
