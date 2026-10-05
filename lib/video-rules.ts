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
