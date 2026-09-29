import { describe, test, expect, afterAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildTip,
  C5_URL,
  formatDay,
  formatTime,
  PHOTOS,
  PHOTO_WIDTH,
  PRIMARY_MARK,
  REPLY_PROMISE,
  SITE,
  TIP_TRACK,
  TIPS_MEDIA_BASE,
  TOUR_FALLBACK,
  TOUR_PHOTOS,
  TRIP_TIPS_POSTAL_ADDRESS,
  tourPhoto,
  toursPhoto,
  type BuiltTip,
  type TipContext,
  type TipKey,
} from '../../lib/trip-tips/emails'
import { TIP_KEYS, TRACK_KEYS, planPerson, type Track } from '../../lib/trip-tips/plan'
import { isExperienceDateBookable } from '../../lib/booking-window'
import { rideBooking, tourBooking } from './trip-tips-fakes'
import { DESTINATIONS, MAX_TRANSFER_PASSENGERS, ZONES, getTransferPrice, zonePriceRange, type TransferZone } from '../../lib/airport-transfers'
import { experiences, tourPrice, priceUnitLabel } from '../../lib/experiences'
import { POPUP_CODE, POPUP_PERCENT } from '../../lib/coupon-popup'

/*
 * The trip tips content, held to the site's own data. Every number in an
 * email must be one the site's pricing functions produce for that guest;
 * every tip carries one gold button, the unsubscribe link and at least one
 * photo from the site, and no mailing address while the owner wants none;
 * nothing states a claim the fact base rules out. Fixtures are
 * fictional people on real rate-card hotels and catalogue tours.
 */

const UNSUB = 'https://mapltours.com/api/trip-tips/unsubscribe?e=guest%40example.com&t=abc123'
const base = { unsubscribeUrl: UNSUB }

const FIXTURES: Record<Track, TipContext[]> = {
  PROSPECT: [
    { ...base, track: 'PROSPECT', firstName: 'Maya' },
    { ...base, track: 'PROSPECT' },
  ],
  RIDE: [
    {
      ...base,
      track: 'RIDE',
      firstName: 'Jordan',
      hotel: 'Riu Negril',
      zone: 'D',
      arrival: { date: '2026-11-14', time: '13:40', flight: 'dl 1234' },
      departure: { date: '2026-11-21', time: '09:15', flight: 'DL 1235' },
      passengers: 2,
    },
    { ...base, track: 'RIDE', hotel: 'Deja Resort, Montego Bay', zone: 'A', arrival: { date: '2027-03-01', time: '00:05', flight: null }, departure: null, passengers: 6 },
    // The least a RIDE tip can know: the landing day.
    { ...base, track: 'RIDE', arrival: { date: '2027-03-02', time: '', flight: null } },
  ],
  TOUR: [
    {
      ...base,
      track: 'TOUR',
      firstName: 'Priya',
      hotel: 'Moon Palace Jamaica, Ocho Rios',
      zone: 'E',
      tours: [{ title: "Dunn's River + Blue Hole", date: '2026-12-03', experienceId: 18, travelers: 3 }],
      passengers: 3,
    },
    {
      ...base,
      track: 'TOUR',
      firstName: 'Sam',
      tours: [
        { title: 'River Tubing', date: '2026-12-10', experienceId: 13, travelers: 2 },
        { title: "Dunn's River Falls Climb", date: '2026-12-08', experienceId: 1, travelers: 2 },
      ],
    },
    { ...base, track: 'TOUR', hotel: 'Hedonism II, Negril', tours: [{ title: 'A tour we no longer list', date: '2026-12-12', experienceId: 999, travelers: 9 }], passengers: 9 },
  ],
  BOTH: [
    {
      ...base,
      track: 'BOTH',
      firstName: 'Alex',
      hotel: 'Couples Negril',
      zone: 'D',
      arrival: { date: '2027-01-09', time: '11:05', flight: 'AA 0987' },
      departure: { date: '2027-01-16', time: '08:30', flight: 'AA 0988' },
      tours: [{ title: "Rick's Cafe Cliff Diving & Sunset", date: '2027-01-11', experienceId: 14, travelers: 2 }],
      passengers: 2,
    },
    {
      ...base,
      track: 'BOTH',
      hotel: 'Sandals Ochi Beach Resort',
      zone: 'E',
      arrival: { date: '2027-02-20', time: '16:25', flight: 'WS 2700' },
      tours: [
        { title: 'Bob Marley Nine Mile Pilgrimage', date: '2027-02-24', experienceId: 15, travelers: 4 },
        { title: 'Blue Hole & Secret Falls', date: '2027-02-22', experienceId: 2, travelers: 4 },
      ],
      passengers: 4,
    },
    // Only the ride HOME (hotel to MBJ) and a tour: the planner picks b2 for
    // this guest; r1, r2 and b1 need a landing and refuse it.
    {
      ...base,
      track: 'BOTH',
      firstName: 'Sam',
      hotel: 'Couples Negril',
      zone: 'D',
      arrival: null,
      departure: { date: '2026-11-12', time: '09:15', flight: 'AA 456' },
      tours: [{ title: "Rick's Cafe Cliff Diving & Sunset", date: '2026-11-08', experienceId: 14, travelers: 2 }],
      passengers: 2,
    },
  ],
}

/** The keys that describe the landing and so need the arrival leg. */
const NEEDS_ARRIVAL: TipKey[] = ['r1_before_you_fly', 'r2_week_before', 'b1_before_you_fly']
const renders = (key: TipKey, ctx: TipContext) => !(NEEDS_ARRIVAL.includes(key) && !ctx.arrival)

type Case = { key: TipKey; ctx: TipContext; i: number; tip: BuiltTip }
const CASES: Case[] = TIP_KEYS.flatMap((key) =>
  FIXTURES[TIP_TRACK[key]].flatMap((ctx, i) => (renders(key, ctx) ? [{ key, ctx, i, tip: buildTip(key, ctx) }] : [])),
)
const name = (c: Case) => `${c.key}#${c.i}`

/** The words a reader sees: tags, comments and the doctype gone, entities decoded. */
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!doctype[^>]*>/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#847;|&zwnj;/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const all = (t: BuiltTip) => [t.subject, t.preheader, t.text, visible(t.html)]
const hrefs = (html: string) => Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"'))
const dollars = (s: string) => Array.from(s.matchAll(/\$(\d[\d,]*)/g)).map((m) => Number(m[1].replace(/,/g, '')))
const range = (min: number, max: number) => (min === max ? `$${min}` : `$${min} to $${max}`)
const noDash = (s: string) => s.replace(/\s*[–—]\s*/g, ' to ')
/** The reply line as the HTML carries it: "24 hours" held together, so a phone never ends the email on "hours." alone. */
const REPLY_HTML = 'one of us will write back within 24&nbsp;hours.'

/**
 * The round-trip fare range of every zone, straight from zonePriceRange: the
 * fares every tip leads with (owner, Sept 27 2026: "it should market the
 * round trip"), as the live /transfers zone cards show them.
 */
const ZONE_RANGES = (Object.keys(ZONES) as TransferZone[]).map((z) => ({ z, ...zonePriceRange(z, 'round_trip') }))
const ALL_MIN = Math.min(...ZONE_RANGES.map((r) => r.min))
const ALL_MAX = Math.max(...ZONE_RANGES.map((r) => r.max))
/** The cheapest one-way fare on the rate card, the one one-way figure under a zone table; held to getTransferPrice too. */
const ONE_WAY_MIN = Math.min(...(Object.keys(ZONES) as TransferZone[]).map((z) => zonePriceRange(z, 'one_way').min))
const ONE_WAY_LINE = `Only need one way? Fares start at $${ONE_WAY_MIN}.`
const P2_IDS = [3, 14, 18]
const exp = (id: number) => experiences.find((e) => e.id === id)!

/** Every dollar figure a tip may print for this guest, computed here from the site's functions, not from the builder. */
function allowedDollars(key: TipKey, ctx: TipContext): Set<number> {
  const s = new Set<number>()
  // A zone table: its round-trip ranges, and the one-way line under it.
  const zoneTable = () => (ZONE_RANGES.forEach((r) => (s.add(r.min), s.add(r.max))), s.add(ONE_WAY_MIN))
  if (key === 'p1_ride_costs') zoneTable()
  if (key === 'p1_ride_costs' || key === 'p3_before_you_land') {
    s.add(ALL_MIN)
    s.add(ALL_MAX)
  }
  if (key === 'p2_tours') P2_IDS.forEach((id) => s.add(tourPrice(exp(id).pricing, 1)))
  if (key === 't1_airport_ride') {
    const dest = DESTINATIONS.find((d) => d.name === ctx.hotel)
    const pax = ctx.passengers ?? ctx.tours?.[0]?.travelers ?? 2
    if (dest && pax >= 1 && pax <= 7) {
      s.add(getTransferPrice(dest.id, 'one_way', pax)!)
      s.add(getTransferPrice(dest.id, 'round_trip', pax)!)
    } else zoneTable()
  }
  return s
}

