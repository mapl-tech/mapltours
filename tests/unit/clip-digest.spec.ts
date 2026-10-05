import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render } from '@react-email/components'
import { NextRequest } from 'next/server'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { GET } from '@/app/api/clip-digest/route'
import { buildClipDigest, clipDigestSubject, type ReviewedClip } from '@/lib/clip-digest'
import { experiences, slugify } from '@/lib/experiences'

/**
 * The evening clip-review email (app/api/clip-digest, migration 036): one email
 * per guest for every clip reviewed since their last, instead of one per
 * review. Pure grouping, the route over a fake database and Resend, and the
 * real template rendered.
 */

const env = vi.hoisted(() => {
  const keys = ['CRON_SECRET', 'RESEND_API_KEY', 'NEXT_PUBLIC_SITE_URL'] as const
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  process.env.CRON_SECRET = 'clip_digest_spec_secret'
  delete process.env.RESEND_API_KEY
  process.env.NEXT_PUBLIC_SITE_URL = 'http://mapltours.com' // production's value; emails must still say https
  return { keys, saved }
})

type Sent = { to: string; subject: string; react: { template: string; props: Record<string, unknown> }; tags?: unknown }

const db = vi.hoisted(() => ({
  /** Rows the first read returns (id, user_id, reviewed_at, review_emailed_at). */
  candidates: [] as Record<string, unknown>[],
  /** What claim_clip_reviews returns per user, consumed once (a second claim finds nothing). */
  claims: {} as Record<string, unknown[]>,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  releases: [] as { ids: string[]; stamp: unknown }[],
  approvedTotals: {} as Record<string, number>,
  rewards: {} as Record<string, { code: string; percent: number; expires_at: string | null; milestone: number } | undefined>,
  rewardReads: [] as Record<string, unknown>[],
  users: {} as Record<string, { email?: string; user_metadata?: Record<string, unknown> } | null>,
  /** An auth lookup that fails for a reason other than a missing user. */
  userErrors: {} as Record<string, { message: string; status?: number }>,
  /** The approved count read fails. */
  countFails: false,
  emails: [] as Sent[],
  answer: (() => Promise.resolve({ ok: true })) as (e: Sent) => Promise<{ ok: boolean; error?: string }>,
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (e: Sent) => { db.emails.push(e); return db.answer(e) },
}))
vi.mock('@/emails/ClipReviewDigest', () => ({ default: (props: unknown) => ({ template: 'ClipReviewDigest', props }) }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    auth: { admin: { getUserById: async (id: string) => {
      if (db.userErrors[id]) return { data: { user: null }, error: db.userErrors[id] }
      return { data: { user: db.users[id] ?? null }, error: db.users[id] ? null : { message: 'User not found', status: 404 } }
    } } },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcCalls.push({ fn, args })
      const user = args.p_user as string
      const rows = (db.claims[user] ?? []) as { reviewed_at: string }[]
      db.claims[user] = []
      // As migration 036 does: the mark is never earlier than the review.
      const stamp = args.p_stamp as string
      const marked = rows.map((r) => ({ ...r, review_emailed_at: Date.parse(r.reviewed_at) > Date.parse(stamp) ? r.reviewed_at : stamp }))
      return { data: marked, error: null }
    },
    from: (table: string) => {
      const f: Record<string, unknown> = {}
      let updating: Record<string, unknown> | null = null
      let ids: string[] = []
      const q = {
        select: () => q,
        in: (col: string, vals: string[]) => { if (col === 'id') ids = vals; return q },
        gte: () => q,
        limit: () => q,
        order: () => q,
        eq: (col: string, val: unknown) => {
          f[col] = val
          if (updating && col === 'review_emailed_at') db.releases.push({ ids, stamp: val })
          return q
        },
        update: (patch: Record<string, unknown>) => { updating = patch; return q },
        then: (resolve: (v: unknown) => void) => {
          if (updating) return resolve({ data: null, error: null })
          if (table === 'user_rewards') {
            db.rewardReads.push({ ...f })
            const r = db.rewards[f.user_id as string]
            const match = r && (f.milestone === undefined || f.milestone === r.milestone)
            return resolve({ data: match ? [r] : [], error: null })
          }
          if (table === 'user_tour_videos' && f.status === 'approved') {
            if (db.countFails) return resolve({ count: null, error: { code: '57014', message: 'canceling statement' } })
            return resolve({ count: db.approvedTotals[f.user_id as string] ?? 0, error: null })
          }
          return resolve({ data: db.candidates, error: null })
        },
      }
      return q
    },
  }),
}))

