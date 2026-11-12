import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render } from '@react-email/render'
import {
  arrivalMs,
  departureMs,
  freeDays,
  firstFreeDay,
  stayHotel,
  stayArea,
  stayTown,
  partySize,
  youngestChildAge,
  accessibilityNeed,
  hasBaby,
  minAgeOf,
  priceJumps,
  rateCardUnsettled,
  doorToDoorHours,
  upsellSendDueMs,
  upsellBlockedReason,
  curateForStay,
  curateEatForStay,
  planUpsell,
  upsellRunOverBudget,
  UPSELL_TARGET_LEAD_DAYS,
  UPSELL_MIN_LEAD_DAYS,
  UPSELL_SETTLE_DAYS,
  UPSELL_MAX_DAY_HOURS,
  UPSELL_PICKS,
  UPSELL_STAMP_KEY,
  UPSELL_STAMP_FILTER,
  type UpsellBooking,
} from '../../lib/tour-upsell'
import { experiences, tourPrice } from '../../lib/experiences'

const sent = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, ok: true }))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (input: Record<string, unknown>) => {
    sent.calls.push(input)
    return sent.ok ? { ok: true, id: 'email-1' } : { ok: false, error: 'refused' }
  }),
}))

const DAY = 86_400_000

/**
 * A made-up guest (the repo is public; no real booking is copied here): a
 * round trip to a Negril resort, landing Feb 10 2027 and flying home on the
 * 17th, two people, booked well ahead.
 */
function booking(over: Partial<UpsellBooking> = {}, item: Record<string, unknown> = {}): UpsellBooking {
  return {
    id: 'b1b2c3d4-0000-4000-8000-000000000001',
    status: 'paid',
    email: 'taylor.guest@example.com',
    first_name: 'Taylor',
    booking_type: 'transfer',
    created_at: '2026-12-01T15:00:00.000Z',
    special_requests: null,
    booking_items: [
      {
        item_type: 'transfer',
        hotel: 'Couples Swept Away, Negril',
        passengers: 2,
        arrival_at: '2027-02-10T12:20:00Z',
        departure_at: '2027-02-17T08:00:00Z',
        ...item,
      },
    ],
    ...over,
  }
}

const ARRIVAL = arrivalMs(booking()) as number
const DUE = (upsellSendDueMs(booking()) as number) + 1
const tour = (title: string) => experiences.find((e) => e.title === title)!

