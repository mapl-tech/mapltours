import type { CartItem, FoodStop } from './cart'
import { DAY_LIMIT_MIN, DAILY_HOUR_LIMIT, formatDayTime, isFullDay, parseDurationHours, stopHoursFor } from './day-hours'
import { minutesBetween, placePoint, stopPoint, tourPlaceName, tourPoint } from './drive-times'

/**
 * The shape of a day, and the rules that keep it drivable.
 *
 * A day is tours in the order they will be driven, with free food stops
 * hanging off them:
 *
 *     stop? → tour → stop? → stop? → tour → stop? …
 *
 * The rules, and the reason for each:
 *
 *  1. A day needs at least one TOUR. Tours are what is booked, what puts a
 *     driver on the road, and what the guest pays for; a cart of nothing but
 *     restaurants is not something MAPL can sell or dispatch. Stops may open
 *     the day — breakfast before the first tour is a real thing people want —
 *     but they cannot be the whole of it.
 *
 *  2. The tours have to be near EACH OTHER, in sequence: point A to point B
 *     to point C, none of them more than an hour apart. A day with Negril in
 *     the morning and Ocho Rios in the afternoon is four hours in a van; it
 *     is two days, and the guest should be sold two days.
 *
 *  3. A stop has to be within half an hour of whatever it sits between — the
 *     tour or stop before it, or the tour after it. Stops may sit together:
 *     two spots in the same town, back to back, is lunch and a bakery on the
 *     way out, not a problem. What a chain of stops may NOT do is float free
 *     of the tours; it has to reach one through links of half an hour or less,
 *     because two stops an hour off the route that happen to be near each
 *     other are still two stops an hour off the route.
 *
 *  4. The whole day fits in DAILY_HOUR_LIMIT hours: the time at each tour,
 *     the food stops, and the driving between them, every leg counted as the
 *     day list prints it (owner, Nov 23 2026: "drive time and tours do not go
 *     over 8 hours"). A tour, a stop or a new order that would take the day
 *     past it is refused where it is offered, with the day's new length named.
 *
 * Nothing here measures against the hotel. Pickup and drop-off are collected
 * at checkout, long after the day is built, so a rule that leant on them would
 * be judging the itinerary against a blank. The day is judged against itself,
 * and the drive to and from the hotel is what each tour's page states.
 *
 * Every drive is routed over OpenStreetMap's roads (lib/drive-times), from the
 * tour's own site where it is known by name and from each food stop's door.
 *
 * Order is the guest's: a new tour lands where it adds the least driving, and
 * checkout can rearrange, but only into orders that keep rules 2 to 4 true.
 */

/** The most driving a food stop may add on either side of itself. */
export const MAX_STOP_GAP_MIN = 30

/**
 * The most driving between one tour and the next.
 *
 * An hour is the line between "the next thing along the coast" and "somewhere
 * else on the island". By road (lib/drive-times) it keeps the pairings a day
 * is built from: Dunn's River with the Blue Hole (~30 min), Montego Bay with
 * the Martha Brae (~50), Rick's Cafe with the Hanover parks (~50); and it
 * refuses the ones that are a second trip: the Martha Brae with Dunn's River
 * (~85), Montego Bay with Negril (~90). Two hours of driving inside an
 * eight-hour day is a day spent in the van.
 */
export const MAX_TOUR_GAP_MIN = 60

/**
 * Driving minutes between two named places (towns, hotels, ports), routed;
 * null when either is missing or unknown. For a tour or a food stop use
 * tourPoint / stopPoint (lib/drive-times), which know the exact site.
 */
export function driveMinutes(from: string | null | undefined, to: string | null | undefined): number | null {
  return minutesBetween(placePoint(from), placePoint(to))
}

/** A stop as the catalog knows it, before it is placed in a day. */
export type StopCandidate = Pick<FoodStop, 'name' | 'town'>

/** What the planner needs from a tour: where it is, what it is called, how long it takes. */
export type TourLike = Pick<CartItem, 'id' | 'title' | 'destination' | 'duration'>

/**
 * Where a stop sits: after the tour with this id, or — when null — before the
 * first tour of the day. Null is what lets breakfast open an itinerary while
 * still hanging the day off tours.
 */
export type StopSlot = number | null

export type StopVerdict = 'no-tours' | 'linked' | 'stranded' | 'unknown' | 'full'

