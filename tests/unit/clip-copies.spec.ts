import { describe, test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose'

/**
 * New tour clips get their phone copies from a GitHub Actions job (Oct 31
 * 2026; before that a person had to run the script). The job holds no key: the
 * site trusts GitHub's OIDC token for this repo's workflow on main, and answers
 * with upload URLs for exactly the copies that are missing.
 */

const db = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; user_id: string; status: string; video_path: string }>,
  stored: [] as string[],
  signed: [] as string[],
  listError: null as null | { message: string },
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.neq = (col: string, val: string) => {
        chain.filtered = db.rows.filter((r) => (r as Record<string, string>)[col] !== val)
        return chain
      }
      chain.order = async () => ({ data: chain.filtered, error: null })
      return chain
    },
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string, { offset }: { offset: number }) => {
          if (db.listError) return { data: null, error: db.listError }
          const names = db.stored.filter((p) => p.slice(0, p.lastIndexOf('/')) === folder).map((p) => ({ name: p.slice(p.lastIndexOf('/') + 1) }))
          return { data: names.slice(offset, offset + 1000), error: null }
        },
        createSignedUploadUrl: async (p: string, opts: { upsert: boolean }) => {
          db.signed.push(p)
          return { data: { signedUrl: `https://sb.example/storage/v1/object/upload/sign/${bucket}/${p}?token=t&upsert=${opts.upsert}` }, error: null }
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://sb.example/storage/v1/object/public/${bucket}/${p}` } }),
      }),
    },
  }),
}))

import { GET } from '@/app/api/clip-copies/route'
import { CLIP_COPIES_AUDIENCE, CLIP_COPIES_JOB, GITHUB_OIDC_ISSUER, isClipCopiesJob, planClipCopies } from '@/lib/clip-copies'

const U1 = '2aa2684f-0000-4000-8000-000000000001'
const U2 = '69b8aaaa-0000-4000-8000-000000000002'
const C = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let privateKey: CryptoKey
let otherKey: CryptoKey
let jwk: JWK

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'gh1', alg: 'RS256', use: 'sig' }
  otherKey = (await generateKeyPair('RS256')).privateKey
})

const goodClaims = () => ({
  repository: CLIP_COPIES_JOB.repository,
  repository_id: CLIP_COPIES_JOB.repositoryId,
  repository_owner_id: CLIP_COPIES_JOB.ownerId,
  workflow_ref: CLIP_COPIES_JOB.workflowRef,
  ref: CLIP_COPIES_JOB.ref,
  event_name: 'schedule',
})

async function token(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string | number } = {}) {
  return new SignJWT({ ...goodClaims(), ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'gh1' })
    .setIssuer(opts.iss ?? GITHUB_OIDC_ISSUER)
    .setAudience(opts.aud ?? CLIP_COPIES_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? privateKey)
}

describe('which clips need copies', () => {
  const row = (id: string, user: string, file: string, status = 'approved') => ({ id, user_id: user, status, video_path: `${user}/${file}` })

  test('a clip without both copies is due; one with both is not', () => {
    const rows = [row(C(1), U1, '2-1.mov'), row(C(2), U1, '5-2.mp4'), row(C(3), U2, '14-3.webm')]
    const stored = new Set([`m/${U1}/5-2.hevc.mp4`, `m/${U1}/5-2.mp4`, `m/${U2}/14-3.hevc.mp4`])
    expect(planClipCopies(rows, stored).map((c) => c.id)).toEqual([C(1), C(3)])
    expect(planClipCopies(rows, stored)[0]).toEqual({
      id: C(1), path: `${U1}/2-1.mov`, hevc: `m/${U1}/2-1.hevc.mp4`, h264: `m/${U1}/2-1.mp4`, failed: `m/${U1}/2-1.failed.txt`,
    })
  })

  test('pending and flagged clips are encoded ahead of approval; rejected ones never', () => {
    const rows = [row(C(1), U1, 'a.mov', 'pending'), row(C(2), U1, 'b.mov', 'flagged'), row(C(3), U1, 'c.mov', 'rejected')]
    expect(planClipCopies(rows, new Set()).map((c) => c.id)).toEqual([C(1), C(2)])
  })

  test('a row naming a file outside its uploader’s own folder is ignored', () => {
    const rows = [
      { id: C(1), user_id: U1, status: 'approved', video_path: `${U2}/theirs.mov` },
      { id: C(2), user_id: U1, status: 'approved', video_path: `m/${U1}/x.mp4` },
      { id: C(3), user_id: U1, status: 'approved', video_path: `${U1}/../${U2}/x.mov` },
      { id: C(4), user_id: '', status: 'approved', video_path: '/x.mov' },
    ]
    expect(planClipCopies(rows, new Set())).toEqual([])
  })

  test('a clip that failed waits until asked for by id, which also redoes a finished one', () => {
    const rows = [row(C(1), U1, 'a.mov'), row(C(2), U1, 'b.mov')]
    const stored = new Set([`m/${U1}/a.failed.txt`, `m/${U1}/b.hevc.mp4`, `m/${U1}/b.mp4`])
    expect(planClipCopies(rows, stored)).toEqual([])
    expect(planClipCopies(rows, stored, C(1)).map((c) => c.id)).toEqual([C(1)])
    expect(planClipCopies(rows, stored, C(2)).map((c) => c.id)).toEqual([C(2)])
  })

  test('two rows for one file are encoded once', () => {
    expect(planClipCopies([row(C(1), U1, 'a.mov'), row(C(2), U1, 'a.mov')], new Set())).toHaveLength(1)
  })
})