describe('reading the trip off the booking', () => {
  test('arrival and departure are Jamaica wall-clock, not raw UTC', () => {
    expect(ARRIVAL).toBe(Date.parse('2027-02-10T12:20:00Z') + 5 * 3_600_000)
    expect(departureMs(booking())).toBe(Date.parse('2027-02-17T08:00:00Z') + 5 * 3_600_000)
  })

  test('free days exclude both travel days; a one way has none to count', () => {
    // Land the 10th, picked up the 17th: the 11th to the 16th, six days.
    expect(freeDays(booking())).toBe(6)
    expect(freeDays(booking({}, { departure_at: null }))).toBeNull()
  })

  test('free days are calendar days in Jamaica, whatever the hour of either ride', () => {
    // A morning ride home after an afternoon landing used to lose a day.
    expect(freeDays(booking({}, { arrival_at: '2026-11-25T13:20:00Z', departure_at: '2026-11-28T10:33:00Z' }))).toBe(2)
    // An afternoon ride home: the same two days.
    expect(freeDays(booking({}, { arrival_at: '2026-11-25T13:20:00Z', departure_at: '2026-11-28T16:22:00Z' }))).toBe(2)
    // Landing late at night still uses up that day.
    expect(freeDays(booking({}, { arrival_at: '2026-11-25T23:40:00Z', departure_at: '2026-11-28T10:00:00Z' }))).toBe(2)
    // Land one day, leave the next: nothing in between.
    expect(freeDays(booking({}, { arrival_at: '2027-02-10T12:20:00Z', departure_at: '2027-02-11T09:00:00Z' }))).toBe(0)
    // Across a month and a year end.
    expect(freeDays(booking({}, { arrival_at: '2026-12-30T14:00:00Z', departure_at: '2027-01-03T08:00:00Z' }))).toBe(3)
  })

  test('the suggested tour day is the first full day after landing, never the flight home', () => {
    expect(firstFreeDay(booking())).toBe('2027-02-11')
    // Land the 10th, fly the 11th: no full day, so the landing day.
    expect(firstFreeDay(booking({}, { departure_at: '2027-02-11T09:00:00Z' }))).toBe('2027-02-10')
    // One way: the next day.
    expect(firstFreeDay(booking({}, { departure_at: null }))).toBe('2027-02-11')
    // Month and year boundaries are calendar arithmetic.
    expect(firstFreeDay(booking({}, { arrival_at: '2026-12-31T22:00:00Z', departure_at: '2027-01-08T09:00:00Z' }))).toBe('2027-01-01')
  })

  test('hotel, party and area come off the leg', () => {
    expect(stayHotel(booking())).toBe('Couples Swept Away, Negril')
    expect(partySize(booking())).toBe(2)
    expect(partySize(booking({}, { passengers: null, travelers: null }))).toBe(1)
    expect(stayArea('Couples Swept Away, Negril')).toBe('Negril')
    expect(stayArea('Hyatt Ziva Rose Hall')).toBe('Rose Hall')
    expect(stayArea('Sandals Ochi Beach Resort')).toBe('Ocho Rios')
    expect(stayArea('Riu Palace Aquarelle (Falmouth)')).toBeNull()
    expect(stayTown('Riu Palace Aquarelle (Falmouth)')).toBe('Falmouth')
    expect(stayTown('Grand Palladium Jamaica, Lucea')).toBe('Lucea')
    expect(stayTown('Skylark Negril Beach Resort')).toBe('Negril')
  })
})

describe('who is travelling', () => {
  test('the youngest child named in the note, read conservatively', () => {
    expect(youngestChildAge('Please bring a child seat for our three year old')).toBe(3)
    expect(youngestChildAge('Kids are 7 and 10 years old, and a 4-year-old')).toBe(4)
    expect(youngestChildAge('we have a 2yo')).toBe(2)
    expect(youngestChildAge('baby on board')).toBe(0)
    expect(youngestChildAge('our 8 month old')).toBe(0)
    expect(youngestChildAge('toddler with us')).toBe(2)
    expect(youngestChildAge('need a booster')).toBe(5)
    expect(youngestChildAge('travelling with our son')).toBe(5)
    for (const none of [null, '', 'Late flight, please wait', 'Two carry-ons each', 'Celebrating our 25 years anniversary']) {
      expect(youngestChildAge(none), String(none)).toBeNull()
    }
  })

  // Owner, Nov 10 2026: "do not send emails to anyone with accessibility issues or babies".
  test('accessibility and care needs are recognised, generously', () => {
    for (const n of ['Folding wheelchair and two suitcases', 'my mom uses a walker', 'Dad walks with a cane', 'I am pregnant', 'limited mobility',
      'one of us is blind', 'hard of hearing', 'travelling with a service dog', 'our son is autistic', 'special needs adult', 'is the van wheelchair accessible?',
      'she had a knee replacement', 'needs oxygen', 'disabled parking permit holder']) {
      expect(accessibilityNeed(n), n).toBe(true)
    }
    for (const n of [null, '', 'Please bring a child seat for our three year old', 'Flight may be late', 'Can you wait outside?', 'Two carry-ons each']) {
      expect(accessibilityNeed(n), String(n)).toBe(false)
    }
  })

  test('a baby in the party is recognised; a toddler is not a baby', () => {
    for (const n of ['baby on board', 'travelling with our infant', 'newborn', 'our 8 month old', 'a 1 year old', 'one-year-old twins', 'we need a crib',
      'bringing a pram', 'need an infant seat', 'please have a car seat', 'child seat please', 'we will have a stroller']) {
      expect(hasBaby(n), n).toBe(true)
    }
    for (const n of [null, '', 'Please bring a child seat for our three year old', 'car seat for our 4-year-old', 'kids are 7 and 10 years old',
      'stroller for our 2yo', 'toddler with us', 'Late flight']) {
      expect(hasBaby(n), String(n)).toBe(false)
    }
  })

  test('every tour has an age line the rules can read', () => {
    for (const e of experiences.filter((x) => x.kind === 'single')) {
      expect(minAgeOf(e.ages), e.title).not.toBeNull()
    }
    expect(minAgeOf('All ages, jumping 16+')).toBe(0)
    expect(minAgeOf('16+ to drive, 8+ to ride')).toBe(8)
    expect(minAgeOf('6 and up')).toBe(6)
    expect(minAgeOf(undefined)).toBeNull()
  })
})

