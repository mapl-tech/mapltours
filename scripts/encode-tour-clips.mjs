#!/usr/bin/env node
/**
 * Writes the phone copies of tour clips (user_tour_videos) next to the upload
 * in the tour-videos bucket, at lib/video-rules clipDerivativePaths:
 *
 *   <user>/<file>.<ext>  ->  m/<user>/<file>.hevc.mp4  and  m/<user>/<file>.mp4
 *
 * Uploads arrive as filmed: up to 11 Mbps, some 1280x720 at 60 fps, two in
 * VP9 (which an iPhone is not guaranteed to play). On a 4 Mbps phone
 * connection those froze for half of every clip while the catalogue reels,
 * encoded lean, played straight through (measured Oct 31 2026). The reel
 * (components/ExperienceDetail.tsx) tries these copies first, HEVC then
 * H.264, and falls back to the upload while a clip has none.
 *
 * Runs in GitHub Actions (.github/workflows/clip-copies.yml) every 15
 * minutes. It asks /api/clip-copies, with the job's own GitHub OIDC token,
 * which clips need copies, and uploads to the signed URLs it is handed; it
 * holds no Supabase key (lib/clip-copies explains why).
 *
 *   node scripts/encode-tour-clips.mjs --check   # count only, writes todo=<n> to $GITHUB_OUTPUT
 *   node scripts/encode-tour-clips.mjs           # encode and upload
 *   CLIP=<clip id>                               # include that clip even if it has copies
 *
 * Same recipe as the catalogue's phone clips (scripts/encode-reel-hevc.mjs):
 * no larger than 720x1280 either way round and never upscaled, at most 30 fps,
 * HEVC tagged hvc1 for Safari, moov first so playback starts at once. Clips
 * keep their sound (AAC, 96 kbps), because a guest clip can play with sound.
 *
 * Uploads are a guest's file, so ffmpeg is held to the containers the upload
 * form accepts (MP4/MOV and WebM) and to local files: a "video" that is
 * really a playlist cannot make it read other files or fetch URLs into the
 * copy. A clip that cannot be encoded gets a .failed.txt marker beside its
 * copies, fails this one run, and is not retried until asked for by id.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, createWriteStream, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const ENDPOINT = process.env.CLIP_COPIES_URL || 'https://mapltours.com/api/clip-copies'
const AUDIENCE = 'https://mapltours.com/api/clip-copies'
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const check = process.argv.includes('--check')
const clip = process.env.CLIP?.trim() || ''
// lib/tour-videos VIDEO_MAX_BYTES, with room for a container's overhead.
const MAX_SOURCE_BYTES = 105 * 1024 * 1024

async function bearer() {
  // A local test against a stand-in for the route passes its own token.
  if (process.env.CLIP_COPIES_TOKEN) return process.env.CLIP_COPIES_TOKEN
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!url || !token) throw new Error('no GitHub OIDC token: the workflow needs permissions id-token: write')
  const res = await fetch(`${url}&audience=${encodeURIComponent(AUDIENCE)}`, { headers: { authorization: `bearer ${token}` } })
  if (!res.ok) throw new Error(`OIDC token request ${res.status}`)
  return (await res.json()).value
}

async function ask(params) {
  const q = new URLSearchParams(params)
  if (clip) q.set('clip', clip)
  const res = await fetch(`${ENDPOINT}?${q}`, { headers: { authorization: `Bearer ${await bearer()}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${ENDPOINT} ${res.status} ${body.error ?? ''}`)
  return body
}

// The child gets no tokens: only what it needs to find its libraries.
const childEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: tmpdir() }
const run = (args) => spawnSync(ffmpeg, args, { stdio: ['ignore', 'inherit', 'inherit'], env: childEnv })
const INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', 'mov,matroska']

// Longer side at most 1280, shorter at most 720, never upscaled, even sizes.
const SCALE = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',scale='min(iw,if(gt(iw,ih),1280,720))':-2"
const common = ['-vf', SCALE, '-fpsmax', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart']
const RECIPES = {
  hevc: ['-c:v', 'libx265', '-preset', 'slow', '-crf', '28', '-x265-params', 'vbv-maxrate=1300:vbv-bufsize=2600:log-level=error', '-tag:v', 'hvc1'],
  h264: ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.0', '-crf', '24', '-maxrate', '1800k', '-bufsize', '3600k'],
}

class ClipError extends Error {
  /** kind: 'permanent' writes the marker, so the clip is not tried again
   *  every run; 'retry' is worth another go in a few seconds; 'fail' is neither. */
  constructor(message, kind) {
    super(message)
    this.kind = kind
  }
}

// undici reports a network failure as "fetch failed" with the reason in cause.
const describe = (e) => (e instanceof Error ? [e.message, e.cause?.code ?? e.cause?.message].filter(Boolean).join(': ') : String(e))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A dropped connection or a 5xx is usually gone seconds later, and every
 *  upload is an overwrite, so network steps get three tries. */
async function withRetry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const retry = !(e instanceof ClipError) || e.kind === 'retry'
      if (!retry || attempt === 3) throw e instanceof ClipError ? e : new ClipError(`${label}: ${describe(e)}`, 'fail')
      console.error(`  ${label}: ${describe(e)}, trying again`)
      await sleep(attempt * 3000)
    }
  }
}

