import { describe, test, expect } from 'vitest'
import { transferLegWindow } from '../../lib/driver'

/**
 * The driver portal's working window over transfer legs.
 *
 * Two things this pins down:
 *
 *   1. The bounds are expressed in the Jamaica wall-clock convention the leg
 *      columns are stored in: a real instant minus five hours, with a Z that
 *      means "Jamaica" (see lib/dispatch.ts legInstantMs). Emitting a true
 *      UTC instant here would shift every comparison by five hours and drop
 *      a late-evening pickup off the board.
 *   2. The back-window is the caller's choice. The flight tracker keeps the
 *      one-day default (it only acts on legs it can still affect), but the
 *      portals look 45 days back because a leg is also a PAYOUT line: a
 *      one-day bound erased every ride the operator had not marked paid
 *      within a day, silently zeroing money still owed to the driver.
 */

// 2026-08-22T12:00:00Z as a real instant.
const NOW = Date.UTC(2026, 7, 22, 12, 0, 0)
const H = 3_600_000
const D = 24 * H

describe('transferLegWindow', () => {
  test('defaults to one day back and ninety days forward, in Jamaica wall-clock', () => {
    const w = transferLegWindow(NOW)
    // Real instant minus 24h, then minus the 5h convention offset.
    expect(w.from).toBe(new Date(NOW - D - 5 * H).toISOString())
    expect(w.to).toBe(new Date(NOW + 90 * D - 5 * H).toISOString())
  })

  test('backDays widens the lower bound without moving the upper bound', () => {
    const w = transferLegWindow(NOW, { backDays: 45 })
    expect(w.from).toBe(new Date(NOW - 45 * D - 5 * H).toISOString())
    expect(w.to).toBe(new Date(NOW + 90 * D - 5 * H).toISOString())
  })

  test('forwardDays moves only the upper bound', () => {
    const w = transferLegWindow(NOW, { forwardDays: 10 })
    expect(w.from).toBe(new Date(NOW - D - 5 * H).toISOString())
    expect(w.to).toBe(new Date(NOW + 10 * D - 5 * H).toISOString())
  })

  test('the OR filter matches a row when EITHER leg falls inside the window', () => {
    const w = transferLegWindow(NOW, { backDays: 45 })
    expect(w.orFilter).toBe(
      `and(arrival_at.gte.${w.from},arrival_at.lte.${w.to}),and(departure_at.gte.${w.from},departure_at.lte.${w.to})`,
    )
  })

  test('a ride 30 days ago is inside the portal window and outside the tracker window', () => {
    // A completed pickup whose payout may still be unpaid.
    const legWall = new Date(NOW - 30 * D - 5 * H).toISOString()
    const portal = transferLegWindow(NOW, { backDays: 45 })
    const tracker = transferLegWindow(NOW)
    expect(legWall >= portal.from && legWall <= portal.to).toBe(true)
    expect(legWall >= tracker.from).toBe(false)
  })
})