describe('prices the rate card has not settled are never offered', () => {
  test('the 3-to-4 step that triples a tour is caught, real tiers are not', () => {
    expect(priceJumps(tour('Bamboo Rafting on the Martha Brae').pricing, 3)).toBe(false)
    expect(priceJumps(tour('Bamboo Rafting on the Martha Brae').pricing, 4)).toBe(true)
    expect(priceJumps(tour('Bamboo Rafting on the Martha Brae').pricing, 6)).toBe(true)
    // Per person: one more person costs one more head, never a jump.
    expect(priceJumps(tour('ATV Off-Road Adventure').pricing, 6)).toBe(false)
    // A group tour whose head price falls as the party grows.
    expect(priceJumps(tour("Dunn's River Falls Climb").pricing, 6)).toBe(false)
    expect(priceJumps(tour("Rick's Cafe Cliff Diving & Sunset").pricing, 6)).toBe(false)
  })

  test('a party of four is never shown a tripled price', () => {
    for (const hotel of ['Couples Swept Away, Negril', 'Hyatt Ziva Rose Hall', 'Sandals Ochi Beach Resort']) {
      for (const p of curateForStay(hotel, 4)) {
        const e = tour(p.title)
        expect(p.total / 4, `${hotel}: ${p.title}`).toBeLessThanOrEqual((tourPrice(e.pricing, 3) / 3) * 1.25)
      }
    }
  })

  test('a tour whose rate card jumps at any size is offered to nobody, a couple included', () => {
    // The clear kayak, Nov 12 2026: its jump at 4 meant the "up to 3" rate was
    // really per person, so the couple's price was wrong too.
    expect(rateCardUnsettled(tour('Bamboo Rafting on the Martha Brae').pricing)).toBe(true)
    expect(rateCardUnsettled(tour('ATV Off-Road Adventure').pricing)).toBe(false)
    expect(rateCardUnsettled(tour("Rick's Cafe Cliff Diving & Sunset").pricing)).toBe(false)
    // Once the catalog says per person, the kayak passes by itself.
    expect(rateCardUnsettled(tour('Clear Kayak Drone Photoshoot').pricing)).toBe(false)
    for (const hotel of ['Couples Swept Away, Negril', 'Hyatt Ziva Rose Hall', 'Sandals Ochi Beach Resort', 'Iberostar Waves Rose Hall']) {
      for (const party of [1, 2, 3, 4, 6]) {
        for (const p of curateForStay(hotel, party)) {
          expect(rateCardUnsettled(tour(p.title).pricing), `${hotel}, party ${party}: ${p.title}`).toBe(false)
        }
      }
    }
  })

  test('a tour that needs a bigger party is never offered to a smaller one', () => {
    // Collin, Nov 12 2026: the zipline runs for 2 or more.
    expect(tour('Rainforest Zipline Adventure').minGuests).toBe(2)
    for (const hotel of ['Couples Swept Away, Negril', 'Hyatt Ziva Rose Hall', 'Iberostar Waves Rose Hall', 'Hotel Riu Montego Bay']) {
      expect(curateForStay(hotel, 1).map((p) => p.title), hotel).not.toContain('Rainforest Zipline Adventure')
      for (const p of curateForStay(hotel, 1)) expect(tour(p.title).minGuests ?? 1, `${hotel}: ${p.title}`).toBeLessThanOrEqual(1)
    }
    // A couple is still offered it where it fits the stay.
    const couple = ['Couples Swept Away, Negril', 'Hyatt Ziva Rose Hall', 'Iberostar Waves Rose Hall', 'Hotel Riu Montego Bay'].flatMap((h) => curateForStay(h, 2).map((p) => p.title))
    expect(couple).toContain('Rainforest Zipline Adventure')
  })
})

