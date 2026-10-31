#!/usr/bin/env node
/**
 * Writes the phone copies of every tour clip (user_tour_videos) next to the
 * upload in the tour-videos bucket, at lib/tour-videos clipDerivativePaths:
 *
 *   <user>/<file>.<ext>  ->  m/<user>/<file>.hevc.mp4  and  m/<user>/<file>.mp4
 *
 * Uploads arrive as filmed: up to 11 Mbps, some 1280x720 at 60 fps, two in
 * VP9 (which an iPhone is not guaranteed to play). On a 4 Mbps phone
 * connection those froze for half of every clip while the catalogue reels,
 * encoded lean, played straight through (measured Oct 31 2026). The reel
 * (components/ExperienceDetail.tsx) now tries these copies first, HEVC then
 * H.264, and falls back to the upload while a clip has none.
 *
 * Same recipe as the catalogue's phone clips (scripts/encode-reel-hevc.mjs):
 * no larger than 720x1280 either way round and never upscaled, at most 30 fps,
 * HEVC tagged hvc1 for Safari, moov first so playback starts at once. Clips
 * keep their sound (AAC, 96 kbps), because a guest clip can play with sound.
 *
 *   set -a; source .env.local; set +a
 *   FFMPEG=/path/to/ffmpeg node scripts/encode-tour-clips.mjs [--force] [--dry]
 *
 * Every clip that is not rejected is encoded, so a pending clip is light the
 * moment it is approved. A clip whose two copies already exist is skipped
 * unless --force. --dry lists what would be done and writes nothing.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ffmpeg = process.env.FFMPEG || 'ffmpeg'
const force = process.argv.includes('--force')
const dry = process.argv.includes('--dry')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (source .env.local)')
  process.exit(1)
}
const svc = createClient(url, key, { auth: { persistSession: false } })
const BUCKET = 'tour-videos'

// Kept in step with clipDerivativePaths in lib/tour-videos.ts.
const derivativePaths = (p) => {
  const base = p.replace(/\.[A-Za-z0-9]+$/, '')
  return { hevc: `m/${base}.hevc.mp4`, h264: `m/${base}.mp4` }
}

// Longer side at most 1280, shorter at most 720, never upscaled, even sizes.
const SCALE = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',scale='min(iw,if(gt(iw,ih),1280,720))':-2"
const common = ['-vf', SCALE, '-fpsmax', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart']
const RECIPES = {
  hevc: ['-c:v', 'libx265', '-preset', 'slow', '-crf', '28', '-x265-params', 'vbv-maxrate=1300:vbv-bufsize=2600:log-level=error', '-tag:v', 'hvc1'],
  h264: ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level', '4.0', '-crf', '24', '-maxrate', '1800k', '-bufsize', '3600k'],
}

async function exists(p) {
  const { data } = svc.storage.from(BUCKET).getPublicUrl(p)
  const r = await fetch(data.publicUrl, { method: 'HEAD' })
  return r.ok
}

const { data: rows, error } = await svc
  .from('user_tour_videos')
  .select('id, experience_id, status, video_path')
  .neq('status', 'rejected')
  .order('created_at', { ascending: true })
if (error) {
  console.error('could not read user_tour_videos:', error.message)
  process.exit(1)
}

let failed = 0
const work = mkdtempSync(path.join(tmpdir(), 'tour-clips-'))
try {
  for (const row of rows) {
    const out = derivativePaths(row.video_path)
    if (!force && (await exists(out.hevc)) && (await exists(out.h264))) {
      console.log(`skip ${row.video_path} (copies exist)`)
      continue
    }
    if (dry) {
      console.log(`would encode ${row.video_path} -> ${out.hevc}, ${out.h264}`)
      continue
    }
    const { data: blob, error: dlErr } = await svc.storage.from(BUCKET).download(row.video_path)
    if (dlErr || !blob) {
      console.error(`download failed ${row.video_path}: ${dlErr?.message}`)
      failed++
      continue
    }
    const src = path.join(work, `${row.id}-src`)
    writeFileSync(src, Buffer.from(await blob.arrayBuffer()))
    // An upload that is already lean H.264 (one is 360x640 at 0.8 Mbps) comes
    // out of the H.264 recipe larger than it went in. Then the H.264 copy is
    // the upload itself, remuxed with its moov first.
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', src], { encoding: 'utf8' })
    const isH264 = /Video: h264/.test(probe.stderr ?? '')
    for (const kind of ['hevc', 'h264']) {
      const file = path.join(work, `${row.id}.${kind}.mp4`)
      const run = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', src, ...common, ...RECIPES[kind], file], { stdio: 'inherit' })
      if (run.status !== 0) {
        console.error(`encode failed ${row.video_path} (${kind})`)
        failed++
        continue
      }
      if (kind === 'h264' && isH264 && statSync(file).size > statSync(src).size) {
        const remux = spawnSync(ffmpeg, ['-y', '-v', 'error', '-i', src, '-c', 'copy', '-movflags', '+faststart', file], { stdio: 'inherit' })
        if (remux.status !== 0) {
          console.error(`remux failed ${row.video_path}`)
          failed++
          continue
        }
      }
      const { error: upErr } = await svc.storage.from(BUCKET).upload(out[kind], readFileSync(file), {
        contentType: 'video/mp4',
        cacheControl: '31536000',
        upsert: true,
      })
      if (upErr) {
        console.error(`upload failed ${out[kind]}: ${upErr.message}`)
        failed++
        continue
      }
      console.log(`${row.video_path} -> ${out[kind]} (${(statSync(src).size / 1e6).toFixed(1)} MB -> ${(statSync(file).size / 1e6).toFixed(1)} MB)`)
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