describe('the ten tips and their tracks', () => {
  test('every key the planner knows has a builder, on the same track', () => {
    expect(Object.keys(TIP_TRACK).sort()).toEqual([...TIP_KEYS].sort())
    for (const [track, keys] of Object.entries(TRACK_KEYS)) for (const k of keys) expect(TIP_TRACK[k], k).toBe(track)
  })

  test('a tip never renders for another track, so a booked guest can never get the code', () => {
    const legs = { arrival: { date: '2026-11-14', time: '13:40', flight: null }, departure: { date: '2026-11-21', time: '09:15', flight: null } }
    for (const key of TIP_KEYS) {
      for (const track of ['PROSPECT', 'RIDE', 'TOUR', 'BOTH'] as const) {
        const ctx = { ...base, track, ...legs }
        if (track === TIP_TRACK[key]) expect(() => buildTip(key, ctx)).not.toThrow()
        else expect(() => buildTip(key, ctx), `${key} for ${track}`).toThrow(/tip, not for track/)
      }
    }
    // Case is forgiven; anything else is not.
    expect(() => buildTip('p1_ride_costs', { ...base, track: 'prospect' as Track })).not.toThrow()
    expect(() => buildTip('p1_ride_costs', { ...base, track: undefined as unknown as Track })).toThrow()
  })

  test('no unsubscribe link means no email; no mailing address is needed', () => {
    expect(() => buildTip('p1_ride_costs', { ...base, track: 'PROSPECT', unsubscribeUrl: '' })).toThrow(/unsubscribe/)
    expect(() => buildTip('p1_ride_costs', { ...base, track: 'PROSPECT', unsubscribeUrl: 'http://mapltours.com/x' })).toThrow(/unsubscribe/)
    expect(() => buildTip('p1_ride_costs', { ...base, track: 'PROSPECT', unsubscribeUrl: 'javascript:alert(1)' })).toThrow(/unsubscribe/)
    expect(() => buildTip('nope' as TipKey, { ...base, track: 'PROSPECT' })).toThrow(/unknown tip/)
    // Owner, Sept 27 2026: "Do not put our address". The one constant is null (tests/unit/trip-tips-postal.spec.ts sets it).
    expect(TRIP_TIPS_POSTAL_ADDRESS).toBeNull()
    expect(() => buildTip('p1_ride_costs', { ...base, track: 'PROSPECT' })).not.toThrow()
  })
})

describe.each(CASES.map((c) => [name(c), c] as const))('%s', (_n, c) => {
  const { key, ctx, tip } = c
  const booked = TIP_TRACK[key] !== 'PROSPECT'

  test('no em or en dashes, no exclamation marks, the brand in mixed case', () => {
    for (const s of all(tip)) {
      expect(s).not.toMatch(/[–—]/)
      expect(s).not.toMatch(/!/)
      expect(s).not.toMatch(/MAPL TOURS/)
    }
    expect(tip.text).toMatch(/MAPL Tours Jamaica/)
    expect(visible(tip.html)).toMatch(/MAPL Tours Jamaica/)
  })

  test('no claim the fact base rules out', () => {
    const banned = [
      /\bcollect(s|ed|ing)? you\b/i,
      /most (booked|popular)|people book most|best.?sell/i,
      /\brating|\breviews?\b|testimonial|★|stars?\b/i,
      /one price (for|covers) (any|your) group|same price for any/i,
      /(?<!about )10% (less|cheaper|off)/i,
      /\bexactly 10\b/i,
      /no account needed/i,
      /itemi[sz]ed|all-in/i,
      /refunded in full or rescheduled/i,
      /\btolls?\b|child seat|car seat|luggage allowance|wait(s)? (up to|for) \d+ ?min/i,
      /UTC|GMT|time zone|daylight/i,
      /\bSIM\b|Digicel|\bFlow\b|US dollars? (are|is) (accepted|taken)/i,
      /\bpassport valid|\bvisa (is|are)? ?(not )?(required|needed)/i,
      /inside (the )?arrivals|outside (the )?arrivals|sixth car rental|the (evening|day) before (a|your) (morning|landing|pickup)/i,
      /entr(y|ies|ance) (is |are )?included|lunch (is )?included|seamless|hassle.?free|unforgettable|paradise|last chance|don.t miss|limited spots/i,
      // Drive times: the site gives two figures for Montego Bay and for Negril (map-facts C13, C22).
      /\b\d+ ?(to \d+ ?)?(min|mins|minutes|hrs?|hours?) (from|to) (MBJ|Sangster|the airport)|\bunder \d+ min|\bthe drive\b|\d+ ?(to \d+ ?)?min\b/i,
      // Group prices always with their limit, never as one price for everyone.
      /(pay|priced) per person and ride together/i,
      // Lead time: tours close from midnight in Jamaica, not 24 hours before they start.
      /24 hours (before|ahead of) (a|the|your) tour|bookings close 24 hours (ahead|before a tour)/i,
      // A booked guest at MBJ is not sent to an inbox that answers in 24 hours.
      /within ten minutes|details in your confirmation email/i,
      /one near each resort area|both days work|everything is booked/i,
    ]
    for (const s of all(tip)) for (const re of banned) expect(s, `${re}`).not.toMatch(re)
  })

  test('nothing from a tour’s DRAFT detail fields is stated', () => {
    const text = tip.text.toLowerCase()
    for (const e of experiences) {
      const draft = [e.about, e.ages, e.fitness, ...(e.included ?? []), ...(e.notIncluded ?? []), ...(e.bring ?? []), ...(e.additionalInfo ?? [])]
      for (const line of draft) if (typeof line === 'string' && line.length >= 20) expect(text, `${e.id}: ${line}`).not.toContain(line.toLowerCase())
    }
  })

  test('exactly one gold button, dark ink on gold, and it is in the text version too', () => {
    expect(tip.html.split(PRIMARY_MARK).length - 1).toBe(1)
    const pill = tip.html.slice(tip.html.indexOf(PRIMARY_MARK))
    const href = /href="([^"]+)"/.exec(pill)![1].replace(/&amp;/g, '&')
    expect(pill).toMatch(/color:#1A1508;font-size:19px;font-weight:700/)
    expect(tip.text).toContain(href)
  })

  test('the unsubscribe link and the why line in both versions, and no mailing address', () => {
    expect(hrefs(tip.html)).toContain(UNSUB)
    expect(tip.text).toContain(`Unsubscribe: ${UNSUB}`)
    for (const s of [visible(tip.html), tip.text]) {
      expect(s).toContain('You asked MAPL Tours Jamaica for Jamaica trip tips')
      expect(s).not.toMatch(/Jimmy Cliff|Boulevard|St\. James|P\.? ?O\.? Box/i)
    }
    // The footer comes last: the why line, the unsubscribe line, then the privacy link, nothing between.
    expect(tip.html.lastIndexOf(UNSUB.replace(/&/g, '&amp;'))).toBeGreaterThan(tip.html.lastIndexOf(PRIMARY_MARK))
    expect(tip.text.endsWith(`Unsubscribe: ${UNSUB}\nPrivacy: ${SITE}/privacy?utm_source=trip_tips&utm_medium=email&utm_campaign=trip_tips&utm_content=${key}_privacy\n`)).toBe(true)
    expect(tip.html).toMatch(/>Unsubscribe<\/a><\/p>\n<p [^>]*><a class="tl" href="[^"]*\/privacy\?[^"]*"[^>]*>Privacy<\/a><\/p>\n<\/div>/)
  })

  test('a hidden preheader, the subject as the title, a light document under Gmail’s clip size', () => {
    expect(tip.preheader.length).toBeGreaterThan(20)
    expect(tip.html).toContain(`display:none;mso-hide:all;`)
    expect(visible(tip.html).startsWith(`${tip.subject} ${tip.preheader}`)).toBe(true)
    expect(tip.subject.length).toBeLessThanOrEqual(60)
    expect(Buffer.byteLength(tip.html)).toBeLessThan(102 * 1024)
    expect(tip.html).toMatch(/<html lang="en">/)
    expect(tip.html).toMatch(/role="article"/)
    expect(tip.html.match(/<h1\b/g)?.length).toBe(1)
  })

  test('short: 250 words or fewer on screen, footer included', () => {
    const shown = visible(tip.html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<div style="display:none[\s\S]*?<\/div>/, ''))
    expect(shown.split(/\s+/).filter((w) => /[A-Za-z0-9$]/.test(w)).length).toBeLessThanOrEqual(250)
  })

  test('at least one photo, each a site-hosted JPEG with width, height, alt, display:block, no border and rounded corners, after the button', () => {
    const imgs = tip.html.match(/<img\b[^>]*>/g) ?? []
    expect(imgs.length).toBeGreaterThanOrEqual(1)
    expect(imgs.length).toBeLessThanOrEqual(2)
    for (const img of imgs) {
      const file = new RegExp(`src="${TIPS_MEDIA_BASE.replace(/[./]/g, '\\$&')}([a-z-]+\\.jpg)"`).exec(img)?.[1]
      expect(file, img).toBeTruthy()
      const photo = Object.values(PHOTOS).find((p) => p.file === file)!
      expect(photo, file).toBeTruthy()
      expect(img).toContain(` width="${PHOTO_WIDTH}"`)
      expect(img).toContain(` height="${Math.round((PHOTO_WIDTH * photo.height) / photo.width)}"`)
      expect(img).toMatch(/ alt="[^"]{20,}"/)
      expect(img).toMatch(/style="display:block;[^"]*border:0;border-radius:14px;/)
      expect(img).toContain(' border="0"')
    }
    // No photo sits above the one gold button, so none moves it down a phone's first screen.
    expect(tip.html.indexOf('<img ')).toBeGreaterThan(tip.html.indexOf(PRIMARY_MARK))
    // The plain text carries no pictures.
    expect(tip.text).not.toMatch(/\.jpg|media\/email/)
  })

  test('every link is this site with trip tips attribution, the official C5 form, or the unsubscribe link', () => {
    for (const h of hrefs(tip.html)) {
      if (h === UNSUB || h === C5_URL) continue
      expect(h.startsWith(`${SITE}/`), h).toBe(true)
      expect(h).toMatch(/[?&]utm_campaign=trip_tips(&|$)/)
      expect(h).toMatch(new RegExp(`[?&]utm_content=${key}_`))
    }
  })

  test('every dollar figure is the site’s own number for this guest', () => {
    const ok = allowedDollars(key, ctx)
    for (const s of all(tip)) for (const n of dollars(s)) expect(ok.has(n), `$${n} in ${s.slice(0, 80)}`).toBe(true)
    if (!['p1_ride_costs', 'p2_tours', 'p3_before_you_land', 't1_airport_ride'].includes(key)) expect(dollars(tip.text)).toEqual([])
  })

  test('percentages: about 10% for round trips, 20% for the administration charge, and the code’s 5% for prospects only', () => {
    for (const s of all(tip)) {
      for (const m of Array.from(s.matchAll(/(\S+ )?(\d+)%/g))) {
        const pct = Number(m[2])
        if (pct === 10) expect(m[1]).toBe('about ')
        else if (pct === 20) expect(key).toBe('p4_booking_rules')
        else if (pct === POPUP_PERCENT) expect(booked).toBe(false)
        else throw new Error(`unexpected ${m[0]}`)
      }
    }
  })

  test('JAMAICA5 only for people who have not booked, and only as the popup states it', () => {
    const line = `${POPUP_CODE} takes ${POPUP_PERCENT}% off your first ride or tour, once per email.`
    for (const s of [tip.text, visible(tip.html)]) {
      if (booked) {
        expect(s).not.toContain(POPUP_CODE)
        expect(s).not.toMatch(/% off/)
      } else {
        expect(s).toContain(line)
        expect(s.split(POPUP_CODE).length - 1).toBe(1)
      }
    }
  })

  if (TIP_TRACK[key] === 'RIDE') {
    test('the RIDE track never pitches a tour', () => {
      for (const s of [...all(tip), ...hrefs(tip.html)]) {
        const t = s.replace(/MAPL Tours/g, '')
        expect(t).not.toMatch(/\btours?\b/i)
        expect(t).not.toMatch(/\/explore|\/experience|day off the resort|rafting|Rick.s|Dunn.s/i)
      }
    })
  }

  if (booked) {
    test('a booked guest’s button opens their booking, or prices the ride they have not booked', () => {
      const pill = tip.html.slice(tip.html.indexOf(PRIMARY_MARK))
      const href = /href="([^"]+)"/.exec(pill)![1]
      if (key === 't1_airport_ride') expect(href).toMatch(/^https:\/\/mapltours\.com\/transfers[/?]/)
      else expect(href).toMatch(/^https:\/\/mapltours\.com\/profile\?/)
    })
  }
})

