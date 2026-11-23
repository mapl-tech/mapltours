/**
 * Pure rules behind the tour reel (components/ExperienceDetail.tsx), kept
 * here so they can be tested without a browser.
 */
import { driveTime, type TourFit } from './day-route'
import { minutesBetween, tourPoint } from './drive-times'
import { slugify, type Experience } from './experiences'

/**
 * The reel order: the tour the visitor asked for first (an ad, a search
 * result, a tap on home), then the rest nearest-first from it. A visitor who
 * lands on Rick's Cafe swipes into the other Negril tours before Ocho Rios,
 * so the next reel is usually one that can join the same day instead of one
 * whose button can only replace it. Distances are the day planner's routed
 * drives between the tours' own sites (lib/drive-times). Ties and tours with
 * no drive time keep catalogue order. Depends on nothing client-side, so the
 * server renders the same order the browser hydrates.
 */
export function orderFeed(list: Experience[], requestedSlug: string): Experience[] {
  const at = list.findIndex((e) => slugify(e.title) === requestedSlug)
  if (at < 0) return list
  const first = list[at]
  const rest = list
    .map((e, i) => ({ e, i, minutes: i === at ? null : minutesBetween(tourPoint(first), tourPoint(e)) }))
    .filter((x) => x.i !== at)
    .sort((a, b) => {
      if (a.minutes === null && b.minutes === null) return a.i - b.i
      if (a.minutes === null) return 1
      if (b.minutes === null) return -1
      return a.minutes - b.minutes || a.i - b.i
    })
    .map((x) => x.e)
  return [first, ...rest]
}

/**
 * Where Close takes the visitor. Back only when they reached the reel from
 * another page of this site in this tab. A visitor who landed on the reel (an
 * ad, a shared link) and then visited checkout and came back has a history
 * whose previous entry is the ad or a blank in-app webview, and Back threw
 * them off the site; they go to /explore instead.
 *
 * `entryPath` is the path of the document's own navigation (the page this
 * tab first loaded), which client-side moves never change.
 */
export function closeTarget(entryPath: string | null, historyLength: number): 'back' | '/explore' {
  if (!entryPath || historyLength < 2) return '/explore'
  return entryPath.startsWith('/experience/') ? '/explore' : 'back'
}

/** "Fri, Oct 16" for a "YYYY-MM-DD" trip date, the same in every time zone. */
export function tripDayLabel(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * The short line under "Book this instead" on a phone: why this tour cannot
 * join the day in the cart, and what booking it does. It wraps rather than
 * being cut: measured on Nov 23 2026, the reel gives it 216px at 320 wide and
 * 286px at 390, and "1 hr 30 min from the Martha Brae, so it replaces that
 * day." needs two lines on both.
 */
export function swapReason(fit: Pick<TourFit, 'minutes' | 'nearest'> & Partial<Pick<TourFit, 'why'>>): string {
  if (fit.why === 'hours') return 'Your day is full, so this replaces it.'
  if (fit.minutes !== null && fit.nearest) return `${driveTime(fit.minutes)} from ${fit.nearest}, so it replaces that day.`
  return 'It can’t share your day, so it replaces it.'
}
