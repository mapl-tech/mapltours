import { createRemoteJWKSet, customFetch, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { clipDerivativePaths } from './video-rules'

/**
 * The phone copies of guest and MAPL clips (lib/video-rules
 * clipDerivativePaths) are made by a GitHub Actions job every 15 minutes
 * (.github/workflows/clip-copies.yml running scripts/encode-tour-clips.mjs),
 * because encoding needs minutes of CPU and ffmpeg, which a Netlify function
 * has neither of. The job asks /api/clip-copies what needs copies; the route
 * answers with signed upload URLs for exactly those copies, so the job holds
 * no Supabase key and can write nothing else.
 *
 * The job proves who it is with GitHub's own OIDC token, so no secret is kept
 * in GitHub either: only this repository's clip-copies workflow, running on
 * main, from a schedule or the Run workflow button, gets an answer. The repo
 * and owner ids (not just the names) are checked, because a name can be
 * freed by a rename and claimed by somebody else.
 */

export const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
export const CLIP_COPIES_AUDIENCE = 'https://mapltours.com/api/clip-copies'
export const CLIP_COPIES_JOB = {
  repository: 'mapl-tech/mapltours',
  repositoryId: '1208311822',
  ownerId: '255713902',
  workflowRef: 'mapl-tech/mapltours/.github/workflows/clip-copies.yml@refs/heads/main',
  ref: 'refs/heads/main',
  events: ['schedule', 'workflow_dispatch'],
} as const

export type ClipCopiesEvent = (typeof CLIP_COPIES_JOB.events)[number]

// Next keeps a route's fetches in its Data Cache unless told not to, and a
// cached key set would outlive GitHub rotating its signing key: every run
// would be refused until the next deploy.
const githubKeys = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`), {
  [customFetch]: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
})

/** The event that started the job, for a current token minted for the
 *  clip-copies workflow on main; null for anything else. */
export async function clipCopiesJob(token: string, keys: JWTVerifyGetKey = githubKeys): Promise<ClipCopiesEvent | null> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: CLIP_COPIES_AUDIENCE,
      algorithms: ['RS256'],
      clockTolerance: 30,
    })
    const job = CLIP_COPIES_JOB
    const event = job.events.find((e) => e === payload.event_name)
    const ok = payload.repository === job.repository
      && String(payload.repository_id) === job.repositoryId
      && String(payload.repository_owner_id) === job.ownerId
      && payload.workflow_ref === job.workflowRef
      && payload.ref === job.ref
    return ok && event ? event : null
  } catch {
    return null
  }
}

export interface ClipCopyRow {
  id: string
  user_id: string
  status: string
  video_path: string
}

export interface ClipCopyPlan {
  id: string
  path: string
  hevc: string
  h264: string
  /** Written by the job when a clip cannot be encoded, so it is not retried every run. */
  failed: string
}

export function clipFailedMarker(path: string): string {
  return clipDerivativePaths(path).h264.replace(/\.mp4$/, '.failed.txt')
}

/**
 * The one shape uploadTourVideo (lib/tour-videos) gives a clip:
 * `<uid>/<experience id>-<ms timestamp>.<extension>`. `video_path` is written
 * by the uploader's browser, and storage-js puts a path into the signing URL
 * unencoded, where `%2e%2e` is a parent directory and `?` or `#` ends the
 * path. Anything else could aim an upload outside m/, or at another bucket.
 */
const CLIP_FILE = /^\d{1,6}-\d{10,16}\.[a-z0-9]{1,8}$/
const UID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function trustedClipPath(row: Pick<ClipCopyRow, 'user_id' | 'video_path'>): boolean {
  const [uid, file, ...rest] = (row.video_path ?? '').split('/')
  return rest.length === 0 && uid === row.user_id && UID.test(uid) && CLIP_FILE.test(file ?? '')
}

/** The folders the planner reads: each uploader's own, and its copies' under m/. */
export function clipCopyFolders(rows: ClipCopyRow[]): string[] {
  const uids = new Set(rows.filter((r) => r.status !== 'rejected' && trustedClipPath(r)).map((r) => r.user_id))
  return Array.from(uids).flatMap((uid) => [uid, `m/${uid}`])
}

/**
 * The clips that still need copies, oldest first, with one asked for by id
 * (`force`) at the front. Rejected clips are left alone; a pending one is
 * encoded so it is light the moment it is approved. A clip is only trusted
 * with its upload actually in its uploader's folder (`stored`), so a row
 * pointing at nothing never reaches the job. A clip with a failure marker
 * waits until it is asked for by id, which also re-encodes a finished one.
 */
export function planClipCopies(rows: ClipCopyRow[], stored: Set<string>, force?: string): ClipCopyPlan[] {
  const seen = new Set<string>()
  const plan: ClipCopyPlan[] = []
  for (const row of rows) {
    if (row.status === 'rejected' || !trustedClipPath(row)) continue
    const path = row.video_path
    if (seen.has(path) || !stored.has(path)) continue
    seen.add(path)
    const { hevc, h264 } = clipDerivativePaths(path)
    const failed = clipFailedMarker(path)
    const due = row.id === force || (!stored.has(failed) && !(stored.has(hevc) && stored.has(h264)))
    if (!due) continue
    if (row.id === force) plan.unshift({ id: row.id, path, hevc, h264, failed })
    else plan.push({ id: row.id, path, hevc, h264, failed })
  }
  return plan
}
