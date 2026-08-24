import 'server-only'
import { createSign } from 'node:crypto'

/**
 * Google Drive archive for guest clips: every uploaded tour video is also
 * copied into the shared marketing folder, named
 * "0007 - Bamboo Rafting on the Martha Brae.mp4" so the folder reads as a
 * numbered catalog per tour.
 *
 * Written against the Drive REST API directly (no googleapis dependency,
 * same policy as lib/google-calendar): a JWT minted from the service-account
 * key exchanges for a bearer token, cached until expiry.
 *
 * Same rules as the calendar sync:
 *   1. Best-effort garnish, never a gate. A Drive hiccup must never fail or
 *      slow a guest's upload; the client fires the sync and forgets it.
 *   2. Idempotent: user_tour_videos.drive_file_id records the copy, and the
 *      sync route skips any clip that already has one.
 *
 * Config (absent config disables the sync silently):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL          shared with the calendar sync
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY    shared with the calendar sync
 *   GOOGLE_DRIVE_CLIPS_FOLDER_ID          optional override of the folder
 *
 * AUTH REALITY (verified 2026-08-24): Google service accounts have NO
 * storage quota, so a plain SA token cannot upload into anyone's My Drive
 * folder. Two ways through, either of which this module supports:
 *
 *   GOOGLE_DRIVE_IMPERSONATE     a Workspace user email; the SA acts as
 *                                them via domain-wide delegation (Workspace
 *                                admin must authorize the SA's client id
 *                                for the drive scope). Uploads land as that
 *                                user, on their quota.
 *   GOOGLE_DRIVE_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN
 *                                a one-time-consented refresh token for the
 *                                folder owner's own Google account (works
 *                                for consumer accounts, no Workspace
 *                                needed). Takes priority when all three
 *                                are set.
 *
 * A folder in a true Shared Drive also works with the bare SA (as a
 * member), since Shared Drives carry their own quota.
 */

/** The MAPL clips folder Leshan shared (drive.google.com/drive/folders/...). */
const DEFAULT_CLIPS_FOLDER_ID = '1bp1DVt48TTyy2JhcCj9z4ZzMXepijprx'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

function oauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN,
  )
}

export function driveConfigured(): boolean {
  return oauthConfigured() || Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  )
}

export function driveClipsFolderId(): string {
  return process.env.GOOGLE_DRIVE_CLIPS_FOLDER_ID || DEFAULT_CLIPS_FOLDER_ID
}

/* ── Bearer token, cached until shortly before expiry ── */

let cachedToken: { value: string; expiresAt: number } | null = null

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

async function driveToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  // Preferred: the folder owner's own refresh token (works for any Google
  // account, and the uploads land on their quota under their ownership).
  let tokenRequest: URLSearchParams
  if (oauthConfigured()) {
    tokenRequest = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN!,
    })
  } else {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n')

    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(JSON.stringify({
      iss: email,
      // Workspace domain-wide delegation: act as this user so uploads have
      // a real storage quota behind them.
      ...(process.env.GOOGLE_DRIVE_IMPERSONATE ? { sub: process.env.GOOGLE_DRIVE_IMPERSONATE } : {}),
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }))
    const signer = createSign('RSA-SHA256')
    signer.update(`${header}.${claims}`)
    const jwt = `${header}.${claims}.${signer.sign(key, 'base64url')}`
    tokenRequest = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    })
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenRequest,
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.access_token) return null

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}

/* ── Upload ── */

export interface DriveUploadResult {
  ok: boolean
  fileId?: string
  error?: string
}

/**
 * Copy one clip into the archive folder via a resumable upload: metadata
 * first (name + parent), then the bytes. supportsAllDrives so the folder
 * may live in a Shared Drive. Timeouts are caller-supplied so the route can
 * keep its whole pipeline inside the serverless execution cap.
 */
export async function uploadClipToDrive({
  name,
  contentType,
  bytes,
  initiateTimeoutMs = 6_000,
  putTimeoutMs = 22_000,
}: {
  name: string
  contentType: string
  bytes: ArrayBuffer
  initiateTimeoutMs?: number
  putTimeoutMs?: number
}): Promise<DriveUploadResult> {
  try {
    const token = await driveToken()
    if (!token) return { ok: false, error: 'token' }

    const initiate = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(bytes.byteLength),
        },
        body: JSON.stringify({ name, parents: [driveClipsFolderId()] }),
        signal: AbortSignal.timeout(initiateTimeoutMs),
        cache: 'no-store',
      },
    )
    if (!initiate.ok) {
      const detail = await initiate.text().catch(() => '')
      return { ok: false, error: `initiate ${initiate.status}: ${detail.slice(0, 200)}` }
    }
    const session = initiate.headers.get('location')
    if (!session) return { ok: false, error: 'no session uri' }

    const put = await fetch(session, {
      method: 'PUT',
      headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.byteLength) },
      body: bytes,
      signal: AbortSignal.timeout(putTimeoutMs),
      cache: 'no-store',
    })
    const file = await put.json().catch(() => null)
    if (!put.ok || !file?.id) {
      return { ok: false, error: `upload ${put.status}` }
    }
    return { ok: true, fileId: file.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'drive failure' }
  }
}

/**
 * Remove a clip's archive copy, used when a clip is rejected or flagged so
 * the marketing folder only accumulates content that survives moderation.
 * Best-effort like everything else here.
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  try {
    const token = await driveToken()
    if (!token) return false
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8_000),
        cache: 'no-store',
      },
    )
    // 404 counts as done: the file is gone either way.
    return res.ok || res.status === 404
  } catch {
    return false
  }
}
