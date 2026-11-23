/**
 * How long a day is, in the units the day builder, checkout and the server
 * all count it in. No imports: lib/cart, lib/day-route, lib/day-score and the
 * checkout route all read these, and lib/cart already imports lib/day-route.
 */

/**
 * The longest day one checkout books: the tours, the free food stops and the
 * driving between them (lib/day-route dayTime). Beyond it the guest removes
 * something or books it as a second day.
 */
export const DAILY_HOUR_LIMIT = 8
export const DAY_LIMIT_MIN = DAILY_HOUR_LIMIT * 60

/**
 * Time a free food stop takes out of the day.
 *
 * A stop costs MAPL nothing and the guest pays the venue directly, but it
 * absolutely costs the DAY — parking, sitting down, eating, getting back on
 * the road. Counting it as zero let a guest fill eight hours with tours and
 * then add three lunches, producing an itinerary no driver could actually run.
 *
 * Real stops run one to two hours; the midpoint is banked. Nobody is hurried
 * out of Scotchies at the sixty-minute mark, and budgeting the full two would
 * make a day with two stops look impossible when it usually is not.
 */
export const STOP_HOURS = 1.5

export function parseDurationHours(duration: string): number {
  if (/full\s*day/i.test(duration)) return 8
  if (/half\s*day/i.test(duration)) return 4
  const match = duration.match(/([\d.]+)\s*hr/i)
  return match ? parseFloat(match[1]) : 3
}

/** A tour that takes the whole day ("Full day"): its driving and lunch are inside it. */
export function isFullDay(duration: string): boolean {
  return parseDurationHours(duration) >= DAILY_HOUR_LIMIT
}

/**
 * The hours a day's free food stops add. A full day (a ready-made package or
 * Nine Mile, each "Full day") already has its meal break inside it, so the
 * first stop on such a day IS that lunch and adds nothing; every further stop
 * costs STOP_HOURS as on any day. Without this, one lunch on a full-day
 * package (8 hours) took the day to 9.5 and blocked Pay for a free stop.
 * Everything that totals a day calls this, so the bar, the day list and the
 * checkout gate agree. The server never counts stops at all.
 */
export function stopHoursFor(items: { duration: string }[], stopCount: number): number {
  const fullDay = items.some((i) => isFullDay(i.duration))
  return Math.max(0, stopCount - (fullDay ? 1 : 0)) * STOP_HOURS
}

/**
 * Minutes as a guest reads them, in the site's own units ("2 hrs at the
 * falls"): "45 min", "1 hr", "1 hr 5 min", "7 hrs 25 min". Whole minutes,
 * which is what every day total is.
 */
export function formatDayTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  const hours = `${h} ${h === 1 ? 'hr' : 'hrs'}`
  return m === 0 ? hours : `${hours} ${m} min`
}
