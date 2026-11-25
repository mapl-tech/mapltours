import { describe, test, expect, vi } from 'vitest'
import { defaultDriverColumns, DEFAULT_DRIVER_WAIT_MS } from '@/lib/default-driver'
import { DEFAULT_DRIVER } from '@/lib/dispatch'

/**
 * The driver a new paid ride is given (lib/default-driver): the saved, working
 * driver named as DEFAULT_DRIVER, with the details saved now, or the constant
 * whenever that cannot be read cleanly. The paid path never waits long or
 * fails because of it. Made-up details.
 */

const row = (over: Record<string, unknown> = {}) => ({ name: DEFAULT_DRIVER.driver_name, whatsapp: '+1 876 555 0177', vehicle: 'Toyota Voxy', colour: 'white', plate: 'PX 0001', active: true, ...over })
function svc(answer: unknown, opts: { throwOnFrom?: boolean; delayMs?: number } = {}) {
  const seen: Array<[string, unknown]> = []
  return {
    seen,
    from: (table: string) => {
      if (opts.throwOnFrom) throw new Error('no table')
      seen.push(['from', table])
      const q: Record<string, unknown> = {}
      q.select = (cols: string) => { seen.push(['select', cols]); return q }
      q.eq = (k: string, v: unknown) => { seen.push([`eq:${k}`, v]); return q }
      q.then = (ok: (v: unknown) => unknown) => new Promise((r) => setTimeout(() => r(answer), opts.delayMs ?? 0)).then(ok)
      return q
    },
  }
}

describe('defaultDriverColumns', () => {
  test('one working row: its details as a booking stores them', async () => {
    const s = svc({ data: [row()], error: null })
    expect(await defaultDriverColumns(s)).toEqual({ driver_name: DEFAULT_DRIVER.driver_name, driver_phone: '+1 876 555 0177', driver_vehicle: 'Toyota Voxy, white', driver_plate: 'PX 0001' })
    expect(s.seen).toContainEqual(['from', 'drivers'])
    expect(s.seen).toContainEqual(['eq:active', true])
    expect(s.seen).toContainEqual(['eq:name', DEFAULT_DRIVER.driver_name])
  })

  test('anything else is the constant: no row, two rows, an error, a thrown read, a missing detail', async () => {
    for (const s of [
      svc({ data: [], error: null }),
      svc({ data: [row(), row({ plate: 'PX 0002' })], error: null }),
      svc({ data: null, error: { message: 'down' } }),
      svc(null, { throwOnFrom: true }),
      svc({ data: [row({ plate: '' })], error: null }),
      svc({ data: [row({ active: false })], error: null }),
    ]) expect(await defaultDriverColumns(s)).toEqual({ ...DEFAULT_DRIVER })
  })

  test('a read that does not answer in time is the constant, and the paid path is not held', async () => {
    vi.useFakeTimers()
    const p = defaultDriverColumns(svc({ data: [row()], error: null }, { delayMs: 10_000 }))
    await vi.advanceTimersByTimeAsync(DEFAULT_DRIVER_WAIT_MS + 1)
    expect(await p).toEqual({ ...DEFAULT_DRIVER })
    vi.useRealTimers()
    expect(DEFAULT_DRIVER_WAIT_MS).toBeLessThanOrEqual(1500)
  })
})
