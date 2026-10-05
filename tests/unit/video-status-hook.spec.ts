import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { render } from '@react-email/components'
// vi.mock calls are hoisted above this import by vitest, so the handler loads over the fakes.
import { POST } from '@/app/api/hooks/video-status/route'
import { experiences } from '@/lib/experiences'

/**
 * Drives the real guest-clip webhook (/api/hooks/video-status) with the
 * payloads Supabase's video_status trigger sends, over a fake auth lookup, a
 * fake PostgREST and a fake Resend. Nothing here reaches Supabase or Resend.
 *
 * What it pins:
 *   - a new clip tells us at the public inbox, whether or not the uploader
 *     has an address (naming them, with the clip's first frame, and replies
 *     going to them), and tells the guest it is in review;
 *   - the two go out side by side, and a failed, throwing or hanging note to
 *     us never costs the guest their email;
 *   - an account inserting clips in a loop cannot turn them into unlimited
 *     email (per uploader and across everyone, per hour, for both emails);
 *   - a first name that is not a name is never said back to the guest;
 *   - a failed send is reported as failed, not as sent;
 *   - a review (approved, rejected) sends nothing here: the evening email
 *     (app/api/clip-digest, tested in clip-digest.spec.ts) carries it;
 *     flagging and status-free updates send nothing either.
 */

type SentEmail = {
  to: string | string[]
  from?: string
  replyTo?: string
  subject: string
  react: { template: string; props: Record<string, unknown> }
  tags?: { name: string; value: string }[]
  bcc?: unknown
}

const env = vi.hoisted(() => {
  const keys = ['SUPABASE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'NEXT_PUBLIC_SITE_URL'] as const
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  process.env.SUPABASE_WEBHOOK_SECRET = 'video_status_spec_secret'
  delete process.env.RESEND_API_KEY
  delete process.env.NEXT_PUBLIC_SITE_URL
  return { keys, saved }
})

const state = vi.hoisted(() => ({
  emails: [] as SentEmail[],
  /** Called for every send; tests swap it to fail, throw or hang per recipient. */
  answer: (() => Promise.resolve({ ok: true, id: 'em_test' })) as (e: SentEmail) => Promise<{ ok: boolean; id?: string; error?: string }>,
  events: [] as string[],
  user: null as null | { email?: string; user_metadata?: Record<string, unknown> },
  userError: null as null | { message: string },
  approvedCount: 1,
  /** Clips in the last hour: by this uploader, and by everyone. */
  recentMine: 1,
  recentAll: 1,
  /** The user_rewards row for the milestone, if any. */
  reward: null as null | { status: string },
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (e: SentEmail) => {
    state.emails.push(e)
    state.events.push(`start:${e.subject}`)
    const res = await state.answer(e)
    state.events.push(`end:${e.subject}`)
    return res
  },
}))

// The route calls each template as a function, so what reaches sendEmail is
// the rendered layout. Stubs hand back the template's own inputs instead; the
// caption test renders the real NewClipAlert from them.
vi.mock('@/emails/VideoSubmitted', () => ({ default: (props: unknown) => ({ template: 'VideoSubmitted', props }) }))
vi.mock('@/emails/NewClipAlert', () => ({ default: (props: unknown) => ({ template: 'NewClipAlert', props }) }))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: state.user },
          error: state.userError,
        }),
      },
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      let since = false
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters[col] = val; return q },
        gte: () => { since = true; return q },
        maybeSingle: async () => ({ data: table === 'user_rewards' ? state.reward : null, error: null }),
        then: (resolve: (v: { count: number; error: null }) => void) => {
          if (table === 'user_tour_videos' && since) {
            resolve({ count: filters.user_id ? state.recentMine : state.recentAll, error: null })
          } else {
            resolve({ count: state.approvedCount, error: null })
          }
        },
      }
      return q
    },
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://db.example.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  }),
}))

afterAll(() => {
  for (const k of env.keys) {
    if (env.saved[k] === undefined) delete process.env[k]
    else process.env[k] = env.saved[k]
  }
})

const EXP = experiences.find((e) => e.kind !== 'package')!
const CLIP_ID = '7d1c2f4e-0000-4000-8000-000000000001'

