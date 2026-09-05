import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest'
import { addTourToCart, buildWebMcpTools, registerWebMcpTools, type WebMcpActions } from '../../lib/webmcp-tools'
import { buildQuote, DESTINATIONS } from '../../lib/airport-transfers'
import { experiences, getSlug, tourPrice, perTravelerPrice } from '../../lib/experiences'
import { MIN_PICKUP_LEAD_MIN } from '../../lib/booking-window'
import { useCartStore } from '../../lib/cart'

// A fixed "now": 10:00 Jamaica on Sep 5, so the 24-hour cutoff is 10:00 on Sep 6.
const NOW = new Date('2026-09-05T15:00:00Z')
function fakeActions(overrides: Partial<WebMcpActions> = {}): WebMcpActions & { calls: string[] } {
  const calls: string[] = []
  return {
    calls, origin: 'https://mapltours.com', now: () => NOW,
    addTransferQuote: (q, o) => { calls.push(`addTransferQuote:${q.destinationId}:${q.tripType}:${q.passengers}:${o.fromAirport}`); return 'item-1' },
    updateTransferItem: (id, patch) => { calls.push(`updateTransferItem:${id}:${JSON.stringify(patch)}`) },
    addTour: (exp, guests, date, hotel) => { calls.push(`addTour:${exp.id}:${guests}:${date ?? ''}:${hotel ?? ''}`); return { added: true, replaced: [], sharedWith: [] } },
    navigate: (p) => { calls.push(`navigate:${p}`) },
    onBookingStarted: (tool) => { calls.push(`onBookingStarted:${tool}`) },
    ...overrides,
  }
}
const tool = (name: string, a = fakeActions()) => ({ t: buildWebMcpTools(a).find((x) => x.name === name)!, a })
type R = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ORIGINAL_TZ = process.env.TZ
afterAll(() => { process.env.TZ = ORIGINAL_TZ })

