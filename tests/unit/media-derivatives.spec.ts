import { describe, expect, test } from 'vitest'
import { closeSync, existsSync, openSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { experiences, mobileVideo, mobileHevcVideo, videoPoster, cardVideo } from '@/lib/experiences'
import { HERO_VIDEO_PHONE, HERO_POSTER_PHONE, HERO_POSTER, HERO_VIDEO_540, HERO_VIDEO_720, HERO_VIDEO_1080 } from '@/lib/images'

const pub = (p: string) => join(process.cwd(), 'public', p)

/**
 * Display width and height from an MP4's first track header, rounded: three
 * clips carry a pixel aspect a hair off square and read 719.86 wide. The phone
 * clips keep their moov box first, so it sits in the first 256 KB.
 */
function mp4Size(file: string): [number, number] {
  const buf = Buffer.alloc(256 * 1024)
  const fd = openSync(file, 'r')
  const n = readSync(fd, buf, 0, buf.length, 0)
  closeSync(fd)
  const i = buf.subarray(0, n).indexOf('tkhd')
  if (i < 0) return [0, 0]
  const at = i + 4 + (buf[i + 4] === 1 ? 88 : 76)
  return [Math.round(buf.readUInt32BE(at) / 65536), Math.round(buf.readUInt32BE(at + 4) / 65536)]
}

describe('phone video derivatives', () => {
  test('every clip has a 720x1280 phone version, its HEVC twin and a first-frame poster', () => {
    const clips = Array.from(new Set(experiences.map((e) => e.video).filter((v): v is string => !!v)))
    expect(clips.length).toBeGreaterThan(10)
    for (const v of clips) {
      expect(mobileVideo(v), v).not.toBe(v)
      expect(existsSync(pub(mobileVideo(v))), mobileVideo(v)).toBe(true)
      // The home rail (MobileShort) plays the HEVC twin alone wherever the
      // browser can, with no H.264 fallback, so a missing twin is a still card.
      expect(existsSync(pub(mobileHevcVideo(v))), mobileHevcVideo(v)).toBe(true)
      expect(existsSync(pub(videoPoster(v))), videoPoster(v)).toBe(true)
      expect(mp4Size(pub(mobileVideo(v))), mobileVideo(v)).toEqual([720, 1280])
      expect(mp4Size(pub(mobileHevcVideo(v))), mobileHevcVideo(v)).toEqual([720, 1280])
    }
  })

  test('every clip has a desktop card version', () => {
    const clips = Array.from(new Set(experiences.map((e) => e.video).filter((v): v is string => !!v)))
    for (const v of clips) {
      expect(cardVideo(v), v).not.toBe(v)
      expect(existsSync(pub(cardVideo(v))), cardVideo(v)).toBe(true)
    }
  })

  test('every home hero file the component can pick exists', () => {
    for (const f of [HERO_VIDEO_PHONE, HERO_POSTER_PHONE, HERO_POSTER, HERO_VIDEO_540, HERO_VIDEO_720, HERO_VIDEO_1080]) {
      expect(existsSync(pub(f)), f).toBe(true)
    }
  })

  test('helpers leave unknown paths alone', () => {
    expect(mobileVideo('/elsewhere/clip.mp4')).toBe('/elsewhere/clip.mp4')
    expect(cardVideo('/elsewhere/clip.mp4')).toBe('/elsewhere/clip.mp4')
  })
})