afterAll(() => {
  for (const k of env.keys) {
    if (env.saved[k] === undefined) delete process.env[k]
    else process.env[k] = env.saved[k]
  }
})

const BLUE = experiences.find((e) => e.id === 2)!
const OTHER = experiences.find((e) => e.kind !== 'package' && e.id !== 2)!
const SITE = 'https://mapltours.com'

function clip(over: Partial<ReviewedClip> = {}): ReviewedClip {
  return { id: 'c1', experience_id: BLUE.id, status: 'approved', admin_notes: null, caption: null, reviewed_at: '2026-10-04T20:00:00Z', ...over }
}

function call(secret: string | null = 'clip_digest_spec_secret', query = '') {
  const headers: Record<string, string> = {}
  if (secret !== null) headers.authorization = `Bearer ${secret}`
  return GET(new NextRequest(`https://mapltours.com/api/clip-digest${query}`, { headers }))
}

beforeEach(() => {
  db.candidates = []
  db.claims = {}
  db.rpcCalls = []
  db.releases = []
  db.approvedTotals = {}
  db.rewards = {}
  db.rewardReads = []
  db.users = {}
  db.userErrors = {}
  db.countFails = false
  db.emails = []
  db.answer = () => Promise.resolve({ ok: true })
})

describe('buildClipDigest and its subject', () => {
  it('lists live clips oldest first, each linking to its place in the tour reel', () => {
    const d = buildClipDigest([
      clip({ id: 'b', reviewed_at: '2026-10-04T21:00:00Z' }),
      clip({ id: 'a', reviewed_at: '2026-10-04T20:00:00Z', experience_id: OTHER.id }),
    ], 2, null, SITE)
    expect(d.approved.map((c) => c.clipId)).toEqual(['a', 'b'])
    expect(d.approved[1]).toEqual({ clipId: 'b', tourTitle: BLUE.title, link: `${SITE}/experience/${slugify(BLUE.title)}?clip=b` })
    expect(d.rejected).toEqual([])
    expect(d.remainingForReward).toBe(3)
  })

  it('a clip not published carries the note and the link to post another', () => {
    const d = buildClipDigest([clip({ id: 'r', status: 'rejected', admin_notes: '  Too dark  ' })], 0, null, SITE)
    expect(d.rejected).toEqual([{ clipId: 'r', tourTitle: BLUE.title, notes: 'Too dark', link: `${SITE}/experience/${slugify(BLUE.title)}?clips=post` }])
  })

  it('a tour no longer in the catalogue still gets an email, pointing to the tours', () => {
    const d = buildClipDigest([clip({ experience_id: 99999 })], 1, null, SITE)
    expect(d.approved[0]).toMatchObject({ tourTitle: 'a tour no longer listed', link: `${SITE}/explore` })
  })

  it('a reward means nothing left to earn; a milestone with no reward row means a full five', () => {
    expect(buildClipDigest([clip()], 5, { code: 'MAPL-AB12-5', percent: 5, expiresAt: null }, SITE).remainingForReward).toBe(0)
    expect(buildClipDigest([clip()], 5, null, SITE).remainingForReward).toBe(5)
    expect(buildClipDigest([clip()], 4, null, SITE).remainingForReward).toBe(1)
  })

  it('subjects say what happened, with the full brand name', () => {
    const one = buildClipDigest([clip()], 1, null, SITE)
    const two = buildClipDigest([clip({ id: 'a' }), clip({ id: 'b' })], 2, null, SITE)
    const unlocked = buildClipDigest([clip()], 5, { code: 'X', percent: 5, expiresAt: null }, SITE)
    const rej1 = buildClipDigest([clip({ status: 'rejected' })], 0, null, SITE)
    const rej2 = buildClipDigest([clip({ id: 'a', status: 'rejected' }), clip({ id: 'b', status: 'rejected' })], 0, null, SITE)
    expect(clipDigestSubject(one)).toBe('Your clip is live on MAPL Tours Jamaica')
    expect(clipDigestSubject(two)).toBe('2 of your clips are live on MAPL Tours Jamaica')
    expect(clipDigestSubject(unlocked)).toBe('Your clip is live, and you unlocked 5% off')
    expect(clipDigestSubject(rej1)).toBe("We couldn't publish your MAPL Tours Jamaica clip")
    expect(clipDigestSubject(rej2)).toBe("We couldn't publish your MAPL Tours Jamaica clips")
  })
})