export interface StopFit {
  verdict: StopVerdict
  /** False only when the stop must be refused. */
  allowed: boolean
  /** Minutes to the neighbour it hangs off, or to the nearest one when refused. */
  minutes: number | null
  /** What it sits beside: a tour, or another stop. */
  neighbour: string | null
  /** One short line, safe to show on a card or a list row. */
  label: string
  /** Why it was refused, in full. Null when the stop is allowed. */
  reason: string | null
}

export interface TourFit {
  allowed: boolean
  /**
   * Why it was refused: 'drive' when no tour it would sit beside is within
   * MAX_TOUR_GAP_MIN, 'hours' when the day would run past DAILY_HOUR_LIMIT.
   * Null when allowed.
   */
  why: 'drive' | 'hours' | null
  /** Drive to the nearest tour already in the day, null when unmeasurable. */
  minutes: number | null
  /** Where that nearest tour is, in a few words ("Dunn's River Falls", "Ocho Rios"). */
  nearest: string | null
  /** The whole day with this tour in it, in minutes; null when nothing was measured. */
  dayMinutes: number | null
  reason: string | null
}

export interface DayContext {
  items: CartItem[]
  stops: FoodStop[]
}

/**
 * The drive into a node from the one before it in the route, as the day list
 * prints it; null for the first (from the hotel, not counted) and for a stop
 * whose tour has gone. The printed legs add up to dayTime's driving.
 */
export interface LegIn {
  from: string
  minutes: number | null
}

export type DayNode =
  | { kind: 'experience'; key: string; place: string; title: string; item: CartItem; legIn: LegIn | null }
  | { kind: 'stop'; key: string; place: string; title: string; stop: FoodStop; fit: StopFit; legIn: LegIn | null }

export interface DayLeg {
  fromId: number
  toId: number
  /** The tours' titles, as the day list prints them. */
  from: string
  to: string
  /** Routed minutes, or null when either end cannot be placed. */
  minutes: number | null
  over: boolean
}

export interface DayPlan {
  /** Tours and their stops, in driving order. No hotel: see the file header. */
  nodes: DayNode[]
  /** Verdict per stop name, the same objects carried on the stop nodes. */
  fits: Map<string, StopFit>
  /**
   * The drive between each consecutive pair of TOURS, in order, for the leg
   * warnings the day flow prints between them.
   */
  legs: DayLeg[]
}

/** How long a day is, in whole minutes, and what it is made of. */
export interface DayTime {
  /** At the tours, as their durations say. */
  tours: number
  /** At the free food stops (lib/day-hours stopHoursFor). */
  stops: number
  /**
   * On the road between them, every leg as the day list prints it (roundFive),
   * none on a full day: its driving is inside its own eight hours.
   */
  driving: number
  total: number
}