describe('the numbers and names come from the site', () => {
  const pick = (key: TipKey, i = 0) => CASES.find((c) => c.key === key && c.i === i)!.tip

  test('r1: the owner’s preheader for every guest, never the date or the flight number as typed', () => {
    const r1s = CASES.filter((c) => c.key === 'r1_before_you_fly')
    expect(r1s.length).toBeGreaterThan(0)
    for (const c of r1s) {
      expect(c.tip.preheader).toBe('Your driver waits at arrivals with your name on a sign, even if your flight lands late.')
    }
  })

  test('t1: the round trip is the bold price; one way is a plain second line', () => {
    const html = pick('t1_airport_ride').html
    const rt = html.indexOf('Round trip'), ow = html.indexOf('One way')
    expect(rt).toBeGreaterThan(-1)
    expect(ow).toBeGreaterThan(rt)
    const oneWayRow = html.slice(ow, html.indexOf('</tr>', ow))
    expect(oneWayRow).not.toMatch(/<strong|<b[\s>]|font-weight:\s*(600|700|bold)/)
    const roundTripValue = html.slice(rt, ow).split('</th>')[1] ?? ''
    expect(roundTripValue).toMatch(/<b[\s>]/)
  })

  test('p1: every zone and its round-trip range, nearest first, with no drive time', () => {
    const t = pick('p1_ride_costs').text
    let last = -1
    for (const r of ZONE_RANGES) {
      const line = `${ZONES[r.z].label}: ${range(r.min, r.max)}`
      expect(t).toContain(line)
      expect(t.indexOf(line)).toBeGreaterThan(last)
      last = t.indexOf(line)
    }
    expect(pick('p1_ride_costs').preheader).toContain(`$${ALL_MIN} to $${ALL_MAX} round trip`)
    expect(t).toContain('Here’s the round trip, by where you’re staying:')
    // Why the round trip, then the one fare for whoever needs only one direction.
    expect(t).toContain(`Round trips cost about 10% less than two one-ways. ${ONE_WAY_LINE}`)
    for (const z of Object.values(ZONES)) expect(t).not.toContain(noDash(z.duration.replace(/ from MBJ$/, '')))
  })

  test('p1: the round-trip ranges are the ones the live /transfers zone cards show, and the one-way line is the rate card’s cheapest fare', () => {
    // Read on mapltours.com/transfers, Sept 27 2026: Round-trip $39 to $92, $135, $114 to $167, $178 to $199, $199 to $285.
    expect(ZONE_RANGES.map((r) => range(r.min, r.max))).toEqual(['$39 to $92', '$135', '$114 to $167', '$178 to $199', '$199 to $285'])
    expect(ONE_WAY_MIN).toBe(Math.min(...DESTINATIONS.map((d) => getTransferPrice(d.id, 'one_way')!)))
    expect(ALL_MIN).toBe(Math.min(...DESTINATIONS.map((d) => getTransferPrice(d.id, 'round_trip')!)))
    expect(ALL_MAX).toBe(Math.max(...DESTINATIONS.map((d) => getTransferPrice(d.id, 'round_trip')!)))
  })

  test('p3: the helper under the button prices the round trip', () => {
    expect(pick('p3_before_you_land').text).toMatch(new RegExp(`\\nPrice my ride: \\S+\\nOne fare per vehicle for up to 4 people, \\$${ALL_MIN} to \\$${ALL_MAX} round trip\\.\\n`))
  })

  test('p1 and the t1 table: big parties ride together at the fare shown, never "pay per person"', () => {
    const line = 'Parties of 5 to 7 still ride together, and you see your party’s fare before you book. Groups of 8 or more get a custom quote with a second vehicle.'
    expect(pick('p1_ride_costs').text).toContain(line)
    for (const i of [1, 2]) expect(pick('t1_airport_ride', i).text).toContain(line)
    // Why not "pay per person": from 5 up the fare is floored at the vehicle fare, so some properties charge 5 what they charge 4.
    const same = DESTINATIONS.filter((d) => getTransferPrice(d.id, 'one_way', 5) === getTransferPrice(d.id, 'one_way', 4))
    expect(same.length).toBeGreaterThan(0)
  })

  test('p2: three tours in three towns, each with its catalogue duration and its price for the stated party', () => {
    const t = pick('p2_tours').text
    for (const id of P2_IDS) {
      const e = exp(id)
      const unit = e.pricing.mode === 'group' ? `for ${priceUnitLabel(e.pricing)}` : priceUnitLabel(e.pricing)
      expect(unit).toMatch(/for up to \d people|per person/)
      const dur = e.duration.replace(/^([A-Z])(?=[a-z])/, (x) => x.toLowerCase())
      expect(t).toContain(`${e.title.replace(/'/g, '’')} (${e.destination}, ${dur}): $${tourPrice(e.pricing, 1)} ${unit}`)
    }
    expect(new Set(P2_IDS.map((id) => exp(id).destination)).size).toBe(3)
    expect(t).toContain(`Three we’d start with, in ${exp(3).destination}, ${exp(14).destination} and ${exp(18).destination}:`)
  })

  test('p2: every price in the preheader carries its party limit', () => {
    const pre = pick('p2_tours').preheader
    const raft = exp(3)
    expect(pre).toContain(`Martha Brae rafting, $${tourPrice(raft.pricing, 1)} ${raft.pricing.mode === 'group' ? 'for ' : ''}${priceUnitLabel(raft.pricing)}`)
    for (const m of Array.from(pre.matchAll(/\$\d[\d,]*( for up to \d people| per person)?/g))) expect(m[1], m[0]).toBeTruthy()
  })

  test('the tour lead time matches the booking window: a Friday tour by the end of Wednesday', () => {
    const friday = '2026-12-04'
    expect(formatDay(friday)).toMatch(/^Friday/)
    // 23:59 on Wednesday in Jamaica is 04:59 UTC on Thursday; 00:01 on Thursday is 05:01 UTC.
    expect(isExperienceDateBookable(friday, new Date('2026-12-03T04:59:00Z'))).toBe(true)
    expect(isExperienceDateBookable(friday, new Date('2026-12-03T05:01:00Z'))).toBe(false)
    expect(pick('p2_tours').text).toContain('Book a Friday tour by the end of Wednesday: tour days count from midnight in Jamaica.')
    expect(pick('p4_booking_rules').text).toContain('How far ahead: Book a ride at least 24 hours before pickup. Tour days count from midnight in Jamaica, so book a Friday tour by the end of Wednesday.')
  })

  test('p4: the cancel window also ends when the tour or pickup begins, and the preheader names the 20% charge', () => {
    const t = pick('p4_booking_rules')
    expect(t.text).toContain('If you cancel within 48 hours of booking, and before the tour or pickup begins, we refund what you paid, less a 20% administration charge.')
    expect(t.preheader).toContain('48 hours to cancel, less a 20% charge')
  })

  test('r1: the guest’s own landing, flight, hotel, drive, party and pickup home', () => {
    const t = pick('r1_before_you_fly').text
    expect(t).toContain('Flight lands: Saturday, November 14, 1:40 pm Jamaica time, flight DL 1234')
    expect(t).toContain('To: Riu Negril')
    expect(t).toContain('Party: 2 people')
    expect(t).toContain('Flying home: Hotel pickup Saturday, November 21, 9:15 am Jamaica time')
    expect(pick('r1_before_you_fly', 1).text).toContain('Flight lands: Monday, March 1, 12:05 am Jamaica time')
  })

  test('r1 and b1: not met at arrivals? the day-of email’s own way out, not an inbox', () => {
    // r1 has just said the WhatsApp number comes by email; b1 leaves that fact to b2, so it says it here.
    expect(pick('r1_before_you_fly').text).toContain('Know who is coming. Before pickup, we email you your driver’s name, vehicle, plate and WhatsApp number.\n\nCan’t see your driver after a few minutes? Message them on WhatsApp.\n')
    expect(pick('b1_before_you_fly').text).not.toContain('Know who is coming.')
    expect(pick('b1_before_you_fly').text).toContain('Can’t see your driver after a few minutes? Message them on WhatsApp; we email you the number before pickup.')
  })

  test('t1: the exact fare for their hotel and party, or the zone table when the hotel is unknown or the party needs a quote', () => {
    const t = pick('t1_airport_ride').text
    const round = `Round trip: $${getTransferPrice('moon-palace-ocho-rios', 'round_trip', 3)} for up to 4 people, about 10% less than two one-ways\n`
    const one = `One way: $${getTransferPrice('moon-palace-ocho-rios', 'one_way', 3)}\n`
    expect(t).toContain(`${round}${one}`)
    expect(pick('t1_airport_ride').preheader).toContain(`: $${getTransferPrice('moon-palace-ocho-rios', 'round_trip', 3)} round trip for up to 4 people,`)
    expect(pick('t1_airport_ride').html).toContain('/transfers/moon-palace-ocho-rios?')
    for (const i of [1, 2]) {
      const u = pick('t1_airport_ride', i).text
      for (const r of ZONE_RANGES) expect(u).toContain(range(r.min, r.max))
    }
    expect(pick('t1_airport_ride', 1).text).toContain('booked for 2 tours, starting Tuesday, December 8')
  })

  test('t1: a tour picked up at a cruise port is not priced as the guest’s hotel', () => {
    const t = buildTip('t1_airport_ride', { ...base, track: 'TOUR', hotel: 'Falmouth Cruise Port', tours: [{ title: 'x', date: '2026-12-03', experienceId: 3, travelers: 2 }] })
    expect(t.text).not.toContain('To: Falmouth Cruise Port')
    for (const r of ZONE_RANGES) expect(t.text).toContain(range(r.min, r.max))
  })

  test('t2: pickup and drop-off are the places given at checkout, never assumed the same', () => {
    const t = pick('t2_week_before_tour').text
    expect(t).toContain('We pick you up and drop you off where you told us at checkout. It’s in your confirmation email.')
    expect(t).not.toMatch(/same place/)
  })

  test('tour days list every tour, soonest first, with the catalogue title and duration', () => {
    const t = pick('t2_week_before_tour', 1).text
    const a = t.indexOf('Tuesday, December 8: Dunn’s River Falls Climb, 2 hrs, for 2 people')
    const b = t.indexOf('Thursday, December 10: River Tubing, 1.5 hrs, for 2 people')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(pick('t2_week_before_tour', 1).subject).toBe('Your tours start Tuesday, December 8')
    expect(pick('t2_week_before_tour').subject).toBe('Your tour is on Thursday, December 3')
    // An id the catalogue no longer has keeps the booking's own title and invents no duration.
    expect(pick('t2_week_before_tour', 2).text).toContain('Saturday, December 12: A tour we no longer list, for 9 people')
  })

  test('tour day uses the confirmation email’s own lines and the terms’ weather rule', () => {
    for (const key of ['t2_week_before_tour', 'b1_before_you_fly', 'b2_week_before'] as const) {
      const t = pick(key).text
      expect(t).toContain('Your guide will reach out 24 to 48 hours before to confirm your driver and your pickup time.')
      expect(t).toContain('Bring a valid ID, reef-safe sunscreen, and water.')
    }
    expect(pick('t2_week_before_tour').text).toContain('A full refund is given only where no reschedule fits your time in Jamaica.')
    expect(pick('p4_booking_rules').text).toContain('A full refund is given only where no reschedule fits your time in Jamaica.')
  })

  test('b2: the week starts with the earlier of landing and the first tour', () => {
    expect(pick('b2_week_before').subject).toBe('Your trip starts Saturday, January 9')
    expect(pick('b2_week_before', 1).subject).toBe('Your trip starts Saturday, February 20')
    expect(pick('b2_week_before', 1).text).toContain('Blue Hole & Secret Falls on Monday, February 22, and Bob Marley Nine Mile Pilgrimage on Wednesday, February 24.')
  })

  test('the C5 line points at the official form only', () => {
    for (const key of ['p3_before_you_land', 'r2_week_before', 'b2_week_before'] as const) {
      expect(hrefs(pick(key).html)).toContain(C5_URL)
      expect(pick(key).text).toContain('The Jamaica Tourist Board suggests doing it the day before you arrive.')
    }
    expect(C5_URL).toBe('https://www.enterjamaica.gov.jm/')
  })

  test('a thin context still makes a whole email, with no empty rows or stray punctuation', () => {
    const land = { date: '2026-11-14', time: '', flight: null }
    const home = { date: '2026-11-21', time: '', flight: null }
    for (const [key, ctx] of [
      ['r1_before_you_fly', { arrival: land }],
      ['r2_week_before', { arrival: land }],
      ['b1_before_you_fly', { arrival: land }],
      ['b2_week_before', { arrival: land }],
      ['b2_week_before', { departure: home }],
      ['t1_airport_ride', {}],
      ['t2_week_before_tour', {}],
    ] as const) {
      const t = buildTip(key, { ...base, track: TIP_TRACK[key], ...ctx })
      expect(t.text, key).not.toMatch(/null|undefined|NaN|\s,|, \.|\.\./)
      expect(visible(t.html), key).not.toMatch(/null|undefined|NaN/)
    }
  })

  test('a tip that describes the landing refuses a context without one, so it can never invent a pickup at MBJ', () => {
    for (const key of NEEDS_ARRIVAL) {
      expect(() => buildTip(key, { ...base, track: TIP_TRACK[key] }), key).toThrow(/needs the arrival leg/)
      expect(() => buildTip(key, { ...base, track: TIP_TRACK[key], departure: { date: '2026-11-21', time: '09:15', flight: null } }), key).toThrow(/needs the arrival leg/)
    }
    expect(() => buildTip('b2_week_before', { ...base, track: 'BOTH' })).toThrow(/needs a ride leg/)
  })

  test('b2 with only the ride home describes that ride, never a pickup at MBJ', () => {
    const t = buildTip('b2_week_before', FIXTURES.BOTH[2])
    expect(t.text).toContain('[done] Ride booked. From Couples Negril to Sangster (MBJ), hotel pickup Thursday, November 12, 9:15 am Jamaica time.')
    expect(t.text).toContain('before your hotel pickup')
    for (const s of [t.text, t.subject, t.preheader]) {
      expect(s).not.toMatch(/From Sangster|Landing|Flying home|airport pickup|C5/)
    }
    expect(t.subject).toBe('Your tour is on Sunday, November 8')
    expect(t.text).toContain('Sam, here’s your trip at a glance, and what happens next.')
  })

  test('b2 with only the ride home lists the tour before the ride and tour day before the driver, in the order they happen', () => {
    const t = buildTip('b2_week_before', FIXTURES.BOTH[2]).text
    const at = (s: string) => {
      const i = t.indexOf(s)
      expect(i, s).toBeGreaterThan(-1)
      return i
    }
    expect(at('[done] Tour booked.')).toBeLessThan(at('[done] Ride booked.'))
    expect(at('1. Tour day.')).toBeLessThan(at('2. Your driver’s details.'))
    // A ride home before the tour (an odd trip, but possible) keeps the ride first.
    const early = buildTip('b2_week_before', { ...FIXTURES.BOTH[2], departure: { date: '2026-11-05', time: '09:15', flight: null } }).text
    expect(early.indexOf('[done] Ride booked.')).toBeLessThan(early.indexOf('[done] Tour booked.'))
  })

  test('b2: two tours join with ", and", three or more with semicolons, so the dates never run together', () => {
    const three = buildTip('b2_week_before', {
      ...FIXTURES.BOTH[1],
      tours: [...FIXTURES.BOTH[1].tours!, { title: 'River Tubing', date: '2027-02-25', experienceId: 13, travelers: 4 }],
    }).text
    expect(three).toContain('Blue Hole & Secret Falls on Monday, February 22; Bob Marley Nine Mile Pilgrimage on Wednesday, February 24; and River Tubing on Thursday, February 25.')
  })

  test('planned and built together: a ride home plus a tour gets b2 about the ride home', () => {
    const email = 'sam@example.org'
    const d = planPerson({
      email,
      joinedAtMs: null,
      ledger: [],
      bookings: [
        rideBooking({ email, departure: '2026-11-12T09:15', hotel: 'Couples Negril', paidAt: '2026-10-01T00:00:00Z' }),
        tourBooking({ email, dates: ['2026-11-08'], experienceId: 14, paidAt: '2026-10-01T00:00:00Z' }),
      ],
    }, Date.parse('2026-11-01T14:00:00Z'))
    expect(d).toMatchObject({ send: true, key: 'b2_week_before', track: 'BOTH' })
    if (!d.send) return
    const t = buildTip(d.key, { ...d.facts, track: d.track, ...base })
    expect(t.text).not.toMatch(/From Sangster|Landing|Flying home/)
    expect(t.text).toContain('From Couples Negril to Sangster (MBJ), hotel pickup Thursday, November 12, 9:15 am Jamaica time.')
  })
})