function clip(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: CLIP_ID,
    user_id: 'user-1',
    experience_id: EXP.id,
    status: 'pending',
    admin_notes: null,
    caption: 'Climbing the falls with my sister',
    created_at: '2026-10-04T20:00:00Z',
    ...over,
  }
}

function call(body: unknown, secret: string | null = 'video_status_spec_secret') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-supabase-secret'] = secret
  return POST(new Request('https://mapltours.com/api/hooks/video-status', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

const insert = (over: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'INSERT', table: 'user_tour_videos', schema: 'public', record: clip(over), old_record: null })
const update = (from: string, to: string, over: Partial<Record<string, unknown>> = {}) =>
  ({ type: 'UPDATE', table: 'user_tour_videos', schema: 'public', record: clip({ status: to, ...over }), old_record: clip({ status: from }) })

const BRAND_FROM = 'MAPL Tours Jamaica <contact@mapltours.com>'
const toUs = () => state.emails.filter((e) => e.to === 'contact@mapltours.com')
const toGuest = () => state.emails.filter((e) => e.to === 'guest@example.com')
const props = (e: SentEmail) => e.react.props

beforeEach(() => {
  state.emails = []
  state.events = []
  state.answer = () => Promise.resolve({ ok: true, id: 'em_test' })
  state.user = { email: 'guest@example.com', user_metadata: { full_name: 'Rick Hosey' } }
  state.userError = null
  state.approvedCount = 1
  state.recentMine = 1
  state.recentAll = 1
  state.reward = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('video-status webhook: who may call it', () => {
  it('refuses a missing or wrong secret and sends nothing', async () => {
    expect((await call(insert(), null)).status).toBe(401)
    expect((await call(insert(), 'wrong')).status).toBe(401)
    expect(state.emails).toHaveLength(0)
  })

  it('answers bad JSON with 400 and another table with a skip', async () => {
    expect((await call('{not json')).status).toBe(400)
    const res = await call({ type: 'INSERT', table: 'bookings', record: clip(), old_record: null })
    expect(await res.json()).toEqual({ skipped: 'not_target_table' })
    expect(state.emails).toHaveLength(0)
  })
})

describe('video-status webhook: a new clip', () => {
  it('tells us at the public inbox and tells the guest it is in review', async () => {
    const res = await call(insert())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'sent' })

    expect(toUs()).toHaveLength(1)
    const note = toUs()[0]
    expect(note.subject).toBe(`New guest clip to review: ${EXP.title}`)
    expect(note.react.template).toBe('NewClipAlert')
    expect(props(note)).toEqual({
      tour: EXP.title,
      name: 'Rick Hosey',
      email: 'guest@example.com',
      caption: 'Climbing the falls with my sister',
      clipId: CLIP_ID,
      posterUrl: null,
      durationSeconds: null,
    })
    expect(note.tags).toContainEqual({ name: 'category', value: 'new_clip' })
    // Under the full brand name, and a reply reaches the guest.
    expect(note.from).toBe(BRAND_FROM)
    expect(note.replyTo).toBe('guest@example.com')
    // To us alone: no operations list, no driver.
    expect(note.bcc).toBeUndefined()

    expect(toGuest()).toHaveLength(1)
    expect(toGuest()[0].subject).toBe('Your MAPL Tours Jamaica clip is in review')
    expect(toGuest()[0].from).toBe(BRAND_FROM)
    expect(toGuest()[0].react.template).toBe('VideoSubmitted')
    expect(props(toGuest()[0])).toEqual({ firstName: 'Rick', experienceTitle: EXP.title, experienceId: EXP.id })
    expect(state.emails).toHaveLength(2)
  })

  it('sends the two side by side, not one after the other', async () => {
    state.answer = () => new Promise((r) => setTimeout(() => r({ ok: true }), 20))
    await call(insert())
    expect(state.events.slice(0, 2).every((e) => e.startsWith('start:'))).toBe(true)
  })

  it('still tells us when the uploader has no address, and nobody else', async () => {
    state.user = { user_metadata: { full_name: 'Rick Hosey' } }
    const res = await call(insert())
    expect(await res.json()).toEqual({ skipped: 'no_uploader_email', owner: 'sent' })
    expect(state.emails).toHaveLength(1)
    expect(props(toUs()[0])).toMatchObject({ name: 'Rick Hosey', email: null })
    // No address to reply to: replies stay with us.
    expect(toUs()[0].replyTo).toBeUndefined()
  })

  it('reports a failed note to us when the uploader has no address', async () => {
    state.user = { user_metadata: {} }
    state.answer = () => Promise.resolve({ ok: false, error: 'refused' })
    const res = await call(insert())
    expect(await res.json()).toEqual({ skipped: 'no_uploader_email', owner: 'failed' })
  })

  it('still tells us when the auth lookup fails', async () => {
    state.user = null
    state.userError = { message: 'User not found' }
    const res = await call(insert({ caption: null }))
    expect(await res.json()).toEqual({ skipped: 'no_uploader_email', owner: 'sent' })
    expect(state.emails).toHaveLength(1)
    expect(props(toUs()[0])).toEqual({
      tour: EXP.title,
      name: null,
      email: null,
      caption: null,
      clipId: CLIP_ID,
      posterUrl: null,
      durationSeconds: null,
    })
  })

  it('a name that is not text (the guest can edit it) is ignored, not fatal', async () => {
    state.user = { email: 'guest@example.com', user_metadata: { full_name: { nested: true }, name: 42 } }
    const res = await call(insert())
    expect(await res.json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'sent' })
    expect(props(toUs()[0])).toMatchObject({ name: null, email: 'guest@example.com' })
    expect(props(toGuest()[0]).firstName).toBeNull()
  })

  it('a first name that is not a name is not said back to the guest; we still see it', async () => {
    state.user = { email: 'guest@example.com', user_metadata: { full_name: 'visit-evil.com/offer now' } }
    await call(insert())
    expect(props(toGuest()[0]).firstName).toBeNull()
    expect(props(toUs()[0]).name).toBe('visit-evil.com/offer now')
  })

  it('says a real first name back, accents, apostrophes and hyphens included', async () => {
    for (const [full, first] of [['Zoë Saldaña', 'Zoë'], ["D'Angelo Russell", "D'Angelo"], ['Jean-Luc Picard', 'Jean-Luc']]) {
      state.emails = []
      state.user = { email: 'guest@example.com', user_metadata: { full_name: full } }
      await call(insert())
      expect(props(toGuest()[0]).firstName).toBe(first)
    }
  })

  it('clips a very long name', async () => {
    state.user = { email: 'guest@example.com', user_metadata: { full_name: 'R'.repeat(500) } }
    await call(insert())
    expect(props(toUs()[0]).name).toBe('R'.repeat(80))
  })

  it('shows the clip\'s first frame from the public bucket, and its length', async () => {
    await call(insert({ thumbnail_path: 'user-1/thumb-1.jpg', duration_seconds: 14.6 }))
    expect(props(toUs()[0])).toMatchObject({
      posterUrl: 'https://db.example.supabase.co/storage/v1/object/public/tour-videos/user-1/thumb-1.jpg',
      durationSeconds: 14.6,
    })
  })

  it('a length the guest wrote that is not plausible is left out', async () => {
    for (const duration_seconds of [0, -3, 1e9, Number.NaN, '12', null]) {
      state.emails = []
      await call(insert({ duration_seconds }))
      expect(props(toUs()[0]).durationSeconds).toBeNull()
    }
  })

  it('names an unknown experience by its id instead of failing', async () => {
    await call(insert({ experience_id: 99999 }))
    expect(toUs()[0].subject).toBe('New guest clip to review: a tour no longer listed (#99999)')
  })

  it('a refused note to us does not cost the guest their email', async () => {
    state.answer = (e) => Promise.resolve(e.to === 'contact@mapltours.com' ? { ok: false, error: 'refused' } : { ok: true })
    const res = await call(insert())
    expect(await res.json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'failed' })
    expect(toGuest()).toHaveLength(1)
  })

  it('a throwing note to us does not cost the guest their email', async () => {
    state.answer = (e) => (e.to === 'contact@mapltours.com' ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true }))
    const res = await call(insert())
    expect(await res.json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'failed' })
  })

  it('a hanging note to us gives up after 3 s and the guest is still told', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    state.answer = (e) => (e.to === 'contact@mapltours.com' ? new Promise(() => {}) : Promise.resolve({ ok: true }))
    const pending = call(insert())
    await vi.advanceTimersByTimeAsync(2_999)
    let settled = false
    void pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const res = await pending
    expect(await res.json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'failed' })
  })

  it('a refused guest email is reported as not sent', async () => {
    state.answer = (e) => Promise.resolve(e.to === 'guest@example.com' ? { ok: false, error: 'refused' } : { ok: true })
    const res = await call(insert())
    expect(await res.json()).toEqual({ ok: false, sent: null, owner: 'sent' })
  })

  it('clips a long caption and renders markup in it as text', async () => {
    await call(insert({ caption: `<img src=x onerror=alert(1)><b>bold</b> ${'a'.repeat(400)}` }))
    const caption = props(toUs()[0]).caption as string
    expect(caption.length).toBe(300)
    const { default: RealNewClipAlert } = await vi.importActual<typeof import('@/emails/NewClipAlert')>('@/emails/NewClipAlert')
    const html = await render(RealNewClipAlert(props(toUs()[0]) as unknown as Parameters<typeof RealNewClipAlert>[0]))
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    // The button opens the queue on this clip, and says who to reply to.
    expect(html).toContain(`https://mapltours.com/admin/videos?clip=${CLIP_ID}`)
    expect(html).toContain('Reply to this email to write to Rick Hosey.')
    expect(html).toContain('Rick Hosey posted a clip from')
  })

  it('a clip inserted already reviewed (a backfill) sends nothing', async () => {
    const res = await call(insert({ status: 'approved' }))
    expect(await res.json()).toEqual({ ok: true, skipped: 'no_matching_transition' })
    expect(state.emails).toHaveLength(0)
  })
})

