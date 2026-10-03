import { describe, expect, test } from 'vitest'
import { closeTarget, orderFeed, swapReason, tripDayLabel } from '@/lib/reel-feed'
import { driveMinutes } from '@/lib/day-route'
import { singleExperiences, slugify } from '@/lib/experiences'

describe('orderFeed', () => {
  const slugs = (list: typeof singleExperiences) => list.map((e) => slugify(e.title))

  test('the requested tour is first and every tour appears once', () => {
    for (const e of singleExperiences) {
      const out = orderFeed(singleExperiences, slugify(e.title))
      expect(out[0]).toBe(e)
      expect(new Set(slugs(out))).toEqual(new Set(slugs(singleExperiences)))
      expect(out).toHaveLength(singleExperiences.length)
    }
  })

  test('the rest run nearest-first from the requested tour', () => {
    const ricks = 'ricks-cafe-cliff-diving-and-sunset'
    const out = orderFeed(singleExperiences, ricks)
    const minutes = out.slice(1).map((e) => driveMinutes(out[0].destination, e.destination))
    const known = minutes.filter((m): m is number => m !== null)
    expect(known).toEqual([...known].sort((a, b) => a - b))
    // Unknown drive times trail the known ones.
    const firstNull = minutes.indexOf(null)
    if (firstNull >= 0) expect(minutes.slice(firstNull).every((m) => m === null)).toBe(true)
  })

  test('an unknown slug leaves the catalogue order alone', () => {
    expect(orderFeed(singleExperiences, 'nope')).toBe(singleExperiences)
  })

  test('is deterministic, so the server and the browser agree', () => {
    const a = slugs(orderFeed(singleExperiences, 'jet-ski-the-caribbean'))
    const b = slugs(orderFeed([...singleExperiences], 'jet-ski-the-caribbean'))
    expect(a).toEqual(b)
  })
})

describe('closeTarget', () => {
  test.each([
    // Landed on the reel (an ad, a shared link): never Back, even after checkout and back.
    ['/experience/ricks-cafe-cliff-diving-and-sunset', 4, '/explore'],
    ['/experience/jet-ski-the-caribbean', 1, '/explore'],
    // Came from inside the site: Back returns them where they were.
    ['/', 3, 'back'],
    ['/explore', 2, 'back'],
    ['/checkout', 5, 'back'],
    // Nothing to go back to.
    ['/', 1, '/explore'],
    [null, 3, '/explore'],
  ] as const)('entry %s, history %i -> %s', (entry, length, want) => {
    expect(closeTarget(entry, length)).toBe(want)
  })
})

describe('tripDayLabel', () => {
  test('names the day in every time zone', () => {
    expect(tripDayLabel('2026-10-16')).toBe('Fri, Oct 16')
    expect(tripDayLabel('2027-03-07')).toBe('Sun, Mar 7')
  })
  test('refuses anything that is not a real date', () => {
    for (const bad of ['', '2027-02-30', '16/10/2026', 'tomorrow']) expect(tripDayLabel(bad)).toBeNull()
  })
})

describe('swapReason', () => {
  test('says how far and what booking it does, in one short line', () => {
    const line = swapReason({ minutes: 74, nearest: 'Negril' })
    expect(line).toBe('75 min from Negril, so it replaces that day.')
    expect(line.length).toBeLessThanOrEqual(46)
  })
  test('still explains itself without a drive time', () => {
    expect(swapReason({ minutes: null, nearest: null })).toMatch(/replaces/)
  })
})