describe('t1: the ride fare reads true for every party size', () => {
  const MOON = DESTINATIONS.find((d) => d.id === 'moon-palace-ocho-rios')!
  const t1For = (passengers: number | null) =>
    buildTip('t1_airport_ride', { ...base, track: 'TOUR', firstName: 'Priya', hotel: MOON.name, passengers, tours: [{ title: 'x', date: '2026-12-03', experienceId: 18, travelers: passengers }] })

  test('"for up to 4 people" is true: 1 to 4 people pay one fare at every rate-card property, both ways', () => {
    for (const d of DESTINATIONS) {
      for (const trip of ['one_way', 'round_trip'] as const) {
        const one = getTransferPrice(d.id, trip, 1)
        for (const n of [2, 3, 4]) expect(getTransferPrice(d.id, trip, n), `${d.id} ${trip} ${n}`).toBe(one)
      }
    }
  })

  test('1 to 4 people, or a party we do not know: the round trip is "for up to 4 people", never an invented party size', () => {
    for (const n of [1, 2, 3, 4, null]) {
      const t = t1For(n)
      const rt = getTransferPrice(MOON.id, 'round_trip', n ?? 1)
      const ow = getTransferPrice(MOON.id, 'one_way', n ?? 1)
      expect(t.text, String(n)).toContain(`Round trip: $${rt} for up to 4 people, about 10% less than two one-ways\nOne way: $${ow}\n`)
      expect(t.preheader, String(n)).toContain(`$${rt} round trip for up to 4 people`)
      expect(t.text, String(n)).not.toMatch(/for \d people/)
    }
  })

  test('5 to 7 people: the round trip names the party, and the helper says they share one vehicle, never "up to 4"', () => {
    for (const n of [5, 6, 7]) {
      const t = t1For(n)
      const rt = getTransferPrice(MOON.id, 'round_trip', n)
      expect(t.text).toContain(`Round trip: $${rt} for ${n} people, about 10% less than two one-ways\nOne way: $${getTransferPrice(MOON.id, 'one_way', n)}\n`)
      expect(t.text).toContain(`All ${n} of you ride together in one private vehicle.`)
      expect(t.preheader).toContain(`$${rt} round trip for ${n} people`)
      for (const s of [t.text, t.preheader]) expect(s, String(n)).not.toMatch(/up to 4|1 to 4/)
    }
  })

  test('8 or more: the 1 to 4 zone fares, the quote a second vehicle needs, and the way to ask for it', () => {
    for (const n of [8, 12]) {
      const t = t1For(n)
      expect(t.text).toContain('here’s what a round trip costs for 1 to 4 people, by where you’re staying.')
      expect(t.text).toContain('Groups of 8 or more get a custom quote with a second vehicle.')
      expect(t.text).toContain(`For ${n} of you, reply with your hotel and your dates, and one of us will quote the ride within 24 hours.`)
      expect(t.preheader).not.toMatch(/up to 4|\$/)
    }
  })

  test('the ride is asked about, never presented as booked', () => {
    for (const n of [3, 6, 9, null]) {
      const t = t1For(n)
      expect(t.subject).toBe('Getting from MBJ to your hotel')
      expect(t.text).toContain('If you still need a ride from Sangster (MBJ)')
      expect(t.text).not.toMatch(/ride is booked|your ride from the airport/i)
    }
  })
})