describe('WebMCP tool set', () => {
  test('seven tools, descriptions under 500 chars, read tools read-only, start tools consequential', () => {
    const tools = buildWebMcpTools(fakeActions())
    expect(tools.map((t) => t.name)).toEqual(['find_transfer_destination', 'get_transfer_quote', 'check_transfer_timing', 'start_transfer_booking', 'list_tours', 'get_tour', 'start_tour_booking'])
    for (const t of tools) {
      expect(t.description.length, t.name).toBeLessThanOrEqual(500)
      expect(t.inputSchema).toMatchObject({ type: 'object' })
      if (t.name.startsWith('start_')) expect(t.annotations.consequentialHint).toBe(true)
      else expect(t.annotations.readOnlyHint).toBe(true)
    }
  })

  test('find_transfer_destination returns ids the quote tool accepts, and area fallbacks when nothing matches', async () => {
    const { t } = tool('find_transfer_destination')
    const r = (await t.execute({ query: 'sandals negril' })) as R
    expect(r.matches[0].name).toMatch(/Sandals Negril/)
    expect(DESTINATIONS.some((d) => d.id === r.matches[0].id)).toBe(true)
    const none = (await t.execute({ query: 'Silver Sands villa' })) as R
    expect(none.matches).toEqual([])
    expect(none.fallbacks.map((f: R) => f.id)).toContain('negril-other')
    const kingston = (await t.execute({ query: 'Kingston Pegasus' })) as R
    expect(kingston.hint).toMatch(/email/)
    expect(kingston.fallbacks).toBeUndefined()
  })

  test('get_transfer_quote matches the live rate table, never touches the cart, and explains the departure pickup', async () => {
    const { t, a } = tool('get_transfer_quote')
    const r = (await t.execute({ destination: 'Sandals Negril Beach Resort', trip_type: 'round_trip', passengers: 2 })) as R
    const q = buildQuote('sandals-negril', 'round_trip', 2)!
    expect(r.priceUsd).toBe(q.priceUsd)
    expect(r.direction).toBe('airport_to_hotel_and_back')
    expect(r.bookUrl).toBe('https://mapltours.com/transfers?to=sandals-negril')
    expect(r.departurePickupGuide).toMatch(/3 hours 30 minutes before/)
    expect(a.calls).toEqual([])
    // a one-way defaults to airport_to_hotel and takes the other direction explicitly
    expect(((await t.execute({ destination: 'sandals-negril', trip_type: 'one_way' })) as R).direction).toBe('airport_to_hotel')
    expect(((await t.execute({ destination: 'sandals-negril', trip_type: 'one_way', direction: 'hotel_to_airport' })) as R).direction).toBe('hotel_to_airport')
  })

  test('get_transfer_quote reports ambiguity instead of guessing, and clips what it echoes', async () => {
    const { t } = tool('get_transfer_quote')
    const r = (await t.execute({ destination: 'Riu' })) as R
    expect(r.error).toMatch(/matches/)
    expect(r.matches.length).toBeGreaterThan(1)
    const long = (await t.execute({ destination: 'x'.repeat(400) })) as R
    expect(long.error.length).toBeLessThan(220)
  })

  test('get_transfer_quote rejects bad inputs with an error object, not a throw', async () => {
    const { t } = tool('get_transfer_quote')
    expect(await t.execute({ destination: 'Sandals Negril Beach Resort', passengers: 9 })).toMatchObject({ error: expect.stringMatching(/between 1 and 7/) })
    expect(await t.execute({ destination: 'Sandals Negril Beach Resort', trip_type: 'sideways' })).toMatchObject({ error: expect.stringMatching(/trip_type/) })
    expect(await t.execute({ destination: 'Sandals Negril Beach Resort', trip_type: 'one_way', direction: 'to the beach' })).toMatchObject({ error: expect.stringMatching(/direction/) })
    expect(await t.execute({})).toMatchObject({ error: expect.stringMatching(/destination is required/) })
  })

  test('a closed hotel is flagged once, under closedUntil', async () => {
    const closed = DESTINATIONS.find((d) => d.reopens)!
    const { t } = tool('get_transfer_quote')
    const r = (await t.execute({ destination: closed.id })) as R
    expect(r.closedUntil).toMatch(new RegExp(`closed until ${closed.reopens}`))
    expect(r.note).toBeUndefined()
    const { t: find } = tool('find_transfer_destination')
    const f = (await find.execute({ query: closed.name })) as R
    expect(f.matches[0].closedUntil).toBeDefined()
    // once that year is behind us the note is stale, not news
    const later = tool('get_transfer_quote', fakeActions({ now: () => new Date('2031-01-01T12:00:00Z') }))
    expect(((await later.t.execute({ destination: closed.id })) as R).closedUntil).toBeUndefined()
  })

  test('check_transfer_timing accepts only "YYYY-MM-DDTHH:MM" and names the field', async () => {
    const { t } = tool('check_transfer_timing')
    for (const bad of ['2026-09-07', '2026-09-07T14:30Z', '2026-09-07T14:30:00-05:00', 'Oct 10 2026 2:30pm', 'next Friday 2pm']) {
      expect(await t.execute({ arrival_at: bad }), bad).toMatchObject({ error: expect.stringMatching(/^arrival_at must be "YYYY-MM-DDTHH:MM"/) })
    }
    expect(await t.execute({ departure_at: '2026-02-31T10:00' })).toMatchObject({ error: expect.stringMatching(/not a real date/) })
    expect(await t.execute({})).toMatchObject({ error: expect.stringMatching(/arrival_at, departure_at or departure_flight_at/) })
  })

  test('the 24-hour rule is judged on the Jamaica clock whatever zone the browser runs in', async () => {
    const { t } = tool('check_transfer_timing')
    for (const tz of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Asia/Tokyo']) {
      process.env.TZ = tz
      // prove the zone switch took: a bare local time must parse differently across zones
      const offset = new Date('2026-09-06T10:00').getTimezoneOffset()
      if (tz === 'Asia/Tokyo') expect(offset).toBe(-540)
      if (tz === 'America/Los_Angeles') expect(offset).toBe(420)
      const onTheLine = (await t.execute({ arrival_at: '2026-09-06T10:00' })) as R
      expect(onTheLine.bookable, `${tz} 10:00`).toBe(true)
      const justInside = (await t.execute({ arrival_at: '2026-09-06T09:59' })) as R
      expect(justInside.bookable, `${tz} 09:59`).toBe(false)
      expect(justInside.earliestBookableJamaicaTime).toBe('2026-09-06T10:00')
      expect(justInside.alternative).toMatch(/email/)
      const later = (await t.execute({ arrival_at: '2026-09-07T14:30', departure_at: '2026-09-14T09:00' })) as R
      expect(later.bookable).toBe(true)
    }
    process.env.TZ = ORIGINAL_TZ
  })

  test('check_transfer_timing derives the hotel pickup from the flight home', async () => {
    const { t } = tool('check_transfer_timing')
    const r = (await t.execute({ departure_flight_at: '2026-10-17T13:30' })) as R
    expect(MIN_PICKUP_LEAD_MIN).toBe(210)
    expect(r.departure.at).toBe('2026-10-17T10:00')
    expect(r.departure.recommendedHotelPickup).toBe('2026-10-17T10:00')
    expect(r.departure.bookable).toBe(true)
    const late = (await t.execute({ departure_at: '2026-10-17T12:00', departure_flight_at: '2026-10-17T13:30' })) as R
    expect(late.departure.at).toBe('2026-10-17T12:00')
    expect(late.departure.warning).toMatch(/less than 3 hours 30 minutes/)
  })

  test('start_transfer_booking fills the cart, patches the legs, navigates, and never pays', async () => {
    const { t, a } = tool('start_transfer_booking')
    const r = (await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 3, arrival_at: '2026-10-10T14:30', arrival_flight: 'aa 1234', departure_at: '2026-10-17T10:00', departure_flight: 'AA4321' })) as R
    expect(r.status).toBe('checkout_opened')
    expect(a.calls).toEqual([
      'addTransferQuote:sandals-negril:round_trip:3:true',
      'updateTransferItem:item-1:{"arrivalAt":"2026-10-10T14:30","arrivalFlight":"AA1234","departureAt":"2026-10-17T10:00","departureFlight":"AA4321"}',
      'onBookingStarted:start_transfer_booking',
      'navigate:/transfers/checkout',
    ])
    expect(r.prefilled).toEqual(['arrivalAt', 'arrivalFlight', 'departureAt', 'departureFlight'])
    expect(JSON.stringify(r)).not.toMatch(/card number|stripe/i)
  })

  test('start_transfer_booking refuses a pickup inside the window before touching the cart', async () => {
    const { t, a } = tool('start_transfer_booking')
    const r = await t.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 2, direction: 'airport_to_hotel', arrival_at: '2026-09-05T18:00' })
    expect(r).toMatchObject({ error: expect.stringMatching(/24-hour.*2026-09-06T10:00/) })
    expect(a.calls).toEqual([])
  })

  test('start_transfer_booking requires trip_type and, for a one-way, a direction', async () => {
    const { t, a } = tool('start_transfer_booking')
    expect(await t.execute({ destination: 'sandals-negril', passengers: 2 })).toMatchObject({ error: expect.stringMatching(/trip_type is required/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: '', passengers: 2 })).toMatchObject({ error: expect.stringMatching(/trip_type is required/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 2 })).toMatchObject({ error: expect.stringMatching(/direction is required/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 2, direction: 'northbound' })).toMatchObject({ error: expect.stringMatching(/direction must be/) })
    expect(a.calls).toEqual([])
  })

  test('a one-way carries only the legs its direction allows', async () => {
    const { t, a } = tool('start_transfer_booking')
    // hotel_to_airport: a departure leg, no arrival leg
    const ok = (await t.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 1, direction: 'hotel_to_airport', departure_at: '2026-10-17T10:00', departure_flight: 'AA4321' })) as R
    expect(ok.status).toBe('checkout_opened')
    expect(a.calls[0]).toBe('addTransferQuote:sandals-negril:one_way:1:false')
    expect(a.calls[1]).toBe('updateTransferItem:item-1:{"departureAt":"2026-10-17T10:00","departureFlight":"AA4321"}')
    const stray = fakeActions()
    const { t: t2 } = tool('start_transfer_booking', stray)
    expect(await t2.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 1, direction: 'hotel_to_airport', arrival_at: '2026-10-10T14:30', arrival_flight: 'AA1234' })).toMatchObject({ error: expect.stringMatching(/no arrival leg/) })
    expect(await t2.execute({ destination: 'sandals-negril', trip_type: 'one_way', passengers: 1, direction: 'airport_to_hotel', departure_flight: 'AA4321' })).toMatchObject({ error: expect.stringMatching(/no departure leg/) })
    expect(stray.calls).toEqual([])
  })

  test('start_transfer_booking rejects loose leg times and a return before the arrival', async () => {
    const { t, a } = tool('start_transfer_booking')
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2, arrival_at: '2026-10-10' })).toMatchObject({ error: expect.stringMatching(/arrival_at must be/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2, arrival_at: '2026-10-10T14:30Z' })).toMatchObject({ error: expect.stringMatching(/arrival_at must be/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2, departure_at: '2026-10-17T10:00:00-05:00' })).toMatchObject({ error: expect.stringMatching(/departure_at must be/) })
    expect(await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2, arrival_at: '2026-10-17T14:30', departure_at: '2026-10-10T10:00' })).toMatchObject({ error: expect.stringMatching(/must be after arrival_at/) })
    expect(a.calls).toEqual([])
  })

  test('start_transfer_booking sets the departure pickup from the flight home when only that is known', async () => {
    const { t, a } = tool('start_transfer_booking')
    const r = (await t.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2, arrival_at: '2026-10-10T14:30', departure_flight_at: '2026-10-17T13:30', departure_flight: 'AA4321' })) as R
    expect(r.status).toBe('checkout_opened')
    expect(a.calls[1]).toBe('updateTransferItem:item-1:{"arrivalAt":"2026-10-10T14:30","departureAt":"2026-10-17T10:00","departureFlight":"AA4321"}')
    expect(r.departurePickupSet).toMatch(/2026-10-17T10:00, 3 hours 30 minutes before the 2026-10-17T13:30 flight/)
  })

  test('both start tools refuse to touch the cart while a payment is being confirmed', async () => {
    const a = fakeActions({ paymentInFlight: () => true })
    const tools = buildWebMcpTools(a)
    const xfer = tools.find((x) => x.name === 'start_transfer_booking')!
    const tour = tools.find((x) => x.name === 'start_tour_booking')!
    expect(await xfer.execute({ destination: 'sandals-negril', trip_type: 'round_trip', passengers: 2 })).toMatchObject({ error: expect.stringMatching(/payment is being confirmed/) })
    expect(await tour.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2 })).toMatchObject({ error: expect.stringMatching(/payment is being confirmed/) })
    expect(a.calls).toEqual([])
  })

  test('list_tours is compact, filters honestly, and clips with a hint', async () => {
    const { t: list } = tool('list_tours')
    const all = (await list.execute({})) as R
    expect(all.count).toBe(experiences.length)
    expect(all.tours.length).toBe(Math.min(12, experiences.length))
    expect(all.more).toBe(experiences.length > 12 ? true : undefined)
    expect(all.urlPrefix).toBe('https://mapltours.com/experience/')
    expect(Object.keys(all.tours[0])).toEqual(['slug', 'title', 'kind', 'area', 'duration', 'fromPriceUsd', 'priceUnit'])
    expect(JSON.stringify(all).length).toBeLessThan(2600)
    const negril = (await list.execute({ area: 'Negril' })) as R
    expect(negril.tours.map((x: R) => x.slug)).toEqual(experiences.filter((e) => /negril/i.test(`${e.destination} ${e.parish}`)).map(getSlug))
    const kingston = (await list.execute({ area: 'Kingston' })) as R
    expect(kingston.count).toBe(experiences.filter((e) => /kingston/i.test(`${e.destination} ${e.parish}`)).length)
    // stop words do not widen the search; "blue hole tour" is about the Blue Hole
    const bh = (await list.execute({ query: 'blue hole tour' })) as R
    expect(bh.tours.every((x: R) => /blue hole/i.test(x.title))).toBe(true)
    expect(bh.count).toBeGreaterThan(0)
    expect(((await list.execute({ query: 'tours' })) as R).count).toBe(experiences.length)
  })

  test('get_tour quotes one total per party and says what it covers', async () => {
    const { t: get } = tool('get_tour')
    const rick = experiences.find((e) => e.title.startsWith("Rick's"))!
    const r = (await get.execute({ tour: "Rick's Cafe Cliff Diving & Sunset", guests: 4 })) as R
    expect(r.priceForParty.priceUsd).toBe(tourPrice(rick.pricing, 4))
    expect(r.priceUsd).toBeUndefined()
    expect(r.fromPriceUsd).toBe(rick.price)
    expect(r.url).toMatch(/\/experience\/ricks-cafe/)
    expect(r.earliestDate).toBe('2026-09-07')
    expect(r.bookingNotice).toMatch(/2026-09-07/)
    // over the flat-rate tier the text says so
    const over = (await get.execute({ tour: rick.title, guests: rick.pricing.tierMax + 2 })) as R
    expect(over.priceForParty.covers).toMatch(/extra guests at a per-person rate/)
    const within = (await get.execute({ tour: rick.title, guests: rick.pricing.tierMax })) as R
    expect(within.priceForParty.covers).toMatch(new RegExp(`flat rate that covers up to ${rick.pricing.tierMax}`))
    // a per-person tour never claims a flat rate, and gives the per-guest figure when it divides evenly
    const pp = experiences.find((e) => e.pricing.mode === 'per_person')!
    const p = (await get.execute({ tour: getSlug(pp), guests: 2 })) as R
    expect(p.priceForParty.covers).toBe('total for 2 guests')
    expect(p.priceForParty.perGuestUsd).toBe(perTravelerPrice(pp.pricing, 2) ?? undefined)
  })

  test('tour names resolve the way people type them', async () => {
    const { t: get } = tool('get_tour')
    expect(((await get.execute({ tour: 'Ricks Cafe' })) as R).slug).toBe('ricks-cafe-cliff-diving-and-sunset')
    expect(((await get.execute({ tour: 'Rick' })) as R).slug).toBe('ricks-cafe-cliff-diving-and-sunset')
    expect(((await get.execute({ tour: 'Parasail Montego' })) as R).slug).toBe('parasailing-over-the-bay')
    expect(((await get.execute({ tour: 'Blue Hole tour' })) as R).slug).toBe('blue-hole-and-secret-falls')
    expect(await get.execute({ tour: 'the tour' })).toMatchObject({ error: expect.stringMatching(/too general/) })
    expect(await get.execute({ tour: 'submarine' })).toMatchObject({ error: expect.stringMatching(/No tour matches/) })
  })

  test('start_tour_booking adds the tour with guests and date and opens /checkout', async () => {
    const { t, a } = tool('start_tour_booking')
    const r = (await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '2026-10-12', pickup_hotel: 'Azul Beach Resort Negril' })) as R
    expect(r.status).toBe('checkout_opened')
    expect(r.priceForParty.priceUsd).toBe(tourPrice(experiences[13].pricing, 2))
    expect(a.calls).toEqual(['addTour:14:2:2026-10-12:Azul Beach Resort Negril', 'onBookingStarted:start_tour_booking', 'navigate:/checkout'])
  })

  test('start_tour_booking enforces the date rules before touching the cart', async () => {
    const { t, a } = tool('start_tour_booking')
    expect(await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '12/10/2026' })).toMatchObject({ error: expect.stringMatching(/YYYY-MM-DD/) })
    expect(await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '2026-09-06' })).toMatchObject({ error: expect.stringMatching(/earliest date is 2026-09-07/) })
    expect(await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '2026-09-01' })).toMatchObject({ error: expect.stringMatching(/earliest date/) })
    expect(await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '2026-02-30' })).toMatchObject({ error: expect.stringMatching(/earliest date/) })
    expect(a.calls).toEqual([])
    const ok = (await t.execute({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: 2, date: '2026-09-07' })) as R
    expect(ok.status).toBe('checkout_opened')
  })

  test('start_tour_booking tells the truth when the cart refuses or evicts', async () => {
    const refused = fakeActions({ addTour: () => ({ added: false, reason: 'Nothing beside it in the day is within reach.' }) })
    const { t } = tool('start_tour_booking', refused)
    const r = (await t.execute({ tour: 'blue-hole-and-secret-falls', guests: 2 })) as R
    expect(r.error).toMatch(/within reach.*Remove the other tour/)
    expect(refused.calls).toEqual([])
    const evicting = fakeActions({ addTour: () => ({ added: true, replaced: ["Dunn's River Falls Climb"], sharedWith: [] }) })
    const { t: t2 } = tool('start_tour_booking', evicting)
    const r2 = (await t2.execute({ tour: getSlug(experiences.find((e) => e.id === 18)!), guests: 2 })) as R
    expect(r2.status).toBe('checkout_opened')
    expect(r2.replaced).toEqual(["Dunn's River Falls Climb"])
    expect(r2.replacedWhy).toMatch(/removed/)
  })

  test('registerWebMcpTools registers every tool and converts throws into error objects', async () => {
    const registered: { name: string; execute: (i: Record<string, unknown>) => Promise<unknown> }[] = []
    const mc = { registerTool: vi.fn((t: { name: string; execute: (i: Record<string, unknown>) => Promise<unknown> }) => { registered.push(t) }) }
    const tools = buildWebMcpTools(fakeActions())
    tools[0].execute = async () => { throw new Error('boom') }
    expect(registerWebMcpTools(mc, tools)).toBe(7)
    expect(await registered[0].execute({})).toEqual({ error: 'boom' })
  })
})