const httpError = (label, status) => new ClipError(`${label} ${status}`, status >= 500 ? 'retry' : 'fail')

async function download(url, file) {
  const res = await fetch(url)
  // Supabase answers a missing object with 400 (body statusCode 404).
  if (res.status === 400 || res.status === 404) throw new ClipError(`download: no file (${res.status})`, 'permanent')
  if (!res.ok) throw httpError('download', res.status)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_SOURCE_BYTES) throw new ClipError('source over 105 MB', 'permanent')
  let bytes = 0
  const limit = new TransformStream({
    transform(chunk, ctl) {
      bytes += chunk.byteLength
      if (bytes > MAX_SOURCE_BYTES) ctl.error(new ClipError('source over 105 MB', 'permanent'))
      else ctl.enqueue(chunk)
    },
  })
  await pipeline(Readable.fromWeb(res.body.pipeThrough(limit)), createWriteStream(file))
}

async function upload(signedUrl, apikey, body, contentType, cacheSeconds) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { apikey, 'x-upsert': 'true', 'content-type': contentType, 'cache-control': `max-age=${cacheSeconds}` },
    body,
  })
  if (!res.ok) {
    const e = httpError('upload', res.status)
    e.message += ` ${(await res.text().catch(() => '')).slice(0, 200)}`
    throw e
  }
}

/** ffmpeg refusing the file is the clip's fault and marks it; ffmpeg killed
 *  or not starting is the machine's, and the clip is tried again next run. */
function ffmpegOk(result, label) {
  if (result.error || result.signal) throw new ClipError(`${label}: ffmpeg ${result.error?.code ?? result.signal}`, 'fail')
  if (result.status !== 0) throw new ClipError(`${label} failed`, 'permanent')
}

async function encode(c, apikey, work) {
  const src = path.join(work, `${c.id}-src`)
  await withRetry('download', () => download(c.source, src))
  // An upload that is already lean H.264 (one is 360x640 at 0.8 Mbps) comes
  // out of the H.264 recipe larger than it went in. Then the H.264 copy is
  // the upload itself, remuxed with its moov first.
  const probe = spawnSync(ffmpeg, ['-hide_banner', ...INPUT, '-i', src], { encoding: 'utf8', env: childEnv })
  if (/not on whitelist|Invalid data found/i.test(probe.stderr ?? '')) throw new ClipError('not an MP4, MOV or WebM video', 'permanent')
  const isH264 = /Video: h264/.test(probe.stderr ?? '')
  const files = {}
  for (const kind of ['hevc', 'h264']) {
    const file = path.join(work, `${c.id}.${kind}.mp4`)
    ffmpegOk(run(['-y', '-v', 'error', ...INPUT, '-i', src, ...common, ...RECIPES[kind], file]), `encode ${kind}`)
    if (kind === 'h264' && isH264 && statSync(file).size > statSync(src).size) {
      ffmpegOk(run(['-y', '-v', 'error', ...INPUT, '-i', src, '-c', 'copy', '-movflags', '+faststart', file]), 'remux')
    }
    files[kind] = file
  }
  // Both copies are made before either is stored, so a clip never has one
  // copy from this run and one from an older recipe.
  for (const kind of ['hevc', 'h264']) {
    await withRetry(`upload ${kind}`, () => upload(c.uploads[kind], apikey, readFileSync(files[kind]), 'video/mp4', 31536000))
    console.log(`${c.path} -> ${kind} (${(statSync(src).size / 1e6).toFixed(1)} MB -> ${(statSync(files[kind]).size / 1e6).toFixed(1)} MB)`)
  }
}

if (check) {
  const { todo } = await ask({ dry: '1' })
  console.log(`${todo} clip(s) need phone copies`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `todo=${Number(todo) || 0}\n`)
  process.exit(0)
}

// Without a working ffmpeg every clip would look unencodable and be marked.
if (spawnSync(ffmpeg, ['-hide_banner', '-version'], { env: childEnv }).status !== 0) {
  console.error(`ffmpeg not found at ${ffmpeg}`)
  process.exit(1)
}
const { clips, more, apikey } = await ask({})
let failed = 0
const work = mkdtempSync(path.join(tmpdir(), 'tour-clips-'))
try {
  for (const c of clips) {
    try {
      await encode(c, apikey, work)
    } catch (e) {
      failed++
      const reason = describe(e)
      console.error(`failed ${c.path} (${c.id}): ${reason}`)
      if (e instanceof ClipError && e.kind === 'permanent') {
        await withRetry('marker', () => upload(c.uploads.failed, apikey, `${new Date().toISOString()} ${reason}\n`, 'text/plain', 60))
          .then(() => console.error(`  marked: it waits until this workflow is run with clip ${c.id}`))
          .catch((m) => console.error(`  marker not written: ${m.message}`))
      }
    } finally {
      for (const f of [`${c.id}-src`, `${c.id}.hevc.mp4`, `${c.id}.h264.mp4`]) rmSync(path.join(work, f), { force: true })
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (more > 0) console.log(`${more} more clip(s) wait for the next run`)
console.log(`${clips.length - failed} of ${clips.length} clip(s) encoded`)
process.exit(failed ? 1 : 0)
