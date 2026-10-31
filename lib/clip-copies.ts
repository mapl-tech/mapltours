import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
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

const githubKeys = createRemoteJWKSet(new URL(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`))

/** True only for a current token minted for the clip-copies job on main. */
export async function isClipCopiesJob(token: string, keys: JWTVerifyGetKey = githubKeys): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: CLIP_COPIES_AUDIENCE,
      algorithms: ['RS256'],
      clockTolerance: 30,
    })
    const job = CLIP_COPIES_JOB
    return payload.repository === job.repository
      && String(payload.repository_id) === job.repositoryId
      && String(payload.repository_owner_id) === job.ownerId
      && payload.workflow_ref === job.workflowRef
      && payload.ref === job.ref
      && (job.events as readonly string[]).includes(String(payload.event_name))
  } catch {
    return false
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
 * The clips that still need copies, oldest first. Rejected clips are left
 * alone; a pending one is encoded so it is light the moment it is approved.
 * `video_path` is written by the uploader's browser, so a row is only trusted
 * with a file in its own uid folder (as app/api/drive-sync checks). A clip
 * with a failure marker waits until it is asked for by id (`force`), which
 * also re-encodes a clip that has its copies.
 */
export function planClipCopies(rows: ClipCopyRow[], stored: Set<string>, force?: string): ClipCopyPlan[] {
  const seen = new Set<string>()
  const plan: ClipCopyPlan[] = []
  for (const row of rows) {
    if (row.status === 'rejected') continue
    const path = row.video_path ?? ''
    if (!row.user_id || !path.startsWith(`${row.user_id}/`) || path.includes('..') || path.includes('//')) continue
    if (seen.has(path)) continue
    seen.add(path)
    const { hevc, h264 } = clipDerivativePaths(path)
    const failed = clipFailedMarker(path)
    const due = row.id === force || (!stored.has(failed) && !(stored.has(hevc) && stored.has(h264)))
    if (due) plan.push({ id: row.id, path, hevc, h264, failed })
  }
  return plan
}
