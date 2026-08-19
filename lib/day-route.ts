import type { CartItem, FoodStop } from './cart'
import { directDistanceKm } from './transportation'

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
 * Nothing here measures against the hotel. Pickup and drop-off are collected
 * at checkout, long after the day is built, so a rule that leant on them would
 * be judging the itinerary against a blank. The day is judged against itself.
 *
 * Order is the guest's: a new tour lands where it adds the least driving, and
 * checkout can rearrange, but only into orders that keep rules 2 and 3 true.
 */

/** The most driving a food stop may add on either side of itself. */
export const MAX_STOP_GAP_MIN = 30

/**
 * The most driving between one tour and the next.
 *
 * An hour is the line between "the next thing along the coast" and "somewhere
 * else on the island". It keeps the pairings a day is actually built from —
 * Montego Bay with Falmouth (~28 min), Ocho Rios with Nine Mile (~30), Ocho
 * Rios with Falmouth (~59) — and refuses the ones that are a second trip:
 * Montego Bay with Ocho Rios (~86), anything with Negril from the east
 * (~132). Two hours of driving inside an eight-hour day is a day spent in the
 * van.
 */
export const MAX_TOUR_GAP_MIN = 60

/**
 * Average speed on the routes these days actually run, km/h, applied to
 * straight-line distance rather than to the fuel estimate's road-corrected
 * figure. Back-solved from real drive times on the north coast — Ocho Rios to
 * Runaway Bay (~25 min), Ocho Rios to St Ann's Bay (~15), Montego Bay to
 * Greenwood (~20), Falmouth to Ocho Rios (~60) — where the A1 runs close
 * enough to straight that the great-circle distance is near the road
 * distance. Using the 1.45x-corrected figure here instead would inflate every
 * gap by half and refuse lunch twenty minutes up the coast.
 */
const AVG_KMH = 60

/**
 * Places reached by winding inland roads, where distance as the crow flies
 * says nothing about the drive. Nine Mile is fifteen straight-line km from
 * Ocho Rios and the better part of an hour on the road.
 */
const WINDING_PLACES = ['Nine Mile', 'Blue Mountains', 'Free Hill', 'Strawberry Hill']
const WINDING_FACTOR = 2

/**
 * Estimated driving minutes between two named places, or null when either is
 * missing or unknown. An estimate from coordinates, never a routed time —
 * which is why the UI rounds it to five minutes and says "about".
 */
export function driveMinutes(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const km = directDistanceKm(from, to)
  if (km === null) return null
  const winding = [from, to].some((place) =>
    WINDING_PLACES.some((w) => place.toLowerCase().includes(w.toLowerCase()))
  )
  return (km / AVG_KMH) * 60 * (winding ? WINDING_FACTOR : 1)
}

/** A stop as the catalog knows it, before it is placed in a day. */
export type StopCandidate = Pick<FoodStop, 'name' | 'town'>

/**
 * Where a stop sits: after the tour with this id, or — when null — before the
 * first tour of the day. Null is what lets breakfast open an itinerary while
 * still hanging the day off tours.
 */
export type StopSlot = number | null

export type StopVerdict = 'no-tours' | 'linked' | 'stranded' | 'unknown'

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
  /** Drive to the nearest tour already in the day, null when unmeasurable. */
  minutes: number | null
  nearest: string | null
  reason: string | null
}

export interface DayContext {
  items: CartItem[]
  stops: FoodStop[]
}

export type DayNode =
  | { kind: 'experience'; key: string; place: string; title: string; item: CartItem }
  | { kind: 'stop'; key: string; place: string; title: string; stop: FoodStop; fit: StopFit }

export interface DayPlan {
  /** Tours and their stops, in driving order. No hotel: see the file header. */
  nodes: DayNode[]
  /** Verdict per stop name, the same objects carried on the stop nodes. */
  fits: Map<string, StopFit>
  /**
   * The drive between each consecutive pair of TOURS, in order, for the leg
   * warnings the day flow prints between them.
   */
  legs: { fromId: number; toId: number; from: string; to: string; minutes: number | null; over: boolean }[]
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
 * Is this gap inside the budget?
 *
 * Judged on the SAME rounded figure the UI prints, not on the raw estimate.
 * The underlying number is a straight-line approximation good to a few
 * minutes either way, so refusing a stop the interface describes as "about
 * 30 min from Dunn's River" would be the app disagreeing with itself in
 * public. It also stops the boundary from being sharper than the measurement
 * behind it: Ocho Rios to the Ultimate Jerk Centre at Discovery Bay computes
 * to 32 minutes and is really about half an hour of coast road, exactly the
 * kind of stop drivers build an Ocho Rios day around.
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
      'Food stops ride along a tour day — they are free, and your driver works them into the route after a tour. Add a tour and the spots near it open up.',
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
  | { kind: 'tour'; place: string; title: string; id: number }
  | { kind: 'stop'; place: string; title: string; name: string }

/** Tours and their stops, flattened into the order they are driven. */
function routeOf(items: CartItem[], stops: FoodStop[]): RouteNode[] {
  const route: RouteNode[] = []
  for (const stop of leadingStops(stops)) {
    route.push({ kind: 'stop', place: stop.town, title: stop.name, name: stop.name })
  }
  for (const item of items) {
    route.push({ kind: 'tour', place: item.destination, title: item.title, id: item.id })
    for (const stop of stopsAfter(stops, item.id)) {
      route.push({ kind: 'stop', place: stop.town, title: stop.name, name: stop.name })
    }
  }
  return route
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
    a < 0 || b >= route.length ? null : driveMinutes(route[a].place, route[b].place)

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
          : `About ${roundFive(nearest.gap)} min from ${nearest.name}`,
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
      reason: `Nothing beside it in the day is within ${MAX_STOP_GAP_MIN} minutes — the nearest is ${nearest.name}, about ${roundFive(nearest.gap)} min away. A stop has to sit next to something in the day it can reach: the tour or stop before it, or the tour after it.`,
    })
  })

  return fits
}

