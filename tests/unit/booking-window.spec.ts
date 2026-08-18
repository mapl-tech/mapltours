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
    // now 03:00Z → cutoff next day 03:00Z; Aug 16 starts 05:00Z, which is later.
    expect(isExperienceDateBookable('2026-08-16', at('2026-08-15T03:00:00Z'))).toBe(true)
  })

  test('the same next-day date is refused once booking happens later in the day', () => {
    // now 10:00Z → cutoff Aug 16 10:00Z; Aug 16 starts 05:00Z, which is sooner.
    expect(isExperienceDateBookable('2026-08-16', at('2026-08-15T10:00:00Z'))).toBe(false)
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
    // cutoff === Aug 17 05:00Z exactly.
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-16T05:00:00Z'))).toBe(true)
    // one second later, Aug 17 is inside the window.
    expect(isExperienceDateBookable('2026-08-17', at('2026-08-16T05:00:01Z'))).toBe(false)
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

  test('exactly 24 hours ahead is allowed', () => {
    // Jamaica 07:00 tomorrow = 12:00 UTC tomorrow = now + exactly 24h.
    expect(isPickupBookable('2026-08-16T07:00:00Z', now)).toBe(true)
  })

  test('one minute inside the window is refused', () => {
    expect(isPickupBookable('2026-08-16T06:59:00Z', now)).toBe(false)
  })

  test('the 24h window is measured in real hours, not a 29h phantom', () => {
    // Regression: raw Date.parse read the wall-clock as UTC, landing 5 hours
    // early, so a pickup 26 real hours out was refused. Jamaica 09:00
    // tomorrow = 14:00 UTC tomorrow = 26 real hours from `now`. Must book.
    expect(isPickupBookable('2026-08-16T09:00:00Z', now)).toBe(true)
    // And 23 real hours out must still be refused: Jamaica 06:00 tomorrow.
    expect(isPickupBookable('2026-08-16T06:00:00Z', now)).toBe(false)
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

test('the window is 24 hours', () => {
  expect(MIN_LEAD_TIME_HOURS).toBe(24)
  const now = at('2026-08-15T12:00:00Z')
  expect(leadTimeCutoff(now).toISOString()).toBe('2026-08-16T12:00:00.000Z')
})

describe('earliestServiceStart', () => {
  test('takes the earliest tour date, as Jamaica midnight', () => {
    const start = earliestServiceStart([
      { date: '2026-09-20' }, { date: '2026-09-14' }, { date: '2026-09-30' },
    ])
    expect(start?.toISOString()).toBe('2026-09-14T05:00:00.000Z')
  })

  test('uses real timestamps for transfer legs', () => {
    const start = earliestServiceStart([
      { arrival_at: '2026-09-14T18:30:00.000Z', departure_at: '2026-09-21T09:00:00.000Z' },
    ])
    expect(start?.toISOString()).toBe('2026-09-14T18:30:00.000Z')
  })

  test('takes the earliest across mixed shapes', () => {
    const start = earliestServiceStart([
      { date: '2026-09-20' },
      { arrival_at: '2026-09-15T02:00:00.000Z' },
    ])
    expect(start?.toISOString()).toBe('2026-09-15T02:00:00.000Z')
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
