import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@react-email/render'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import {
  RECIPIENT_DAILY_CAP, authorLine, commentLink, emailParts, listUnsubscribeHeaders, mentionsSecret,
  planMentionEmail, processMentionEmails, signStop, stopPage, stopUrl, subjectFor, verifyStop,
} from '@/lib/mentions-server'
import { defuseLinks, mentionToken } from '@/lib/mentions'
import MentionNotification from '@/emails/MentionNotification'
import * as unsubscribeRoute from '@/app/api/mentions/unsubscribe/route'

/**
 * @mention emails: who gets one, the stop link, the email itself, the
 * claim-and-send loop against a fake database, and the stop route. Synthetic
 * ids and addresses only; nothing here reaches Resend or Supabase.
 */

const sent: Array<Record<string, unknown>> = []
let sendResult: { ok: boolean; id?: string; error?: string } | Error = { ok: true, id: 'em_1' }
vi.mock('@/lib/email/send', () => ({
  sendEmail: async (args: Record<string, unknown>) => {
    sent.push(args)
    if (sendResult instanceof Error) throw sendResult
    return sendResult
  },
}))

const stops: string[] = []
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: async (row: { user_id: string }) => { stops.push(row.user_id); return { error: null } },
    }),
  }),
}))


const SECRET = 'test-secret-0123456789abcdef'
const AUTHOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ANA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CARA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const COMMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const base = {
  emailsOn: true, email: 'ana@example.com', emailConfirmed: true,
  sentToRecipientLast24h: 0, sentByAuthorToRecipientLastCooldown: 0,
  commentExists: true, hasSecret: true, tourKnown: true,
}

describe('planMentionEmail', () => {
  test('sends when everything holds', () => {
    expect(planMentionEmail(base)).toEqual({ send: true })
  })
  test.each([
    [{ commentExists: false }, 'comment-gone'],
    [{ hasSecret: false }, 'no-stop-secret'],
    [{ tourKnown: false }, 'unknown-tour'],
    [{ emailsOn: false }, 'emails-off'],
    [{ email: null }, 'no-confirmed-email'],
    [{ emailConfirmed: false }, 'no-confirmed-email'],
    [{ sentToRecipientLast24h: RECIPIENT_DAILY_CAP }, 'daily-cap'],
    [{ sentByAuthorToRecipientLastCooldown: 1 }, 'pair-cooldown'],
  ])('%o is skipped as %s', (change, reason) => {
    expect(planMentionEmail({ ...base, ...change })).toEqual({ send: false, reason })
  })
  test('one under the daily cap still sends', () => {
    expect(planMentionEmail({ ...base, sentToRecipientLast24h: RECIPIENT_DAILY_CAP - 1 })).toEqual({ send: true })
  })
})

