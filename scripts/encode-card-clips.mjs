#!/usr/bin/env node
/**
 * Writes the desktop card clip of every catalogue video:
 * public/media/video/<id>.mp4 -> public/media/video/c/<id>.mp4
 *
 * The tour card (components/ExpCard.tsx) plays this on hover, through
 * lib/experiences cardVideo. It played the original before, and the originals
 * are 3 to 57 MB at up to 18.5 Mbps and 120 fps, eight of them fragmented
 * MP4s that cost Chrome several range requests before the first frame. On a
 * 20 Mbps line the jet ski clip stalled five times in its first five seconds,
 * and Netlify's edge never stores a file that large when the browser asks for
 * it by Range, so every hover went to origin (measured Oct 4 2026).
 *
 * The card shows a 4:3 centre crop of the clip (object-fit: cover), so that
 * crop is all this keeps: at most 960x720, which a 2x screen draws at about
 * its own size, no faster than 30 fps, the first 10 seconds, H.264 High at
 * CRF 23 capped at 2.5 Mbps, moov first, one unfragmented file, no audio.
 *
 *   FFMPEG=/path/to/ffmpeg node scripts/encode-card-clips.mjs [--force]
 *
 * Skips a clip whose card file is already newer than its source unless
 * --force. ONLY=<id>[,<id>] limits a run to those clips.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const srcDir = path.join(root, 'public/media/video')
const outDir = path.join(srcDir, 'c')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const force = process.argv.includes('--force')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null

function encode(src, out) {
  return spawnSync(ffmpeg, [
    '-y', '-v', 'error', '-i', src, '-t', '10',
    '-vf', "crop='min(iw,ih*4/3)':'min(ih,iw*3/4)',scale='min(960,iw)':-2:flags=lanczos,setsar=1",
    '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-maxrate', '2500k', '-bufsize', '5000k',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '60',
    '-movflags', '+faststart', '-an', out,
  ], { stdio: 'inherit' })
}

const catalogue = readFileSync(path.join(root, 'lib/experiences.ts'), 'utf8')
const ids = [...new Set([...catalogue.matchAll(/'\/media\/video\/([A-Za-z0-9_-]+)\.mp4'/g)].map((m) => m[1]))]
if (!ids.length) {
  console.error('No catalogue videos found in lib/experiences.ts')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
let failed = 0
for (const id of ids) {
  if (only && !only.has(id)) continue
  const src = path.join(srcDir, `${id}.mp4`)
  const out = path.join(outDir, `${id}.mp4`)
  if (!existsSync(src)) {
    console.error(`missing original: ${src}`)
    failed++
    continue
  }
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(`skip ${id} (up to date)`)
    continue
  }
  if (encode(src, out).status !== 0) {
    console.error(`failed: ${id}`)
    failed++
    continue
  }
  const mb = (f) => (statSync(f).size / 1048576).toFixed(2)
  console.log(`${id}: ${mb(src)} MB -> ${mb(out)} MB`)
}
process.exit(failed ? 1 : 0)
