import { describe, test, expect, vi, afterEach } from 'vitest'
import { contactSpam, mailboxKey, noRealWords, paddedGmail, replyHotel, typedText } from '@/lib/contact-spam'
import { rateLimit } from '@/lib/rate-limit'

const partner = (business: string, parish: string, message: string, kind = 'Guided experience or tour') => ({
  subject: `Partner enquiry · ${kind}${business ? ` · ${business}` : ''}`,
  message:
    `Business / operation: ${business || '(not given)'}\n` +
    `Parish or area: ${parish || '(not given)'}\n` +
    `Type: ${kind}\n\n` +
    message,
})

const price = (hotel: string) => ({
  subject: `Unlisted hotel · ${hotel}`,
  message:
    `A visitor could not find their hotel in the transfers picker.\n\n` +
    `Hotel or address: ${hotel}\nTrip type: Round-trip\nPassengers: 2\n\n` +
    `Reply with a flat quote, and add the property to DESTINATIONS if we serve it.`,
})

describe('contact spam', () => {
  test('the three Oct 31 submissions, as received, are spam', () => {
    expect(contactSpam({ email: 'd.u.l.uj.u.z.368@gmail.com', subject: '', message: '9073668193' })).toBe('padded Gmail, no words')
    expect(contactSpam({ email: 'w.iz.imi.ja.g44.3@gmail.com', subject: '', message: '2033162635' })).toBe('padded Gmail, no words')
    expect(contactSpam({ email: 'w.iz.imi.ja.g44.3@gmail.com', ...partner('Vcvsjglm LLC', 'jiOuTbHLjwyCPAoQP', 'jBiOJqqjeEKqpcxfT') })).toBe('padded Gmail, no words')
  })

  test('the partner spam is held with its line breaks gone, or as \\r\\n', () => {
    const p = partner('Vcvsjglm LLC', 'jiOuTbHLjwyCPAoQP', 'jBiOJqqjeEKqpcxfT')
    for (const message of [p.message.replace(/\n+/g, ' '), p.message.replace(/\n/g, '\r\n')]) {
      expect(contactSpam({ email: 'w.iz.imi.ja.g44.3@gmail.com', subject: p.subject, message })).toBe('padded Gmail, no words')
    }
  })

  test('random strings with no words are spam from any address, and a business suffix does not save them', () => {
    expect(contactSpam({ email: 'someone@example.com', ...partner('Vcvsjglm LLC', 'jiOuTbHLjwyCPAoQP', 'jBiOJqqjeEKqpcxfT') })).toBe('random strings, no words')
    expect(contactSpam({ email: 'w.iz.imi.ja.g44.3@gmail.com', ...partner('Vcvsjglm Inc', 'jiOuTbHLjwyCPAoQP', 'jBiOJqqjeEKqpcxfT') })).toBe('padded Gmail, no words')
  })

  test('real messages are never spam, whatever the address looks like', () => {
    const padded = 'mary.jane.watson.1990@gmail.com'
    const real = [
      { subject: '', message: 'Can you pick us up at MBJ on Dec 3? We are 4.' },
      { subject: 'Wedding', message: 'Hi' },
      { subject: '', message: '¿Pueden recogernos en el aeropuerto el 3 de diciembre?' },
      { subject: '', message: '我们12月3日到达蒙特哥贝机场' },
      { subject: '', message: 'Booking MAPL-3331BF69, can we change the time to 10:15?' },
      { subject: '', message: 'Love it #BeyondTheResortJamaica #OneLoveJamaicaVibes' },
      price('Sandals Montego Bay'),
      price('Villa 12'),
      price('https://maps.app.goo.gl/x8YbQ2uKpZJtqWv7'),
      partner('Irie Rafting Co', 'Portland', 'We run bamboo rafting on the Rio Grande and would love to partner.'),
      partner('', '', 'We cook jerk in Boston Bay.', 'Restaurant or food spot'),
      partner('Scotchies', 'St. James', 'Jerk pork and chicken, 20 years.', 'Restaurant or food spot'),
    ]
    for (const m of real) {
      expect(contactSpam({ email: padded, ...m })).toBeNull()
      expect(contactSpam({ email: 'guest@example.com', ...m })).toBeNull()
      // ...and every one of them is answered.
      expect(noRealWords(m.subject, m.message)).toBe(false)
    }
  })

  test('only a number, from an ordinary address, is delivered', () => {
    expect(contactSpam({ email: 'guest@example.com', subject: '', message: '8765551234' })).toBeNull()
    expect(contactSpam({ email: 'john.smith@gmail.com', subject: '', message: '8765551234' })).toBeNull()
  })

  // Nov 2 2026: the bot's five posts that day, as typed, each from a different
  // ordinary address. Delivered to the team, never answered.
  test('text with no real words is told apart, so it is delivered but never answered', () => {
    for (const message of ['9047299932', '9027681708', '6363537966', '6264464967', '9776134824']) {
      expect(contactSpam({ email: 'someone@example.com', subject: '', message })).toBeNull()
      expect(noRealWords('', message)).toBe(true)
    }
    for (const message of ['+1 (876) 555-0100', '?!', '👍', 'jiOuTbHLjwyCPAoQP', 'xkcd qwrt pfft']) {
      expect(noRealWords('', message)).toBe(true)
    }
    // The forms' own wording is not the visitor's words.
    const p = partner('', '', '')
    expect(noRealWords(p.subject, p.message)).toBe(true)
    expect(noRealWords(price('1234').subject, price('1234').message)).toBe(true)
    // One real word answers it, a link too, and so does any other script.
    for (const message of ['Call me 8765551234', 'https://maps.app.goo.gl/x8YbQ2uKpZJtqWv7', 'Привет', 'ok']) {
      expect(noRealWords('', message)).toBe(false)
    }
    expect(noRealWords('Airport ride', '8765551234')).toBe(false)
  })

  test('the forms\' own wording is not counted as the visitor\'s words', () => {
    expect(typedText(...Object.values(partner('Vcvsjglm LLC', '', 'x')) as [string, string]).replace(/\s+/g, ' ').trim()).toBe('Vcvsjglm LLC Vcvsjglm LLC x')
    expect(typedText(...Object.values(price('Villa Old')) as [string, string]).replace(/\s+/g, ' ').trim()).toBe('Villa Old Villa Old')
    // A contact-page subject is the visitor's own, labels and all.
    expect(typedText('Type: question', 'Type: hello')).toBe('Type: question\nType: hello')
  })

  test('padded Gmail', () => {
    expect(paddedGmail('w.iz.imi.ja.g44.3@gmail.com')).toBe(true)
    expect(paddedGmail('D.U.L.UJ@GoogleMail.com')).toBe(true)
    expect(paddedGmail('john.smith@gmail.com')).toBe(false)
    expect(paddedGmail('a.b.c@gmail.com')).toBe(false)
    expect(paddedGmail('jo.hn+a.b.c.d@gmail.com')).toBe(false)
    expect(paddedGmail('a.b.c.d@example.com')).toBe(false)
  })

  test('a hotel is said back only when it reads as a place', () => {
    expect(replyHotel('Sandals Montego Bay')).toBe('Sandals Montego Bay')
    expect(replyHotel('Villa 12, St. James')).toBe('Villa 12, St. James')
    expect(replyHotel("Jake's, Treasure Beach (cottage #4)")).toBe("Jake's, Treasure Beach (cottage #4)")
    expect(replyHotel('Hôtel Mocking Bird Hill')).toBe('Hôtel Mocking Bird Hill')
    expect(replyHotel('Lot 1234, Bogue')).toBe('Lot 1234, Bogue')
    expect(replyHotel('  Half   Moon <b>Resort</b> ')).toBe('Half Moon b Resort /b')
    for (const bad of [
      'https://maps.app.goo.gl/x8YbQ2uKpZJtqWv7', 'www.example.org', 'example.com', 'evil.co/claim', 'EVIL.COM',
      'help@example.com', 'Call 876-555-0100', '+1 (876) 555 0100', '18765550100', '', '   ', '<>',
    ]) expect(replyHotel(bad)).toBeNull()
    expect(replyHotel('A'.repeat(300))).toHaveLength(80)
  })

  test('one mailbox key per real inbox', () => {
    expect(mailboxKey('W.iz.imi.ja.g44.3@gmail.com')).toBe('wizimijag443@gmail.com')
    expect(mailboxKey('wizimijag443+x@googlemail.com')).toBe('wizimijag443@gmail.com')
    expect(mailboxKey('Jane.Doe+trip@Example.com')).toBe('jane.doe@example.com')
  })
})

describe('rate limit windows', () => {
  afterEach(() => { vi.useRealTimers() })

  // A one-minute bucket's sweep used to drop every key idle for a minute,
  // which would have reset an hour-long bucket after sixty seconds.
  test('a long bucket outlives a short bucket\'s sweep', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'))
    const hour = { windowMs: 3_600_000, max: 1, bucket: 'spec-hour' }
    expect(rateLimit('inbox', hour)).toBe(false)
    vi.setSystemTime(new Date('2026-11-01T00:05:00Z'))
    rateLimit('203.0.113.1', { windowMs: 60_000, max: 3, bucket: 'spec-minute' })
    expect(rateLimit('inbox', hour)).toBe(true)
    vi.setSystemTime(new Date('2026-11-01T01:00:01Z'))
    expect(rateLimit('inbox', hour)).toBe(false)
  })
})