describe('/api/clip-digest', () => {
  it('refuses a missing or wrong secret', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call('wrong')).status).toBe(401)
    expect(db.rpcCalls).toHaveLength(0)
  })

  it('a dry run counts what is due and claims and sends nothing', async () => {
    db.candidates = [
      { id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null },
      { id: 'b', user_id: 'u1', reviewed_at: '2026-10-04T21:00:00Z', review_emailed_at: '2026-10-03T01:00:00Z' },
      { id: 'c', user_id: 'u2', reviewed_at: '2026-10-02T20:00:00Z', review_emailed_at: '2026-10-03T01:00:00Z' },
    ]
    const res = await call(undefined, '?dry=1')
    expect(await res.json()).toEqual({ ok: true, dry: true, due: 2, guests: 1, sent: 0, failed: 0, noEmail: 0, deferred: 0 })
    expect(db.rpcCalls).toHaveLength(0)
    expect(db.emails).toHaveLength(0)
  })

  it('one email per guest, with every clip of theirs reviewed since the last', async () => {
    db.candidates = [
      { id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null },
      { id: 'b', user_id: 'u1', reviewed_at: '2026-10-04T21:00:00Z', review_emailed_at: null },
      { id: 'c', user_id: 'u2', reviewed_at: '2026-10-04T22:00:00Z', review_emailed_at: null },
    ]
    db.claims = {
      u1: [clip({ id: 'a' }), clip({ id: 'b', status: 'rejected', admin_notes: 'Sideways' })],
      u2: [clip({ id: 'c' })],
    }
    db.users = { u1: { email: 'one@example.com', user_metadata: { full_name: 'Rick Hosey' } }, u2: { email: 'two@example.com' } }
    db.approvedTotals = { u1: 1, u2: 3 }
    const res = await call()
    expect(await res.json()).toEqual({ ok: true, dry: false, due: 3, guests: 2, sent: 2, failed: 0, noEmail: 0, deferred: 0 })
    expect(db.emails).toHaveLength(2)
    const first = db.emails.find((e) => e.to === 'one@example.com')!
    expect(first.subject).toBe('Your clip is live on MAPL Tours Jamaica')
    expect(first.react.template).toBe('ClipReviewDigest')
    expect(first.react.props).toMatchObject({ firstName: 'Rick', approvedTotal: 1, remainingForReward: 4, reward: null })
    expect((first.react.props.approved as unknown[]).length).toBe(1)
    expect((first.react.props.rejected as { notes: string }[])[0].notes).toBe('Sideways')
    // Every claim stamps the guest's clips with the run's time.
    expect(db.rpcCalls.map((c) => c.args.p_user)).toEqual(['u1', 'u2'])
    expect(db.rpcCalls.every((c) => c.fn === 'claim_clip_reviews' && typeof c.args.p_stamp === 'string')).toBe(true)
  })

  it('clips another run already claimed are not sent twice', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [] }
    db.users = { u1: { email: 'one@example.com' } }
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 0 })
    expect(db.emails).toHaveLength(0)
  })

  it('a send that fails is released for the next run, by its own stamp', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.users = { u1: { email: 'one@example.com' } }
    db.answer = () => Promise.resolve({ ok: false, error: 'refused' })
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 1 })
    expect(db.releases).toEqual([{ ids: ['a'], stamp: db.rpcCalls[0].args.p_stamp }])
  })

  it('a review stamped by a fast clock is released by the mark the claim set', async () => {
    // reviewed_at comes from the reviewer's browser; a few minutes fast, it is
    // later than the run's stamp, and the claim marks it with reviewed_at.
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: future, review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a', reviewed_at: future })] }
    db.users = { u1: { email: 'one@example.com' } }
    db.answer = () => Promise.resolve({ ok: false, error: 'refused' })
    await call()
    expect(db.releases).toEqual([{ ids: ['a'], stamp: future }])
  })

  it('an auth lookup that fails for another reason is tried again, not dropped', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.userErrors = { u1: { message: 'fetch failed', status: 502 } }
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 1, noEmail: 0 })
    expect(db.releases).toEqual([{ ids: ['a'], stamp: db.rpcCalls[0].args.p_stamp }])
  })

  it('a count that cannot be read is tried again, never sent without the reward', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.users = { u1: { email: 'one@example.com' } }
    db.countFails = true
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 1 })
    expect(db.emails).toHaveLength(0)
    expect(db.releases).toHaveLength(1)
  })

  it('a send that hangs gives up and is released for the next run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
      db.claims = { u1: [clip({ id: 'a' })] }
      db.users = { u1: { email: 'one@example.com' } }
      db.answer = () => new Promise(() => {})
      const pending = call()
      await vi.advanceTimersByTimeAsync(2_500)
      expect(await (await pending).json()).toMatchObject({ sent: 0, failed: 1 })
      expect(db.releases).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops taking guests before the 10 s cut-off and says how many it left', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const users = ['u1', 'u2', 'u3', 'u4']
      db.candidates = users.map((u, i) => ({ id: `c${i}`, user_id: u, reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }))
      db.claims = Object.fromEntries(users.map((u, i) => [u, [clip({ id: `c${i}` })]]))
      db.users = Object.fromEntries(users.map((u) => [u, { email: `${u}@example.com` }]))
      // Each send takes 3 s of the run.
      db.answer = () => { vi.setSystemTime(Date.now() + 3_000); return Promise.resolve({ ok: true }) }
      const body = await (await call()).json()
      expect(body).toMatchObject({ guests: 4, sent: 2, failed: 0, deferred: 2 })
      // The two left were never claimed: the next call takes them.
      expect(db.rpcCalls.map((c) => c.args.p_user)).toEqual(['u1', 'u2'])
      expect(db.releases).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('a guest with no address is counted and not retried', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.users = { u1: { user_metadata: {} } }
    expect(await (await call()).json()).toMatchObject({ sent: 0, failed: 0, noEmail: 1 })
    expect(db.releases).toEqual([])
  })

  it('a reward granted by one of the day\'s approvals is announced with its code', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.users = { u1: { email: 'one@example.com' } }
    db.approvedTotals = { u1: 5 }
    db.rewards = { u1: { code: 'MAPL-AB12-5', percent: 5, expires_at: '2027-10-04T20:00:00Z', milestone: 5 } }
    await call()
    expect(db.emails[0].subject).toBe('Your clip is live, and you unlocked 5% off')
    expect(db.emails[0].react.props).toMatchObject({ remainingForReward: 0, reward: { code: 'MAPL-AB12-5', percent: 5, expiresAt: '2027-10-04T20:00:00Z' } })
    // Found by the milestone crossed, whatever the reviewer's clock said.
    expect(db.rewardReads).toEqual([{ user_id: 'u1', kind: 'video_upload_5pct', status: 'available', milestone: 5 }])
  })

  it('approvals that cross two milestones announce the higher one', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: Array.from({ length: 7 }, (_, i) => clip({ id: `c${i}` })) }
    db.users = { u1: { email: 'one@example.com' } }
    db.approvedTotals = { u1: 11 }
    db.rewards = { u1: { code: 'MAPL-CD34-10', percent: 5, expires_at: null, milestone: 10 } }
    await call()
    expect(db.rewardReads[0]).toMatchObject({ milestone: 10 })
    expect(db.emails[0].react.props).toMatchObject({ reward: { code: 'MAPL-CD34-10' } })
  })

  it('a reward from an earlier evening is not announced again', async () => {
    // Five were approved and emailed before; today's approval is the sixth.
    db.candidates = [{ id: 'f', user_id: 'u1', reviewed_at: '2026-10-05T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'f' })] }
    db.users = { u1: { email: 'one@example.com' } }
    db.approvedTotals = { u1: 6 }
    db.rewards = { u1: { code: 'MAPL-AB12-5', percent: 5, expires_at: null, milestone: 5 } }
    await call()
    expect(db.rewardReads).toEqual([])
    expect(db.emails[0].subject).toBe('Your clip is live on MAPL Tours Jamaica')
    expect(db.emails[0].react.props).toMatchObject({ reward: null, remainingForReward: 4 })
  })

  it('every link in the email is https, even with production\'s http site address', async () => {
    db.candidates = [{ id: 'a', user_id: 'u1', reviewed_at: '2026-10-04T20:00:00Z', review_emailed_at: null }]
    db.claims = { u1: [clip({ id: 'a' })] }
    db.users = { u1: { email: 'one@example.com' } }
    await call()
    expect((db.emails[0].react.props.approved as { link: string }[])[0].link).toBe(`https://mapltours.com/experience/${slugify(BLUE.title)}?clip=a`)
  })
})