describe('the stop link', () => {
  test('a secret must be at least 16 characters; MENTIONS_SECRET wins over TRIP_TIPS_SECRET', () => {
    expect(mentionsSecret({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(mentionsSecret({ TRIP_TIPS_SECRET: 'short' } as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(mentionsSecret({ TRIP_TIPS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv)).toBe(SECRET)
    expect(mentionsSecret({ TRIP_TIPS_SECRET: SECRET, MENTIONS_SECRET: `${SECRET}-m` } as unknown as NodeJS.ProcessEnv)).toBe(`${SECRET}-m`)
  })
  test('verifies its own token, case-insensitively by user, and nothing else', () => {
    const t = signStop(ANA, SECRET)
    expect(verifyStop(ANA, t, SECRET)).toBe(true)
    expect(verifyStop(ANA.toUpperCase(), signStop(ANA.toUpperCase(), SECRET), SECRET)).toBe(true)
    expect(verifyStop(CARA, t, SECRET)).toBe(false)
    expect(verifyStop(ANA, `${t.slice(0, -1)}x`, SECRET)).toBe(false)
    expect(verifyStop(ANA, t, `${SECRET}x`)).toBe(false)
    expect(verifyStop('not-a-uuid', t, SECRET)).toBe(false)
    expect(verifyStop(ANA, 'x'.repeat(101), SECRET)).toBe(false)
    expect(verifyStop(ANA, null, SECRET)).toBe(false)
  })
  test('is not the trip-tips token for the same secret (its own prefix)', () => {
    expect(signStop(ANA, SECRET)).not.toBe(createHmac('sha256', SECRET).update(ANA).digest('base64url'))
  })
  test('the URL names the public site and the List-Unsubscribe headers carry it', () => {
    const url = stopUrl(ANA.toUpperCase(), SECRET)
    expect(url).toBe(`https://mapltours.com/api/mentions/unsubscribe?u=${ANA}&t=${signStop(ANA, SECRET)}`)
    expect(listUnsubscribeHeaders(url)).toEqual({
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })
})

describe('defuseLinks', () => {
  test.each([
    ['see https://spam.example/x?y=1 now', 'see (link) now'],
    ['www.cheap-tours.biz', '(link)'],
    ['go to cheap-tours.com today', 'go to (link) today'],
    ['(promo.xyz)', '((link))'],
    ['visit Spam.COM/deal.', 'visit (link).'],
  ])('%s', (input, out) => {
    expect(defuseLinks(input)).toBe(out)
  })
  test.each([
    'see you in St. Ann, e.g. at the falls',
    'ask @cara.lee about it',
    'jane.doe said 10.5 hours',
    'Rick’s Cafe at 5.30',
  ])('leaves ordinary words alone: %s', (input) => {
    expect(defuseLinks(input)).toBe(input)
  })
})

describe('the email content', () => {
  const people = new Map([[ANA, { label: 'Ana', isHandle: false }], [CARA, { label: 'cara.lee', isHandle: true }]])

  test('tags spelled out, the reader marked, an unknown person as @someone', () => {
    const { parts, truncated } = emailParts(`${mentionToken(ANA)} meet ${mentionToken(CARA)} and ${mentionToken(COMMENT)}`, people, ANA)
    expect(truncated).toBe(false)
    expect(parts).toEqual([
      { kind: 'mention', text: '@Ana', isYou: true },
      { kind: 'text', text: ' meet ' },
      { kind: 'mention', text: '@cara.lee', isYou: false },
      { kind: 'text', text: ' and ' },
      { kind: 'mention', text: '@someone', isYou: false },
    ])
  })
  test('long comments are cut at a word and marked truncated', () => {
    const long = `${mentionToken(ANA)} ${'sunset '.repeat(60)}`
    const { parts, truncated } = emailParts(long, people, ANA, 60)
    const joined = parts.map((p) => p.text).join('')
    expect(truncated).toBe(true)
    expect(joined.length).toBeLessThanOrEqual(60)
    expect(joined.endsWith('sunset')).toBe(true)
  })
  test('a link in the comment never reaches the email', () => {
    const { parts } = emailParts(`${mentionToken(ANA)} book at https://evil.example/now or evil-deals.com`, people, ANA)
    const joined = parts.map((p) => p.text).join('')
    expect(joined).not.toMatch(/evil/)
    expect(joined).toContain('(link)')
  })
  test('a name that is a web address is not passed on as the author, or as a tag', () => {
    expect(authorLine({ id: AUTHOR, name: 'cheap-tours.com Smith' })).toBe('A guest')
    expect(authorLine({ id: AUTHOR, name: 'Ana Brown' })).toBe('Ana')
    expect(authorLine({ id: AUTHOR, name: 'Ana', social_handle: 'ana.b' })).toBe('@ana.b')
    expect(authorLine(null)).toBe('A guest')
    const spammy = new Map([[ANA, { label: 'promo.xyz', isHandle: false }]])
    expect(emailParts(mentionToken(ANA), spammy, CARA).parts[0]).toEqual({ kind: 'mention', text: '@someone', isYou: false })
  })
  test('the link opens that comment, tagged for analytics; the subject says who and where', () => {
    expect(commentLink('dunns-river-falls-climb', COMMENT)).toBe(
      `https://mapltours.com/experience/dunns-river-falls-climb?comment=${COMMENT}&utm_source=email&utm_medium=notification&utm_campaign=mention`,
    )
    expect(subjectFor('@cara.lee', 'Bamboo Rafting')).toBe('@cara.lee tagged you on Bamboo Rafting')
  })
})

describe('the email renders', () => {
  const props = {
    authorLabel: '@cara.lee',
    tourTitle: 'Bamboo Rafting',
    destination: 'Montego Bay',
    parts: [
      { kind: 'mention' as const, text: '@Ana', isYou: true },
      { kind: 'text' as const, text: ' you have to try this <script>alert(1)</script> & the river' },
    ],
    truncated: false,
    commentUrl: `https://mapltours.com/experience/bamboo-rafting?comment=${COMMENT}`,
    stopUrl: `https://mapltours.com/api/mentions/unsubscribe?u=${ANA}&t=abc`,
  }

  test('branded, with the button to the comment and the stop link', async () => {
    const html = await render(MentionNotification(props))
    expect(html).toContain('MAPL Tours Jamaica')
    expect(html).toContain('@cara.lee tagged you in a comment')
    expect(html).toContain('Bamboo Rafting, Montego Bay')
    expect(html).toContain(`href="${props.commentUrl.replace(/&/g, '&amp;')}"`)
    expect(html).toContain(props.stopUrl.replace(/&/g, '&amp;'))
    expect(html).toContain('See the comment')
  })
  test('guest words are escaped, never markup', async () => {
    const html = await render(MentionNotification(props))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
  test('no em dash anywhere, and a plain-text version that reads on its own', async () => {
    const html = await render(MentionNotification(props))
    const text = await render(MentionNotification(props), { plainText: true })
    expect(html).not.toContain('—')
    expect(text).not.toContain('—')
    expect(text.toLowerCase()).toContain('@cara.lee tagged you in a comment')
    expect(text).toContain('See the comment')
    expect(text).toMatch(/Stop these emails/i)
  })
  test('the stop pages are branded, inert on GET and carry no em dash', () => {
    for (const kind of ['confirm', 'done', 'invalid'] as const) {
      const page = stopPage(kind, '/api/mentions/unsubscribe?u=x&t="><script>')
      expect(page).toContain('MAPL Tours Jamaica')
      expect(page).not.toContain('—')
      expect(page).not.toContain('"><script>')
    }
    expect(stopPage('confirm')).toContain('<form method="post"')
  })
})

/* ── The claim-and-send loop against a fake database ─────────────────── */

type Op = { op: string; args: unknown[] }
interface FakeOpts {
  rows: Array<Record<string, unknown>>
  comments?: Array<Record<string, unknown>>
  users?: Array<Record<string, unknown>>
  prefs?: Array<Record<string, unknown>>
  authUsers?: Record<string, { email: string | null; email_confirmed_at: string | null } | null>
  counts?: { day?: number; pair?: number }
  claimError?: boolean
}
function fakeSvc(o: FakeOpts) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = []
  const builder = (table: string) => {
    const ops: Op[] = []
    const b: Record<string, unknown> = {}
    for (const op of ['select', 'in', 'eq', 'gte', 'is']) {
      b[op] = (...args: unknown[]) => { ops.push({ op, args }); return b }
    }
    b.update = (patch: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => { updates.push({ id, patch }); return { error: null } },
    })
    b.then = (resolve: (v: unknown) => void) => {
      const sel = ops.find((x) => x.op === 'select')
      const head = !!(sel?.args[1] as { head?: boolean } | undefined)?.head
      if (table === 'comment_mentions' && head) {
        const pair = ops.some((x) => x.op === 'eq' && x.args[0] === 'author_id')
        return resolve({ count: pair ? o.counts?.pair ?? 0 : o.counts?.day ?? 0 })
      }
      if (table === 'comments') return resolve({ data: o.comments ?? [] })
      if (table === 'users') return resolve({ data: o.users ?? [] })
      if (table === 'notification_prefs') return resolve({ data: o.prefs ?? [] })
      return resolve({ data: [] })
    }
    return b
  }
  const svc = {
    rpc: async () => (o.claimError ? { data: null, error: { message: 'boom' } } : { data: o.rows, error: null }),
    from: (t: string) => builder(t),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = o.authUsers?.[id]
          return { data: { user: u === undefined ? { email: `${id.slice(0, 4)}@example.com`, email_confirmed_at: '2026-01-01T00:00:00Z' } : u } }
        },
      },
    },
  }
  return { svc: svc as never, updates }
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1', comment_id: COMMENT, experience_id: 3, author_id: AUTHOR, mentioned_user_id: ANA,
  created_at: '2026-11-15T12:00:00Z', email_attempts: 1, ...over,
})
const world = {
  comments: [{ id: COMMENT, text: `${mentionToken(ANA)} this raft is the one`, experience_id: 3, user_id: AUTHOR }],
  users: [{ id: AUTHOR, name: 'Cara Lee', social_handle: 'cara.lee' }, { id: ANA, name: 'Ana Brown', social_handle: null }],
}
const env = { TRIP_TIPS_SECRET: SECRET } as unknown as NodeJS.ProcessEnv

describe('processMentionEmails', () => {
  beforeEach(() => { sent.length = 0; sendResult = { ok: true, id: 'em_1' } })

  test('sends one email per claimed row, keyed for repeats, with the stop headers, and records it', async () => {
    const { svc, updates } = fakeSvc({ rows: [row()], ...world })
    const r = await processMentionEmails(svc, { commentId: COMMENT, env })
    expect(r).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 })
    expect(sent).toHaveLength(1)
    const e = sent[0] as { to: string; subject: string; dedupe: string; headers: Record<string, string>; timeoutMs: number }
    expect(e.to).toBe('bbbb@example.com')
    expect(e.subject).toMatch(/^@cara\.lee tagged you on /)
    expect(e.dedupe).toBe('mention/m1')
    expect(e.timeoutMs).toBeLessThanOrEqual(4000)
    expect(e.headers['List-Unsubscribe']).toContain(`u=${ANA}`)
    expect(e.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(updates).toEqual([{ id: 'm1', patch: expect.objectContaining({ email_status: 'sent', email_note: 'em_1' }) }])
  })

  test('a guest who switched emails off is skipped, not emailed', async () => {
    const { svc, updates } = fakeSvc({ rows: [row()], ...world, prefs: [{ user_id: ANA, mention_emails: false }] })
    const r = await processMentionEmails(svc, { env })
    expect(r.skipped).toBe(1)
    expect(sent).toHaveLength(0)
    expect(updates[0].patch).toMatchObject({ email_status: 'skipped', email_note: 'emails-off' })
  })

  test('an unconfirmed address, the daily cap and the cooldown each skip', async () => {
    for (const [opts, reason] of [
      [{ authUsers: { [ANA]: { email: 'ana@example.com', email_confirmed_at: null } } }, 'no-confirmed-email'],
      [{ counts: { day: RECIPIENT_DAILY_CAP } }, 'daily-cap'],
      [{ counts: { pair: 1 } }, 'pair-cooldown'],
    ] as const) {
      sent.length = 0
      const { svc, updates } = fakeSvc({ rows: [row()], ...world, ...opts })
      await processMentionEmails(svc, { env })
      expect(sent).toHaveLength(0)
      expect(updates[0].patch).toMatchObject({ email_status: 'skipped', email_note: reason })
    }
  })

  test('no secret: nothing is sent without a working stop link', async () => {
    const { svc, updates } = fakeSvc({ rows: [row()], ...world })
    await processMentionEmails(svc, { env: {} as unknown as NodeJS.ProcessEnv })
    expect(sent).toHaveLength(0)
    expect(updates[0].patch).toMatchObject({ email_status: 'skipped', email_note: 'no-stop-secret' })
  })

  test('a refused or thrown send is recorded failed (the sweep retries it)', async () => {
    sendResult = { ok: false, error: 'rate limited' }
    let f = fakeSvc({ rows: [row()], ...world })
    expect((await processMentionEmails(f.svc, { env })).failed).toBe(1)
    expect(f.updates[0].patch).toMatchObject({ email_status: 'failed', email_note: 'rate limited' })
    sendResult = new Error('socket hang up')
    f = fakeSvc({ rows: [row()], ...world })
    expect((await processMentionEmails(f.svc, { env })).failed).toBe(1)
    expect(f.updates[0].patch).toMatchObject({ email_status: 'failed', email_note: 'socket hang up' })
  })

  test('a failed claim sends nothing and does not throw', async () => {
    const { svc } = fakeSvc({ rows: [row()], ...world, claimError: true })
    expect(await processMentionEmails(svc, { env })).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0 })
    expect(sent).toHaveLength(0)
  })
})

/* ── The stop route ──────────────────────────────────────────────────── */

describe('/api/mentions/unsubscribe', () => {
  beforeEach(() => { stops.length = 0; process.env.TRIP_TIPS_SECRET = SECRET; delete process.env.MENTIONS_SECRET })
  const route = unsubscribeRoute
  const url = (u: string, t: string) => `https://mapltours.com/api/mentions/unsubscribe?u=${u}&t=${t}`

  test('GET shows a confirm page and records nothing', async () => {
    const res = await route.GET(new NextRequest(url(ANA, signStop(ANA, SECRET))))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<form method="post"')
    expect(stops).toEqual([])
  })
  test('GET with a bad token says so', async () => {
    const res = await route.GET(new NextRequest(url(ANA, 'nope')))
    expect(res.status).toBe(400)
    expect(stops).toEqual([])
  })
  test('POST from the button records the stop', async () => {
    const res = await route.POST(new NextRequest(url(ANA, signStop(ANA, SECRET)), { method: 'POST', body: '' }))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('No more mention emails')
    expect(stops).toEqual([ANA])
  })
  test('one-click POST answers 200 with no body', async () => {
    const res = await route.POST(new NextRequest(url(ANA, signStop(ANA, SECRET)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(res.status).toBe(200)
    expect(stops).toEqual([ANA])
  })
  test("a token for one guest cannot stop another's emails", async () => {
    const res = await route.POST(new NextRequest(url(CARA, signStop(ANA, SECRET)), { method: 'POST', body: 'List-Unsubscribe=One-Click' }))
    expect(res.status).toBe(400)
    expect(stops).toEqual([])
  })
})

describe('defuseLinks keeps the sentence around an address', () => {
  test.each([
    ['see https://spam.example/x.', 'see (link).'],
    ['(www.spam.biz/a)', '((link))'],
    ['try spam.com/deal!', 'try (link)!'],
  ])('%s', (input, out) => {
    expect(defuseLinks(input)).toBe(out)
  })
})