describe('every ride fare leads with the round trip (owner, Sept 27 2026: "it should market the round trip")', () => {
  const pick = (key: TipKey, i = 0) => CASES.find((c) => c.key === key && c.i === i)!.tip
  const MOON = DESTINATIONS.find((d) => d.id === 'moon-palace-ocho-rios')!
  /** Every tip the fixtures render, plus t1 for every party size, a cruise-port pickup and a bare context. */
  const t1 = (ctx: Partial<TipContext>): BuiltTip => buildTip('t1_airport_ride', { ...base, track: 'TOUR', ...ctx })
  const TIPS: Array<[string, TipKey, BuiltTip]> = [
    ...CASES.map((c): [string, TipKey, BuiltTip] => [name(c), c.key, c.tip]),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 12, null].map((n): [string, TipKey, BuiltTip] => [
      `t1 ${MOON.name} x${n}`,
      't1_airport_ride',
      t1({ hotel: MOON.name, passengers: n, tours: [{ title: 'x', date: '2026-12-03', experienceId: 18, travelers: n }] }),
    ]),
    ['t1 cruise port', 't1_airport_ride', t1({ hotel: 'Falmouth Cruise Port', tours: [{ title: 'x', date: '2026-12-03', experienceId: 3, travelers: 2 }] })],
    ['t1 bare', 't1_airport_ride', t1({})],
  ]
  /** The zone table's header and values as the HTML shows them. */
  const zoneTable = (html: string) => ({
    head: /<th scope="col" align="right"[^>]*>([^<]*)<\/th>/.exec(html)?.[1],
    values: Array.from(html.matchAll(/<td align="right" valign="top" style="[^"]*">([^<]*)/g)).map((m) => m[1]),
  })
  /** The paragraph right after the headline: the lede. */
  const lede = (t: BuiltTip) => {
    const blocks = t.text.split('\n\n')
    const h1 = /<h1 [^>]*>([^<]*)<\/h1>/.exec(t.html)![1].replace(/&nbsp;/g, ' ')
    expect(blocks.indexOf(h1), h1).toBeGreaterThan(0)
    return blocks[blocks.indexOf(h1) + 1]
  }

  test('p1’s table, and t1’s when it shows one, is the round trip: its header and every zonePriceRange round-trip range, nearest first', () => {
    const want = ZONE_RANGES.map((r) => range(r.min, r.max))
    for (const t of [pick('p1_ride_costs'), pick('t1_airport_ride', 1), pick('t1_airport_ride', 2)]) {
      expect(zoneTable(t.html)).toEqual({ head: 'Round trip', values: want })
      expect(t.html).not.toMatch(/>One way</)
    }
  })

  test('every preheader and lede that states a ride fare states the round trip, and states it first', () => {
    let priced = 0
    for (const [label, key, t] of TIPS) {
      // p2's one price is a tour's, with its party limit; every other preheader price is a ride's.
      if (key !== 'p2_tours' && /\$\d/.test(t.preheader)) {
        priced++
        expect(t.preheader, label).toMatch(/\$\d[\d,]*( to \$\d[\d,]*)? round trip\b/)
        expect(t.preheader, label).not.toMatch(/one way/i)
      }
      // The first direction any version names is the round trip: a one-way
      // fare only ever follows it (the preheader leads the HTML's visible words).
      for (const s of [t.preheader, lede(t), t.text, visible(t.html)]) {
        const first = /round trip|one[ -]way/i.exec(s)
        if (first) expect(first[0].toLowerCase(), `${label}: ${s.slice(0, 120)}`).toBe('round trip')
      }
    }
    // The preheaders that price a ride: p1's two fixtures, and t1 at a known hotel (the Priya fixture, parties of 1 to 7, and a party we do not know).
    expect(priced).toBe(2 + 1 + 8)
    expect(pick('p2_tours').preheader).not.toMatch(/round trip|one[ -]way/i)
    expect(lede(pick('p1_ride_costs'))).toMatch(/Here’s the round trip, by where you’re staying:$/)
    for (const i of [1, 2]) expect(lede(pick('t1_airport_ride', i))).toMatch(/here’s what a round trip costs for 1 to 4 people, by where you’re staying\.$/)
  })

  test('the one-way fare is second everywhere a tip gives one: under a zone table, and under the round trip at a known hotel', () => {
    for (const [label, , t] of TIPS) {
      for (const m of Array.from(t.text.matchAll(/one way\b/gi))) {
        expect(t.text.slice(0, m.index).toLowerCase(), label).toContain('round trip')
      }
    }
    for (const t of [pick('p1_ride_costs'), pick('t1_airport_ride', 1)]) {
      expect(t.text).toContain(`Round trips cost about 10% less than two one-ways. ${ONE_WAY_LINE} Parties of 5 to 7`)
    }
    expect(pick('p3_before_you_land').text).not.toMatch(/one way/i)
  })

  test('written one way: "round trip", never "round-trip"', () => {
    for (const [label, , t] of TIPS) for (const s of all(t)) expect(s, label).not.toMatch(/round-trip/i)
  })

  test('"about 10% less than two one-ways" holds at every property, for every party the site prices online', () => {
    for (const d of DESTINATIONS) {
      for (let n = 1; n <= MAX_TRANSFER_PASSENGERS; n++) {
        const ow = getTransferPrice(d.id, 'one_way', n)!
        const rt = getTransferPrice(d.id, 'round_trip', n)!
        const saving = 1 - rt / (2 * ow)
        // Measured Sept 27 2026: 8.9% to 11.8%. Within 2 points of 10% is "about 10%".
        expect(Math.abs(saving - 0.1), `${d.id} x${n}: $${rt} against 2 x $${ow}`).toBeLessThanOrEqual(0.02)
      }
    }
  })
})

