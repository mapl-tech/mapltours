/**
 * Guest-clip rules that server code needs too. lib/tour-videos is a
 * 'use client' module, and a server route that imports from it gets a client
 * reference object in place of each value: VIDEO_REWARD_MILESTONE read there
 * as an object, so the webhook's reward arithmetic came out NaN (measured on
 * the dev server, Oct 4 2026). Values live here; lib/tour-videos re-exports
 * them for the browser.
 */

/** Approved clips per 5%-off reward. Migration 003's trigger grants at every multiple of 5. */
export const VIDEO_REWARD_MILESTONE = 5

/**
 * Where a clip's phone copies live: the upload's own path under m/, as an
 * HEVC and an H.264 MP4 (720p at most, ~1.3 and ~1.8 Mbps, moov first).
 * Uploads arrive as filmed, at up to 11 Mbps and in codecs an iPhone may not
 * play (VP9), and on a 4 Mbps phone connection they froze for half of every
 * clip (measured Oct 31 2026). The scheduled clip-copies job writes them
 * (lib/clip-copies). No uploader can write under m/: the bucket's insert
 * policy keys on the first folder being the uploader's own uid.
 */
export function clipDerivativePaths(path: string): { hevc: string; h264: string } {
  const base = path.replace(/\.[A-Za-z0-9]+$/, '')
  return { hevc: `m/${base}.hevc.mp4`, h264: `m/${base}.mp4` }
}