describe('how long the day takes', () => {
  test('every phrasing in the catalogue reads', () => {
    expect(doorToDoorHours('Allow 3.5 to 4 hours from Negril, 6 to 7 from Montego Bay and Rose Hall (back about 9pm in winter and 10pm in summer), and 9 to 11 from Ocho Rios or Runaway Bay.', 'Negril')).toEqual({ lo: 3.5, hi: 4 })
    expect(doorToDoorHours('Allow about 3 hours from Ocho Rios or Runaway Bay, 5 to 6 from Rose Hall, 6 to 7 from the Hip Strip and west Montego Bay, and 8 to 10 from Negril.', 'Runaway Bay')).toEqual({ lo: 3, hi: 3 })
    expect(doorToDoorHours('Allow 4 to 6 hours from Montego Bay and Rose Hall and 3 to 4.5 from Negril. From Ocho Rios it is a 7 to 10 hour day.', 'Negril')).toEqual({ lo: 3, hi: 4.5 })
    expect(doorToDoorHours('Allow 4 to 6 hours from Montego Bay and Rose Hall and 3 to 4.5 from Negril. From Ocho Rios it is a 7 to 10 hour day.', 'Ocho Rios')).toEqual({ lo: 7, hi: 10 })
    // A parenthetical is too loose to quote; "longer" has no number.
    expect(doorToDoorHours('Allow 3.5 to 5 hours from Montego Bay (up to 6 from Rose Hall) and 2 to 3 from Negril.', 'Rose Hall')).toBeNull()
    expect(doorToDoorHours('Allow about 2 to 4 hours from Montego Bay and Rose Hall, and longer from Negril or Ocho Rios.', 'Negril')).toBeNull()
    expect(doorToDoorHours(undefined, 'Negril')).toBeNull()
    expect(doorToDoorHours('Allow 2 hours from Negril.', null)).toBeNull()
  })
})

describe('when the offer should go out', () => {
  test('two weeks before arrival for a booking made well ahead', () => {
    expect(upsellSendDueMs(booking())).toBe(ARRIVAL - UPSELL_TARGET_LEAD_DAYS * DAY)
  })

  test('a late booking settles first; a very late one gets no window', () => {
    const late = booking({ created_at: new Date(ARRIVAL - 10 * DAY).toISOString() })
    expect(upsellSendDueMs(late)).toBe(ARRIVAL - 10 * DAY + UPSELL_SETTLE_DAYS * DAY)
    expect(upsellSendDueMs(booking({ created_at: new Date(ARRIVAL - 1 * DAY).toISOString() }))).toBeNull()
    expect(upsellSendDueMs(booking({}, { arrival_at: null }))).toBeNull()
  })
})

