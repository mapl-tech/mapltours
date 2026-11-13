import { describe, test, expect } from 'vitest'
import { bookingRef, clockTime, count, jamaicaToday, legTime, money, plural, stamp, tripDay } from '@/lib/admin-format'

/**
 * The admin screens' one way of writing money and time (lib/admin-format).
 * Every function names its zone, so these hold whatever zone the test runner
 * is in. Dates in 2099 always print their year; dates in this Jamaica year
 * never do.
 */

const THIS_YEAR = jamaicaToday().slice(0, 4)

describe('money and words', () => {
  test('two decimals, no code (the caller adds it once per block)', () => {
    expect(money(162)).toBe('$162.00')
    expect(money(37.5)).toBe('$37.50')
    expect(money(null)).toBe('$0.00')
    expect(money(1234.5)).toBe('$1,234.50')
    expect(money(-12.5)).toBe('\u2212$12.50')
    expect(money(-0.001)).toBe('$0.00')
  })

  test('the guest-facing reference, and counts that never break after the number', () => {
    expect(bookingRef('abcdef12-0000-4000-8000-000000000000')).toBe('MAPL-ABCDEF12')
    expect(plural(1, 'traveler')).toBe('1 traveler')
    expect(count(2, 'passenger')).toBe('2 passengers')
  })
})

describe('our own events: Toronto, zone named', () => {
  test('summer and winter name their own zone; another year prints the year', () => {
    expect(stamp('2099-07-12T01:31:00Z')).toBe('Jul 11, 2099, 9:31 PM EDT')
    expect(stamp('2099-01-12T01:31:00Z')).toBe('Jan 11, 2099, 8:31 PM EST')
    expect(stamp('2099-07-12T01:31:00Z', true)).toBe('Jul 11, 2099')
  })

  test('this year leaves the year out', () => {
    expect(stamp(`${THIS_YEAR}-06-15T16:00:00Z`)).toMatch(/^Jun 15, 12:00 PM EDT$/)
  })

  test('nothing recorded reads as a dash, never "Invalid Date"', () => {
    expect(stamp(null)).toBe('-')
    expect(stamp('not a date')).toBe('-')
  })
})

describe('trip days and legs: the Jamaica wall-clock as stored', () => {
  test('a leg reads exactly as stored, whatever zone the viewer is in', () => {
    expect(legTime('2099-12-03T16:06:00+00:00')).toBe('Thu, Dec 3, 2099, 4:06 PM')
    expect(clockTime('2099-12-03T16:06:00+00:00')).toBe('4:06 PM')
    expect(legTime(`${THIS_YEAR}-12-03T16:06:00+00:00`)).toMatch(/^[A-Z][a-z]{2}, Dec 3, 4:06 PM$/)
  })

  test('a trip day, and nothing for what is not a date', () => {
    expect(tripDay('2099-12-05')).toBe('Sat, Dec 5, 2099')
    expect(tripDay(`${THIS_YEAR}-12-05`)).toMatch(/^[A-Z][a-z]{2}, Dec 5$/)
    expect(tripDay('')).toBe('')
    expect(tripDay(null)).toBe('')
    expect(legTime(null)).toBe('')
  })
})