/** The whole day as a route, with every stop judged where it sits. */
export function planDay(ctx: DayContext): DayPlan {
  const fits = new Map<string, StopFit>()

  if (ctx.items.length === 0) {
    for (const stop of ctx.stops) fits.set(stop.name, noToursFit())
    return { nodes: [], fits, legs: [] }
  }

  const grounded = groundRoute(routeOf(ctx.items, ctx.stops))
  const nodes: DayNode[] = []

  const push = (stop: FoodStop) => {
    const fit = grounded.get(stop.name) ?? noToursFit()
    fits.set(stop.name, fit)
    nodes.push({ kind: 'stop', key: `stop-${stop.name}`, place: stop.town, title: stop.name, stop, fit })
  }

  for (const stop of leadingStops(ctx.stops)) push(stop)

  for (const item of ctx.items) {
    nodes.push({
      kind: 'experience',
      key: `exp-${item.id}`,
      place: item.destination,
      title: item.title,
      item,
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
    nodes.push({ kind: 'stop', key: `stop-${stop.name}`, place: stop.town, title: stop.name, stop, fit })
  }

  const legs = ctx.items.slice(0, -1).map((item, i) => {
    const next = ctx.items[i + 1]
    const minutes = driveMinutes(item.destination, next.destination)
    return {
      fromId: item.id,
      toId: next.id,
      from: item.destination,
      to: next.destination,
      minutes,
      over: minutes !== null && !withinGap(minutes, MAX_TOUR_GAP_MIN),
    }
  })

  return { nodes, fits, legs }
}

/**
 * Judge a stop appended to one particular tour — behind whatever stops that
 * tour already carries, which is where it would actually land.
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
 * What would happen if this stop were added now — judged in the slot the day
 * would actually give it.
 */
export function fitCandidateStop(stop: StopCandidate, ctx: DayContext): StopFit {
  if (ctx.items.length === 0) return noToursFit()

  const already = ctx.stops.find((s) => s.name === stop.name)
  if (already) return planDay(ctx).fits.get(stop.name) ?? noToursFit()

  const best = bestSlotForStop(stop, ctx)
  if (best) return best.fit

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
  items: Pick<CartItem, 'destination'>[],
  incoming: Pick<CartItem, 'destination'>,
): number {
  if (items.length === 0) return 0

  let bestAt = items.length
  let bestCost = Infinity

  for (let slot = 0; slot <= items.length; slot++) {
    const before = items[slot - 1]?.destination ?? null
    const after = items[slot]?.destination ?? null
    const toNew = before ? driveMinutes(before, incoming.destination) ?? 10_000 : 0
    const fromNew = after ? driveMinutes(incoming.destination, after) ?? 10_000 : 0
    const skipped = before && after ? driveMinutes(before, after) ?? 0 : 0
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
 */
export function fitTourToDay(incoming: Pick<CartItem, 'destination'>, ctx: DayContext): TourFit {
  if (ctx.items.length === 0) return { allowed: true, minutes: null, nearest: null, reason: null }

  // Judged against the tours it would actually END UP BETWEEN, at the slot the
  // planner would give it — not against the day as a whole. A tour an hour
  // and a half from one end of the day is fine if it slots in beside
  // something twenty minutes away: Montego Bay joins an Ocho Rios day the
  // moment Falmouth is in it, because it lands next to Falmouth.
  const at = bestInsertIndex(ctx.items, incoming)
  const before = ctx.items[at - 1]
  const after = ctx.items[at]

  const neighbours: { minutes: number; name: string }[] = []
  const inbound = before ? driveMinutes(before.destination, incoming.destination) : null
  if (inbound !== null && before) neighbours.push({ minutes: inbound, name: before.destination })
  const outbound = after ? driveMinutes(incoming.destination, after.destination) : null
  if (outbound !== null && after) neighbours.push({ minutes: outbound, name: after.destination })

  // Nothing measurable: a hole in the coordinate table is not the guest's
  // problem, so it goes through.
  if (neighbours.length === 0) return { allowed: true, minutes: null, nearest: null, reason: null }

  const closest = neighbours.reduce((a, b) => (b.minutes < a.minutes ? b : a))

  // Close to the one before it OR the one after it is enough — the van only
  // ever drives one leg at a time.
  if (withinGap(closest.minutes, MAX_TOUR_GAP_MIN)) {
    return { allowed: true, minutes: closest.minutes, nearest: closest.name, reason: null }
  }

  return {
    allowed: false,
    minutes: closest.minutes,
    nearest: closest.name,
    reason: `The nearest tour in your day is ${closest.name}, about ${roundFive(closest.minutes)} min away — past the ${MAX_TOUR_GAP_MIN} minutes a day can absorb between one tour and the next. This belongs on a day of its own.`,
  }
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
 * can put two distant tours next to each other, and it can leave a stop half
 * an hour from nothing. Both are refused, with the thing that would break
 * named, so the answer is never a bare no.
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
      reason: `That would put ${newLeg.from} next to ${newLeg.to} — about ${newLeg.minutes ? roundFive(newLeg.minutes) : '?'} min of driving between two tours, past the ${MAX_TOUR_GAP_MIN} the day allows.`,
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
  return { ok: true, reason: null }
}