describe('the ten tips read as one series', () => {
  test('every tip promises the same reply in the same words, once, and ends on it: no sign-off', () => {
    expect(REPLY_PROMISE).toBe('one of us will write back within 24 hours.')
    expect(REPLY_HTML.replace(/&nbsp;/g, ' ')).toBe(REPLY_PROMISE)
    for (const c of CASES) {
      for (const s of [c.tip.text, visible(c.tip.html)]) {
        expect(s.split(REPLY_PROMISE).length - 1, name(c)).toBe(1)
        expect(s, name(c)).not.toMatch(/a person here|writes back|answers within/)
        // The owner removed "Walk good." on Sept 27 2026 and asked for no replacement.
        expect(s, name(c)).not.toMatch(/walk good|see you soon|cheers|irie|one love|best wishes|regards/i)
      }
      // The reply line is the last thing the email says before the footer, in
      // both versions. Only t1 shows anything after it: its one photo, so the
      // first screen holds only the fare and the button.
      expect(c.tip.text, name(c)).toContain(`${REPLY_PROMISE}\n\nYou asked MAPL Tours Jamaica`)
      const beforeRule = c.tip.html.slice(0, c.tip.html.indexOf('<hr '))
      expect(beforeRule, name(c)).toContain(`${REPLY_HTML}</p>`)
      const tail = beforeRule.slice(beforeRule.lastIndexOf(`${REPLY_HTML}</p>`) + `${REPLY_HTML}</p>`.length)
      if (c.key === 't1_airport_ride') expect(tail, name(c)).toMatch(/^\n<a class="tl" href="[^"]*"[^>]*><img [^>]*><\/a>\n$/)
      else expect(tail.trim(), name(c)).toBe('')
    }
  })

  test('every booked tip greets the guest by name before the facts, and only t1 says "booked" again under the eyebrow', () => {
    for (const c of CASES.filter((x) => TIP_TRACK[x.key] !== 'PROSPECT')) {
      // The text version runs: brand, eyebrow, headline, lede, then the facts.
      const [, eyebrow, , lede] = c.tip.text.split('\n\n')
      expect(eyebrow, name(c)).toMatch(/ BOOKED$/)
      if (c.ctx.firstName) expect(lede.startsWith(`${c.ctx.firstName}, `), `${name(c)}: ${lede}`).toBe(true)
      if (c.key !== 't1_airport_ride') expect(lede, name(c)).not.toMatch(/\bbooked\b/)
    }
  })

  test('p2 names its three tours by what the catalogue calls them', () => {
    const t = buildTip('p2_tours', FIXTURES.PROSPECT[0])
    const [raft, ricks, dunns] = P2_IDS.map((id) => exp(id).title.replace(/'/g, '’'))
    // The subject's river, cliffs and falls.
    expect(t.subject).toBe('A day off the resort: river, cliffs and falls')
    expect(raft).toMatch(/Rafting on the Martha Brae/)
    expect(ricks).toMatch(/Cliff Diving/)
    expect(dunns).toMatch(/^Dunn’s River/)
    // The preheader's names and its one "sunset" come from the same titles.
    for (const name of ['Rick’s Cafe', 'Dunn’s River']) expect([ricks, dunns].some((x) => x.startsWith(name)), name).toBe(true)
    expect(ricks).toMatch(/Sunset/)
    expect(t.preheader).toContain('sunset at Rick’s Cafe, and Dunn’s River')
  })
})

describe('photos: from the site, email-safe, and of what the email is about', () => {
  const DIR = join(__dirname, '../../public/media/email/tips')
  const pick = (key: TipKey, i = 0) => CASES.find((c) => c.key === key && c.i === i)!.tip
  const files = (t: BuiltTip) => Array.from(t.html.matchAll(/<img src="[^"]*\/([a-z-]+\.jpg)"/g)).map((m) => m[1])
  const alts = (t: BuiltTip) => Array.from(t.html.matchAll(/<img [^>]*alt="([^"]*)"/g)).map((m) => m[1])

  /** Width, height and whether it is progressive, from the JPEG's frame header. */
  function jpeg(buf: Buffer): { width: number; height: number; progressive: boolean } {
    expect(buf.readUInt16BE(0)).toBe(0xffd8)
    let i = 2
    while (i + 9 < buf.length) {
      expect(buf[i]).toBe(0xff)
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), progressive: marker === 0xc2 }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
    throw new Error('no frame header')
  }

  test('every photo is a file in public/media/email/tips: a progressive JPEG, 2:1, at most 1200 wide, 100 KB or less (the coast road about 90), the size PHOTOS declares', () => {
    expect(TIPS_MEDIA_BASE).toBe('https://mapltours.com/media/email/tips/')
    for (const [name, p] of Object.entries(PHOTOS)) {
      const buf = readFileSync(join(DIR, p.file))
      const f = jpeg(buf)
      expect(f, name).toEqual({ width: p.width, height: p.height, progressive: true })
      expect(p.width, name).toBeLessThanOrEqual(1200)
      expect(Math.abs(p.width / 2 - p.height), name).toBeLessThanOrEqual(1)
      expect(buf.length, name).toBeLessThanOrEqual(100 * 1024)
    }
    // The coast road is in four tips (p1, r1, t1, and b1's fallback): the lightest of the full-width photos.
    expect(readFileSync(join(DIR, PHOTOS.coastRoad.file)).length).toBeLessThanOrEqual(90 * 1024)
    expect(PHOTOS.coastRoad.width).toBeGreaterThanOrEqual(2 * PHOTO_WIDTH)
    // Nothing in the folder that no tip uses.
    expect(readdirSync(DIR).sort()).toEqual(Object.values(PHOTOS).map((p) => p.file).sort())
  })

  test('alt text follows the copy rules and names no place the site does not', () => {
    for (const p of Object.values(PHOTOS)) {
      expect(p.alt).not.toMatch(/[–—!]|MAPL TOURS/)
      expect(p.alt.length).toBeGreaterThanOrEqual(20)
      // Dunn's River has no photo that shows it; nothing may be called it.
      expect(p.alt).not.toMatch(/Dunn/)
    }
  })

  test('every catalogue tour has its photo chosen; a tour with none, or unknown, gets the general one', () => {
    for (const e of experiences) expect(e.id in TOUR_PHOTOS, `${e.id} ${e.title}: choose its photo in TOUR_PHOTOS`).toBe(true)
    // Only Dunn's River Falls Climb has none of its own.
    expect(experiences.filter((e) => TOUR_PHOTOS[e.id] === null).map((e) => e.id)).toEqual([1])
    expect(tourPhoto(999)).toBeNull()
    expect(tourPhoto(null)).toBeNull()
    expect(toursPhoto([{ experienceId: 999 }])).toBe(PHOTOS[TOUR_FALLBACK])
    expect(toursPhoto([])).toBe(PHOTOS[TOUR_FALLBACK])
    // The soonest tour with a photo of its own: Dunn's River Falls Climb then River Tubing shows the tubing.
    expect(toursPhoto([{ experienceId: 1 }, { experienceId: 13 }])).toBe(PHOTOS.riverTubing)
    // The listing images that do not show their tour are not used.
    expect(TOUR_PHOTOS[18]).toBe('blueHole')
    expect(TOUR_PHOTOS[16]).toBe(TOUR_PHOTOS[13])
    expect(TOUR_PHOTOS[21]).toBe(TOUR_PHOTOS[3])
    // Zipline + ATV shows the ATV Off-Road it includes (Collins's buggies), not its listing's stock desert ATV.
    expect(exp(19).includes).toContain(6)
    expect(TOUR_PHOTOS[19]).toBe(TOUR_PHOTOS[6])
  })

  test('the alts say only what the frame shows', () => {
    // One boat shows at Rick's from above, cut off by the edge: the cove, not "boats".
    expect(PHOTOS.ricksCafeCove.alt).toBe('Rick’s Cafe from above: red umbrellas over the terrace, and the cove below')
    // Nothing in the ATV frame says who the man beside the buggies is.
    expect(PHOTOS.atv.alt).not.toMatch(/guide/i)
    // The jet skis by the same rule: two people stand beside them, one per ski, and nothing says who they are.
    expect(PHOTOS.jetSki.alt).not.toMatch(/guide/i)
    expect(PHOTOS.jetSki.alt).toContain('two people standing in the water')
  })

  test('the ride and arrivals emails show the ride', () => {
    const ride = [PHOTOS.coastRoad.file, PHOTOS.shoreRoad.file]
    for (const c of CASES.filter((x) => ['p1_ride_costs', 'p3_before_you_land', 'r1_before_you_fly', 'r2_week_before', 't1_airport_ride'].includes(x.key))) {
      expect(files(c.tip), name(c)).toHaveLength(1)
      expect(ride, name(c)).toContain(files(c.tip)[0])
    }
    // The same guest gets r1 and r2: two different shots.
    expect(files(pick('r1_before_you_fly'))).not.toEqual(files(pick('r2_week_before')))
    expect(files(pick('p1_ride_costs'))).not.toEqual(files(pick('p3_before_you_land')))
  })

  test('a booked tour email shows THAT tour: t2, b2 and b1 the soonest tour with a photo, or the general one', () => {
    for (const c of CASES.filter((x) => ['t2_week_before_tour', 'b2_week_before', 'b1_before_you_fly'].includes(x.key))) {
      const soonest = [...(c.ctx.tours ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))
      const own = soonest.map((t) => tourPhoto(t.experienceId)).find((p) => p)
      expect(files(c.tip), name(c)).toEqual([(own ?? PHOTOS[TOUR_FALLBACK]).file])
    }
    // Every catalogue tour, in t2.
    for (const e of experiences) {
      const t = buildTip('t2_week_before_tour', { ...base, track: 'TOUR', tours: [{ title: e.title, date: '2026-12-03', experienceId: e.id, travelers: 2 }] })
      expect(files(t), `${e.id}`).toEqual([(tourPhoto(e.id) ?? PHOTOS[TOUR_FALLBACK]).file])
    }
    // Sam's two tours: Dunn's River Falls Climb (no photo of its own) first, so River Tubing's photo.
    expect(files(pick('t2_week_before_tour', 1))).toEqual([PHOTOS.riverTubing.file])
    // A tour the catalogue no longer lists: the general photo.
    expect(files(pick('t2_week_before_tour', 2))).toEqual([PHOTOS[TOUR_FALLBACK].file])
  })

  test('p2 shows the raft it leads with, p4 a tour to choose; a linked photo says where it goes', () => {
    expect(files(pick('p2_tours'))).toEqual([PHOTOS.marthaBraeRaft.file])
    expect(files(pick('p4_booking_rules'))).toEqual([PHOTOS.ricksCafeSunset.file])
    for (const c of CASES) {
      for (const m of Array.from(c.tip.html.matchAll(/<a class="tl" href="([^"]*)"[^>]*><img [^>]*alt="([^"]*)"/g))) {
        const pill = c.tip.html.slice(c.tip.html.indexOf(PRIMARY_MARK))
        const button = /href="([^"]+)"/.exec(pill)![1]
        // Same page as the button, its own utm_content.
        expect(m[1].split('?')[0], name(c)).toBe(button.split('?')[0])
        expect(m[1], name(c)).toMatch(/utm_content=[a-z0-9_]+_photo$/)
        expect(m[2], name(c)).toMatch(/^(Price my ride|Choose my tour)\. /)
      }
      // Booked emails that open the booking do not link their photos.
      if (/\/profile\?/.test(/href="([^"]+)"/.exec(c.tip.html.slice(c.tip.html.indexOf(PRIMARY_MARK)))![1])) {
        expect(c.tip.html, name(c)).not.toMatch(/<a [^>]*><img /)
      }
      for (const alt of alts(c.tip)) expect(alt).not.toMatch(/[–—!]/)
    }
  })

  describe('where each photo sits', () => {
    /** Where the gold pill's table ends: the helper lines, if any, come next. */
    const afterPill = (html: string) => html.indexOf('</table>', html.indexOf(PRIMARY_MARK)) + '</table>'.length
    const at = (html: string, s: string) => {
      const i = html.indexOf(s)
      expect(i, s).toBeGreaterThan(-1)
      return i
    }
    const land = { date: '2027-01-09', time: '11:05', flight: 'AA 0987' }

    test('b1: exactly ONE photo for every catalogue tour, an unknown id and no tour; the tour’s own under "Tour day", else the coast road in that same place', () => {
      const ctxs: Array<[string, TipContext]> = [
        ...[...experiences.map((e) => e.id), 999, null].map((id): [string, TipContext] => [
          String(id),
          { ...base, track: 'BOTH', hotel: 'Couples Negril', arrival: land, tours: [{ title: 'A tour', date: '2027-01-11', experienceId: id, travelers: 2 }] },
        ]),
        ['no tour', { ...base, track: 'BOTH', hotel: 'Couples Negril', arrival: land, tours: [] }],
        ...CASES.filter((c) => c.key === 'b1_before_you_fly').map((c): [string, TipContext] => [name(c), c.ctx]),
      ]
      for (const [label, ctx] of ctxs) {
        const t = buildTip('b1_before_you_fly', ctx)
        const own = [...(ctx.tours ?? [])].sort((x, y) => (x.date < y.date ? -1 : 1)).map((x) => tourPhoto(x.experienceId)).find((p) => p)
        expect(files(t), label).toEqual([(own ?? PHOTOS[TOUR_FALLBACK]).file])
        // Under "Tour day", before its first line.
        const img = at(t.html, '<img ')
        expect(img, label).toBeGreaterThan(at(t.html, '>Tour&nbsp;day</h2>'))
        expect(img, label).toBeLessThan(at(t.html, '>Before the day.</b>'))
        // Nothing directly under the button: its helper, then "When you land".
        const next = t.html.slice(afterPill(t.html), t.html.indexOf('<h2'))
        expect(next, label).toMatch(/^<p [^>]*>Flight changed\? [^<]*<\/p>\n$/)
        expect(t.html.slice(t.html.indexOf('<h2')), label).toMatch(/^<h2 [^>]*>When you&nbsp;land<\/h2>/)
      }
    })

    test('r1: the ride photo heads "When you land", never between the booking and that heading', () => {
      for (const c of CASES.filter((x) => x.key === 'r1_before_you_fly')) {
        const h = c.tip.html
        expect(h.slice(afterPill(h), h.indexOf('<h2')), name(c)).toMatch(/^<p [^>]*>Flight changed\? [^<]*<\/p>\n$/)
        const img = at(h, '<img ')
        expect(img, name(c)).toBeGreaterThan(at(h, '>When you&nbsp;land</h2>'))
        expect(img, name(c)).toBeLessThan(at(h, '>Look for your name.</b>'))
      }
    })

    test('t1: the photo sits below the reply line, so the first screen holds only the fare and the button', () => {
      const MOON = 'Moon Palace Jamaica, Ocho Rios'
      const variants: TipContext[] = [
        ...CASES.filter((c) => c.key === 't1_airport_ride').map((c) => c.ctx),
        ...[1, 3, 6, 9, null].map((n): TipContext => ({ ...base, track: 'TOUR', hotel: MOON, passengers: n, tours: [{ title: 'x', date: '2026-12-03', experienceId: 18, travelers: n }] })),
        { ...base, track: 'TOUR' },
      ]
      for (const ctx of variants) {
        const t = buildTip('t1_airport_ride', ctx)
        const label = `${ctx.hotel ?? 'no hotel'} ${ctx.passengers ?? ''}`
        expect(files(t), label).toEqual([PHOTOS.coastRoad.file])
        const reply = at(t.html, REPLY_HTML)
        expect(at(t.html, '<img '), label).toBeGreaterThan(reply)
        // Between the button and the reply line: its helper lines and nothing else.
        expect(t.html.slice(afterPill(t.html), reply), label).toMatch(/^(<p [^>]*>[^<]*<\/p>)+\n<p [^>]*>Anything else\? Just reply, and $/)
      }
    })

    test('t2: "Plans changed? Just reply." is back under the button, said once, and the email still ends on the booked reply line', () => {
      for (const c of CASES.filter((x) => x.key === 't2_week_before_tour')) {
        const h = c.tip.html
        expect(h.slice(afterPill(h)), name(c)).toMatch(/^<p [^>]*>Plans changed\? Just reply\.<\/p>\n/)
        expect(c.tip.text, name(c)).toMatch(/View my booking: \S+\nPlans changed\? Just reply\.\n/)
        for (const s of [c.tip.text, visible(h)]) {
          expect(s.split('Plans changed?').length - 1, name(c)).toBe(1)
          expect(s, name(c)).toContain(`Anything else? Just reply, and ${REPLY_PROMISE}`)
        }
      }
    })

    test('a photo before a new question leaves 32px (t2, p2, p4); every other photo 16px', () => {
      for (const c of CASES) {
        const found = Array.from(c.tip.html.matchAll(/<img [^>]*margin:16px 0 (\d+)px;[^>]*>(<\/a>)?\n(.{0,160})/g))
        expect(found.length, name(c)).toBe(files(c.tip).length)
        for (const m of found) {
          const question = /^<p [^>]*margin-bottom:4px;">(Need|Know)/.test(m[3])
          expect(Number(m[1]), `${name(c)}: ${m[3]}`).toBe(question ? 32 : 16)
        }
      }
      for (const key of ['t2_week_before_tour', 'p2_tours', 'p4_booking_rules'] as const) expect(pick(key).html, key).toContain('margin:16px 0 32px;')
    })
  })
})

