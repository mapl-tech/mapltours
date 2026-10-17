import { describe, test, expect } from 'vitest'
import {
  isExperienceDateBookable,
  earliestBookableExperienceDate,
  isPickupBookable,
  areTransferLegsBookable,
  leadTimeCutoff,
  MIN_LEAD_TIME_HOURS,
  earliestServiceStart,
} from '../../lib/booking-window'

// Jamaica is UTC-5, so a calendar day D begins at D 05:00Z.
const at = (iso: string) => new Date(iso)

describe('experiences, date-only with an assumed midnight start', () => {
  test('a date whose Jamaica midnight is beyond the cutoff is bookable', () => {
    // now 03:00Z → cutoff 15:00Z the same day; Aug 16 starts 05:00Z, which is later.
    expect(isExperienceDateBookable('2026-08-16', at('2026-08-15T03:00:00Z'))).toBe(true)
  })

  test('the next day is bookable until noon in Jamaica, then refused', () => {
    // now 16:59Z (11:59 Jamaica) → cutoff Aug 16 04:59Z; Aug 16 starts 05:00Z, which is later.
    expect(isExperienceDateBookable('2026-08-16', at('2026-08-15T16:59:00Z'))).toBe(true)
    // now 18:00Z (13:00 Jamaica) → cutoff Aug 16 06:00Z; Aug 16 starts 05:00Z, which is sooner.
    expect(isExperienceDateBookable('2026-08-16', at('2026-08-15T18:00:00Z'))).toBe(false)
  })

  test('the day after is bookable in both cases', () => {
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-15T10:00:00Z'))).toBe(true)
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-15T23:00:00Z'))).toBe(true)
  })

  test('same-day is never bookable', () => {
    expect(isExperienceDateBookable('2026-08-15', at('2026-08-15T00:01:00Z'))).toBe(false)
    expect(isExperienceDateBookable('2026-08-15', at('2026-08-15T12:00:00Z'))).toBe(false)
  })

  test('past dates are refused, which the old check also did', () => {
    expect(isExperienceDateBookable('2026-08-14', at('2026-08-15T12:00:00Z'))).toBe(false)
    expect(isExperienceDateBookable('2020-01-01', at('2026-08-15T12:00:00Z'))).toBe(false)
  })

  test('exact boundary: Jamaica midnight landing precisely on the cutoff is allowed', () => {
    // cutoff === Aug 17 05:00Z exactly (noon in Jamaica the day before).
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-16T17:00:00Z'))).toBe(true)
    // one second later, Aug 17 is inside the window.
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-16T17:00:01Z'))).toBe(false)
  })

  test('accepts a full ISO timestamp by reading its date part', () => {
    expect(isExperienceDateBookable('2026-08-20T00:00:00.000Z', at('2026-08-15T10:00:00Z'))).toBe(true)
  })

  test('unparseable dates fail closed', () => {
    for (const bad of ['', 'tomorrow', '15-08-2026', '2026-13-45', 'null']) {
      expect(isExperienceDateBookable(bad, at('2026-08-15T10:00:00Z'))).toBe(false)
    }
  })
})

describe('earliestBookableExperienceDate', () => {
  test('always returns a date that passes the check', () => {
    for (const iso of [
      '2026-08-15T00:00:00Z', '2026-08-15T04:59:00Z', '2026-08-15T05:00:00Z',
      '2026-08-15T12:00:00Z', '2026-08-15T23:59:00Z', '2026-12-31T22:00:00Z',
    ]) {
      const now = at(iso)
      const earliest = earliestBookableExperienceDate(now)
      expect(isExperienceDateBookable(earliest, now)).toBe(true)
    }
  })

  test('the day before the answer is NOT bookable, so it really is the earliest', () => {
    const now = at('2026-08-15T12:00:00Z')
    const earliest = earliestBookableExperienceDate(now)
    const dayBefore = new Date(Date.parse(earliest + 'T00:00:00Z') - 86_400_000)
      .toISOString().slice(0, 10)
    expect(isExperienceDateBookable(dayBefore, now)).toBe(false)
  })
})

describe('transfers, exact because pickups carry a real time', () => {
  // Leg timestamps are Jamaica WALL-CLOCK with a Z suffix (lib/dispatch
  // convention): '…T12:00:00Z' means noon in Jamaica, whose real instant is
  // 17:00 UTC. `now` below is a true instant — 12:00 UTC = 07:00 in Jamaica.
  const now = at('2026-08-15T12:00:00Z')

  test('exactly 12 hours ahead is allowed', () => {
    // Jamaica 19:00 today = 00:00 UTC tomorrow = now + exactly 12h.
    expect(isPickupBookable('2026-08-15T19:00:00Z', now)).toBe(true)
  })

  test('one minute inside the window is refused', () => {
    expect(isPickupBookable('2026-08-15T18:59:00Z', now)).toBe(false)
  })

  test('the 12h window is measured in real hours, not a 17h phantom', () => {
    // Regression: raw Date.parse read the wall-clock as UTC, landing 5 hours
    // early. Jamaica 21:00 today = 02:00 UTC tomorrow = 14 real hours from
    // `now`. Must book.
    expect(isPickupBookable('2026-08-15T21:00:00Z', now)).toBe(true)
    // And 11 real hours out must still be refused: Jamaica 18:00 today.
    expect(isPickupBookable('2026-08-15T18:00:00Z', now)).toBe(false)
  })

  test('an 11:45 landing tomorrow books until 23:45 tonight, Jamaica time', () => {
    // The Oct 17 2026 guest: asked at 18:22 Jamaica (23:22Z) about Sunday 11:45.
    expect(isPickupBookable('2026-10-18T11:45:00Z', at('2026-10-17T23:22:00Z'))).toBe(true)
    expect(isPickupBookable('2026-10-18T11:45:00Z', at('2026-10-18T04:45:00Z'))).toBe(true)
    expect(isPickupBookable('2026-10-18T11:45:00Z', at('2026-10-18T04:46:00Z'))).toBe(false)
  })

  test('comfortably ahead is allowed, past is refused', () => {
    expect(isPickupBookable('2026-09-01T08:00:00Z', now)).toBe(true)
    expect(isPickupBookable('2026-08-14T08:00:00Z', now)).toBe(false)
  })

  test('unparseable timestamps fail closed', () => {
    expect(isPickupBookable('not-a-date', now)).toBe(false)
    expect(isPickupBookable('', now)).toBe(false)
  })
})

