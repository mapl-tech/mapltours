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
import { CLIP_COPIES_AUDIENCE, CLIP_COPIES_JOB, GITHUB_OIDC_ISSUER, clipCopiesJob, clipCopyFolders, planClipCopies, trustedClipPath } from '@/lib/clip-copies'

const U1 = '2aa2684f-0000-4000-8000-000000000001'
const U2 = '69b8def3-0000-4000-8000-000000000002'
const C = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
// The shape uploadTourVideo gives a clip: <uid>/<experience>-<ms timestamp>.<ext>
const F = (n: number, ext = 'mov') => `${n % 20}-17911${String(n).padStart(8, '0')}.${ext}`

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

const row = (id: string, user: string, file: string, status = 'approved') => ({ id, user_id: user, status, video_path: `${user}/${file}` })

describe('which clips need copies', () => {
  test('a clip without both copies is due; one with both is not', () => {
    const rows = [row(C(1), U1, F(1)), row(C(2), U1, F(2, 'mp4')), row(C(3), U2, F(3, 'webm'))]
    const stored = new Set([...rows.map((r) => r.video_path), `m/${U1}/${F(2, 'hevc.mp4')}`, `m/${U1}/${F(2, 'mp4')}`, `m/${U2}/${F(3, 'hevc.mp4')}`])
    const plan = planClipCopies(rows, stored)
    expect(plan.map((c) => c.id)).toEqual([C(1), C(3)])
    const base = F(1).replace(/\.mov$/, '')
    expect(plan[0]).toEqual({
      id: C(1), path: `${U1}/${F(1)}`, hevc: `m/${U1}/${base}.hevc.mp4`, h264: `m/${U1}/${base}.mp4`, failed: `m/${U1}/${base}.failed.txt`,
    })
  })

  test('pending and flagged clips are encoded ahead of approval; rejected ones never', () => {
    const rows = [row(C(1), U1, F(1), 'pending'), row(C(2), U1, F(2), 'flagged'), row(C(3), U1, F(3), 'rejected')]
    expect(planClipCopies(rows, new Set(rows.map((r) => r.video_path))).map((c) => c.id)).toEqual([C(1), C(2)])
  })

  test('a row whose upload is not in its uploader’s folder never reaches the job', () => {
    expect(planClipCopies([row(C(1), U1, F(1))], new Set())).toEqual([])
  })

  test.each([
    ['another uploader’s folder', U1, `${U2}/${F(1)}`],
    ['the copies folder', U1, `m/${U1}/${F(1)}`],
    ['a parent directory', U1, `${U1}/../${U2}/${F(1)}`],
    ['an encoded parent directory, which the signing URL would follow', U1, `${U1}/%2e%2e/%2E%2e/other-bucket/${F(1)}`],
    ['a question mark, which would end the signing URL’s path', U1, `${U1}/1-1791100000000?x.mov`],
    ['a hash', U1, `${U1}/1-1791100000000#.mov`],
    ['a subfolder', U1, `${U1}/a/${F(1)}`],
    ['a name the upload form never makes', U1, `${U1}/holiday.mov`],
    ['an extension with a space', U1, `${U1}/1-1791100000000.mp4 (1)`],
    ['an uploader id that is not a uid', 'm', `m/${F(1)}`],
    ['no uploader', '', `/${F(1)}`],
  ])('refuses a path into %s', (_label, user, path) => {
    const r = { id: C(1), user_id: user, status: 'approved', video_path: path }
    expect(trustedClipPath(r)).toBe(false)
    expect(planClipCopies([r], new Set([path]))).toEqual([])
  })

  test('the upload form’s own names are trusted', () => {
    for (const file of ['2-1792160211772.mov', '14-1791157747500.mp4', '5-1791173690902.webm', '120-1791173690902.m4v']) {
      expect(trustedClipPath({ user_id: U1, video_path: `${U1}/${file}` })).toBe(true)
    }
  })

  test('the folders read are each uploader’s own and its copies’, for trusted rows only', () => {
    const rows = [row(C(1), U1, F(1)), row(C(2), U1, F(2)), row(C(3), U2, F(3), 'rejected'), { id: C(4), user_id: U2, status: 'approved', video_path: `${U2}/%2e%2e/x.mov` }]
    expect(clipCopyFolders(rows)).toEqual([U1, `m/${U1}`])
  })

  test('a clip that failed waits until asked for by id, which also redoes a finished one and puts it first', () => {
    const rows = [row(C(1), U1, F(1)), row(C(2), U1, F(2)), row(C(3), U1, F(3))]
    const b = (n: number) => F(n).replace(/\.mov$/, '')
    const stored = new Set([...rows.map((r) => r.video_path), `m/${U1}/${b(1)}.failed.txt`, `m/${U1}/${b(2)}.hevc.mp4`, `m/${U1}/${b(2)}.mp4`])
    expect(planClipCopies(rows, stored).map((c) => c.id)).toEqual([C(3)])
    expect(planClipCopies(rows, stored, C(1)).map((c) => c.id)).toEqual([C(1), C(3)])
    expect(planClipCopies(rows, stored, C(2)).map((c) => c.id)).toEqual([C(2), C(3)])
  })

  test('two rows for one file are encoded once', () => {
    const rows = [row(C(1), U1, F(1)), row(C(2), U1, F(1))]
    expect(planClipCopies(rows, new Set([rows[0].video_path]))).toHaveLength(1)
  })
})

