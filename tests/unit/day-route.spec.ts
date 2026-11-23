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
  dayTime,
  dayWithStop,
  legMinutes,
  legNote,
  MAX_STOP_GAP_MIN,
  MAX_TOUR_GAP_MIN,
} from '../../lib/day-route'
import { DAY_LIMIT_MIN } from '../../lib/day-hours'
import { EATS } from '../../lib/eats'
import { experiences } from '../../lib/experiences'

/**
 * The shape of a day and the rules that keep it drivable.
 *
 * These matter more than they look: a stop is not sold, so nothing in the
 * money path guards them. If a stop can be booked with no tour, dispatch gets
 * a day with no tour in it; if two land side by side, the guest has booked
 * lunch followed by lunch; if one sits an hour off the route, the guest pays
 * for that hour in fuel and daylight and never sees it as a line item.
 *
 * Every drive is the routed table (lib/drive-times.json, OpenStreetMap roads).
 * The helper's ids are the catalogue's: tour('Ocho Rios', 1) is timed from
 * Dunn's River Falls, tour('Falmouth', 3) from the Martha Brae rafting
 * village, any other pairing from its town.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tour = (destination: string, id = 1, hours = 3): any => ({
  id,
  title: `${destination} tour`,
  destination,
  parish: 'St. Ann',
  duration: `${hours} hrs`,
  date: '2026-09-01',
  travelers: 1,
  category: 'Adventure',
  pricing: { mode: 'group', baseRate: 100, tierMax: 4, extraPerPerson: 0 },
})

/** A real catalogue tour, as a cart line. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const real = (id: number): any => ({ ...experiences.find((e) => e.id === id)!, travelers: 2, date: '2026-09-01' })

const eat = (name: string, afterId: number | null = 1) => {
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

describe('the drive times', () => {
  test('are routed, and sit inside the drives people actually make', () => {
    // Google's typical midday times from MBJ (Oct 2026): Negril 90 to 130,
    // Ocho Rios 90 to 150. The site's own transfer zones say Falmouth 35 to 45.
    const mbj = 'Sangster International Airport (MBJ)'
    expect(driveMinutes(mbj, 'Negril')).toBeGreaterThanOrEqual(90)
    expect(driveMinutes(mbj, 'Negril')).toBeLessThanOrEqual(130)
    expect(driveMinutes(mbj, 'Ocho Rios')).toBeGreaterThanOrEqual(90)
    expect(driveMinutes(mbj, 'Ocho Rios')).toBeLessThanOrEqual(150)
    expect(driveMinutes(mbj, 'Falmouth')).toBeGreaterThanOrEqual(30)
    expect(driveMinutes(mbj, 'Falmouth')).toBeLessThanOrEqual(50)
    // The next town along the coast is a short hop; across the island is not.
    expect(driveMinutes('Ocho Rios', "St. Ann's Bay")).toBeLessThan(MAX_STOP_GAP_MIN)
    expect(driveMinutes('Montego Bay', 'Negril')).toBeGreaterThan(MAX_TOUR_GAP_MIN)
  })

  test('are the same either way, and nothing between a place and itself', () => {
    expect(driveMinutes('Negril', 'Ocho Rios')).toBe(driveMinutes('Ocho Rios', 'Negril'))
    expect(driveMinutes('Ocho Rios', 'Ocho Rios')).toBe(0)
  })

  test('inland roads cost more than the crow flies', () => {
    const straightish = driveMinutes('Ocho Rios', "St. Ann's Bay") ?? 0
    const winding = driveMinutes('Ocho Rios', 'Nine Mile') ?? 0
    expect(winding).toBeGreaterThan(straightish * 2)
  })

  test('says nothing rather than guessing about a place it cannot find', () => {
    expect(driveMinutes('Ocho Rios', 'Nowhere In Particular')).toBeNull()
    expect(driveMinutes(undefined, 'Ocho Rios')).toBeNull()
    expect(driveMinutes('', 'Ocho Rios')).toBeNull()
  })

  test('two tours at one site are timed from the site, not the town', () => {
    // Dunn's River and the Blue Hole are both "Ocho Rios", half an hour apart.
    const { legs } = planDay(ctx([real(1), real(2)]))
    expect(legs[0].minutes).toBeGreaterThanOrEqual(20)
    expect(legs[0].minutes).toBeLessThanOrEqual(40)
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
    expect(fit.why).toBe('drive')
    expect(fit.minutes ?? 0).toBeGreaterThan(MAX_TOUR_GAP_MIN)
    expect(fit.reason).toContain('day of its own')
  })

  test('Montego Bay and Negril are a different day by road', () => {
    // About 50 min as the crow flies, about 90 by road: the straight-line
    // estimate used to let a jet ski and Rick's Cafe share a day.
    const fit = fitTourToDay(real(14), ctx([real(10)]))
    expect(fit.allowed).toBe(false)
    expect(fit.why).toBe('drive')
    expect(fit.nearest).toBe('Montego Bay')
    expect(fit.reason).toBe('The nearest tour in your day is Jet Ski the Caribbean, about 1 hr 30 min away by road, past the 60 minutes a day can absorb between one tour and the next. This belongs on a day of its own.')
  })

  test('an empty day takes anything', () => {
    expect(fitTourToDay(tour('Negril'), ctx([])).allowed).toBe(true)
  })

  test('a stepping stone makes a far tour bookable', () => {
    // Montego Bay is ~90 min from Negril and cannot share a day with it
    // alone. Put Hanover between them and it can: what matters is the tour
    // it ends up beside, not the far end of the day.
    expect(fitTourToDay(tour('Montego Bay', 3, 2), ctx([tour('Negril', 1, 2)])).allowed).toBe(false)
    const withStop = ctx([tour('Negril', 1, 2), tour('Hanover', 2, 2)])
    expect(fitTourToDay(tour('Montego Bay', 3, 2), withStop).allowed).toBe(true)
    expect(fitTourToDay(tour('Montego Bay', 3, 2), withStop).nearest).toBe('Hanover')
  })

  test('the chain it joins keeps its own legs legal', () => {
    // Having joined beside Hanover, the day reads Montego Bay → Hanover →
    // Negril: two legs, each inside the budget, though its ends are not.
    const items = [tour('Montego Bay', 3, 2), tour('Hanover', 2, 2), tour('Negril', 1, 2)]
    expect(planDay(ctx(items)).legs.every((l) => !l.over)).toBe(true)
  })

  test('the day flow prints the drive between each pair, naming the tour before', () => {
    const { legs } = planDay(ctx([tour('Montego Bay', 1), tour('Falmouth', 2)]))
    expect(legs).toHaveLength(1)
    expect(legs[0].over).toBe(false)
    expect(legs[0].minutes ?? 0).toBeGreaterThan(0)
    expect(legs[0].from).toBe('Montego Bay tour')
  })
})

describe('the day fits in eight hours, driving included', () => {
  test('a day is its tours, its food stops and the drives between them', () => {
    // Dunn's River (2 hrs), the Blue Hole (2 hrs), a lunch at Miss T's after
    // the falls: 4 hrs at the tours, 1 hr 30 min at lunch, and the drives
    // Dunn's River → Miss T's → the Blue Hole as the list prints them.
    const t = dayTime([real(1), real(2)], [eat("Miss T's Kitchen", 1)])
    expect(t.tours).toBe(240)
    expect(t.stops).toBe(90)
    expect(t.driving).toBeGreaterThan(0)
    expect(t.driving % 5).toBe(0)
    expect(t.total).toBe(t.tours + t.stops + t.driving)
  })

  test('two tours at one place add no driving; a short hop counts as five minutes', () => {
    // Jet ski, parasailing and the clear kayak are all at the Montego Bay beach.
    expect(dayTime([real(10), real(11), real(12)]).driving).toBe(0)
    expect(legMinutes(0)).toBe(0)
    expect(legMinutes(null)).toBe(0)
    expect(legMinutes(2)).toBe(5)
    expect(legMinutes(28)).toBe(30)
  })

  test('a full day has its driving inside its own eight hours', () => {
    // Nine Mile is "Full day": its first lunch adds nothing, nor does the drive to it.
    expect(dayTime([real(15)], [eat("Miss T's Kitchen", 15)])).toEqual({ tours: 480, stops: 0, driving: 0, total: 480 })
  })

  test('a tour that fits by distance is refused when the day would run past eight hours', () => {
    // Dunn's River, both horseback rides and the tubing: 7.5 hrs at the tours.
    const day = ctx([real(1), real(8), real(9), real(13)])
    const fit = fitTourToDay(real(2), day)
    expect(fit.allowed).toBe(false)
    expect(fit.why).toBe('hours')
    expect(fit.dayMinutes).toBeGreaterThan(DAY_LIMIT_MIN)
    expect(fit.reason).toMatch(/^With it, your day would come to \d+ hrs( \d+ min)? with the drives in between, past the 8 hours one day can hold\. This belongs on a day of its own\.$/)
  })

  test('nothing joins a full day, and the refusal does not invent driving', () => {
    const fit = fitTourToDay(real(1), ctx([real(15)]))
    expect(fit.allowed).toBe(false)
    expect(fit.why).toBe('hours')
    expect(fit.reason).toBe('With it, your day would come to 10 hrs, past the 8 hours one day can hold. This belongs on a day of its own.')
  })

  test('a tour that keeps the day within eight hours is allowed, and its length is known', () => {
    const fit = fitTourToDay(real(9), ctx([real(1), real(8), real(13)]))
    expect(fit.allowed).toBe(true)
    expect(fit.why).toBeNull()
    expect(fit.dayMinutes).toBeLessThanOrEqual(DAY_LIMIT_MIN)
  })

  test('exactly eight hours is a full day, not an over one', () => {
    // Dunn's River → the horseback stable → the tubing → the Blue Hole: 7.5
    // hrs of tours and 30 min of driving.
    const t = dayTime([real(1), real(8), real(13), real(2)])
    expect(t.total).toBe(DAY_LIMIT_MIN)
  })

  test('a food stop the day has no room for is refused, and says why', () => {
    const fit = fitCandidateStop(eat("Miss T's Kitchen"), ctx([real(1), real(8), real(13), real(2)]))
    expect(fit.verdict).toBe('full')
    expect(fit.allowed).toBe(false)
    expect(fit.label).toBe('Your day is full')
    expect(fit.reason).toMatch(/^Adding it would make your day \d+ hrs( \d+ min)? with the drives in between, past the 8 hours one day can hold\.$/)
  })

  test('a stop with room is judged on distance alone', () => {
    const fit = fitCandidateStop(eat('Sharkies Seafood Restaurant'), ctx([real(1)]))
    expect(fit.allowed).toBe(true)
    expect(dayWithStop(eat('Sharkies Seafood Restaurant'), 1, ctx([real(1)])).fits).toBe(true)
  })

  test('a new order that drives the day past eight hours is refused, with what it adds', () => {
    // From an exact 8-hour day, the Blue Hole moved between the stable and
    // the tubing adds 20 minutes of road.
    const move = canMoveItem(ctx([real(1), real(8), real(13), real(2)]), 2, -1)
    expect(move.ok).toBe(false)
    expect(move.reason).toBe('That order adds 20 min of driving and takes your day to 8 hrs 20 min, past the 8 hours one day can hold.')
  })

  test('the legs the day list prints add up to the day\'s driving', () => {
    // Dunn's River, lunch at Miss T's, then the Blue Hole: each line says the
    // drive in from the line above it, lunch included.
    const items = [real(1), real(2)]
    const stops = [eat("Miss T's Kitchen", 1)]
    const { nodes } = planDay(ctx(items, stops))
    expect(nodes.map((n) => legNote(n.legIn))).toEqual([
      undefined,
      "About 10 min drive from Dunn's River Falls Climb",
      "About 20 min drive from Miss T's Kitchen",
    ])
    // And for every day of two tours with a stop in any slot.
    const singles = experiences.filter((e) => e.kind === 'single' && e.duration !== 'Full day').map((e) => real(e.id))
    for (const a of singles) {
      for (const b of singles) {
        if (a.id === b.id) continue
        for (const e of EATS.slice(0, 6)) {
          for (const slot of [null, a.id, b.id]) {
            const day = ctx([a, b], [{ ...e, afterId: slot }])
            const printed = planDay(day).nodes.reduce((sum, n) => sum + legMinutes(n.legIn?.minutes ?? null), 0)
            expect(printed).toBe(dayTime(day.items, day.stops).driving)
          }
        }
      }
    }
  })

  test('two tours at one place read as right by each other', () => {
    const { nodes } = planDay(ctx([real(10), real(11)]))
    expect(legNote(nodes[1].legIn)).toBe('Right by Jet Ski the Caribbean')
  })

  test('the server, which never sees the stops, never counts more than the day list does', () => {
    // The checkout route totals tours and the drives between them alone; a
    // stop only adds time, so the server can never refuse a day the page
    // allowed. Every single tour, every pair and every stop, both orders.
    const singles = experiences.filter((e) => e.kind === 'single').map((e) => real(e.id))
    for (const a of singles) {
      for (const b of singles) {
        if (a.id === b.id) continue
        const tours = dayTime([a, b]).total
        for (const e of EATS) {
          for (const slot of [null, a.id, b.id]) {
            expect(dayTime([a, b], [{ ...e, afterId: slot }]).total).toBeGreaterThanOrEqual(tours)
          }
        }
      }
    }
  })
})

describe('a stop is half an hour from what it sits between', () => {
  test('same town is fine', () => {
    const fit = fitCandidateStop(eat('3 Dives Jerk Centre'), ctx([tour('Negril')]))
    expect(fit.allowed).toBe(true)
  })

  test('the Discovery Bay jerk stop is too far from Dunn\'s River by road, and says how far', () => {
    // About 37 minutes along the coast from the falls: past the half hour,
    // judged on the rounded figure the card prints.
    const fit = fitCandidateStop(eat('Ultimate Jerk Centre'), ctx([tour('Ocho Rios')]))
    expect(fit.allowed).toBe(false)
    expect(fit.verdict).toBe('stranded')
    expect(fit.reason).toContain('about 35 min away')
  })

  test('a stop up the coast from the falls stays in the day', () => {
    const fit = fitCandidateStop(eat('Sharkies Seafood Restaurant'), ctx([tour('Ocho Rios')]))
    expect(fit.allowed).toBe(true)
    expect(fit.label).toBe('About 25 min from Ocho Rios tour')
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
    // The Pork Pit hung off the Hanover tour is 40 minutes behind it, and
    // a few minutes ahead of the Montego Bay tour that follows: the near side
    // carries it.
    const items = [tour('Hanover', 1, 2), tour('Montego Bay', 2, 2)]
    const fit = fitStopAfter(eat('The Pork Pit'), 1, ctx(items))
    expect(fit.allowed).toBe(true)
    expect(fit.neighbour).toBe('Montego Bay tour')
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

  test('still takes its time out of the day, but no driving', () => {
    const stops = [eat('3 Dives Jerk Centre', 99)]
    expect(dayTime([tour('Ocho Rios', 1)], stops)).toEqual({ tours: 180, stops: 90, driving: 0, total: 270 })
  })
})

describe('reordering the day by hand', () => {
  const coastDay = () => {
    const items = [tour('Falmouth', 1, 2), tour('Montego Bay', 2, 2)]
    const stops = [eat("Pepper's Jerk Center", 1)] // Falmouth lunch, on the Falmouth tour
    return ctx(items, stops)
  }

  test('a stop travels with the tour it follows', () => {
    const day = coastDay()
    const moved = movedOrder(day.items, 1, 1)!
    const { nodes } = planDay({ ...day, items: moved })
    expect(shapeOf(nodes)).toEqual(['Montego Bay', 'Falmouth', 'Falmouth'])
  })

  test('a legal move is allowed', () => {
    expect(canMoveItem(coastDay(), 1, 1).ok).toBe(true)
  })

  test('a move that would strand a stop is refused, and names it', () => {
    // A Hip Strip lunch hung off the Hanover tour, legal only because the
    // Montego Bay tour follows it. Send Montego Bay to the front and the stop
    // is left behind Hanover, 40 minutes from anything.
    const items = [tour('Hanover', 1, 2), tour('Montego Bay', 2, 2)]
    const stops = [eat('The Pork Pit', 1)]
    const day = ctx(items, stops)
    expect(planDay(day).fits.get('The Pork Pit')?.allowed).toBe(true)

    const move = canMoveItem(day, 2, -1)
    expect(move.ok).toBe(false)
    expect(move.reason).toBe('That would strand The Pork Pit: it would end up more than 30 minutes from anything beside it.')
  })

  test('a move that would put two distant tours together is refused', () => {
    const items = [tour('Negril', 1, 2), tour('Hanover', 2, 2), tour('Montego Bay', 3, 2)]
    const move = canMoveItem(ctx(items), 1, 1)
    expect(move.ok).toBe(false)
    expect(move.reason).toContain(`${MAX_TOUR_GAP_MIN}`)
  })

  test('there is nothing off either end of the list', () => {
    const day = coastDay()
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