describe('who must not be mailed', () => {
  const ok = { hasTour: false, nearbyCount: 3 }

  test('sends when everything lines up', () => {
    expect(upsellBlockedReason(booking(), DUE, ok)).toBeNull()
  })

  test('refuses unpaid, refunded, non-transfer, tour buyers, no address, a second send', () => {
    expect(upsellBlockedReason(booking({ status: 'pending' }), DUE, ok)).toBe('not_paid')
    expect(upsellBlockedReason(booking({ refund_state: 'refunded' }), DUE, ok)).toBe('refunded')
    expect(upsellBlockedReason(booking({ booking_type: 'tour' }), DUE, ok)).toBe('not_a_transfer')
    expect(upsellBlockedReason(booking(), DUE, { ...ok, hasTour: true })).toBe('already_has_tour')
    expect(upsellBlockedReason(booking({ email: null }), DUE, ok)).toBe('no_email')
    expect(upsellBlockedReason(booking({ dispatch: { [UPSELL_STAMP_KEY]: '2027-01-27T00:00:00Z' } }), DUE, ok)).toBe('already_sent')
  })

  test('only inside the window', () => {
    expect(upsellBlockedReason(booking(), DUE - 2 * DAY, ok)).toBe('too_early')
    expect(upsellBlockedReason(booking(), ARRIVAL - 1 * DAY, ok)).toBe('too_late')
    expect(upsellBlockedReason(booking(), ARRIVAL - UPSELL_MIN_LEAD_DAYS * DAY, ok)).toBeNull()
  })

  test('no email for an accessibility need or a baby; a toddler still gets one', () => {
    expect(upsellBlockedReason(booking({ special_requests: 'Folding wheelchair' }), DUE, ok)).toBe('accessibility_need')
    expect(upsellBlockedReason(booking({ special_requests: 'Travelling with our 6 month old' }), DUE, ok)).toBe('baby_in_party')
    expect(upsellBlockedReason(booking({ special_requests: 'Please bring a child seat for our three year old' }), DUE, ok)).toBeNull()
  })

  test('a party too big to book, nothing within reach', () => {
    expect(upsellBlockedReason(booking({}, { passengers: 13 }), DUE, ok)).toBe('party_too_big')
    expect(upsellBlockedReason(booking(), DUE, { ...ok, nearbyCount: 0 })).toBe('nothing_nearby')
  })
})

describe('curation', () => {
  test('a Negril stay gets the three shortest days out, priced for the party', () => {
    const picks = curateForStay('Couples Swept Away, Negril', 2)
    expect(picks).toHaveLength(UPSELL_PICKS)
    const his = picks.map((p) => p.doorToDoor!.hi)
    expect([...his].sort((a, b) => a - b)).toEqual(his)
    for (const p of picks) {
      expect(p.doorToDoor!.hi).toBeLessThanOrEqual(UPSELL_MAX_DAY_HOURS)
      expect(p.total).toBe(tourPrice(tour(p.title).pricing, 2))
      expect(p.slug).toBeTruthy()
    }
    // Dunn's River from Negril is 8 to 10 hours: never offered.
    expect(picks.some((p) => /Dunn/.test(p.title))).toBe(false)
  })

  test('a family with a three-year-old is offered only tours that take one', () => {
    const picks = curateForStay('Skylark Negril Beach Resort', 3, experiences, { youngest: 3 })
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) expect(minAgeOf(p.ages), p.title).toBeLessThanOrEqual(3)
    expect(picks.some((p) => /ATV|Zipline/.test(p.title))).toBe(false)
  })

  test('where no time is published (Falmouth, Lucea) the day planner ranks, within its ceiling', () => {
    const picks = curateForStay('Riu Palace Aquarelle (Falmouth)', 2)
    expect(picks.length).toBeGreaterThan(0)
    for (const p of picks) {
      expect(p.doorToDoor).toBeNull()
      expect(p.driveMinutes).not.toBeNull()
    }
  })

  test('unknown hotel, packages', () => {
    expect(curateForStay('Somewhere Nobody Has Heard Of', 2)).toEqual([])
    expect(curateForStay(null, 2)).toEqual([])
    expect(curateForStay('Couples Swept Away, Negril', 2).some((p) => p.title.includes(' + '))).toBe(false)
  })

  test('every email photo is light enough for a phone inbox (100KB or less, 4:3, at least the 600px the email shows)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    for (const f of readdirSync('public/email/tours').filter((n) => n.endsWith('.jpg'))) {
      const path = `public/email/tours/${f}`
      expect(statSync(path).size, f).toBeLessThanOrEqual(100 * 1024)
      // JPEG SOF0/SOF2 marker: height then width, big-endian.
      const buf = readFileSync(path)
      let i = 2, w = 0, h = 0
      while (i < buf.length) {
        const marker = buf[i + 1], len = buf.readUInt16BE(i + 2)
        if (marker === 0xc0 || marker === 0xc2) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break }
        i += 2 + len
      }
      expect(w, f).toBeGreaterThanOrEqual(600)
      expect(Math.abs(w / h - 4 / 3), f).toBeLessThan(0.01)
    }
  })

  test('every single tour has its email photo on disk', async () => {
    const { existsSync } = await import('node:fs')
    const { slugify } = await import('../../lib/experiences')
    const missing = experiences.filter((e) => e.kind === 'single').map((e) => `public/email/tours/${slugify(e.title)}.jpg`).filter((f) => !existsSync(f))
    expect(missing).toEqual([])
  })
})