describe('only the clip-copies workflow on main gets an answer', () => {
  const keys = () => createLocalJWKSet({ keys: [jwk] })

  test('a token GitHub minted for this workflow on main, scheduled or run by hand, names its event', async () => {
    expect(await clipCopiesJob(await token(), keys())).toBe('schedule')
    expect(await clipCopiesJob(await token({ event_name: 'workflow_dispatch' }), keys())).toBe('workflow_dispatch')
  })

  test.each([
    ['another repository', { repository: 'someone/mapltours' }],
    ['a repository that took the name after a rename', { repository_id: '999' }],
    ['another owner', { repository_owner_id: '1' }],
    ['another workflow in the repo', { workflow_ref: 'mapl-tech/mapltours/.github/workflows/other.yml@refs/heads/main' }],
    ['a branch other than main', { ref: 'refs/heads/feature', workflow_ref: 'mapl-tech/mapltours/.github/workflows/clip-copies.yml@refs/heads/feature' }],
    ['a pull request', { event_name: 'pull_request' }],
  ])('refuses %s', async (_label, claims) => {
    expect(await clipCopiesJob(await token(claims), keys())).toBeNull()
  })

  test('refuses a token for another audience, another issuer, an expired one, or one GitHub did not sign', async () => {
    expect(await clipCopiesJob(await token({}, { aud: 'https://example.com' }), keys())).toBeNull()
    expect(await clipCopiesJob(await token({}, { iss: 'https://evil.example' }), keys())).toBeNull()
    expect(await clipCopiesJob(await token({}, { exp: Math.floor(Date.now() / 1000) - 120 }), keys())).toBeNull()
    expect(await clipCopiesJob(await token({}, { key: otherKey }), keys())).toBeNull()
    expect(await clipCopiesJob('not-a-token', keys())).toBeNull()
  })

  test('refuses an unsigned token', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...goodClaims(), iss: GITHUB_OIDC_ISSUER, aud: CLIP_COPIES_AUDIENCE, iat: now, exp: now + 300 })}.`
    expect(await clipCopiesJob(unsigned, keys())).toBeNull()
  })
})

describe('/api/clip-copies', () => {
  const jwksFetches: RequestInit[] = []
  const call = async (query = '', bearer?: string) => {
    const t = bearer ?? (await token())
    return GET(new NextRequest(`https://mapltours.com/api/clip-copies${query}`, { headers: { authorization: `Bearer ${t}` } }))
  }
  const handRun = async () => token({ event_name: 'workflow_dispatch' })

  beforeEach(() => {
    db.rows = [
      row(C(1), U1, F(1)),
      row(C(2), U1, F(2, 'mp4'), 'pending'),
      row(C(3), U2, F(3), 'rejected'),
      row(C(4), U2, F(4, 'mp4')),
      { id: C(5), user_id: U2, status: 'approved', video_path: `${U2}/%2e%2e/%2e%2e/x/${F(5)}` },
      row(C(6), U2, F(6)),
    ]
    // C(6)'s upload is not in storage.
    db.stored = [...db.rows.filter((r) => r.id !== C(6)).map((r) => r.video_path), `m/${U2}/${F(4, 'hevc.mp4')}`, `m/${U2}/${F(4, 'mp4')}`]
    db.signed = []
    db.listError = null
    jwksFetches.length = 0
    vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
      if (String(url) === `${GITHUB_OIDC_ISSUER}/.well-known/jwks`) {
        jwksFetches.push(init ?? {})
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

  test('GitHub’s keys are fetched past Next’s cache, so a key rotation is seen', async () => {
    // A fresh module: the one above has the key set cached by now.
    vi.resetModules()
    const fresh = await import('@/lib/clip-copies')
    expect(await fresh.clipCopiesJob(await token())).toBe('schedule')
    expect(jwksFetches.length).toBeGreaterThan(0)
    expect(jwksFetches.every((i) => i.cache === 'no-store')).toBe(true)
  })

  test('a dry run counts and mints nothing', async () => {
    const res = await call('?dry=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ todo: 2 })
    expect(db.signed).toEqual([])
  })

  test('the work list holds upload URLs for exactly the missing copies and their markers, under m/ only', async () => {
    const res = await call()
    const body = await res.json()
    expect(body.more).toBe(0)
    expect(body.clips.map((c: { id: string }) => c.id)).toEqual([C(1), C(2)])
    const base = F(1).replace(/\.mov$/, '')
    expect(body.clips[0]).toEqual({
      id: C(1),
      source: `https://sb.example/storage/v1/object/public/tour-videos/${U1}/${F(1)}`,
      uploads: {
        hevc: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/${base}.hevc.mp4?token=t&upsert=true`,
        h264: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/${base}.mp4?token=t&upsert=true`,
        failed: `https://sb.example/storage/v1/object/upload/sign/tour-videos/m/${U1}/${base}.failed.txt?token=t&upsert=true`,
      },
    })
    expect(db.signed).toHaveLength(6)
    expect(db.signed.every((p) => /^m\/[0-9a-f-]{36}\/\d+-\d+\.(hevc\.mp4|mp4|failed\.txt)$/.test(p))).toBe(true)
  })

  test('Run workflow with a clip id puts that clip first even with its copies; a malformed id is 400', async () => {
    const body = await (await call(`?clip=${C(4)}`, await handRun())).json()
    expect(body.clips.map((c: { id: string }) => c.id)).toEqual([C(4), C(1), C(2)])
    expect((await call('?clip=../../x', await handRun())).status).toBe(400)
  })

  test('a scheduled run’s token cannot ask for a clip by id', async () => {
    expect((await call(`?clip=${C(4)}`)).status).toBe(403)
    expect(db.signed).toEqual([])
  })

  test('at most 12 clips a run; the rest are counted for the next', async () => {
    db.rows = Array.from({ length: 15 }, (_, i) => row(C(i + 1), U1, F(i + 1)))
    db.stored = db.rows.map((r) => r.video_path)
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
