/**
 * Driver payouts by Wise: the banking calendar that decides when a payment
 * must leave so it is in the account the day before the ride or tour.
 *
 * The owner's rule (Nov 21 2026): "we want the transfer to arrive either the
 * day of or day before". US banks move no money on weekends or on the
 * Federal Reserve's holidays, so the day the money should be in the account
 * (`arrivalDayFor`) is:
 *  - the day before the trip, when the banks are open that day;
 *  - otherwise the day of the trip, when they are open then (a Monday trip,
 *    or the day after a holiday);
 *  - otherwise the last bank day before the trip: the Friday for a Sunday
 *    trip, when neither the day nor the day before is a bank day. Money is
 *    never planned to arrive after the trip (Nov 18 2026: pay "before the
 *    ride our tour").
 *
 * Wise needs `transit` business days (default 2) to put a US-dollar bank
 * transfer into Collin's US account, counted from the first business day on
 * or after it is funded. Wise's own delivery estimates on the first real
 * payouts: funded Thursday Nov 19, in the account Monday Nov 23; funded
 * Friday Nov 20, Tuesday Nov 24; quoted on Saturday Nov 21, Wednesday Nov 25.
 * (The Nov 18 design counted one business day, which put the money for the
 * Nov 21 and 22 weekend rides in the account on the Monday after them.) So a
 * payment goes out `transit` business days before its arrival day: a Thursday
 * trip is paid on the Monday and arrives on the Wednesday; a Saturday or
 * Sunday trip is paid on the Wednesday and arrives on the Friday; a Monday
 * trip is paid on the Thursday and arrives on the Monday.
 *
 * Dates are calendar dates, 'YYYY-MM-DD', with no time and no zone: the
 * Jamaica day of the ride or tour, and the Jamaica day of the run. Pure.
 *
 * The holidays are the Federal Reserve's (federalreserve.gov, "Holidays
 * Observed by the Federal Reserve System"): New Year's Day, Martin Luther King
 * Jr. Day, Washington's Birthday, Memorial Day, Juneteenth, Independence Day,
 * Labor Day, Columbus Day, Veterans Day, Thanksgiving and Christmas. One that
 * falls on a Sunday is observed on the Monday after; one that falls on a
 * Saturday is not moved (the banks are open the Friday before).
 */

const DAY_MS = 86_400_000
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date in 'YYYY-MM-DD' form (2026-02-30 is not one). */
export function isYmd(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = YMD.exec(s)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.toISOString().slice(0, 10) === s
}

const toMs = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The date `n` calendar days after (or before, for a negative n) `ymd`. */
export function addDays(ymd: string, n: number): string {
  return fromMs(toMs(ymd) + n * DAY_MS)
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(ymd: string): number {
  return new Date(toMs(ymd)).getUTCDay()
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymdOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** The nth (1-based) given weekday of a month, e.g. the 4th Thursday of November. */
function nthWeekday(y: number, m: number, dow: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return ymdOf(y, m, 1 + ((dow - first + 7) % 7) + (n - 1) * 7)
}

/** The last given weekday of a month, e.g. the last Monday of May. */
function lastWeekday(y: number, m: number, dow: number): string {
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay()
  return ymdOf(y, m, lastDay - ((last - dow + 7) % 7))
}

/** A fixed-date holiday as the banks observe it: Sunday moves to Monday, Saturday is not moved. */
function observedFixed(y: number, m: number, d: number): string | null {
  const ymd = ymdOf(y, m, d)
  const w = weekday(ymd)
  if (w === 0) return addDays(ymd, 1)
  if (w === 6) return null
  return ymd
}

const cache = new Map<number, Set<string>>()

/** The days in a year on which US banks move no money besides weekends. */
export function usBankHolidays(year: number): Set<string> {
  const hit = cache.get(year)
  if (hit) return hit
  const days = [
    observedFixed(year, 1, 1), // New Year's Day
    nthWeekday(year, 1, 1, 3), // Martin Luther King Jr. Day: 3rd Monday of January
    nthWeekday(year, 2, 1, 3), // Washington's Birthday: 3rd Monday of February
    lastWeekday(year, 5, 1), // Memorial Day: last Monday of May
    observedFixed(year, 6, 19), // Juneteenth
    observedFixed(year, 7, 4), // Independence Day
    nthWeekday(year, 9, 1, 1), // Labor Day: 1st Monday of September
    nthWeekday(year, 10, 1, 2), // Columbus Day: 2nd Monday of October
    observedFixed(year, 11, 11), // Veterans Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving: 4th Thursday of November
    observedFixed(year, 12, 25), // Christmas Day
  ].filter((d): d is string => d !== null)
  const set = new Set(days)
  cache.set(year, set)
  return set
}

/** Monday to Friday and not a US bank holiday. */
export function isBusinessDay(ymd: string): boolean {
  const w = weekday(ymd)
  if (w === 0 || w === 6) return false
  return !usBankHolidays(Number(ymd.slice(0, 4))).has(ymd)
}

/** The first business day after `ymd` (never `ymd` itself). */
export function nextBusinessDay(ymd: string): string {
  let day = addDays(ymd, 1)
  // The longest run of days without a bank day is a weekend beside a holiday: 3 or 4 days.
  for (let i = 0; i < 14 && !isBusinessDay(day); i++) day = addDays(day, 1)
  return day
}

/** The last business day before `ymd` (never `ymd` itself). */
export function prevBusinessDay(ymd: string): string {
  let day = addDays(ymd, -1)
  for (let i = 0; i < 14 && !isBusinessDay(day); i++) day = addDays(day, -1)
  return day
}

/**
 * The day the money for a service on `serviceDay` should be in the account:
 * the day before, else the day itself, else the last bank day before it.
 */
export function arrivalDayFor(serviceDay: string): string {
  const before = addDays(serviceDay, -1)
  if (isBusinessDay(before)) return before
  if (isBusinessDay(serviceDay)) return serviceDay
  return prevBusinessDay(serviceDay)
}

/**
 * The day a payment funded on `payDay` is in the account: Wise starts on the
 * first business day on or after it and takes `transit` business days.
 */
export function landingDayFor(payDay: string, transit: number): string {
  let day = isBusinessDay(payDay) ? payDay : nextBusinessDay(payDay)
  for (let i = 0; i < transit; i++) day = nextBusinessDay(day)
  return day
}

/**
 * The day a payment for a service on `serviceDay` goes out: `transit`
 * business days before its arrival day, so that it lands on that day. A run
 * on that day or later pays it (later lands later, never earlier).
 */
export function sendDayFor(serviceDay: string, transit: number): string {
  let day = arrivalDayFor(serviceDay)
  for (let i = 0; i < transit; i++) day = prevBusinessDay(day)
  return day
}

const JAMAICA_OFFSET_MS = 5 * 3_600_000 // Jamaica is UTC-5 all year (no daylight saving)

/** The Jamaica calendar date of a real instant. */
export function jamaicaDay(nowMs: number): string {
  return new Date(nowMs - JAMAICA_OFFSET_MS).toISOString().slice(0, 10)
}