describe('planUpsell and the food tip', () => {
  test('returns everything the email needs', () => {
    const r = planUpsell(booking(), DUE, { hasTour: false })
    if (!('plan' in r)) throw new Error('unexpected skip')
    expect(r.plan).toMatchObject({ email: 'taylor.guest@example.com', firstName: 'Taylor', hotel: 'Couples Swept Away, Negril', town: 'Negril', party: 2, freeDays: 6, tourDay: '2027-02-11', youngest: null })
    expect(r.plan.picks).toHaveLength(UPSELL_PICKS)
    expect(r.plan.eat?.mapsUrl).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/)
  })

  test('passes the skip reason straight through', () => {
    expect(planUpsell(booking(), DUE, { hasTour: true })).toEqual({ skipped: 'already_has_tour' })
    expect(planUpsell(booking(), DUE - 30 * DAY, { hasTour: false })).toEqual({ skipped: 'too_early' })
  })

  test('the food tip is deterministic and carries no price or rating', () => {
    const runs = Array.from({ length: 5 }, () => curateEatForStay('Couples Swept Away, Negril')!.name)
    expect(new Set(runs).size).toBe(1)
    const eat = curateEatForStay('Couples Swept Away, Negril')!
    expect(Object.keys(eat)).not.toContain('total')
    expect(Object.keys(eat)).not.toContain('rating')
    expect(curateEatForStay(null)).toBeNull()
  })
})