/** The day's areas, deduped and written out: "Ocho Rios and Falmouth". */
export function dayAreas(items: Pick<CartItem, 'destination'>[]): string {
  const names = Array.from(new Set(items.map((i) => i.destination)))
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function roundFive(minutes: number): number {
  return Math.max(5, Math.round(minutes / 5) * 5)
}

/**
 * A drive as a sentence says it: to the nearest five minutes, in the same
 * units as the day's total ("35 min", "1 hr 25 min", "3 hrs 15 min").
 */
export function driveTime(minutes: number): string {
  return formatDayTime(roundFive(minutes))
}

/**
 * A leg as the day counts it: nothing between two things at the same place,
 * otherwise the five-minute figure the list prints. Unmeasurable counts as
 * nothing; a hole in the table is not the guest's to pay for.
 */
export function legMinutes(minutes: number | null): number {
  if (minutes === null || minutes === 0) return 0
  return roundFive(minutes)
}

/**
 * Is this gap inside the budget?
 *
 * Judged on the SAME rounded figure the UI prints, not on the raw time. The
 * routed figure is good to a few minutes either way (no traffic), so refusing
 * a stop the interface describes as "about 30 min from Dunn's River" would be
 * the app disagreeing with itself in public, and the boundary would be
 * sharper than the measurement behind it.
 */
function withinGap(minutes: number | null, budget: number): boolean {
  return minutes !== null && roundFive(minutes) <= budget
}

function noToursFit(): StopFit {
  return {
    verdict: 'no-tours',
    allowed: false,
    minutes: null,
    neighbour: null,
    label: 'Add a tour first',
    reason:
      'Food stops ride along a tour day. They are free, and your driver works them into the route after a tour. Add a tour and the spots near it open up.',
  }
}

/** Every stop attached to this tour, in the order they were added. */
export function stopsAfter(stops: FoodStop[], itemId: StopSlot): FoodStop[] {
  return stops.filter((s) => s.afterId === itemId)
}

/** Stops that open the day, before the first tour. */
export function leadingStops(stops: FoodStop[]): FoodStop[] {
  return stops.filter((s) => s.afterId === null)
}

type RouteNode =
  | { kind: 'tour'; point: string | null; title: string; id: number }
  | { kind: 'stop'; point: string | null; title: string; name: string }

/** Tours and their stops, flattened into the order they are driven. */
function routeOf(items: TourLike[], stops: FoodStop[]): RouteNode[] {
  const route: RouteNode[] = []
  for (const stop of leadingStops(stops)) {
    route.push({ kind: 'stop', point: stopPoint(stop), title: stop.name, name: stop.name })
  }
  for (const item of items) {
    route.push({ kind: 'tour', point: tourPoint(item), title: item.title, id: item.id })
    for (const stop of stopsAfter(stops, item.id)) {
      route.push({ kind: 'stop', point: stopPoint(stop), title: stop.name, name: stop.name })
    }
  }
  return route
}

/**
 * How long the day is: the tours, the food stops, and the driving along the
 * route between them, in that order. Stops whose tour has left the day still
 * take their time (they are still in the cart), but no driving, since they
 * are on no route.
 *
 * Shared by the bar, the day list, the cart's gate, the add buttons and the
 * checkout server (which sends tours only), so they can never disagree.
 */
export function dayTime(items: TourLike[], stops: FoodStop[] = []): DayTime {
  const tours = Math.round(items.reduce((sum, i) => sum + parseDurationHours(i.duration) * 60, 0))
  const atStops = Math.round(stopHoursFor(items, stops.length) * 60)
  let driving = 0
  if (!items.some((i) => isFullDay(i.duration))) {
    const route = routeOf(items, stops)
    for (let i = 1; i < route.length; i++) driving += legMinutes(minutesBetween(route[i - 1].point, route[i].point))
  }
  return { tours, stops: atStops, driving, total: tours + atStops + driving }
}

/** The same, for a day as the planner holds it. */
export function dayTimeOf(ctx: DayContext): DayTime {
  return dayTime(ctx.items, ctx.stops)
}

/**
 * What a day's time is made of, parts that are there only:
 * "Tours 5 hrs · Driving 40 min · Food stops 1 hr 30 min". The bar and the
 * checkout's over-limit dialog both print it.
 */
export function dayParts(time: DayTime): string {
  return [
    `Tours ${formatDayTime(time.tours)}`,
    time.driving > 0 ? `Driving ${formatDayTime(time.driving)}` : null,
    time.stops > 0 ? `Food stops ${formatDayTime(time.stops)}` : null,
  ].filter(Boolean).join(' · ')
}

/**
 * The note under a stop in the day list: the drive in from the one before,
 * in the minutes the day's total counts. "Right by" when they share a place.
 */
export function legNote(leg: LegIn | null): string | undefined {
  if (!leg || leg.minutes === null) return undefined
  if (leg.minutes === 0) return `Right by ${leg.from}`
  return `About ${driveTime(leg.minutes)} drive from ${leg.from}`
}

/**
 * Each booking date's tours, in driving order, with the food stops that ride
 * along them. A stop belongs to the day of the tour it follows; one that
 * opens the day, or whose tour has gone, to the first tour's day ('unset'
 * when the cart has no tours). One checkout books one day, so in practice
 * this is a single entry.
 */
export function daysOf(items: CartItem[], stops: FoodStop[]): Map<string, { items: CartItem[]; stops: FoodStop[] }> {
  const days = new Map<string, { items: CartItem[]; stops: FoodStop[] }>()
  const dayFor = (key: string) => {
    const day = days.get(key) ?? { items: [], stops: [] }
    days.set(key, day)
    return day
  }
  for (const item of items) dayFor(item.date || 'unset').items.push(item)
  const firstKey = items[0]?.date || 'unset'
  for (const stop of stops) {
    const host = items.find((i) => i.id === stop.afterId)
    dayFor(host ? host.date || 'unset' : firstKey).stops.push(stop)
  }
  return days
}

/**
 * Which stops in a route hold, and what holds them.
 *
 * Tours are anchors. A stop is anchored when it is within half an hour of an
 * already-anchored neighbour, which walks along a chain of stops from either
 * side — so two stops in a row are fine as long as the chain reaches a tour.
 * Anything neither pass reaches is hanging off nothing.
 */
function groundRoute(route: RouteNode[]): Map<string, StopFit> {
  const anchored = route.map((n) => n.kind === 'tour')
  const gap = (a: number, b: number) =>
    a < 0 || b >= route.length ? null : minutesBetween(route[a].point, route[b].point)

  for (let i = 1; i < route.length; i++) {
    if (route[i].kind !== 'stop' || !anchored[i - 1]) continue
    if (withinGap(gap(i - 1, i), MAX_STOP_GAP_MIN)) anchored[i] = true
  }
  for (let i = route.length - 2; i >= 0; i--) {
    if (route[i].kind !== 'stop' || anchored[i] || !anchored[i + 1]) continue
    if (withinGap(gap(i, i + 1), MAX_STOP_GAP_MIN)) anchored[i] = true
  }

  const fits = new Map<string, StopFit>()
  route.forEach((node, i) => {
    if (node.kind !== 'stop') return

    const options: { gap: number; name: string | null }[] = []
    const behind = gap(i - 1, i)
    if (behind !== null) options.push({ gap: behind, name: route[i - 1]?.title ?? null })
    const ahead = gap(i, i + 1)
    if (ahead !== null) options.push({ gap: ahead, name: route[i + 1]?.title ?? null })

    if (options.length === 0) {
      // Nothing here can be placed on the map. A hole in the coordinate table
      // is our problem, not the guest's; refusing a real restaurant over it
      // would be the worse failure.
      fits.set(node.name, {
        verdict: 'unknown',
        allowed: true,
        minutes: null,
        neighbour: null,
        label: 'Your driver will fit this in',
        reason: null,
      })
      return
    }

    const nearest = options.reduce((a, b) => (b.gap < a.gap ? b : a))

    if (anchored[i]) {
      fits.set(node.name, {
        verdict: 'linked',
        allowed: true,
        minutes: nearest.gap,
        neighbour: nearest.name,
        label: nearest.gap <= 5
          ? `Right by ${nearest.name}`
          : `About ${driveTime(nearest.gap)} from ${nearest.name}`,
        reason: null,
      })
      return
    }

    fits.set(node.name, {
      verdict: 'stranded',
      allowed: false,
      minutes: nearest.gap,
      neighbour: nearest.name,
      label: 'Off your route',
      reason: `Nothing beside it in the day is within ${MAX_STOP_GAP_MIN} minutes. The nearest is ${nearest.name}, about ${driveTime(nearest.gap)} away. A stop has to sit next to something in the day it can reach: the tour or stop before it, or the tour after it.`,
    })
  })

  return fits
}

/** The drive between each consecutive pair of tours, as the day list prints it. */
function legsOf(items: TourLike[]): DayLeg[] {
  return items.slice(0, -1).map((item, i) => {
    const next = items[i + 1]
    const minutes = minutesBetween(tourPoint(item), tourPoint(next))
    return {
      fromId: item.id,
      toId: next.id,
      from: item.title,
      to: next.title,
      minutes,
      over: minutes !== null && !withinGap(minutes, MAX_TOUR_GAP_MIN),
    }
  })
}

/** The whole day as a route, with every stop judged where it sits. */
export function planDay(ctx: DayContext): DayPlan {
  const fits = new Map<string, StopFit>()

  if (ctx.items.length === 0) {
    for (const stop of ctx.stops) fits.set(stop.name, noToursFit())
    return { nodes: [], fits, legs: [] }
  }

  const route = routeOf(ctx.items, ctx.stops)
  const grounded = groundRoute(route)
  const nodes: DayNode[] = []

  // Nodes are pushed in the route's own order, so the n-th one pushed is
  // route[n] and its drive in is from route[n - 1].
  let at = 0
  const legIn = (): LegIn | null => {
    const i = at++
    return i === 0 ? null : { from: route[i - 1].title, minutes: minutesBetween(route[i - 1].point, route[i].point) }
  }

  const push = (stop: FoodStop) => {
    const fit = grounded.get(stop.name) ?? noToursFit()
    fits.set(stop.name, fit)
    nodes.push({ kind: 'stop', key: `stop-${stop.name}`, place: stop.town, title: stop.name, stop, fit, legIn: legIn() })
  }

  for (const stop of leadingStops(ctx.stops)) push(stop)

  for (const item of ctx.items) {
    nodes.push({
      kind: 'experience',
      key: `exp-${item.id}`,
      place: item.destination,
      title: item.title,
      item,
      legIn: legIn(),
    })
    for (const stop of stopsAfter(ctx.stops, item.id)) push(stop)
  }

  // A stop whose tour has left the cart has nothing to hang off. Shown at the
  // end and flagged rather than vanishing; the store re-homes or drops those
  // on removal, so this is the belt to that braces.
  const hosted = new Set<StopSlot>([null, ...ctx.items.map((i) => i.id)])
  for (const stop of ctx.stops) {
    if (hosted.has(stop.afterId)) continue
    const fit: StopFit = {
      verdict: 'stranded',
      allowed: false,
      minutes: null,
      neighbour: null,
      label: 'Off your route',
      reason:
        'The tour this sat with is no longer in your day, so there is nothing beside it in the route. Drop it, or add a tour near it.',
    }
    fits.set(stop.name, fit)
    nodes.push({ kind: 'stop', key: `stop-${stop.name}`, place: stop.town, title: stop.name, stop, fit, legIn: null })
  }

  return { nodes, fits, legs: legsOf(ctx.items) }
}

/**
 * Judge a stop appended to one particular tour — behind whatever stops that
 * tour already carries, which is where it would actually land. Distance only:
 * the store re-homes stops with this when a tour leaves, and a stop the guest
 * already chose is never dropped for the day's length (fitCandidateStop and
 * the store's addStop judge the length of the day, on the way in).
 */
export function fitStopAfter(stop: StopCandidate, afterId: StopSlot, ctx: DayContext): StopFit {
  if (ctx.items.length === 0) return noToursFit()
  if (afterId !== null && !ctx.items.some((i) => i.id === afterId)) return noToursFit()
  const candidate: FoodStop = {
    name: stop.name, town: stop.town, afterId,
    parish: '', knownFor: '', image: '', mapsQuery: '',
  }
  return groundRoute(routeOf(ctx.items, [...ctx.stops, candidate])).get(stop.name) ?? noToursFit()
}

/**
 * The tour this stop should follow: whichever gives the shortest hop. Any
 * tour will do — a tour may carry several stops, so a good spot is never
 * refused because an earlier one took the slot.
 */
export function bestSlotForStop(
  stop: StopCandidate,
  ctx: DayContext,
): { afterId: StopSlot; fit: StopFit } | null {
  let best: { afterId: StopSlot; fit: StopFit; cost: number } | null = null

  // null first: with equal hops, opening the day is the better read of a stop
  // that is near the first tour anyway.
  for (const slot of [null, ...ctx.items.map((i) => i.id)] as StopSlot[]) {
    const fit = fitStopAfter(stop, slot, ctx)
    if (!fit.allowed) continue
    const cost = fit.minutes ?? Infinity
    if (!best || cost < best.cost) best = { afterId: slot, fit, cost }
  }

  return best ? { afterId: best.afterId, fit: best.fit } : null
}

/**
 * The length of the day with this stop added in that slot, and whether it
 * still fits. Rule 4 for a stop: the store's addStop and every surface that
 * offers one ask this.
 */
export function dayWithStop(stop: StopCandidate, afterId: StopSlot, ctx: DayContext): { time: DayTime; fits: boolean } {
  const candidate: FoodStop = {
    name: stop.name, town: stop.town, afterId,
    parish: '', knownFor: '', image: '', mapsQuery: '',
  }
  const time = dayTime(ctx.items, [...ctx.stops, candidate])
  return { time, fits: time.total <= DAY_LIMIT_MIN }
}

/** "9 hrs 35 min with the drives in between": a day's length, naming the driving when there is some. */
function lengthWithDrives(time: DayTime): string {
  return `${formatDayTime(time.total)}${time.driving > 0 ? ' with the drives in between' : ''}`
}

/** A stop refused because the day has no room left for it. */
function fullDayFit(fit: StopFit, time: DayTime): StopFit {
  return {
    verdict: 'full',
    allowed: false,
    minutes: fit.minutes,
    neighbour: fit.neighbour,
    label: 'Your day is full',
    reason: `Adding it would make your day ${lengthWithDrives(time)}, past the ${DAILY_HOUR_LIMIT} hours one day can hold.`,
  }
}

/**
 * What would happen if this stop were added now — judged in the slot the day
 * would actually give it, and against the length of the day.
 */
export function fitCandidateStop(stop: StopCandidate, ctx: DayContext): StopFit {
  if (ctx.items.length === 0) return noToursFit()

  const already = ctx.stops.find((s) => s.name === stop.name)
  if (already) return planDay(ctx).fits.get(stop.name) ?? noToursFit()

  const best = bestSlotForStop(stop, ctx)
  if (best) {
    const day = dayWithStop(stop, best.afterId, ctx)
    return day.fits ? best.fit : fullDayFit(best.fit, day.time)
  }

  // Nothing legal: report the closest miss, so the card can say how far off
  // the day this place actually is.
  return ([null, ...ctx.items.map((i) => i.id)] as StopSlot[])
    .map((slot) => fitStopAfter(stop, slot, ctx))
    .reduce((a, b) => ((b.minutes ?? Infinity) < (a.minutes ?? Infinity) ? b : a))
}

/** Shorthand for the callers that only need a yes or no. */
export function canAddStop(stop: StopCandidate, ctx: DayContext): boolean {
  return fitCandidateStop(stop, ctx).allowed
}

/**
 * Stops that no longer sit beside anything. Flagged rather than deleted where
 * they survive: the guest chose them, so the guest decides.
 */
export function strandedStops(ctx: DayContext): FoodStop[] {
  const { fits } = planDay(ctx)
  return ctx.stops.filter((s) => fits.get(s.name)?.allowed === false)
}

/**
 * Where a newly added tour belongs: the slot that adds the least driving.
 * Cart order is tap order, which has nothing to do with geography — appending
 * produced days that read Falmouth → Ocho Rios → Falmouth.
 */
export function bestInsertIndex(
  items: Pick<CartItem, 'id' | 'destination'>[],
  incoming: Pick<CartItem, 'id' | 'destination'>,
): number {
  if (items.length === 0) return 0

  const drive = (a: Pick<CartItem, 'id' | 'destination'>, b: Pick<CartItem, 'id' | 'destination'>) =>
    minutesBetween(tourPoint(a), tourPoint(b))
  let bestAt = items.length
  let bestCost = Infinity

  for (let slot = 0; slot <= items.length; slot++) {
    const before = items[slot - 1] ?? null
    const after = items[slot] ?? null
    const toNew = before ? drive(before, incoming) ?? 10_000 : 0
    const fromNew = after ? drive(incoming, after) ?? 10_000 : 0
    const skipped = before && after ? drive(before, after) ?? 0 : 0
    const cost = toNew + fromNew - skipped
    if (cost < bestCost) {
      bestCost = cost
      bestAt = slot
    }
  }
  return bestAt
}

/**
 * May this tour join the day?
 *
 * Rule 2, at the point of adding: the tour has to sit within an hour of the
 * one before or after it wherever it lands. An unmeasurable destination is
 * waved through — a hole in the coordinate table is not the guest's problem.
 * Then rule 4: the day with it in, driving included, has to fit in
 * DAILY_HOUR_LIMIT hours.
 */
export function fitTourToDay(incoming: TourLike, ctx: DayContext): TourFit {
  if (ctx.items.length === 0) {
    const alone = dayTime([incoming]).total
    return { allowed: true, why: null, minutes: null, nearest: null, dayMinutes: alone, reason: null }
  }

  // Judged against the tours it would actually END UP BETWEEN, at the slot the
  // planner would give it — not against the day as a whole. A tour an hour
  // and a half from one end of the day is fine if it slots in beside
  // something twenty minutes away: Montego Bay joins a Dunn's River day the
  // moment the Martha Brae is in it, because it lands next to the Martha Brae.
  const at = bestInsertIndex(ctx.items, incoming)
  const before = ctx.items[at - 1]
  const after = ctx.items[at]

  const neighbours: { minutes: number; place: string; title: string }[] = []
  const inbound = before ? minutesBetween(tourPoint(before), tourPoint(incoming)) : null
  if (inbound !== null && before) neighbours.push({ minutes: inbound, place: tourPlaceName(before), title: before.title })
  const outbound = after ? minutesBetween(tourPoint(incoming), tourPoint(after)) : null
  if (outbound !== null && after) neighbours.push({ minutes: outbound, place: tourPlaceName(after), title: after.title })

  const closest = neighbours.length ? neighbours.reduce((a, b) => (b.minutes < a.minutes ? b : a)) : null

  // Close to the one before it OR the one after it is enough — the van only
  // ever drives one leg at a time. Nothing measurable: a hole in the
  // coordinate table is not the guest's problem, so it goes through.
  if (closest && !withinGap(closest.minutes, MAX_TOUR_GAP_MIN)) {
    return {
      allowed: false,
      why: 'drive',
      minutes: closest.minutes,
      nearest: closest.place,
      dayMinutes: null,
      reason: `The nearest tour in your day is ${closest.title}, about ${driveTime(closest.minutes)} away by road, past the ${MAX_TOUR_GAP_MIN} minutes a day can absorb between one tour and the next. This belongs on a day of its own.`,
    }
  }

  const next: TourLike[] = [...ctx.items]
  next.splice(at, 0, incoming)
  const time = dayTime(next, ctx.stops)
  const near = { minutes: closest?.minutes ?? null, nearest: closest?.place ?? null }
  if (time.total > DAY_LIMIT_MIN) {
    return {
      allowed: false,
      why: 'hours',
      ...near,
      dayMinutes: time.total,
      reason: `With it, your day would come to ${lengthWithDrives(time)}, past the ${DAILY_HOUR_LIMIT} hours one day can hold. This belongs on a day of its own.`,
    }
  }
  return { allowed: true, why: null, ...near, dayMinutes: time.total, reason: null }
}

/** The order after moving one tour a single place, or null if it cannot move. */
export function movedOrder(items: CartItem[], itemId: number, direction: -1 | 1): CartItem[] | null {
  const from = items.findIndex((i) => i.id === itemId)
  if (from === -1) return null
  const to = from + direction
  if (to < 0 || to >= items.length) return null
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * May this tour move a place in that direction?
 *
 * The order is the guest's to set, but not every order is drivable. A move
 * can put two distant tours next to each other, it can leave a stop half an
 * hour from nothing, and it can add enough driving to take the day past its
 * hours. All three are refused, with the thing that would break named, so the
 * answer is never a bare no.
 */
export function canMoveItem(
  ctx: DayContext,
  itemId: number,
  direction: -1 | 1,
): { ok: boolean; reason: string | null } {
  const next = movedOrder(ctx.items, itemId, direction)
  if (!next) return { ok: false, reason: null }

  const before = planDay(ctx)
  const after = planDay({ ...ctx, items: next })

  const newLeg = after.legs.find((leg) => leg.over && !before.legs.some((b) => b.fromId === leg.fromId && b.toId === leg.toId && b.over))
  if (newLeg) {
    return {
      ok: false,
      reason: `That would put ${newLeg.from} next to ${newLeg.to}, about ${newLeg.minutes !== null ? driveTime(newLeg.minutes) : 'an hour or more'} of driving between two tours, past the ${MAX_TOUR_GAP_MIN} minutes the day allows.`,
    }
  }

  for (const stop of ctx.stops) {
    const was = before.fits.get(stop.name)?.allowed !== false
    const now = after.fits.get(stop.name)?.allowed !== false
    if (was && !now) {
      return {
        ok: false,
        reason: `That would strand ${stop.name}: it would end up more than ${MAX_STOP_GAP_MIN} minutes from anything beside it.`,
      }
    }
  }

  const wasLength = dayTime(ctx.items, ctx.stops)
  const nowLength = dayTime(next, ctx.stops)
  if (nowLength.total > DAY_LIMIT_MIN && nowLength.total > wasLength.total) {
    return {
      ok: false,
      reason: `That order adds ${formatDayTime(nowLength.driving - wasLength.driving)} of driving and takes your day to ${formatDayTime(nowLength.total)}, past the ${DAILY_HOUR_LIMIT} hours one day can hold.`,
    }
  }
  return { ok: true, reason: null }
}