describe('video-status webhook: a loop of inserts cannot become a flood of email', () => {
  it('past 5 clips an hour from one account, nobody is emailed', async () => {
    state.recentMine = 6
    const res = await call(insert())
    expect(await res.json()).toEqual({ ok: true, skipped: 'capped', owner: 'capped' })
    expect(state.emails).toHaveLength(0)
  })

  it('the fifth clip in an hour is still sent', async () => {
    state.recentMine = 5
    expect(await (await call(insert())).json()).toEqual({ ok: true, sent: 'video_submitted', owner: 'sent' })
    expect(state.emails).toHaveLength(2)
  })

  it('past 20 clips an hour across everyone, nobody is emailed, the guest included', async () => {
    // Many accounts, five clips each, must not add up to mail for strangers:
    // an address is not confirmed at sign-up.
    state.recentAll = 21
    expect(await (await call(insert())).json()).toEqual({ ok: true, skipped: 'capped', owner: 'capped' })
    expect(state.emails).toHaveLength(0)
  })
})

describe('video-status webhook: reviews wait for the evening email', () => {
  it('an approval sends nothing now', async () => {
    const res = await call(update('pending', 'approved'))
    expect(await res.json()).toEqual({ ok: true, skipped: 'emailed_in_evening_digest' })
    expect(state.emails).toHaveLength(0)
  })

  it('a rejection sends nothing now', async () => {
    const res = await call(update('pending', 'rejected', { admin_notes: 'Too dark to see the falls' }))
    expect(await res.json()).toEqual({ ok: true, skipped: 'emailed_in_evening_digest' })
    expect(state.emails).toHaveLength(0)
  })

  it('flagging, and an update that keeps the status, send nothing', async () => {
    expect(await (await call(update('pending', 'flagged'))).json()).toEqual({ ok: true, skipped: 'flagged_is_internal' })
    expect(await (await call(update('pending', 'pending'))).json()).toEqual({ ok: true, skipped: 'no_matching_transition' })
    expect(state.emails).toHaveLength(0)
  })

  it('a review for an uploader with no address sends nothing', async () => {
    state.user = { user_metadata: {} }
    expect(await (await call(update('pending', 'approved'))).json()).toEqual({ skipped: 'no_uploader_email' })
    expect(state.emails).toHaveLength(0)
  })
})