describe('the email', async () => {
  const { upsellProps, bookLink, doorToDoorLabel, agesLabel } = await import('../../lib/email/tour-upsell')
  const TourUpsell = (await import('../../emails/TourUpsell')).default
  const { upsellSubject, upsellHeadline, upsellPreheader, partyPhrase } = await import('../../emails/TourUpsell')
  const plan = (() => { const r = planUpsell(booking(), DUE, { hasTour: false }); if (!('plan' in r)) throw new Error('skip'); return r.plan })()
  const props = upsellProps(plan, { unsubscribeUrl: 'https://mapltours.com/api/trip-tips/unsubscribe?e=x&t=y', postalAddress: null })

  test('each button opens checkout with the tour, day, party and pickup filled in', () => {
    const u = new URL(bookLink('ricks-cafe-cliff-diving-and-sunset', plan))
    expect(u.origin + u.pathname).toBe('https://mapltours.com/book')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ tour: 'ricks-cafe-cliff-diving-and-sunset', guests: '2', date: '2027-02-11', hotel: 'Couples Swept Away, Negril', utm_campaign: 'tour_upsell', utm_medium: 'lifecycle' })
    for (const p of props.picks) expect(p.bookUrl).toMatch(/^https:\/\/mapltours\.com\/book\?tour=/)
  })

  test('exactly one card is marked the shortest day out, and it is the shortest', () => {
    expect(props.picks.filter((p) => p.shortest)).toHaveLength(1)
    expect(props.picks[0].shortest).toBe(true)
  })

  test('the words: subject, headline, preheader, party', () => {
    expect(upsellSubject(props)).toBe('Taylor, your 6 free days in Negril')
    expect(upsellSubject({ ...props, firstName: null })).toBe('Your 6 free days in Negril')
    expect(upsellSubject({ ...props, freeDays: 1 })).toBe('Taylor, your free day in Negril')
    expect(upsellSubject({ ...props, freeDays: 0 })).toBe('Taylor, what to do near Negril')
    expect(upsellSubject({ ...props, freeDays: null, firstName: null })).toBe('What to do near Negril')
    // Fits an iPhone inbox line for ordinary names, even with the longest town.
    expect(upsellSubject({ ...props, firstName: 'Jerome', town: 'Montego Bay', freeDays: 12 }).length).toBeLessThanOrEqual(40)
    for (const s of [upsellSubject(props), upsellPreheader(props)]) {
      expect(s).not.toMatch(/[\u2013\u2014!]|days out|don't miss|hurry|sale|deal|off\b|%|\$/i)
    }
    expect(upsellHeadline(props)).toBe('6 free days in Negril. Three good ways to spend one.')
    expect(upsellHeadline({ ...props, freeDays: 0 })).toBe('Three good tours near Negril')
    expect(upsellHeadline({ ...props, picks: props.picks.slice(0, 1) })).toBe('6 free days in Negril. A good way to spend one.')
    expect(upsellPreheader(props)).toBe('Three tours that fit your trip, priced for both of you with hotel pickup.')
    expect(upsellPreheader({ ...props, party: 1, picks: props.picks.slice(0, 1) })).toBe('One tour that fits your trip, priced for you with hotel pickup.')
    expect([partyPhrase(1), partyPhrase(2), partyPhrase(4)]).toEqual(['you', 'both of you', 'all 4 of you'])
    expect(doorToDoorLabel({ lo: 3, hi: 3 })).toBe('About 3 hours door to door')
    expect(doorToDoorLabel({ lo: 3.5, hi: 4 })).toBe('3.5 to 4 hours door to door')
    expect([agesLabel('All ages'), agesLabel('8 and up'), agesLabel(null)]).toEqual(['All ages', 'Ages 8 and up', null])
  })

  test('renders with real prices, the stop link, alt text, and none of the banned words', async () => {
    const html = await render(TourUpsell(props))
    const text = await render(TourUpsell(props), { plainText: true })
    for (const p of props.picks) {
      expect(html).toContain(`$${p.total}`)
      expect(html).toContain(`alt="${p.title.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')}"`)
    }
    expect(html).toContain('Book for Thu, Feb 11')
    expect(html).toContain('Stop these emails')
    expect(text).toContain('https://mapltours.com/api/trip-tips/unsubscribe?e=x&t=y')
    const words = text.replace(/https?:\/\/\S+/g, '')
    expect(words).not.toMatch(/[–—]/)
    expect(words).not.toMatch(/MAPL Tours(?! Jamaica)/)
    expect(words).not.toMatch(/collect|only \d+ left|hurry|limited time/i)
  })

  test('the template states no tour or parish count it cannot back', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('emails/TourUpsell.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '')
    expect(src).not.toMatch(/seven parishes/i)
    expect(src).not.toMatch(/\d+\s+(tours|parishes)/i)
  })
})

