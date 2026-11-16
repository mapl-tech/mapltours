import { describe, test, expect, beforeEach } from 'vitest'
import { PAUSED_TOURS, isTourPaused } from '@/lib/tour-pause'
import { experiences, singleExperiences, packageExperiences, getExperienceBySlug, getSlug, TOUR_DESTINATIONS } from '@/lib/experiences'
import { priceTourCart, PricingError } from '@/lib/checkout-pricing'
import { useCartStore } from '@/lib/cart'
import { addTourToCart, buildWebMcpTools, type WebMcpActions } from '@/lib/webmcp-tools'
import { bookingLink, parseHandoff } from '@/lib/agent/booking-link'
import { stillBookable } from '@/lib/cart-reminders'
import { curateForStay } from '@/lib/tour-upsell'
import { GET as llms } from '@/app/llms.txt/route'

/**
 * The Rasta Cultural ATV Safari (5) is paused: Collin, WhatsApp, Nov 15 2026,
 * "Can you pause on the Rasta safari tour i am going to reach out to them
 * tomorrow and confirm the pricing". When it comes back, delete its line in
 * lib/tour-pause.ts and this first test with it; the rest hold for whatever
 * is paused, and say nothing once nothing is.
 */
const SAFARI = 5

describe('what is paused', () => {
  test('the Rasta ATV Safari, on Collin\'s word, Nov 15 2026', () => {
    expect(isTourPaused(SAFARI)).toBe(true)
    expect(PAUSED_TOURS[SAFARI]).toMatch(/Collin, Nov 15 2026/)
    expect(experiences.find((e) => e.id === SAFARI)?.title).toBe('Rasta Cultural ATV Safari')
  })

  test('only catalogue ids, and nothing else is paused by accident', () => {
    for (const id of Object.keys(PAUSED_TOURS).map(Number)) expect(experiences.some((e) => e.id === id), `tour ${id}`).toBe(true)
    expect(isTourPaused(1)).toBe(false)
    expect(isTourPaused(null)).toBe(false)
    expect(isTourPaused(undefined)).toBe(false)
  })
})

const paused = experiences.filter((e) => isTourPaused(e.id))
const forEachPaused = (name: string, fn: (exp: (typeof experiences)[number]) => void | Promise<void>) => {
  for (const exp of paused) test(`${name}: ${exp.title}`, () => fn(exp))
}

describe('a paused tour keeps its page and its card, and leaves every list', () => {
  forEachPaused('still in the catalogue and reachable by its link', (exp) => {
    expect(getExperienceBySlug(getSlug(exp))?.id).toBe(exp.id)
  })
  forEachPaused('in no browse list', (exp) => {
    expect(singleExperiences.some((e) => e.id === exp.id)).toBe(false)
    expect(packageExperiences.some((e) => e.id === exp.id)).toBe(false)
    expect(TOUR_DESTINATIONS.reduce((n, d) => n + d.count, 0)).toBe(experiences.length - paused.length)
  })
  test('every tour on sale is still listed', () => {
    for (const e of experiences.filter((x) => !isTourPaused(x.id))) {
      expect(e.kind === 'single' ? singleExperiences : packageExperiences).toContain(e)
    }
  })
})

