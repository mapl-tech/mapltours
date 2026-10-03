#!/usr/bin/env node
/**
 * Writes the HEVC twin of every catalogue phone clip:
 * public/media/video/m/<id>.mp4 -> public/media/video/m/<id>.hevc.mp4
 *
 * The reel (components/ExperienceDetail.tsx) and the home rail
 * (components/MobileShort.tsx) serve the HEVC file first and fall back to the
 * H.264 one (lib/experiences mobileHevcVideo). Same 720x1280 frame at about
 * half the bytes: libx265 CRF 26 capped at 1.3 Mbps, tagged hvc1 so Safari
 * plays it, moov atom first so playback starts before the download ends, no
 * audio (the phone clips have none). At the same 1.3 Mbps, H.264 showed
 * visible blocking on falling water; HEVC held the look of the 2.5 Mbps
 * original (compared frame by frame, Oct 2 2026).
 *
 * The clips are read from lib/experiences.ts, so a new catalogue video is
 * picked up by running this again:
 *
 *   FFMPEG=/path/to/ffmpeg node scripts/encode-reel-hevc.mjs [--force]
 *
 * Skips a clip whose .hevc.mp4 is already newer than its source unless --force.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dir = path.join(root, 'public/media/video/m')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const force = process.argv.includes('--force')
// ONLY=<id>[,<id>] limits a run to those clips.
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null

// A clip already encoded lean (one H.264 source runs at ~1.07 Mbps) can come
// out of CRF 26 LARGER than its source. The twin has to be smaller, because
// the rail serves it to every browser that can play HEVC: step the quality
// target down until it is at least 10% smaller than the H.264 file.
const CRF_STEPS = [26, 29, 32]

function encode(src, out, crf) {
  return spawnSync(ffmpeg, [
    '-y', '-v', 'error', '-i', src,
    '-c:v', 'libx265', '-preset', 'slow', '-crf', String(crf),
    '-x265-params', 'vbv-maxrate=1300:vbv-bufsize=2600:log-level=error',
    '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', out,
  ], { stdio: 'inherit' })
}

const catalogue = readFileSync(path.join(root, 'lib/experiences.ts'), 'utf8')
const ids = [...new Set([...catalogue.matchAll(/'\/media\/video\/([A-Za-z0-9_-]+)\.mp4'/g)].map((m) => m[1]))]
if (!ids.length) {
  console.error('No catalogue videos found in lib/experiences.ts')
  process.exit(1)
}

let failed = 0
for (const id of ids) {
  if (only && !only.has(id)) continue
  const src = path.join(dir, `${id}.mp4`)
  const out = path.join(dir, `${id}.hevc.mp4`)
  if (!existsSync(src)) {
    console.error(`missing phone clip: ${src}`)
    failed++
    continue
  }
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(`skip ${id} (up to date)`)
    continue
  }
  let ok = false
  let crfUsed = null
  for (const crf of CRF_STEPS) {
    if (encode(src, out, crf).status !== 0) break
    crfUsed = crf
    if (statSync(out).size <= statSync(src).size * 0.9) {
      ok = true
      break
    }
  }
  if (!ok) {
    console.error(`failed: ${id} (${crfUsed === null ? 'ffmpeg error' : 'never 10% smaller than its H.264 source'})`)
    failed++
    continue
  }
  const mb = (f) => (statSync(f).size / 1048576).toFixed(2)
  console.log(`${id}: ${mb(src)} MB -> ${mb(out)} MB (crf ${crfUsed})`)
}
process.exit(failed ? 1 : 0)