describe('guest data is shown as text, never as markup', () => {
  const hostile: TipContext = {
    ...base,
    track: 'BOTH',
    firstName: '<img src=x onerror=alert(1)> Ann–Marie',
    hotel: '[click](https://evil.example) **Resort**',
    arrival: { date: '2026-11-14', time: '13:40', flight: '"><script>x</script>' },
    tours: [{ title: '<b>Free</b> [tour](https://evil.example)', date: '2026-11-15', experienceId: null, travelers: 2 }],
  }
  const tip = buildTip('b1_before_you_fly', hostile)

  test('escaped in the HTML, no injected link, no dash smuggled in', () => {
    expect(tip.html).not.toMatch(/<img src=x|<script>|<b>Free<\/b>/)
    expect(tip.html).toContain('&lt;img src=x onerror=alert(1)&gt; Ann Marie')
    expect(hrefs(tip.html).some((h) => h.includes('evil.example'))).toBe(false)
    expect(tip.text).not.toMatch(/[–—]/)
    expect(tip.subject).not.toContain('<')
  })
})

describe('dates and times are calendar strings, the same in every time zone', () => {
  test('formatDay and formatTime', () => {
    expect(formatDay('2026-11-14')).toBe('Saturday, November 14')
    expect(formatDay('2028-02-29')).toBe('Tuesday, February 29')
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-01', '14/11/2026', '', null, undefined]) expect(formatDay(bad), String(bad)).toBeNull()
    expect(formatTime('13:40')).toBe('1:40 pm')
    expect(formatTime('00:05')).toBe('12:05 am')
    expect(formatTime('12:00')).toBe('12:00 pm')
    expect(formatTime('11:59')).toBe('11:59 am')
    for (const bad of ['24:00', '9:15', '12:60', '', null]) expect(formatTime(bad), String(bad)).toBeNull()
  })

  const original = process.env.TZ
  afterAll(() => {
    process.env.TZ = original
  })

  test('every fixture renders byte for byte the same under UTC, Los Angeles and Tokyo', () => {
    const render = () => CASES.map((c) => JSON.stringify(buildTip(c.key, c.ctx)))
    const outputs = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map((tz) => {
      process.env.TZ = tz
      return render()
    })
    expect(outputs[1]).toEqual(outputs[0])
    expect(outputs[2]).toEqual(outputs[0])
  })
})

