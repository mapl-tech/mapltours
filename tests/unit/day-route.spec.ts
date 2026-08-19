import { describe, test, expect } from 'vitest'
import {
  planDay,
  fitCandidateStop,
  fitStopAfter,
  bestSlotForStop,
  fitTourToDay,
  canAddStop,
  canMoveItem,
  movedOrder,
  bestInsertIndex,
  strandedStops,
  driveMinutes,
  MAX_STOP_GAP_MIN,
  MAX_TOUR_GAP_MIN,
} from '../../lib/day-route'
import { EATS } from '../../lib/eats'

/**
 * The shape of a day and the rules that keep it drivable.
 *
 * These matter more than they look: a stop is not sold, so nothing in the
 * money path guards them. If a stop can be booked with no tour, dispatch gets
 * a day with no tour in it; if two land side by side, the guest has booked
 * lunch followed by lunch; if one sits an hour off the route, the guest pays
 * for that hour in fuel and daylight and never sees it as a line item.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tour = (destination: string, id = 1): any => ({
  id,
  title: `${destination} tour`,
  destination,
  parish: 'St. Ann',
  duration: '3 hrs',
  date: '2026-09-01',
  travelers: 1,
  category: 'Adventure',
  pricing: { mode: 'group', baseRate: 100, tierMax: 4, extraPerPerson: 0 },
})

const eat = (name: string, afterId = 1) => {
  const found = EATS.find((e) => e.name === name)
  if (!found) throw new Error(`no such eat: ${name}`)
  return { ...found, afterId }
}

const ctx = (items: unknown[], stops: unknown[] = []) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ items, stops }) as any

/** The day as a readable shape: 'pickup', tour destinations, stop towns. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shapeOf = (nodes: any[]) =>
  nodes.map((n) =>
    n.kind === 'experience' ? n.item.destination : n.kind === 'stop' ? n.stop.town : n.kind
  )

describe('the drive-time estimate', () => {
  test('tracks the real north-coast runs closely enough to judge them', () => {
    // Real drive times: ~15 min, ~25 min, ~20 min, ~60 min.
    expect(driveMinutes('Ocho Rios', "St. Ann's Bay")).toBeLessThan(20)
    expect(driveMinutes('Ocho Rios', 'Runaway Bay')).toBeLessThan(MAX_STOP_GAP_MIN)
    expect(driveMinutes('Montego Bay', 'Greenwood')).toBeLessThan(MAX_STOP_GAP_MIN)
    expect(driveMinutes('Falmouth', 'Ocho Rios')).toBeGreaterThan(MAX_STOP_GAP_MIN)
  })

  test('inland roads cost more than the crow flies', () => {
    const straightish = driveMinutes('Ocho Rios', "St. Ann's Bay") ?? 0
    const winding = driveMinutes('Ocho Rios', 'Nine Mile') ?? 0
    expect(winding).toBeGreaterThan(straightish)
  })

  test('says nothing rather than guessing about a place it cannot find', () => {
    expect(driveMinutes('Ocho Rios', 'Nowhere In Particular')).toBeNull()
    expect(driveMinutes(undefined, 'Ocho Rios')).toBeNull()
  })
})

describe('a day needs at least one tour', () => {
  test('an empty day refuses every stop', () => {
    for (const e of EATS) expect(canAddStop(e, ctx([], []))).toBe(false)
  })

  test('the refusal explains itself rather than just saying no', () => {
    const fit = fitCandidateStop(eat('Scotchies'), ctx([], []))
    expect(fit.verdict).toBe('no-tours')
    expect(fit.label).toBe('Add a tour first')
  })

  test('a stop may open the day, ahead of the first tour', () => {
    // Breakfast before the rafting: allowed, as long as tours exist at all.
    const items = [tour('Falmouth', 1)]
    const stops = [{ ...eat("Pepper's Jerk Center"), afterId: null }]
    const { nodes, fits } = planDay(ctx(items, stops))
    expect(nodes[0].kind).toBe('stop')
    expect(nodes[1].kind).toBe('experience')
    expect(fits.get("Pepper's Jerk Center")?.allowed).toBe(true)
  })

  test('the front slot is offered when it is the shortest hop', () => {
    const slot = bestSlotForStop(eat("Pepper's Jerk Center"), ctx([tour('Falmouth', 1)]))
    expect(slot?.fit.allowed).toBe(true)
  })
})

describe('stops may sit together', () => {
  test('one tour can carry several stops, back to back', () => {
    // Lunch and a coffee in the same town: two stops in a row is a real day,
    // not a mistake, as long as each is close to what it sits beside.
    const items = [tour('Ocho Rios', 1)]
    const stops = [eat("Miss T's Kitchen", 1), eat("PG's Toscanini", 1)]
    const { nodes, fits } = planDay(ctx(items, stops))
    expect(shapeOf(nodes)).toEqual(['Ocho Rios', 'Ocho Rios', 'Ocho Rios'])
    expect(fits.get("Miss T's Kitchen")?.allowed).toBe(true)
    expect(fits.get("PG's Toscanini")?.allowed).toBe(true)
  })

  test('a second stop is still offered once a tour has one', () => {
    const items = [tour('Ocho Rios', 1)]
    const stops = [eat("Miss T's Kitchen", 1)]
    expect(canAddStop(eat("PG's Toscanini"), ctx(items, stops))).toBe(true)
  })

  test('a chain still has to reach a tour', () => {
    // Two Negril spots on an Ocho Rios day: near each other, and that counts
    // for nothing, because the chain never reaches the tour.
    const items = [tour('Ocho Rios', 1)]
    const stops = [eat('3 Dives Jerk Centre', 1), eat('Sweet Spice Restaurant', 1)]
    const { fits } = planDay(ctx(items, stops))
    expect(fits.get('3 Dives Jerk Centre')?.allowed).toBe(false)
    expect(fits.get('Sweet Spice Restaurant')?.allowed).toBe(false)
  })
})

describe('the tours have to be near each other', () => {
  test('the next town along the coast is fine', () => {
    expect(fitTourToDay(tour('Falmouth'), ctx([tour('Montego Bay', 1)])).allowed).toBe(true)
    expect(fitTourToDay(tour('Nine Mile'), ctx([tour('Ocho Rios', 1)])).allowed).toBe(true)
  })

  test('the other end of the island is a different day, and says so', () => {
    const fit = fitTourToDay(tour('Negril'), ctx([tour('Ocho Rios', 1)]))
    expect(fit.allowed).toBe(false)
    expect(fit.minutes ?? 0).toBeGreaterThan(MAX_TOUR_GAP_MIN)
    expect(fit.reason).toContain('day of its own')
  })

  test('an empty day takes anything', () => {
    expect(fitTourToDay(tour('Negril'), ctx([])).allowed).toBe(true)
  })

  test('a stepping stone makes a far tour bookable', () => {
    // Montego Bay is ~85 min from Ocho Rios and cannot share a day with it
    // alone. Put Falmouth between them and it can: what matters is the tour
    // it ends up beside, not the far end of the day.
    expect(fitTourToDay(tour('Montego Bay'), ctx([tour('Ocho Rios', 1)])).allowed).toBe(false)
    const withStop = ctx([tour('Ocho Rios', 1), tour('Falmouth', 2)])
    expect(fitTourToDay(tour('Montego Bay'), withStop).allowed).toBe(true)
    expect(fitTourToDay(tour('Montego Bay'), withStop).nearest).toBe('Falmouth')
  })

  test('the chain it joins keeps its own legs legal', () => {
    // Having joined beside Falmouth, the day reads Montego Bay → Falmouth →
    // Ocho Rios: two legs, each inside the budget, though its ends are not.
    const items = [tour('Montego Bay', 3), tour('Falmouth', 2), tour('Ocho Rios', 1)]
    expect(planDay(ctx(items)).legs.every((l) => !l.over)).toBe(true)
  })

  test('the day flow prints the drive between each pair', () => {
    const { legs } = planDay(ctx([tour('Montego Bay', 1), tour('Falmouth', 2)]))
    expect(legs).toHaveLength(1)
    expect(legs[0].over).toBe(false)
    expect(legs[0].minutes ?? 0).toBeGreaterThan(0)
  })
})

describe('a stop is half an hour from what it sits between', () => {
  test('same town is fine', () => {
    const fit = fitCandidateStop(eat('3 Dives Jerk Centre'), ctx([tour('Negril')]))
    expect(fit.allowed).toBe(true)
  })

  test('the Discovery Bay jerk stop stays in an Ocho Rios day', () => {
    // ~32 minutes by the estimate, about half an hour of coast road in life.
    // The budget is judged on the rounded figure the interface shows, which is
    // what keeps a stop the app calls "about 30 min" from being refused.
    const fit = fitCandidateStop(eat('Ultimate Jerk Centre'), ctx([tour('Ocho Rios')]))
    expect(fit.allowed).toBe(true)
    expect(fit.label).toContain('30 min')
  })

  test('the tolerance does not stretch past the next rounding step', () => {
    const fit = fitCandidateStop(eat('Sharkies Seafood Restaurant'), ctx([tour('Falmouth')]))
    expect(fit.allowed).toBe(false)
  })

  test('the other end of the island is refused, and the refusal names the gap', () => {
    const fit = fitCandidateStop(eat('3 Dives Jerk Centre'), ctx([tour('Ocho Rios')]))
    expect(fit.verdict).toBe('stranded')
    expect(fit.minutes ?? 0).toBeGreaterThan(MAX_STOP_GAP_MIN)
    expect(fit.reason).toContain(`${MAX_STOP_GAP_MIN} minutes`)
  })

  test('the tour AFTER a stop can be what makes it legal', () => {
    // Falmouth sits between Montego Bay and Ocho Rios: hung off the Montego
    // Bay tour it is 28 min behind and 59 ahead, and the near side carries it.
    const items = [tour('Montego Bay', 1), tour('Falmouth', 2)]
    const fit = fitStopAfter(eat("Miss T's Kitchen"), 2, ctx(items))
    expect(fit.neighbour).toBeTruthy()
  })

  test('the hotel is not an anchor, because it is not chosen yet', () => {
    // Pickup and drop-off are collected at checkout, long after the day is
    // built. A Negril dinner on an Ocho Rios day is refused on the tours
    // alone, whatever hotel might later turn up.
    const fit = fitStopAfter(eat('Sweet Spice Restaurant'), 1, ctx([tour('Ocho Rios', 1)]))
    expect(fit.allowed).toBe(false)
  })

  test('a town we cannot place is allowed, not refused', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const madeUp = { ...eat('Scotchies'), name: 'Somewhere', town: 'Nowhere In Particular' } as any
    const fit = fitCandidateStop(madeUp, ctx([tour('Ocho Rios')]))
    expect(fit.verdict).toBe('unknown')
    expect(fit.allowed).toBe(true)
  })
})

describe('a stop whose tour has gone', () => {
  test('is shown at the end and flagged, not silently dropped', () => {
    const stops = [eat('3 Dives Jerk Centre', 99)] // host id not in the cart
    const { nodes, fits } = planDay(ctx([tour('Ocho Rios', 1)], stops))
    expect(fits.get('3 Dives Jerk Centre')?.allowed).toBe(false)
    expect(nodes[nodes.length - 1].kind).toBe('stop')
    expect(strandedStops(ctx([tour('Ocho Rios', 1)], stops))).toHaveLength(1)
  })
})

describe('reordering the day by hand', () => {
  const negrilDay = () => {
    const items = [tour('Falmouth', 1), tour('Montego Bay', 2)]
    const stops = [eat("Pepper's Jerk Center", 1)] // Falmouth lunch, on the Falmouth tour
    return ctx(items, stops)
  }

  test('a stop travels with the tour it follows', () => {
    const day = negrilDay()
    const moved = movedOrder(day.items, 1, 1)!
    const { nodes } = planDay({ ...day, items: moved })
    expect(shapeOf(nodes)).toEqual(['Montego Bay', 'Falmouth', 'Falmouth'])
  })

  test('a legal move is allowed', () => {
    expect(canMoveItem(negrilDay(), 1, 1).ok).toBe(true)
  })

  test('a move that would strand a stop is refused, and names it', () => {
    // An Ocho Rios lunch hung off the Montego Bay tour, legal only because the
    // Ocho Rios tour follows it. Send Ocho Rios to the front and the stop is
    // left beside Montego Bay, an hour and a half away.
    const items = [tour('Montego Bay', 1), tour('Falmouth', 2), tour('Ocho Rios', 3)]
    const stops = [eat("Miss T's Kitchen", 2)]
    const day = ctx(items, stops)
    expect(planDay(day).fits.get("Miss T's Kitchen")?.allowed).toBe(true)

    const move = canMoveItem(day, 3, -1)
    expect(move.ok).toBe(false)
    expect(move.reason).toBeTruthy()
  })

  test('a move that would put two distant tours together is refused', () => {
    const items = [tour('Montego Bay', 1), tour('Falmouth', 2), tour('Ocho Rios', 3)]
    const move = canMoveItem(ctx(items), 1, 1)
    expect(move.ok).toBe(false)
    expect(move.reason).toContain(`${MAX_TOUR_GAP_MIN}`)
  })

  test('there is nothing off either end of the list', () => {
    const day = negrilDay()
    expect(canMoveItem(day, 1, -1).ok).toBe(false)
    expect(movedOrder(day.items, 1, -1)).toBeNull()
  })
})

describe('where a new tour lands', () => {
  test('between the two it is on the way between, not at the end', () => {
    const items = [tour('Montego Bay', 1), tour('Ocho Rios', 2)]
    const at = bestInsertIndex(items, tour('Falmouth', 3))
    expect(at).toBe(1)
  })

  test('an empty day takes it first', () => {
    expect(bestInsertIndex([], tour('Negril'))).toBe(0)
  })
})