describe('addTourToCart against the real store', () => {
  const byId = (id: number) => experiences.find((e) => e.id === id)!
  const dunns = byId(1)          // Ocho Rios, single
  const blueHole = byId(2)       // Ocho Rios, single
  const ricks = byId(14)         // Negril, single, a long way from Ocho Rios
  const dunnsPlusBlue = byId(18) // package bundling 1 and 2
  const s = () => useCartStore.getState()
  beforeEach(() => s().clearCart())

  test('reports a refusal and leaves the cart alone', () => {
    s().addItem(ricks)
    const r = addTourToCart(s, blueHole, 2, '2026-10-12')
    expect(r.added).toBe(false)
    expect(r.reason).toBeTruthy()
    expect(s().items.map((i) => i.id)).toEqual([ricks.id])
  })

  test('reports what a package evicted', () => {
    s().addItem(dunns)
    const r = addTourToCart(s, dunnsPlusBlue, 3, '2026-10-12', 'Moon Palace Jamaica')
    expect(r).toMatchObject({ added: true, replaced: [dunns.title], sharedWith: [] })
    expect(s().items.map((i) => i.id)).toEqual([dunnsPlusBlue.id])
    expect(s().items[0]).toMatchObject({ travelers: 3, date: '2026-10-12' })
    expect(s().pickup).toBe('Moon Palace Jamaica')
  })

  test('applies the date and party to every line, as checkout does', () => {
    s().addItem(dunns)
    s().updateTravelers(dunns.id, 1)
    const r = addTourToCart(s, blueHole, 4, '2026-10-12')
    expect(r).toMatchObject({ added: true, replaced: [], sharedWith: [dunns.title] })
    expect(s().items).toHaveLength(2)
    for (const i of s().items) expect(i).toMatchObject({ travelers: 4, date: '2026-10-12' })
  })

  test('the tool wired to the real store never reports a checkout it did not fill', async () => {
    s().addItem(ricks)
    const a = fakeActions({ addTour: (exp, guests, date, hotel) => addTourToCart(s, exp, guests, date, hotel) })
    const { t } = tool('start_tour_booking', a)
    const r = (await t.execute({ tour: 'blue-hole-and-secret-falls', guests: 2, date: '2026-10-12' })) as R
    expect(r.error).toMatch(/Remove the other tour/)
    expect(a.calls).toEqual([])
    expect(s().items.map((i) => i.id)).toEqual([ricks.id])
  })
})