describe('the visual system', () => {
  test('a number and what it counts never split across lines on a phone; the plain text keeps ordinary spaces', () => {
    for (const c of CASES) {
      // The words on screen: the hidden preheader and the title are not laid out.
      const shown = c.tip.html.replace(/<title>[\s\S]*?<\/title>|<div style="display:none[\s\S]*?<\/div>/g, ' ').replace(/<[^>]+>/g, ' ')
      expect(shown, name(c)).not.toMatch(/\d (hrs?|hours?|people|person|am|pm)\b/)
      // So the reply line never ends the email on "hours." alone.
      expect(c.tip.html, name(c)).toContain(`${REPLY_HTML}</p>`)
    }
    const raft = buildTip('t2_week_before_tour', { ...base, track: 'TOUR', tours: [{ title: 'x', date: '2026-12-05', experienceId: 3, travelers: 2 }] })
    expect(raft.html).toContain('1.5&nbsp;hrs, for 2&nbsp;people')
    expect(raft.text).toContain('1.5 hrs, for 2 people')
  })

  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
    return (x + 0.05) / (y + 0.05)
  }

  test('the gold pill label clears AA at any size, and body text on the page clears AAA', () => {
    expect(ratio('#1A1508', '#A58326')).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#2b2926', '#FAF9F7')).toBeGreaterThanOrEqual(7)
    expect(ratio('#524F49', '#FFFFFF')).toBeGreaterThanOrEqual(7)
    expect(ratio('#12563A', '#FAF9F7')).toBeGreaterThanOrEqual(7)
  })

  test('the page, the column, the type and the pill match the bio system', () => {
    const html = CASES[0].tip.html
    expect(html).toContain('background:#FAF9F7;font-family:\'DM Sans\',-apple-system,Segoe UI,Helvetica,Arial,sans-serif')
    expect(html).toContain('max-width:600px;margin:0 auto;padding:32px 20px 40px;')
    // Border-box: on a desktop the text column is the photos' 560px, so a photo ends where the boxes and the rule end.
    expect(html).toContain('padding:32px 20px 40px;box-sizing:border-box;')
    expect(PHOTO_WIDTH).toBe(600 - 2 * 20)
    expect(html).toContain('font-size:26px;line-height:1.15')
    expect(html).toContain('font-size:16px;line-height:1.6;color:#2b2926;')
    expect(html).toContain('max-width:320px')
    expect(html).toContain('<meta name="color-scheme" content="light only">')
  })
})