describe('nobody can book it', () => {
  beforeEach(() => useCartStore.setState({ items: [], stops: [] }))

  forEachPaused('the cart will not take it, alone or in a day\'s place', (exp) => {
    const s = useCartStore.getState()
    s.addItem(exp)
    expect(useCartStore.getState().items).toHaveLength(0)
    expect(s.swapDayFor(exp)).toBeNull()
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  forEachPaused('checkout pricing refuses it, with a sentence the guest can act on', (exp) => {
    const go = () => priceTourCart([{ id: exp.id, travelers: 2, date: '2027-06-15' }], {}, {})
    expect(go).toThrow(PricingError)
    try { go() } catch (e) {
      expect((e as PricingError).code).toBe('paused')
      expect((e as PricingError).detail).toBe(`${exp.title} is not taking bookings right now. Remove it from your trip to book the rest, or write to contact@mapltours.com.`)
    }
    // Beside a tour on sale too: the cart is one booking.
    expect(() => priceTourCart([{ id: 10, travelers: 2, date: '2027-06-15' }, { id: exp.id, travelers: 2, date: '2027-06-15' }], {}, {})).toThrow(/not taking bookings/)
  })
})

describe('agents are told, never handed it', () => {
  const NOW = new Date('2026-11-16T15:00:00Z')
  const actions = (calls: string[] = []): WebMcpActions => ({
    origin: 'https://mapltours.com', now: () => NOW,
    addTransferQuote: () => 'x', updateTransferItem: () => {},
    addTour: (exp) => { calls.push(`addTour:${exp.id}`); return { added: true, replaced: [], sharedWith: [] } },
    navigate: (p) => { calls.push(`navigate:${p}`) },
  })
  const run = async (name: string, input: Record<string, unknown>, calls: string[] = []) =>
    (await buildWebMcpTools(actions(calls)).find((t) => t.name === name)!.execute(input)) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

  forEachPaused('list_tours leaves it out, searched for or not', async (exp) => {
    const all = await run('list_tours', {})
    expect(all.count).toBe(experiences.length - paused.length)
    const byName = await run('list_tours', { query: exp.title })
    expect((byName.tours as Array<{ title: string }>).map((t) => t.title)).not.toContain(exp.title)
  })

  forEachPaused('get_tour and start_tour_booking answer with an error and a next step; nothing is added', async (exp) => {
    const calls: string[] = []
    for (const q of [getSlug(exp), exp.title]) {
      expect(await run('get_tour', { tour: q })).toEqual({ error: `${exp.title} is not taking bookings right now. Offer the traveller another tour from list_tours.` })
      expect(await run('start_tour_booking', { tour: q, guests: 2, date: '2026-12-10' }, calls)).toEqual({ error: `${exp.title} is not taking bookings right now. Offer the traveller another tour from list_tours.` })
    }
    expect(calls).toEqual([])
  })

  forEachPaused('a fuzzy search never resolves to it', async (exp) => {
    const r = await run('get_tour', { tour: exp.title.split(' ').slice(0, 2).join(' ') })
    if ('title' in r) expect(r.title).not.toBe(exp.title)
    if (r.matches) expect((r.matches as Array<{ title: string }>).map((m) => m.title)).not.toContain(exp.title)
  })

  forEachPaused('addTourToCart (the tools\' real cart path) refuses it', (exp) => {
    useCartStore.setState({ items: [], stops: [] })
    expect(addTourToCart(useCartStore.getState, exp, 2, '2026-12-10')).toEqual({ added: false, reason: `${exp.title} is not taking bookings right now.` })
    expect(useCartStore.getState().items).toHaveLength(0)
  })

  forEachPaused('a /book link made before the pause opens nothing and points to the others', (exp) => {
    const link = bookingLink('https://mapltours.com', { kind: 'tour', slug: getSlug(exp), guests: 2, date: '2026-12-10' }, 'claude', 'start_tour_booking')
    const parsed = parseHandoff(new URL(link).searchParams, NOW)
    expect(parsed.ok).toBe(false)
    expect(parsed).toMatchObject({ reason: `${exp.title} is not taking bookings right now.`, fallbackPath: '/explore', fallbackLabel: 'See our other tours' })
  })

  forEachPaused('llms.txt does not list it', async (exp) => {
    const body = await (llms() as Response).text()
    expect(body).not.toContain(exp.title)
    expect(body).not.toContain(`/experience/${getSlug(exp)}`)
  })
})

describe('no email offers it', () => {
  forEachPaused('a cart reminder for a cart holding it is not bookable, link or no link', (exp) => {
    const now = Date.parse('2026-11-16T15:00:00Z')
    const b = { booking_type: 'tour', booking_items: [{ experience_id: exp.id, date: '2026-12-10', travelers: 2 }] }
    const link = bookingLink('https://mapltours.com', { kind: 'tour', slug: getSlug(exp), guests: 2, date: '2026-12-10' }, 'mcp', 'reminder_2')
    expect(stillBookable(b, link, now)).toBe(false)
    expect(stillBookable(b, null, now)).toBe(false)
    // The same cart with a tour on sale is.
    expect(stillBookable({ ...b, booking_items: [{ experience_id: 10, date: '2026-12-10', travelers: 2 }] }, null, now)).toBe(true)
  })

  forEachPaused('the tour email never picks it, even where it would otherwise fit the stay', (exp) => {
    for (const hotel of ['Sandals Negril Beach Resort', 'Hyatt Ziva Rose Hall', 'Sandals Ochi Beach Resort', 'Royalton Negril']) {
      for (const party of [1, 2, 4, 6]) {
        expect(curateForStay(hotel, party).map((p) => p.id)).not.toContain(exp.id)
      }
    }
    // Its long day may keep it out anyway, so the pause is shown on its own:
    // the same tour with a short day is picked when on sale (999), never when
    // paused (its own id).
    const short = { ...exp, fromHotel: undefined, ages: undefined, minGuests: 1 }
    const near = exp.destination === 'Negril' ? 'Sandals Negril Beach Resort' : 'Sandals Ochi Beach Resort'
    expect(curateForStay(near, 2, [{ ...short, id: 999 }], { youngest: null }).map((p) => p.id)).toContain(999)
    expect(curateForStay(near, 2, [short], { youngest: null }).map((p) => p.id)).not.toContain(exp.id)
  })
})