describe('the real email', () => {
  it('renders every state readable, on brand, with the code when unlocked', async () => {
    const { default: Real } = await vi.importActual<typeof import('@/emails/ClipReviewDigest')>('@/emails/ClipReviewDigest')
    const states = [
      { firstName: 'Rick', ...buildClipDigest([clip()], 1, null, SITE) },
      { firstName: null, ...buildClipDigest([clip({ id: 'a' }), clip({ id: 'b', experience_id: OTHER.id })], 2, null, SITE) },
      { firstName: 'Rick', ...buildClipDigest([clip()], 5, { code: 'MAPL-AB12-5', percent: 5, expiresAt: '2027-10-04T20:00:00Z' }, SITE) },
      { firstName: 'Rick', ...buildClipDigest([clip({ status: 'rejected', admin_notes: 'Filmed sideways' })], 0, null, SITE) },
      { firstName: 'Rick', ...buildClipDigest([clip({ id: 'a' }), clip({ id: 'b', status: 'rejected' })], 1, null, SITE) },
    ]
    for (const props of states) {
      const html = await render(Real(props))
      const text = await render(Real(props), { plainText: true })
      // White text only ever sits on the dark ink button, in the same style.
      const styles = Array.from(html.matchAll(/style="([^"]*)"/g)).map((m) => m[1])
      const white = styles.filter((st) => /(?:^|;)\s*color:\s*#fff(?:fff)?\b/i.test(st))
      expect(white.length).toBeGreaterThan(0)
      expect(white.every((st) => /background:\s*#1A1714/i.test(st))).toBe(true)
      expect(text).not.toMatch(/[—–]/)
      expect(text).not.toMatch(/MAPL Tours(?! Jamaica)/)
      expect(text).not.toMatch(/NaN|undefined|null/)
    }
    const unlocked = await render(Real(states[2]))
    expect(unlocked).toContain('MAPL-AB12-5')
    expect(unlocked).toContain('comes off automatically at checkout')
    expect(unlocked).toContain('October 4, 2027')
    const both = await render(Real(states[4]), { plainText: true })
    expect(both).toContain('See it live')
    expect(both).toContain('Post another clip')
  })

  // Sent at the approval itself by app/api/hooks/reward-unlocked. Its text was
  // white on the light layout (contrast 1:1), so it is pinned the same way.
  it('the reward email is readable and on brand', async () => {
    const { default: RewardUnlocked } = await import('@/emails/RewardUnlocked')
    for (const props of [
      { firstName: 'Rick', code: 'MAPL-AB12-5', percent: 5, expiresAt: '2027-10-04T20:00:00Z', milestone: 5 },
      { firstName: null, code: 'MAPL-CD34-10', percent: 5, expiresAt: 'not a date', milestone: 10 },
    ]) {
      const html = await render(RewardUnlocked(props))
      const text = await render(RewardUnlocked(props), { plainText: true })
      const styles = Array.from(html.matchAll(/style="([^"]*)"/g)).map((m) => m[1])
      expect(styles.some((st) => /rgba\(255,\s*255,\s*255/i.test(st))).toBe(false)
      const white = styles.filter((st) => /(?:^|;)\s*color:\s*#fff(?:fff)?\b/i.test(st))
      expect(white.every((st) => /background:\s*#1A1714/i.test(st))).toBe(true)
      expect(html).toContain(props.code)
      expect(text).not.toMatch(/MAPL Tours(?! Jamaica)/)
      expect(text).not.toMatch(/Tap to copy|NaN|Invalid Date|undefined|null/)
      expect(text).not.toMatch(/[—–]/)
    }
    expect(await render(RewardUnlocked({ code: 'X', percent: 5, expiresAt: '2027-10-04T20:00:00Z' }), { plainText: true })).toContain('October 4, 2027')
  })
})