describe('transfer legs', () => {
  const now = at('2026-08-15T12:00:00Z')

  test('both legs clear the window', () => {
    expect(areTransferLegsBookable(
      { arrivalAt: '2026-08-20T09:00:00Z', departureAt: '2026-08-27T15:00:00Z' }, now,
    )).toBe(true)
  })

  test('a too-soon arrival blocks it even when the return is far out', () => {
    expect(areTransferLegsBookable(
      { arrivalAt: '2026-08-15T15:00:00Z', departureAt: '2026-09-27T15:00:00Z' }, now,
    )).toBe(false)
  })

  test('a departure-only one-way is still checked', () => {
    expect(areTransferLegsBookable({ departureAt: '2026-08-15T18:00:00Z' }, now)).toBe(false)
    expect(areTransferLegsBookable({ departureAt: '2026-08-30T18:00:00Z' }, now)).toBe(true)
  })

  test('nothing scheduled is not rejected here, other validation owns that', () => {
    expect(areTransferLegsBookable({}, now)).toBe(true)
    expect(areTransferLegsBookable({ arrivalAt: null, departureAt: null }, now)).toBe(true)
  })
})

test('the window is 12 hours', () => {
  expect(MIN_LEAD_TIME_HOURS).toBe(12)
  const now = at('2026-08-15T12:00:00Z')
  expect(leadTimeCutoff(now).toISOString()).toBe('2026-08-16T00:00:00.000Z')
})

describe('earliestServiceStart', () => {
  test('takes the earliest tour date, as Jamaica midnight', () => {
    const start = earliestServiceStart([
      { date: '2026-09-20' }, { date: '2026-09-14' }, { date: '2026-09-30' },
    ])
    expect(start?.toISOString()).toBe('2026-09-14T05:00:00.000Z')
  })

  // These two used to assert that a leg timestamp is a real instant. It is
  // not. The transfers checkout stores `new Date(<datetime-local>).toISOString()`,
  // and a datetime-local value carries no zone, so what lands in the column is
  // the guest's typed Jamaica wall-clock wearing a Z. lib/dispatch.ts reads it
  // back that way (legInstantMs adds five hours) and so does isPickupBookable
  // in this very file; earliestServiceStart was the one place that did not,
  // which closed the refund gate five hours early on every transfer.
  test('reads a transfer leg as Jamaica wall-clock, five hours before the real instant', () => {
    const start = earliestServiceStart([
      { arrival_at: '2026-09-14T18:30:00.000Z', departure_at: '2026-09-21T09:00:00.000Z' },
    ])
    // 6:30 PM in Negril is 11:30 PM UTC.
    expect(start?.toISOString()).toBe('2026-09-14T23:30:00.000Z')
  })

  test('a leg time replaces the item date rather than competing with it', () => {
    // Both fields are set on every transfer row, the date being a
    // denormalized copy of the arrival day. Taking the minimum let midnight
    // win, so a 9 PM pickup counted as delivered from midnight that morning.
    const start = earliestServiceStart([
      { date: '2026-09-14', arrival_at: '2026-09-14T21:00:00.000Z' },
    ])
    expect(start?.toISOString()).toBe('2026-09-15T02:00:00.000Z')
  })

  test('takes the earliest across mixed shapes', () => {
    const start = earliestServiceStart([
      { date: '2026-09-20' },
      { arrival_at: '2026-09-15T02:00:00.000Z' },
    ])
    // The transfer leg, 2 AM Jamaica on the 15th, is 7 AM UTC.
    expect(start?.toISOString()).toBe('2026-09-15T07:00:00.000Z')
  })

  test('null when nothing has a usable time', () => {
    expect(earliestServiceStart([])).toBeNull()
    expect(earliestServiceStart([{ date: null, arrival_at: null }])).toBeNull()
    expect(earliestServiceStart([{ date: 'garbage' }])).toBeNull()
  })

  test('ignores unusable entries but keeps good ones', () => {
    const start = earliestServiceStart([{ date: 'garbage' }, { date: '2026-09-14' }])
    expect(start?.toISOString()).toBe('2026-09-14T05:00:00.000Z')
  })
})
