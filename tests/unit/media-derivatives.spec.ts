import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { experiences, mobileVideo, videoPoster } from '@/lib/experiences'
import { HERO_VIDEO_PORTRAIT, HERO_POSTER_PORTRAIT } from '@/lib/images'

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

  test('the portrait hero pair exists', () => {
    expect(existsSync(pub(HERO_VIDEO_PORTRAIT))).toBe(true)
    expect(existsSync(pub(HERO_POSTER_PORTRAIT))).toBe(true)
  })

  test('helpers leave unknown paths alone', () => {
    expect(mobileVideo('/elsewhere/clip.mp4')).toBe('/elsewhere/clip.mp4')
  })
})