describe('only the clip-copies workflow on main gets an answer', () => {
  const keys = () => createLocalJWKSet({ keys: [jwk] })

  test('a token GitHub minted for this workflow on main, scheduled or run by hand', async () => {
    expect(await isClipCopiesJob(await token(), keys())).toBe(true)
    expect(await isClipCopiesJob(await token({ event_name: 'workflow_dispatch' }), keys())).toBe(true)
  })

  test.each([
    ['another repository', { repository: 'someone/mapltours' }],
    ['a repository that took the name after a rename', { repository_id: '999' }],
    ['another owner', { repository_owner_id: '1' }],
    ['another workflow in the repo', { workflow_ref: 'mapl-tech/mapltours/.github/workflows/other.yml@refs/heads/main' }],
    ['a branch other than main', { ref: 'refs/heads/feature', workflow_ref: 'mapl-tech/mapltours/.github/workflows/clip-copies.yml@refs/heads/feature' }],
    ['a pull request', { event_name: 'pull_request' }],
  ])('refuses %s', async (_label, claims) => {
    expect(await isClipCopiesJob(await token(claims), keys())).toBe(false)
  })

  test('refuses a token for another audience, another issuer, an expired one, or one GitHub did not sign', async () => {
    expect(await isClipCopiesJob(await token({}, { aud: 'https://example.com' }), keys())).toBe(false)
    expect(await isClipCopiesJob(await token({}, { iss: 'https://evil.example' }), keys())).toBe(false)
    expect(await isClipCopiesJob(await token({}, { exp: Math.floor(Date.now() / 1000) - 120 }), keys())).toBe(false)
    expect(await isClipCopiesJob(await token({}, { key: otherKey }), keys())).toBe(false)
    expect(await isClipCopiesJob('not-a-token', keys())).toBe(false)
  })

  test('refuses an unsigned token', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...goodClaims(), iss: GITHUB_OIDC_ISSUER, aud: CLIP_COPIES_AUDIENCE, iat: now, exp: now + 300 })}.`
    expect(await isClipCopiesJob(unsigned, keys())).toBe(false)
  })
})

describe('/api/clip-copies', () => {
  const call = async (query = '', bearer?: string) => {
    const t = bearer ?? (await token())
    return GET(new NextRequest(`https://mapltours.com/api/clip-copies${query}`, { headers: { authorization: `Bearer ${t}` } }))
  }

  beforeEach(() => {
    db.rows = [
      { id: C(1), user_id: U1, status: 'approved', video_path: `${U1}/2-1.mov` },
      { id: C(2), user_id: U1, status: 'pending', video_path: `${U1}/5-2.mp4` },
      { id: C(3), user_id: U2, status: 'rejected', video_path: `${U2}/14-3.mov` },
      { id: C(4), user_id: U2, status: 'approved', video_path: `${U2}/14-4.mp4` },
    ]
    db.stored = [`m/${U2}/14-4.hevc.mp4`, `m/${U2}/14-4.mp4`]
    db.signed = []
    db.listError = null
    vi.stubGlobal('fetch', async (url: string | URL) => {
      if (String(url) === `${GITHUB_OIDC_ISSUER}/.well-known/jwks`) {
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch ${url}`)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  test('no token, or one that is not the job’s, is 401 and reads nothing', async () => {
    const none = await GET(new NextRequest('https://mapltours.com/api/clip-copies'))
    expect(none.status).toBe(401)
    expect((await call('', await token({ ref: 'refs/heads/feature' }))).status).toBe(401)
    expect(db.signed).toEqual([])
  })

  test('a dry run counts and mints nothing', async () => {
    const res = await call('?dry=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ todo: 2 })
    expect(db.signed).toEqual([])
  })

  test('the work list holds upload URLs for exactly the missing copies and their markers', async () => {
    const res = await call()
    const body = await res.json()
    expect(body.more).toBe(0)
    expect(body.clips.map((c: { id: string }) => c.id)).toEqual([C(1), C(2)])
    expect(body.clips[0]).toEqual({
      id: C(1),
      path: `${U1}/2-1.mov`,
      source: `https://sb.example/storage/v1/object/public/tour-videos/${U1}/2-1.mov`,
      uploads: {
        hevc: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/2-1.hevc.mp4?token=t&upsert=true`,
        h264: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/2-1.mp4?token=t&upsert=true`,
        failed: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/2-1.failed.txt?token=t&upsert=true`,
      },
    })
    expect(db.signed.every((p) => p.startsWith('m/'))).toBe(true)
    expect(db.signed).toHaveLength(6)
  })

  test('a clip asked for by id comes back even with its copies; a malformed id is 400', async () => {
    const body = await (await call(`?clip=${C(4)}`)).json()
    expect(body.clips.map((c: { id: string }) => c.id)).toEqual([C(1), C(2), C(4)])
    expect((await call('?clip=../../x')).status).toBe(400)
  })

  test('at most 12 clips a run; the rest are counted for the next', async () => {
    db.rows = Array.from({ length: 15 }, (_, i) => ({ id: C(i + 1), user_id: U1, status: 'approved', video_path: `${U1}/${i}.mov` }))
    db.stored = []
    const body = await (await call()).json()
    expect(body.clips).toHaveLength(12)
    expect(body.more).toBe(3)
  })

  test('storage it cannot read is a 500, never a list of clips to redo', async () => {
    db.listError = { message: 'boom' }
    const res = await call()
    expect(res.status).toBe(500)
    expect(db.signed).toEqual([])
  })
})
