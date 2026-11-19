import { describe, test, expect } from 'vitest'
import { readAll } from '@/lib/payouts/store'

/**
 * PostgREST answers at most 1,000 rows a request whatever `limit` asks, so
 * the payout reads go a page at a time: a short read must never look like
 * the whole list.
 */

const pages = (sizes: number[]) => {
  const asked: [number, number][] = []
  const page = async (from: number, to: number) => {
    asked.push([from, to])
    const n = sizes[asked.length - 1] ?? 0
    return { data: Array.from({ length: n }, (_, i) => ({ i: from + i })), error: null }
  }
  return { page, asked }
}

describe('readAll', () => {
  test('reads page after page until one comes back short', async () => {
    const { page, asked } = pages([1000, 1000, 3])
    const rows = await readAll<{ i: number }>(page, 'bookings')
    expect(rows).toHaveLength(2003)
    expect(rows[2002].i).toBe(2002)
    expect(asked).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  test('an exact multiple ends on an empty page', async () => {
    const { page, asked } = pages([1000, 0])
    expect(await readAll(page, 'bookings')).toHaveLength(1000)
    expect(asked).toHaveLength(2)
  })

  test('a list longer than it may read stops the run instead of paying from part of it', async () => {
    const { page } = pages([10, 10, 10])
    await expect(readAll(page, 'driver_payout_items', 10, 3)).rejects.toThrow('driver_payout_items: the read may be incomplete')
  })

  test('a failed page fails the read', async () => {
    const page = async () => ({ data: null, error: { message: 'timeout' } })
    await expect(readAll(page, 'bookings')).rejects.toThrow('bookings: timeout')
  })
})
