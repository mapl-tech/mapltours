import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The list as the Tor Project serves it: one address per line. 200 filler
// exits plus three the contact-form bot used (Nov 2 and 3 2026).
const EXITS = ['45.66.35.45', '185.220.101.7', '168.222.241.36']
const LIST = [...Array.from({ length: 200 }, (_, i) => `10.0.${i >> 8}.${i & 255}`), ...EXITS].join('\n') + '\n'

const calls: string[] = []
let answer: () => Promise<Response>

// A fresh module per test: the list lives in module state.
const load = async () => {
  vi.resetModules()
  return import('@/lib/tor-exit')
}

beforeEach(() => {
  calls.length = 0
  answer = async () => new Response(LIST)
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url)
    return answer()
  })
  // Only the clock is faked, so the real 2 s timeout still runs.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('isTorExit', () => {
  test('an exit on the list is one, any other address is not', async () => {
    const { isTorExit } = await load()
    for (const ip of EXITS) expect(await isTorExit(ip)).toBe(true)
    expect(await isTorExit('142.113.149.160')).toBe(false)
    expect(await isTorExit('::ffff:185.220.101.7')).toBe(true)
    expect(await isTorExit(' 45.66.35.45 ')).toBe(true)
    expect(calls).toEqual(['https://check.torproject.org/torbulkexitlist'])
  })

  test('an address that is not one is never looked up', async () => {
    const { isTorExit } = await load()
    for (const ip of ['unknown', '', '45.66.35.45, 1.2.3.4', '999.1.1.1', 'localhost']) expect(await isTorExit(ip)).toBe(false)
    expect(calls).toHaveLength(0)
  })

  test('questions asked at once share one request, and the list is kept for an hour', async () => {
    const { isTorExit } = await load()
    expect(await Promise.all(EXITS.map(isTorExit))).toEqual([true, true, true])
    expect(calls).toHaveLength(1)
    vi.setSystemTime(new Date('2026-11-03T12:59:59Z'))
    await isTorExit('45.66.35.45')
    expect(calls).toHaveLength(1)
    vi.setSystemTime(new Date('2026-11-03T13:00:00Z'))
    await isTorExit('45.66.35.45')
    expect(calls).toHaveLength(2)
  })

  test('a newer list replaces the old one', async () => {
    const { isTorExit } = await load()
    expect(await isTorExit('45.66.35.45')).toBe(true)
    answer = async () => new Response(LIST.replace('45.66.35.45\n', '45.66.35.46\n'))
    vi.setSystemTime(new Date('2026-11-03T13:00:00Z'))
    expect(await isTorExit('45.66.35.45')).toBe(false)
    expect(await isTorExit('45.66.35.46')).toBe(true)
  })

  test('with no list, an exit is not one, and the next try waits 5 minutes', async () => {
    answer = async () => { throw new Error('network down') }
    const { isTorExit } = await load()
    expect(await isTorExit('45.66.35.45')).toBe(false)
    vi.setSystemTime(new Date('2026-11-03T12:04:59Z'))
    expect(await isTorExit('45.66.35.45')).toBe(false)
    expect(calls).toHaveLength(1)
    answer = async () => new Response(LIST)
    vi.setSystemTime(new Date('2026-11-03T12:05:00Z'))
    expect(await isTorExit('45.66.35.45')).toBe(true)
    expect(calls).toHaveLength(2)
  })

  test('an error page, a short list or a failed status is not taken for the list', async () => {
    for (const bad of [
      async () => new Response('<!doctype html><title>Down</title>'),
      async () => new Response('185.220.101.7\n45.66.35.45\n'),
      async () => new Response(LIST, { status: 503 }),
      async () => new Response(`${LIST}not an address\n`),
    ]) {
      answer = bad
      const { isTorExit } = await load()
      expect(await isTorExit('185.220.101.7')).toBe(false)
    }
  })

  test('a list that cannot be refreshed is used for a day, then no longer', async () => {
    const { isTorExit } = await load()
    expect(await isTorExit('45.66.35.45')).toBe(true)
    answer = async () => new Response('', { status: 500 })
    vi.setSystemTime(new Date('2026-11-04T11:59:59Z'))
    expect(await isTorExit('45.66.35.45')).toBe(true)
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
    expect(await isTorExit('45.66.35.45')).toBe(false)
  })

  test('a list that does not arrive within 2 seconds counts as none', async () => {
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push(url)
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
    })
    const { isTorExit } = await load()
    const started = performance.now()
    expect(await isTorExit('45.66.35.45')).toBe(false)
    const ms = performance.now() - started
    expect(ms).toBeGreaterThanOrEqual(1900)
    expect(ms).toBeLessThan(3000)
  })
})
