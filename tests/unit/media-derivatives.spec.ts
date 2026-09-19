import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { experiences, mobileVideo, videoPoster } from '@/lib/experiences'
import { HERO_VIDEO_PHONE, HERO_POSTER_PHONE, HERO_POSTER, HERO_VIDEO_540, HERO_VIDEO_720, HERO_VIDEO_1080 } from '@/lib/images'

const pub = (p: string) => join(process.cwd(), 'public', p)

describe('phone video derivatives', () => {
  test('every clip has a 720x1280 phone version and a first-frame poster', () => {
    const clips = Array.from(new Set(experiences.map((e) => e.video).filter((v): v is string => !!v)))
    expect(clips.length).toBeGreaterThan(10)
    for (const v of clips) {
      expect(mobileVideo(v), v).not.toBe(v)
      expect(existsSync(pub(mobileVideo(v))), mobileVideo(v)).toBe(true)
      expect(existsSync(pub(videoPoster(v))), videoPoster(v)).toBe(true)
    }
  })

  test('every home hero file the component can pick exists', () => {
    for (const f of [HERO_VIDEO_PHONE, HERO_POSTER_PHONE, HERO_POSTER, HERO_VIDEO_540, HERO_VIDEO_720, HERO_VIDEO_1080]) {
      expect(existsSync(pub(f)), f).toBe(true)
    }
  })

  test('helpers leave unknown paths alone', () => {
    expect(mobileVideo('/elsewhere/clip.mp4')).toBe('/elsewhere/clip.mp4')
  })
})
