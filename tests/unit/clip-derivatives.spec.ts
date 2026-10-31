import { describe, test, expect, vi } from 'vitest'

// lib/tour-videos imports the browser Supabase client; only its storage URL
// builder is needed here.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    storage: { from: (b: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.example/${b}/${p}` } }) }) },
  }),
}))

import { clipDerivativePaths } from '@/lib/tour-videos'

/**
 * Oct 31 2026: uploaded clips (up to 11 Mbps, two in VP9) froze for half of
 * every clip on a 4 Mbps phone connection. Their phone copies live at a path
 * the reel and scripts/encode-tour-clips.mjs both derive from the upload's.
 */
describe('a clip’s phone copies', () => {
  test('sit under m/ at the upload’s own path, as HEVC and H.264 MP4s', () => {
    expect(clipDerivativePaths('2aa2684f/2-1792160211772.mov')).toEqual({
      hevc: 'm/2aa2684f/2-1792160211772.hevc.mp4',
      h264: 'm/2aa2684f/2-1792160211772.mp4',
    })
    expect(clipDerivativePaths('69b8/14-1791157747500.mp4').h264).toBe('m/69b8/14-1791157747500.mp4')
  })

  test('the script derives the same paths', async () => {
    const src = (await import('node:fs')).readFileSync('scripts/encode-tour-clips.mjs', 'utf8')
    expect(src).toContain("hevc: `m/${base}.hevc.mp4`, h264: `m/${base}.mp4`")
    expect(src).toContain(".replace(/\\.[A-Za-z0-9]+$/, '')")
  })
})