describe('the send', async () => {
  const { sendTourUpsell } = await import('../../lib/email/tour-upsell')

  function fakeSvc(opts: { tours?: unknown[]; tips?: unknown[]; claim?: boolean; tipsError?: boolean } = {}) {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const table = (rows: unknown[], err = false) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {}
      for (const m of ['select', 'eq', 'ilike', 'in', 'gte']) q[m] = () => q
      q.limit = () => Promise.resolve(err ? { data: null, error: { message: 'down' } } : { data: rows, error: null })
      return q
    }
    return {
      rpcCalls,
      from: (t: string) => (t === 'trip_tips_log' ? table(opts.tips ?? [], opts.tipsError) : table(opts.tours ?? [])),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return { data: opts.claim === false ? [] : [{ id: 'row' }] }
      },
    }
  }
  const contact = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
  const deps = (over: Record<string, unknown> = {}) => ({ now: DUE, resendKey: 'rk', stopSecret: 's'.repeat(32), fetchImpl: contact(404), ...over })

  beforeEach(() => { sent.calls.length = 0; sent.ok = true })

  test('sends once: claims, then mails with the stop headers and an idempotency key', async () => {
    const svc = fakeSvc()
    const r = await sendTourUpsell(svc, booking(), deps())
    expect(r).toMatchObject({ ok: true, sentTo: 't***@example.com' })
    expect(svc.rpcCalls[0].args.p_patch).toHaveProperty(UPSELL_STAMP_KEY)
    expect(svc.rpcCalls[0].args.p_only_if_absent).toBe(UPSELL_STAMP_KEY)
    expect(sent.calls).toHaveLength(1)
    const mail = sent.calls[0] as { to: string; from: string; replyTo: string; headers: Record<string, string>; idempotencyKey: string; subject: string }
    expect(mail.to).toBe('taylor.guest@example.com')
    expect(mail.from).toBe('MAPL Tours Jamaica <contact@mapltours.com>')
    expect(mail.replyTo).toBe('contact@mapltours.com')
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/mapltours\.com\/api\/trip-tips\/unsubscribe\?e=.+&t=.+>, <mailto:contact@mapltours\.com\?subject=stop>$/)
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mail.idempotencyKey).toBe(`tour-upsell:${booking().id}`)
  })

  test('a dry run checks everything and writes nothing', async () => {
    const svc = fakeSvc()
    const r = await sendTourUpsell(svc, booking(), deps({ dry: true }))
    expect(r).toMatchObject({ ok: true, sentTo: 't***@example.com' })
    expect(svc.rpcCalls).toHaveLength(0)
    expect(sent.calls).toHaveLength(0)
  })

  test.each([
    ['a tour already bought', { tours: [{ id: 't' }] }, {}, 'already_has_tour'],
    ['a tip in the last week', { tips: [{ status: 'sent', sent_at: new Date(DUE - 2 * DAY).toISOString(), created_at: new Date(DUE - 2 * DAY).toISOString() }] }, {}, 'tip_recent'],
    ['the tips ledger unreadable', { tipsError: true }, {}, 'tip_recent'],
    ['stopped in Resend', {}, { fetchImpl: contact(200, { unsubscribed: true }) }, 'unsubscribed'],
    ['Resend unreadable', {}, { fetchImpl: contact(500) }, 'contact_check_failed'],
    ['no stop secret', {}, { stopSecret: '' }, 'no_unsubscribe_link'],
    ['claimed by another run', { claim: false }, {}, 'claimed_elsewhere'],
  ])('sends nothing when %s', async (_name, svcOpts, depOver, reason) => {
    const svc = fakeSvc(svcOpts as never)
    const r = await sendTourUpsell(svc, booking(), deps(depOver))
    expect(r.ok).toBe(false)
    expect(r.skipped).toBe(reason)
    expect(sent.calls).toHaveLength(0)
  })

  test('an old tip does not hold it, and a still-subscribed contact is fine', async () => {
    const svc = fakeSvc({ tips: [{ status: 'sent', sent_at: new Date(DUE - 10 * DAY).toISOString(), created_at: new Date(DUE - 10 * DAY).toISOString() }] })
    expect((await sendTourUpsell(svc, booking(), deps({ fetchImpl: contact(200, { unsubscribed: false }) }))).ok).toBe(true)
  })

  test('a refused send releases the claim so a later run retries', async () => {
    sent.ok = false
    const svc = fakeSvc()
    const r = await sendTourUpsell(svc, booking(), deps())
    expect(r).toMatchObject({ ok: false, error: 'refused' })
    expect(svc.rpcCalls.map((c) => c.args.p_remove ?? null)).toEqual([null, [UPSELL_STAMP_KEY]])
  })

  test.each([
    ['an accessibility need', 'Folding wheelchair and two suitcases', 'accessibility_need'],
    ['a baby', 'We are bringing our 9 month old', 'baby_in_party'],
  ])('%s: no email to the guest and none about them, nothing claimed', async (_name, note, reason) => {
    const svc = fakeSvc()
    const r = await sendTourUpsell(svc, booking({ special_requests: note }), deps())
    expect(r).toMatchObject({ ok: false, skipped: reason })
    expect(sent.calls).toHaveLength(0)
    expect(svc.rpcCalls).toHaveLength(0)
  })
})

test('the stamp filter is derived from the key, never hand written', () => {
  expect(UPSELL_STAMP_FILTER).toBe(`dispatch->${UPSELL_STAMP_KEY}`)
})

test('a run stops before Netlify cuts it off', () => {
  expect(upsellRunOverBudget(0, 0)).toBe(false)
  expect(upsellRunOverBudget(12, 0)).toBe(true)
  expect(upsellRunOverBudget(0, 7_000)).toBe(true)
})
