/**
 * Trip tips v2: the words and the markup of the ten tips (lib/trip-tips/run.ts
 * sends them, lib/trip-tips/plan.ts decides which one and when).
 *
 * buildTip(key, ctx) returns { subject, preheader, html, text }. It is pure:
 * no clock, no I/O, no environment, so the same booking renders the same
 * email in any time zone. Dates and times arrive as Jamaica wall clock
 * strings ('YYYY-MM-DD', 'HH:MM') and are only reformatted, never parsed
 * into an instant.
 *
 * VISUAL SYSTEM. Ported from the bio's code email and welcome tips
 * (bio netlify/lib/emails.mts, tip-emails.mts) as plain HTML strings: #FAF9F7
 * page, a 600px column with 32px 20px 40px padding, the DM Sans stack, a
 * 26/18/16/14px type scale on an 8px spacing grid, 16px-radius table boxes
 * with solid hex borders (Outlook drops rgba), bulletproof table pills, and
 * photos with width, height and alt. Every tip carries at least one photo
 * (owner, Sept 27 2026), an email-safe JPEG in public/media/email/tips/ cut
 * from a photo the site already shows (PHOTOS below), always AFTER the first
 * gold button so no photo moves the button down a phone's first screen.
 * One change from the bio: the gold pill's label is dark ink #1A1508 on #A58326
 * (5.09:1, AA at any size) instead of white (3.57:1), as the bio page did on
 * Sept 26. Every email has exactly ONE gold pill; anything else is a plain
 * underlined text link.
 *
 * FACTS. Every number is computed here from the site's own functions
 * (getTransferPrice / zonePriceRange / ZONES in lib/airport-transfers.ts,
 * tourPrice / priceUnitLabel / durations in lib/experiences.ts, the popup's
 * code in lib/coupon-popup.ts), never typed by hand. Every sentence of fact
 * carries its source in the comment beside it: a site page or email the
 * guest can already read, or an official Jamaican source checked on
 * 2026-09-27. Deliberately NOT stated, because the fact base marks them
 * unpublished, contradicted or unverified: anything from a tour's DRAFT
 * detail fields (about, ages, fitness, included, notIncluded, bring,
 * additionalInfo; lib/experiences.ts:250-257), tolls, driver wait limits,
 * luggage, child seats, vehicle types, tour start times, entry rules beyond
 * the C5 form, Jamaica's time zone, tipping amounts, SIM prices at MBJ,
 * drive times from MBJ (the site gives two figures for Montego Bay and for
 * Negril, map-facts C13 and C22, so no zone's time is stated),
 * whether US dollars are accepted, "inside" versus "outside" arrivals, the
 * exact day driver details arrive, whether transport is itemised, and any
 * rating, review or "most booked" claim. Every ride fare leads with the
 * round trip, as the site's route cards do ("MBJ to Negril private transfer,
 * From $199 round-trip"; owner, Sept 27 2026: "it should market the round
 * trip"), and one way comes second. The emails write it "round trip", as
 * the site does beside a price (components/transfers/FareTables.tsx:154
 * "one way $22 to $51 · round trip $39 to $92", PlacePicker.tsx:70 "$111
 * one way, $199 round trip"), always as a noun or after the price, never
 * "round-trip".
 * Round trips are "about 10% less" (the real saving runs 8.9% to 11.8%
 * across every property and every party of 1 to 7, which a test holds),
 * group prices always name their party limit, and JAMAICA5 appears only in
 * the four PROSPECT tips.
 *
 * COPY. Warm, local, short, first person plural. No em or en dashes and no
 * exclamation marks anywhere (ranges read "$22 to $51"),
 * "MAPL Tours Jamaica" in mixed case, drivers "pick you up" and "wait at
 * arrivals", never "collect". The RIDE track never mentions a tour (the
 * owner's separate tour upsell does that); the booked tracks never carry the
 * code. Headlines and CTAs follow Sentinel's improve_copy briefs per track
 * (Sept 27 2026): the answer the reader wants sits above the one button, the
 * booked tracks echo their own booking first, and the helper line under the
 * button answers the next question in true words.
 *
 * SERIES (copy edit, Sept 27 2026). Contractions throughout, except inside
 * the lines quoted from the site (GUIDE_LINE, BRING_LINE, WEATHER_LINE).
 * Every booked tip greets the guest by name before the facts; where the
 * eyebrow already says "booked", the lede does not say it again (t1's lede
 * echoes the tour they booked, as the TOUR brief asks). Every reply line
 * promises "one of us will write back within 24 hours" (REPLY_PROMISE), and
 * every email ends on that reply line: no sign-off after it (the owner
 * removed "Walk good." on Sept 27 2026). A ride fare for 1 to 4 people reads
 * "for up to 4 people"; a fare for 5 to 7 names the party and says they
 * ride together in one vehicle; 8 or more are sent to a quote.
 */
import type { TipKey, Track } from './plan'
import { DESTINATIONS, MAX_TRANSFER_PASSENGERS, ZONES, getTransferPrice, zonePriceRange, type TransferDestination, type TransferTripType, type TransferZone } from '../airport-transfers'
import { experiences, getSlug, priceUnitLabel, tourPrice, type Experience } from '../experiences'
import { POPUP_CODE, POPUP_PERCENT } from '../coupon-popup'
import { TRIP_TIPS_POSTAL_ADDRESS } from './postal'

export type { TipKey, Track }
export { TRIP_TIPS_POSTAL_ADDRESS }

/* ── Public types ───────────────────────────────────────────────────────── */

/** One transfer leg in Jamaica wall clock. For the departure leg `time` is the HOTEL PICKUP time (bookings store the pickup, not the flight). */
export interface TipLeg {
  date: string
  time: string
  flight: string | null
}

export interface TipTourLine {
  title: string
  /** The tour day, a Jamaica calendar day 'YYYY-MM-DD'. */
  date: string
  experienceId: number | null
  travelers: number | null
}

export interface TipContext {
  firstName?: string | null
  track: Track
  /** The rate-card name (lib/airport-transfers.ts DESTINATIONS[].name). */
  hotel?: string | null
  zone?: string | null
  arrival?: TipLeg | null
  departure?: TipLeg | null
  tours?: TipTourLine[]
  passengers?: number | null
  /** The signed one-click stop link for this address. Required. */
  unsubscribeUrl: string
}

export interface BuiltTip {
  subject: string
  preheader: string
  html: string
  text: string
}

/** Which track each tip belongs to. Mirrors TRACK_KEYS in plan.ts (a test holds them together). */
export const TIP_TRACK = {
  p1_ride_costs: 'PROSPECT',
  p2_tours: 'PROSPECT',
  p3_before_you_land: 'PROSPECT',
  p4_booking_rules: 'PROSPECT',
  r1_before_you_fly: 'RIDE',
  r2_week_before: 'RIDE',
  t1_airport_ride: 'TOUR',
  t2_week_before_tour: 'TOUR',
  b1_before_you_fly: 'BOTH',
  b2_week_before: 'BOTH',
} as const satisfies Record<TipKey, Track>

/* ── Links ──────────────────────────────────────────────────────────────── */

export const SITE = 'https://mapltours.com'

/** Every site link: mapltours.com, attributed to this series; `content` names the tip and the slot. */
export const siteLink = (path: string, content: string) =>
  `${SITE}${path}${path.includes('?') ? '&' : '?'}utm_source=trip_tips&utm_medium=email&utm_campaign=trip_tips&utm_content=${content}`

/**
 * Jamaica's own online C5 form. Official: the Jamaica Customs Agency
 * (https://jca.gov.jm/individual/passenger/: "Effective September 1, 2023,
 * all arriving passengers are mandated to complete and submit an Electronic
 * Passenger Declaration (C5) using the enterjamaica.gov.jm ... This service
 * is free of charge to visitors and residents") and the Jamaica Tourist
 * Board (https://www.visitjamaica.com/plan-your-adventure/getting-here/airports-in-jamaica/sangster-international-airport/:
 * "This form may be completed online at www.enterjamaica.gov.jm." and "We
 * recommend you complete the form the day before you arrive in Jamaica.").
 * Both read on 2026-09-27; www.enterjamaica.gov.jm answered 200 (PICA and
 * JCA's declaration form). Never a third-party "C5" site.
 */
export const C5_URL = 'https://www.enterjamaica.gov.jm/'

/* ── Photos ─────────────────────────────────────────────────────────────── */

/**
 * Where every tip photo is served from: public/media/email/tips/ in this
 * repo, deployed with the site. The one place to change the host.
 * scripts/trip-tips-preview.mts swaps it for the local folder so previews
 * show the files before they are deployed.
 */
export const TIPS_MEDIA_BASE = `${SITE}/media/email/tips/`

/** A photo file: its natural size (never wider than 1200) and what it shows. */
export interface TipPhoto {
  file: string
  width: number
  height: number
  /** What is in the frame, and nothing the frame does not show. No place is named unless the site names it. */
  alt: string
}

/**
 * The tip photos: email-safe JPEGs (Outlook desktop cannot show WebP), 2:1,
 * progressive, 1120 or 1200 wide (1120 is twice the 560px slot), or the
 * source's own width when it is narrower (never upscaled), each 100 KB or
 * less and the coast road, in four tips, about 90 KB (Sept 27 2026, for the
 * Sentinel scorer's weight notes: the ten that were over 100 KB are mozjpeg
 * encodes, the rest Pillow's; a test holds every file to its size).
 * Each is cut from a photo the site already serves, named beside it. The
 * owner said on Sept 27 2026: "use what we have on the site", and people in
 * photos are fine in email.
 *
 * Deliberately NOT used: public/media/img/189708.jpg (the Dunn's River + Blue
 * Hole listing image, a stock waterfall that is not Dunn's River),
 * 11035880.jpg (the Dunn's River Falls Climb listing image, a stock
 * waterfall climb nobody has shown to be Dunn's River), 4511090.jpg (the
 * Tubing + Clear Kayak listing image, people swimming in a gorge, neither
 * tubing nor kayaking), 11820457.jpg (the Bamboo Rafting + Zipline listing
 * image, rafts on an open lagoon, not the Martha Brae that package rafts),
 * 5976872.jpg (the Zipline + ATV listing image, a stock rider on an ATV in a
 * desert at dusk, dropped Sept 27 2026 for the package's own buggies),
 * and the destination tiles in public/img/dest/ that came from the
 * attractions' own sites or from Wikimedia under CC BY-SA (a licence that
 * would need a credit line in the email).
 */
export const PHOTOS = {
  // /transfers hero (lib/images.ts HERO, Pexels 14788935), the photo the bio's ride.jpg is cut from.
  coastRoad: { file: 'coast-road.jpg', width: 1120, height: 560, alt: 'A coast road seen from above, one car on it, white surf on one side and green hills on the other' },
  // The home page hero poster (public/hero-montage.webp, lib/images.ts HERO_POSTER), its lower left.
  shoreRoad: { file: 'shore-road.jpg', width: 1200, height: 600, alt: 'A road along the shore seen from the air, cars on it, fishing canoes pulled up on a white beach and clear green water' },
  // Tour listing images (lib/experiences.ts `image`). Collins's own photos: the Martha Brae (3; the bio's raft.jpg), Rick's Cafe (14), the Blue Hole (2), Rasta Safari (5), the ATVs (6), jet skis (10), Rick's from above (22).
  marthaBraeRaft: { file: 'martha-brae-raft.jpg', width: 765, height: 382, alt: 'A captain poling a bamboo raft down the Martha Brae, past the raft village umbrellas' },
  ricksCafeSunset: { file: 'ricks-cafe-sunset.jpg', width: 1200, height: 600, alt: 'Rick’s Cafe at sunset: a thatched shelter on the rocks above the sea, and a crowd along the pool' },
  blueHole: { file: 'blue-hole.jpg', width: 816, height: 408, alt: 'Guests wading across the top of a waterfall at the Blue Hole, the water spilling over the rocks' },
  rastaSafari: { file: 'rasta-safari.jpg', width: 1100, height: 550, alt: 'Two guests under the Rasta Safari sign at the entrance to the trail' },
  // No "guide": nothing in the frame says who the man beside the buggies is.
  atv: { file: 'atv.jpg', width: 1120, height: 560, alt: 'Three orange off-road buggies with riders aboard, lined up on a dirt track through green fields' },
  // Two people stand in the water, one beside each ski, and nothing in the frame says who they are: not "a guide".
  jetSki: { file: 'jet-ski.jpg', width: 1200, height: 600, alt: 'Two jet skis in the shallows off a beach, a rider on each, and two people standing in the water beside them' },
  // The cove, not "boats": one boat shows, cut off by the top edge.
  ricksCafeCove: { file: 'ricks-cafe-cove.jpg', width: 1120, height: 560, alt: 'Rick’s Cafe from above: red umbrellas over the terrace, and the cove below' },
  // Stock listing images that show the activity, not a named place (Pexels ids in the file names under public/media/img/).
  zipline: { file: 'zipline.jpg', width: 1120, height: 560, alt: 'A rider in an orange helmet on a zip line above the forest' },
  horsebackTrail: { file: 'horseback-trail.jpg', width: 1200, height: 600, alt: 'Three riders on horseback along a beach at sunset' },
  horseSwim: { file: 'horse-swim.jpg', width: 1200, height: 600, alt: 'A rider on a horse swimming through the surf' },
  parasail: { file: 'parasail.jpg', width: 1200, height: 600, alt: 'A boat crossing a reef, seen from above, with a parasail in the air' },
  kayak: { file: 'kayak.jpg', width: 1200, height: 600, alt: 'Two people paddling a kayak over clear, shallow water' },
  riverTubing: { file: 'river-tubing.jpg', width: 1120, height: 560, alt: 'Riders in helmets tubing down a rocky river' },
  nineMile: { file: 'nine-mile.jpg', width: 720, height: 360, alt: 'The 9 Miles Trading Post, Bob Marley’s face painted above its door' },
  kayaksAerial: { file: 'kayaks-aerial.jpg', width: 1120, height: 560, alt: 'Three kayaks on green water, seen from above' },
} as const satisfies Record<string, TipPhoto>
export type PhotoName = keyof typeof PHOTOS

/**
 * The photo a booked tour shows, by catalogue id: the tour's own listing
 * image, unless that image does not show the tour, then an included tour's
 * own photo (a package), or null when nothing on the site shows it. Every
 * catalogue id is listed, so a new tour fails the test until someone picks
 * its photo.
 */
export const TOUR_PHOTOS: Record<number, PhotoName | null> = {
  1: null, // Dunn's River Falls Climb: no photo on the site shows Dunn's River and is ours to send (see PHOTOS)
  2: 'blueHole',
  3: 'marthaBraeRaft',
  5: 'rastaSafari',
  6: 'atv',
  7: 'zipline',
  8: 'horsebackTrail',
  9: 'horseSwim',
  10: 'jetSki',
  11: 'parasail',
  12: 'kayak',
  13: 'riverTubing',
  14: 'ricksCafeSunset',
  15: 'nineMile',
  16: 'riverTubing', // Tubing + Clear Kayak: its listing image shows neither; River Tubing (13) is in it
  17: 'kayaksAerial',
  18: 'blueHole', // Dunn's River + Blue Hole: the listing image is not Dunn's River; the day visits the Blue Hole (2)
  19: 'atv', // Zipline + ATV: the ATV Off-Road (6) in it, Collins's own buggies, not the listing's stock ATV in a desert (5976872.jpg)
  21: 'marthaBraeRaft', // Bamboo Rafting + Zipline: the listing's rafts are not on the Martha Brae (3), which it rafts
  22: 'ricksCafeCove',
}

/** The general photo, for a tour with no photo of its own: the coast road every tour day starts on (hotel pickup). */
export const TOUR_FALLBACK: PhotoName = 'coastRoad'

/** A tour's own photo, or null when it has none (TOUR_PHOTOS null, or an id the catalogue no longer has). */
export const tourPhoto = (experienceId: number | null | undefined): TipPhoto | null => {
  const name = typeof experienceId === 'number' ? TOUR_PHOTOS[experienceId] : null
  return name ? PHOTOS[name] : null
}

/** The photo for a booking's tours, soonest first: the first tour with a photo of its own, else the general one. */
export const toursPhoto = (tours: Array<{ experienceId: number | null }>): TipPhoto =>
  tours.map((t) => tourPhoto(t.experienceId)).find((p): p is TipPhoto => p !== null) ?? PHOTOS[TOUR_FALLBACK]


/* ── Small pure helpers ─────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
/** A URL inside an href: the &s and quotes escaped, as HTML wants. */
const attr = (u: string) => u.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** Straight apostrophes to typographic ones, for display only. */
const typo = (s: string) => s.replace(/'/g, '’')

/**
 * Guest-supplied text (a first name, a hotel, a flight number) as it may be
 * shown: control characters and dashes gone, whitespace collapsed, clipped.
 * Dashes become spaces so a name like "Mary-Ann" never trips the no-dash
 * rule on an en dash typed on a phone, and hyphens stay.
 */
const clean = (s: unknown, max: number): string | null => {
  if (typeof s !== 'string') return null
  const t = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[–—]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > max ? t.slice(0, max).trim() : t
}

export const usd = (n: number) => `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

/** "$22 to $51", or "$75" when both ends match. Never a dash. */
export const usdRange = (min: number, max: number) => (min === max ? usd(min) : `${usd(min)} to ${usd(max)}`)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * 'YYYY-MM-DD' to "Saturday, November 14". Calendar arithmetic only
 * (Date.UTC on the three numbers), so the machine's time zone can never
 * move the day. Null for anything that is not a real calendar date.
 */
export function formatDay(ymd: string | null | undefined): string | null {
  if (typeof ymd !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return `${WEEKDAYS[t.getUTCDay()]}, ${MONTHS[mo - 1]} ${d}`
}

/** 'HH:MM' (24h) to "1:40 pm". Null for anything else. */
export function formatTime(hhmm: string | null | undefined): string | null {
  if (typeof hhmm !== 'string') return null
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`
}

/** A leg's "Saturday, November 14, 1:40 pm Jamaica time" (the confirmation emails label every time "Jamaica time"). */
const legWhen = (leg: TipLeg | null | undefined): string | null => {
  const day = formatDay(leg?.date)
  if (!day) return null
  const time = formatTime(leg?.time)
  return time ? `${day}, ${time} Jamaica time` : day
}

const flightOf = (leg: TipLeg | null | undefined) => {
  const f = clean(leg?.flight, 12)
  return f ? f.toUpperCase() : null
}

/** A rate-card destination by its exact name (what booking_items.hotel stores), case and space insensitive. */
export function destinationByName(name: string | null | undefined): TransferDestination | null {
  const want = clean(name, 120)?.toLowerCase()
  if (!want) return null
  return DESTINATIONS.find((d) => d.name.toLowerCase() === want) ?? null
}

/**
 * The rate-card property a guest stays at, for pricing their airport ride:
 * a destination by name, but never a cruise port (a tour picked up at the
 * port says nothing about where the guest sleeps).
 */
export function stayDestination(name: string | null | undefined): TransferDestination | null {
  const d = destinationByName(name)
  return d && !/-cruise-port$/.test(d.id) ? d : null
}

/** The fare range across every rate-card property, round trip or one way, for the "$X to $Y" lines. */
export function allFares(trip: TransferTripType): { min: number; max: number } {
  const r = (Object.keys(ZONES) as TransferZone[]).map((z) => zonePriceRange(z, trip))
  return { min: Math.min(...r.map((x) => x.min)), max: Math.max(...r.map((x) => x.max)) }
}

/** The fare for this guest's own hotel and party, when both are known and the site prices it online (1 to 7). */
export function fareFor(dest: TransferDestination | null, passengers: number | null | undefined): { pax: number; oneWay: number; roundTrip: number } | null {
  if (!dest) return null
  const pax = typeof passengers === 'number' && Number.isFinite(passengers) ? Math.round(passengers) : 2
  if (pax < 1 || pax > MAX_TRANSFER_PASSENGERS) return null
  const oneWay = getTransferPrice(dest.id, 'one_way', pax)
  const roundTrip = getTransferPrice(dest.id, 'round_trip', pax)
  return oneWay !== null && roundTrip !== null ? { pax, oneWay, roundTrip } : null
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/** A catalogue duration inside a sentence: "Half day" reads "half day"; "1.5 hrs" is left alone. */
const durIn = (d: string) => d.replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase())

/* ── Tours ──────────────────────────────────────────────────────────────── */

const byId = (id: number | null | undefined): Experience | null => (typeof id === 'number' ? experiences.find((e) => e.id === id) ?? null : null)

/** What the tour tips show for one booked tour: the catalogue's title and duration when the id is known, the booking's title otherwise. */
export interface TourShown {
  title: string
  day: string | null
  date: string
  duration: string | null
  travelers: number | null
  /** The catalogue id when the catalogue still has it (picks the photo), otherwise null. */
  experienceId: number | null
}

export function toursShown(ctx: TipContext): TourShown[] {
  const list = Array.isArray(ctx.tours) ? ctx.tours : []
  return list
    .map((t) => {
      const e = byId(t.experienceId)
      const title = e ? e.title : clean(t.title, 80)
      if (!title) return null
      const trav = typeof t.travelers === 'number' && t.travelers >= 1 ? Math.round(t.travelers) : null
      return { title: typo(title), day: formatDay(t.date), date: t.date, duration: e ? e.duration : null, travelers: trav, experienceId: e ? e.id : null }
    })
    .filter((x): x is TourShown => x !== null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * The three tours p2 shows, by catalogue id: Martha Brae (3, Falmouth),
 * Rick's Cafe (14, Negril), Dunn's River + Blue Hole (18, Ocho Rios). Three
 * towns, not "one near each resort area": Montego Bay, Lucea and the South
 * Coast have none of the three. Throws if one disappears, so a renamed tour
 * stops the build instead of mailing a dead reference.
 */
export const P2_TOUR_IDS = [3, 14, 18] as const
export function p2Tours(): Experience[] {
  return P2_TOUR_IDS.map((id) => {
    const e = byId(id)
    if (!e) throw new Error(`trip-tips: tour ${id} is no longer in lib/experiences.ts`)
    return e
  })
}

/** "$128 for up to 3 people" or "$166 per person": tourPrice for the smallest party, and the site's own unit label. */
export const tourFrom = (e: Experience) => `${usd(tourPrice(e.pricing, 1))} ${e.pricing.mode === 'group' ? 'for ' : ''}${priceUnitLabel(e.pricing)}`

/* ── Inline text: plain strings, bold runs and links, never markup parsed from data ── */

/** A run of text, a bold run, a link, or a line break (a space in the plain text). */
type Seg = string | { b: string } | { a: string; href: string } | { br: true }
type Inline = string | Seg[]
const b = (s: string): Seg => ({ b: s })
const a = (label: string, href: string): Seg => ({ a: label, href })
const br: Seg = { br: true }
/** A helper given as one Inline or as several lines. An array of plain strings is several lines; an array of segments is one line. */
const helperLines = (h: Inline | Inline[] | undefined): Inline[] =>
  h === undefined ? [] : typeof h === 'string' ? [h] : h.length > 0 && h.every((x) => typeof x === 'string' || Array.isArray(x)) ? (h as Inline[]) : [h as Inline]
/** True when an Inline ends with a link: its 44px target already adds 12px below, so the block's own bottom gap shrinks by that much. */
const endsWithLink = (x: Inline) => typeof x !== 'string' && x.length > 0 && typeof x[x.length - 1] === 'object' && 'a' in (x[x.length - 1] as object)
const segs = (x: Inline): Seg[] => (typeof x === 'string' ? [x] : x)

/**
 * Every text link: underlined #12563A (8.3:1 on the page), and a 44px tall
 * target (16px line + 12px above and below) that never wraps mid-label. The
 * `tl` class carries the hover and focus states from HEAD_STYLE.
 */
const TEXT_LINK = 'display:inline-block;padding:12px 0;color:#12563A;font-weight:700;text-decoration:underline;white-space:nowrap;'
const textLink = (href: string, label: string, style = TEXT_LINK) => `<a class="tl" href="${attr(href)}" style="${style}">${esc(label)}</a>`

/**
 * Units a phone must never split across lines: "1:40 pm", a flight number
 * such as "DL 1234", a number and what it counts ("1.5 hrs", "3 people",
 * "24 hours", so the reply line never ends on "hours." alone). HTML only;
 * the plain text keeps ordinary spaces.
 */
const keepTogether = (html: string) =>
  html
    .replace(/(\d) (am|pm)\b/g, '$1&nbsp;$2')
    .replace(/\b([A-Z0-9]{2}) (\d{1,4})\b/g, '$1&nbsp;$2')
    .replace(/(\d) (hrs?|hours?|people|person)\b/g, '$1&nbsp;$2')

const inlineHtml = (x: Inline) =>
  segs(x)
    .map((s) =>
      typeof s === 'string'
        ? keepTogether(esc(s))
        : 'br' in s
          ? '<br>'
          : 'b' in s
            ? `<b style="color:#171614;">${keepTogether(esc(s.b))}</b>`
            : textLink(s.href, s.a),
    )
    .join('')
const inlineText = (x: Inline) => segs(x).map((s) => (typeof s === 'string' ? s : 'br' in s ? ' ' : 'b' in s ? s.b : `${s.a} (${s.href})`)).join('')

/** A non-breaking space before the last word, so a 320px phone never leaves one word alone on a line. HTML only. */
const bindLast = (html: string) => html.replace(/ (\S+)$/, '&nbsp;$1')

/* ── Blocks: one list renders both the HTML and the plain text ──────────── */

type Block =
  | { t: 'eyebrow'; text: string }
  | { t: 'h1'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'p'; text: Inline }
  | { t: 'small'; text: Inline }
  /** A photo; with `href` it links there and its alt starts with `label`, the link's purpose. */
  | { t: 'photo'; photo: TipPhoto; href?: string; label?: string }
  /** helper: one line, or several short lines (one idea each) under the pill. */
  | { t: 'button'; href: string; label: string; helper?: Inline | Inline[] }
  /** A question and a standalone 44px text link under it, for the one quiet secondary action. */
  | { t: 'link'; lead: string; label: string; href: string }
  | { t: 'rows'; rows: Array<[string, Inline]> }
  | { t: 'table'; head: [string, string]; rows: Array<{ main: string; sub?: string; value: string; valueSub?: string; href?: string }> }
  | { t: 'facts'; items: Array<{ lead: string; text: Inline }> }
  | { t: 'checklist'; items: Array<{ done: boolean; lead: string; text: Inline }> }
type PhotoBlock = Extract<Block, { t: 'photo' }>

const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2926;'
const SMALL = 'margin:0 0 16px;font-size:14px;line-height:1.55;color:#524F49;'
const RULE = '<hr style="border:0;border-top:1px solid #DFDEDC;margin:32px 0 16px;">'
/**
 * The column's content width (600 less 20px each side; the column is
 * border-box, so on a desktop the text, the boxes and the photos all end at
 * the same 560px edge): the width every photo is declared at.
 */
export const PHOTO_WIDTH = 560

/** A one-cell table box: Word-engine Outlook drops padding on a div. */
const box = (cell: string, margin: string, inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:${margin};border-collapse:separate;"><tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px;${cell}">${inner}</td></tr></table>`

/** The one gold pill: dark ink on gold, 19px bold, about 55px tall, the cell carries colour and Outlook padding. */
export const PRIMARY_MARK = 'bgcolor="#A58326"'
const pill = (href: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;width:100%;max-width:320px;border-collapse:separate;"><tr><td align="center" ${PRIMARY_MARK} style="background:#A58326;border-radius:999px;mso-padding-alt:16px 24px;"><a class="pill" href="${attr(href)}" style="display:block;padding:16px 24px;color:#1A1508;font-size:19px;font-weight:700;text-decoration:none;line-height:1.2;border-radius:999px;">${esc(label)}</a></td></tr></table>`

/**
 * Interaction states, for the clients that read a head <style> (Apple Mail,
 * iOS Mail, Outlook.com, most webmail). Everything else stays inline, so a
 * client that drops this block loses only the states.
 * - Pointer: hover lightens the pill to #B99632 (ink 6.47:1, up from 5.09:1)
 *   and darkens text links to #0B3D29 with a 2px underline.
 * - Touch, where hover never fires: a pressed (:active) state lightens the
 *   pill further to #C4A13E (ink 7.37:1) and tints a text link's ground
 *   #E3EDE6 (#0B3D29 on it 10.2:1), and WebKit's tap highlight is the brand
 *   green at 18% instead of the default grey.
 * - Keyboard: every link gets a 3px #12563A focus ring (8.3:1 on the page).
 * The only motion is the 150ms colour change, off under prefers-reduced-motion.
 */
const HEAD_STYLE =
  '<style>.pill,.tl{-webkit-tap-highlight-color:rgba(18,86,58,.18)}.pill,.tl{transition:background-color .15s ease-out,color .15s ease-out}.pill:hover{background-color:#B99632 !important}.pill:active{background-color:#C4A13E !important}.pill:focus-visible,.tl:focus-visible{outline:3px solid #12563A;outline-offset:3px}.tl:hover{color:#0B3D29 !important;text-decoration-thickness:2px}.tl:active{color:#0B3D29 !important;background-color:#E3EDE6 !important}@media (prefers-reduced-motion:reduce){.pill,.tl{transition:none}}</style>'

/** One block's HTML. `next` is the block after it, for the one spacing rule that depends on it (a photo before a new question). */
function blockHtml(x: Block, next?: Block): string {
  switch (x.t) {
    case 'eyebrow':
      return `<p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#5A4A16;">${esc(x.text)}</p>`
    case 'h1':
      return `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.15;letter-spacing:-.02em;color:#171614;">${bindLast(esc(x.text))}</h1>`
    case 'h2':
      return `<h2 style="margin:32px 0 8px;font-size:18px;line-height:1.25;color:#171614;">${bindLast(esc(x.text))}</h2>`
    case 'p':
      return `<p style="${P}">${inlineHtml(x.text)}</p>`
    case 'small':
      return `<p style="${SMALL}">${inlineHtml(x.text)}</p>`
    case 'photo': {
      // Declared at the column width with the file's own ratio, so the space
      // is held before it loads and Outlook (which ignores max-width) draws
      // it at 560x280; 16px above and below, which collapses with the gap
      // under the button's helper line. Before a new question (a 'link'
      // block: p2, p4, t2) it leaves 32px, the gap every section starts
      // with, so the question reads as its own idea, not a caption.
      const { photo } = x
      const h = Math.round((PHOTO_WIDTH * photo.height) / photo.width)
      const alt = x.href && x.label ? `${x.label}. ${photo.alt}` : photo.alt
      const below = next?.t === 'link' ? 32 : 16
      const img = `<img src="${TIPS_MEDIA_BASE}${photo.file}" width="${PHOTO_WIDTH}" height="${h}" alt="${esc(alt)}" border="0" style="display:block;width:100%;max-width:${PHOTO_WIDTH}px;height:auto;aspect-ratio:${photo.width}/${photo.height};border:0;border-radius:14px;margin:16px 0 ${below}px;">`
      return x.href ? `<a class="tl" href="${attr(x.href)}" style="display:block;text-decoration:none;">${img}</a>` : img
    }
    case 'button':
      return pill(x.href, x.label) + helperLines(x.helper).map((h, i, all) => `<p style="${SMALL}${i < all.length - 1 ? 'margin-bottom:4px;' : ''}">${inlineHtml(h)}</p>`).join('')
    case 'link':
      return `<p style="${P}margin-bottom:4px;">${esc(x.lead)}<br>${textLink(x.href, x.label)}</p>`
    case 'rows':
      // Label over value: each pair is a real row header (th scope=row) and
      // its cell, stacked by display:block so a date or a long label never
      // squeezes the value on a phone. Word-engine Outlook ignores the
      // display and shows the pair side by side at 600px, where it fits; the
      // mso border keeps its row rule full width.
      return box(
        'border:1px solid #DFDEDC;padding:8px 16px;',
        '0 0 16px',
        `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">${x.rows
          .map(
            ([k, v], i) =>
              `<tr><th scope="row" align="left" valign="top" style="display:block;padding:8px 16px 0 0;font-size:14px;line-height:1.5;font-weight:700;color:#524F49;text-align:left;white-space:nowrap;${i ? 'border-top:1px solid #DFDEDC;' : ''}">${esc(k)}</th><td valign="top" style="display:block;padding:0 0 8px;font-size:16px;line-height:1.5;color:#171614;${i ? 'mso-border-top-alt:solid #DFDEDC .75pt;' : ''}">${inlineHtml(v)}</td></tr>`,
          )
          .join('')}</table>`,
      )
    case 'table': {
      const head = 'padding:8px 0;font-size:14px;line-height:1.5;font-weight:700;color:#524F49;'
      // A row with an href makes its whole name cell (title and sub-line) one
      // link: a target of 48px or more, and one tap from choosing to the page.
      const main = (r: { main: string; sub?: string; href?: string }) =>
        r.href
          ? `<a class="tl" href="${attr(r.href)}" style="display:block;color:#12563A;font-weight:700;text-decoration:underline;">${bindLast(esc(r.main))}${r.sub ? `<br><span style="font-size:14px;font-weight:400;color:#524F49;text-decoration:none;display:inline-block;">${keepTogether(esc(r.sub))}</span>` : ''}</a>`
          : `${bindLast(esc(r.main))}${r.sub ? `<br><span style="font-size:14px;color:#524F49;">${keepTogether(esc(r.sub))}</span>` : ''}`
      return box(
        'border:1px solid #DFDEDC;padding:8px 16px;',
        '0 0 16px',
        `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;"><tr><th scope="col" align="left" style="${head}text-align:left;">${esc(x.head[0])}</th><th scope="col" align="right" style="${head}padding-left:16px;white-space:nowrap;text-align:right;">${esc(x.head[1])}</th></tr>${x.rows
          .map(
            (r) =>
              `<tr><td style="padding:8px 0;font-size:16px;line-height:1.5;color:#2b2926;border-top:1px solid #DFDEDC;">${main(r)}</td><td align="right" valign="top" style="padding:8px 0 8px 16px;font-size:16px;line-height:1.5;font-weight:700;color:#171614;white-space:nowrap;text-align:right;border-top:1px solid #DFDEDC;">${esc(r.value)}${r.valueSub ? `<br><span style="font-size:14px;font-weight:400;color:#524F49;">${keepTogether(esc(r.valueSub))}</span>` : ''}</td></tr>`,
          )
          .join('')}</table>`,
      )
    }
    case 'facts':
      return x.items.map((f) => `<p style="${P}${endsWithLink(f.text) ? 'margin-bottom:4px;' : ''}"><b style="color:#171614;">${esc(f.lead)}</b> ${inlineHtml(f.text)}</p>`).join('\n')
    case 'checklist': {
      // The marks are read aloud: the tick as "Done", the numbers as they
      // are, so a screen reader hears the progress a sighted reader sees.
      // A list to assistive technology ("list, 5 items"), a two-column table
      // to every mail client: role=list/listitem on the table and rows,
      // role=none on the cells.
      let n = 0
      return `<table role="list" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 8px;border-collapse:collapse;"><tbody role="none">${x.items
        .map((c) => {
          const mark = c.done ? '<span role="img" aria-label="Done" style="color:#12563A;">✓</span>' : `<span style="color:#5A4A16;">${++n}</span>`
          const pb = endsWithLink(c.text) ? 4 : 16
          return `<tr role="listitem"><td role="none" valign="top" style="width:32px;padding:0 0 ${pb}px;font-size:16px;line-height:1.6;font-weight:700;">${mark}</td><td role="none" valign="top" style="padding:0 0 ${pb}px;font-size:16px;line-height:1.6;color:#2b2926;"><b style="color:#171614;">${esc(c.lead)}</b> ${inlineHtml(c.text)}</td></tr>`
        })
        .join('')}</tbody></table>`
    }
  }
}

function blockText(x: Block): string {
  switch (x.t) {
    case 'eyebrow':
      return x.text.toUpperCase()
    case 'h1':
    case 'h2':
      return x.text
    case 'p':
    case 'small':
      return inlineText(x.text)
    case 'photo':
      return ''
    case 'button':
      return [`${x.label}: ${x.href}`, ...helperLines(x.helper).map(inlineText)].join('\n')
    case 'link':
      return `${x.lead} ${x.label}: ${x.href}`
    case 'rows':
      return x.rows.map(([k, v]) => `${k}: ${inlineText(v)}`).join('\n')
    case 'table':
      return x.rows.map((r) => `${r.main}${r.sub ? ` (${r.sub})` : ''}: ${r.value}${r.valueSub ? ` ${r.valueSub}` : ''}${r.href ? `\n${r.href}` : ''}`).join('\n')
    case 'facts':
      return x.items.map((f) => `${f.lead} ${inlineText(f.text)}`).join('\n\n')
    case 'checklist': {
      let n = 0
      return x.items.map((c) => `${c.done ? '[done]' : `${++n}.`} ${c.lead} ${inlineText(c.text)}`).join('\n')
    }
  }
}

/** The hidden inbox preview line, padded so the client does not fill the rest with body text. */
const preheaderHtml = (t: string) =>
  `<div style="display:none;mso-hide:all;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${esc(t)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>`

interface Draft {
  subject: string
  preheader: string
  body: Block[]
  /** The closing line: the last words of every email, above the footer rule. */
  closing: Inline
  /**
   * A photo shown below the closing line (t1 only), so the fare and the
   * button lead and only the helper and the reply line follow them before
   * the photo. Photos only: the closing stays the
   * last thing the email SAYS, and the plain text (which has no photos) still
   * ends on it.
   */
  after?: PhotoBlock[]
}

function render(key: TipKey, d: Draft, unsubscribeUrl: string, postal: string | null): BuiltTip {
  const booked = TIP_TRACK[key] !== 'PROSPECT'
  // Why they get it: they asked for Jamaica trip tips (the consent label,
  // lib/trip-tips.ts TIPS_LABEL). After a booking the tips are about the
  // trip, as the privacy page now says.
  const why = booked
    ? 'You asked MAPL Tours Jamaica for Jamaica trip tips, so we send a few that fit your booking.'
    : 'You asked MAPL Tours Jamaica for Jamaica trip tips.'
  const privacy = siteLink('/privacy', `${key}_privacy`)
  const small14 = 'margin:0;font-size:14px;line-height:1.6;color:#524F49;'
  // Each line of the footer on its own: the padded 44px links sit on lines
  // of their own, so they never stretch a line of running text. The mailing
  // address line appears only when TRIP_TIPS_POSTAL_ADDRESS is set (null by
  // the owner's decision of Sept 27 2026; see lib/trip-tips/postal.ts).
  // 8px above the privacy link keeps its 44px target off the unsubscribe
  // link's, which it would otherwise touch with no address line between.
  const footer = [
    `<p style="${small14}">${esc(why)}</p>`,
    `<p style="${small14}">Changed your mind? ${textLink(unsubscribeUrl, 'Unsubscribe')}</p>`,
    ...(postal ? [`<p style="${small14}">${esc(postal)}</p>`] : []),
    `<p style="${small14}margin-top:8px;">${textLink(privacy, 'Privacy')}</p>`,
  ].join('\n')

  const title = esc(d.subject)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${title}</title>${HEAD_STYLE}</head>
<body style="margin:0;background:#FAF9F7;font-family:'DM Sans',-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#171614;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheaderHtml(d.preheader)}
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<div role="article" aria-roledescription="email" aria-label="${title}" lang="en" style="max-width:600px;margin:0 auto;padding:32px 20px 40px;box-sizing:border-box;">
<p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#5A4A16;">MAPL Tours Jamaica</p>
${d.body.map((x, i) => blockHtml(x, d.body[i + 1])).join('\n')}
<p style="${P}margin-top:32px;">${inlineHtml(d.closing)}</p>
${(d.after ?? []).map((x) => `${blockHtml(x)}\n`).join('')}${RULE}
${footer}
</div>
<!--[if mso]></td></tr></table><![endif]-->
</body></html>`

  const text = [
    'MAPL Tours Jamaica',
    ...d.body.map(blockText).filter((s) => s !== ''),
    inlineText(d.closing),
    [why, `Unsubscribe: ${unsubscribeUrl}`, ...(postal ? [postal] : []), `Privacy: ${privacy}`].join('\n'),
  ].join('\n\n')

  return { subject: d.subject, preheader: d.preheader, html, text: `${text}\n` }
}

/* ── Shared lines, each with its source ─────────────────────────────────── */

/**
 * Arrival facts for anyone with (or pricing) a ride. Sources in each line.
 * `driverDetails` false leaves out "Know who is coming" (b1, whose
 * week-before tip carries it); the booked fallback then says where the
 * driver's number comes from itself.
 */
function arrivalFacts(booked: boolean, driverDetails = true): Array<{ lead: string; text: Inline }> {
  return [
    {
      lead: 'Look for your name.',
      // lib/airport-transfers-content.ts:44 (the transfers FAQ): "After you
      // clear immigration and customs, walk through the arrivals doors. Your
      // driver will be holding a MAPL Tours Jamaica sign with your name. If
      // you do not see them within ten minutes, contact us using the details
      // in your confirmation email." Inside or outside the doors is left out
      // (the site says both, map-facts C2).
      text: 'After immigration and customs, walk through the arrivals doors. Your driver will be holding a MAPL Tours Jamaica sign with your name on it.',
    },
    {
      lead: 'Land late, still met.',
      // lib/airport-transfers-content.ts:40: "We track your flight in real
      // time ... If you land late, your driver adjusts, there is no delay
      // surcharge on any booking." TransfersView.tsx:842 "Flight tracking,
      // no surcharge if you land late". "At no extra charge" is that "no
      // delay surcharge".
      text: 'We track your flight, so a delay moves your pickup with it, at no extra charge.',
    },
    ...(driverDetails ? [{
      lead: 'Know who is coming.',
      // TransfersView.tsx:395 "Name, vehicle, plate and WhatsApp before
      // pickup.", TransfersView.tsx:427-429 "named in your email before
      // pickup" and app/safety/page.tsx:20. The exact hour is left out: the
      // site says "day before" in one place and the day-of email goes within
      // 13 hours (map-facts C3).
      text: 'Before pickup, we email you your driver’s name, vehicle, plate and WhatsApp number.',
    }] : []),
    // For a booked guest, the fallback their own day-of email gives them
    // (emails/TransferDayOf.tsx:145: "If you do not see it within a few
    // minutes, message {driver} on WhatsApp above"), with where the number
    // comes from (TransfersView.tsx:395 "Name, vehicle, plate and WhatsApp
    // before pickup"), not the FAQ's "contact us using the details in your
    // confirmation email", an inbox that answers in 24 hours. The lead names
    // who is missing, so a nervous reader never hears "are YOU not there?".
    // Last, so the facts run in the order things happen.
    ...(booked
      ? [{ lead: 'Can’t see your driver after a few minutes?', text: driverDetails ? 'Message them on WhatsApp.' : 'Message them on WhatsApp; we email you the number before pickup.' }]
      : []),
  ]
}

/** Tour-day lines, word for word from the tour confirmation email (emails/BookingConfirmed.tsx:313-317), the en dash read as "to". */
const GUIDE_LINE = 'Your guide will reach out 24 to 48 hours before to confirm your driver and your pickup time.'
const BRING_LINE = 'Bring a valid ID, reef-safe sunscreen, and water.'

/**
 * The weather rule as the terms state it (app/terms/page.tsx:61, also
 * LegalModal.tsx:238 and lib/help-faqs.ts:73), not the blogs' "refunded in
 * full or rescheduled" (map-facts C1).
 */
const WEATHER_LINE =
  'If weather or other safety conditions cancel a tour, we reschedule you at no extra cost, to another date or an experience of equal value. A full refund is given only where no reschedule fits your time in Jamaica.'

/**
 * JTB, https://www.visitjamaica.com/plan-your-adventure/getting-here/airports-in-jamaica/sangster-international-airport/
 * ("Easily exchange currency at cambios that are open during the airport's
 * operating hours.") and https://www.visitjamaica.com/plan-your-adventure/travel-tips/currency-conversion/
 * ("Here in Jamaica we use the Jamaican dollar as our currency." "Most
 * Jamaican ATMs accept international bank cards with Visa, MasterCard,
 * Cirrus and Plus logos."). Read 2026-09-27. Whether US dollars are taken
 * is left out: the official pages do not say. "Cambio" is glossed as an
 * exchange desk (JTB: "exchange currency at cambios") because most North
 * American readers have not met the word. Stated, never advised: the site's
 * own blog calls the airport rate the worst on the island.
 */
const MONEY_LINE = 'Jamaica uses the Jamaican dollar. Most ATMs take Visa and Mastercard, and the cambios (exchange desks) at Sangster (MBJ) are open during airport hours.'

/**
 * The C5 line, its link last so the 44px link ends the item instead of
 * stretching a line mid-sentence. Sources at C5_URL (JCA: "all arriving
 * passengers are mandated to complete and submit" the C5, "free of charge").
 * Every item that carries it leads with "Fill in the C5 form.", so the line
 * says what the form is and where it lives, once each.
 */
const c5Line = (): Inline => [
  'It’s Jamaica’s free immigration and customs form, for every arriving passenger. The Jamaica Tourist Board suggests doing it the day before you arrive.',
  br,
  'Find it at ',
  a('enterjamaica.gov.jm', C5_URL),
]

/** The prospect-only code line: lib/coupon-popup.ts POPUP_CODE / POPUP_PERCENT; CouponPopup.tsx:266 "5% off your first ride or tour." and :327 "Once per email". */
const codeLine = () => `${POPUP_CODE} takes ${POPUP_PERCENT}% off your first ride or tour, once per email.`

/**
 * app/safety/page.tsx:24: "Write to contact@mapltours.com and a person
 * replies within 24 hours." The tips come from and reply to that address.
 * "One of us" is that person, in the first person plural the brand speaks
 * in; every reply line in the series uses the same words, and every email
 * ends on its reply line. No sign-off follows it: the owner removed "Walk
 * good." on Sept 27 2026 and asked for no replacement.
 */
export const REPLY_PROMISE = 'one of us will write back within 24 hours.'
const PROSPECT_CLOSING: Inline = `Got a question? Reply with your resort and your dates, and ${REPLY_PROMISE}`
const BOOKED_CLOSING: Inline = `Anything else? Just reply, and ${REPLY_PROMISE}`

/**
 * Flight changes on a booked ride: the day-of email's own promise
 * (emails/TransferDayOf.tsx:150, "If anything changes with your flight or
 * your plans, reply to this email and we will let your driver know and
 * adjust the pickup for you").
 */
const FLIGHT_CHANGE = 'Flight changed? Reply with the new details and we’ll let your driver know.'

/**
 * The tour tip's reassurance under its button (t2): the helper it carried
 * before the copy edit, cut to the invitation so the 24-hour promise stays
 * the closing's alone (REPLY_PROMISE, once per email). app/safety/page.tsx:24.
 */
const PLANS_CHANGED = 'Plans changed? Just reply.'

/**
 * Round trips and big parties. TransfersView.tsx:1064 (round trip "10%
 * cheaper than two one-ways", said as "about": 8.9% to 11.8% across every
 * property and party of 1 to 7);
 * airport-transfers-content.ts:36 (5 to 7 ride together, 8 or more quoted
 * with a second vehicle). Not "pay per person": from 5 up the fare is a
 * per-head rate floored at the vehicle fare (legRate in
 * lib/airport-transfers.ts), so at 88 properties a party of 5 pays what 4
 * do. The site prices 5 to 7 online (getTransferPrice up to
 * MAX_TRANSFER_PASSENGERS), so "you see the fare" holds for every party.
 * The 8-or-more sentence is the FAQ's own ("groups of eight or more get a
 * custom quote with a second vehicle").
 */
const ROUND_TRIP_LINE = 'Round trips cost about 10% less than two one-ways.'
/**
 * For the reader who needs only one direction, under a round-trip table:
 * the cheapest one-way fare on the rate card (zonePriceRange one way; the
 * site's own "from" figure, app/transfers/page.tsx:13 "Flat rates from $22
 * per vehicle").
 */
const oneWayLine = () => `Only need one way? Fares start at ${usd(allFares('one_way').min)}.`
const GROUP_LINE = 'Parties of 5 to 7 still ride together, and you see your party’s fare before you book. Groups of 8 or more get a custom quote with a second vehicle.'

/**
 * What the driver does at MBJ, for the lines under a ride price:
 * airport-transfers-content.ts:40,44; TransfersView.tsx:841-842 "Driver
 * waits with your name at arrivals", "Flight tracking".
 */
const DRIVER_LINE = 'Your driver waits at arrivals with your name on a sign, and we track your flight.'

/**
 * Tour lead time. app/terms/page.tsx:47 says bookings close 24 hours before
 * an experience begins, and lib/booking-window.ts counts a tour day from
 * midnight in Jamaica (isExperienceDateBookable), as the help page says
 * (lib/help-faqs.ts:33 "experience days are counted from midnight in
 * Jamaica"). So a Friday tour is bookable to the end of Wednesday, not
 * "24 hours before it starts". A test holds this to isExperienceDateBookable.
 */
const TOUR_NOTICE = 'Book a Friday tour by the end of Wednesday: tour days count from midnight in Jamaica.'

/**
 * The zone fare table: ZONES in order, zonePriceRange round trip, the fares
 * the live /transfers zone cards show beside "Round-trip". No drive times
 * (see the header).
 */
function fareTable(): Block {
  return {
    t: 'table',
    head: ['Where you’re staying', 'Round trip'],
    rows: (Object.keys(ZONES) as TransferZone[]).map((z) => {
      const r = zonePriceRange(z, 'round_trip')
      return { main: ZONES[z].label, value: usdRange(r.min, r.max) }
    }),
  }
}

/** Under a zone table: why the round trip, the one-way fare for who needs it, then big parties. */
const fareNotes = () => `${ROUND_TRIP_LINE} ${oneWayLine()} ${GROUP_LINE}`

/** A photo block: linked (its alt then leads with the link's label) when the email's button goes to the same place, plain otherwise. */
const photo = (name: PhotoName | TipPhoto, link?: { href: string; label: string }): PhotoBlock => ({
  t: 'photo',
  photo: typeof name === 'string' ? PHOTOS[name] : name,
  ...(link ? { href: link.href, label: link.label } : {}),
})

const nameLead = (ctx: TipContext) => {
  const n = clean(ctx.firstName, 40)
  return n ? `${n}, ` : ''
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The booked guest's own ride, as rows: when they land, the flight, where to, the party, the pickup home. */
function rideRows(ctx: TipContext, dest: TransferDestination | null): Array<[string, Inline]> {
  const rows: Array<[string, Inline]> = []
  const landing = legWhen(ctx.arrival)
  const flight = flightOf(ctx.arrival)
  // "Flight lands": the checkout's own label for this time (OnePageTransfersCheckout.tsx:378).
  if (landing) rows.push(['Flight lands', flight ? [landing, `, flight ${flight}`] : landing])
  const hotel = dest ? dest.name : clean(ctx.hotel, 80)
  if (hotel) rows.push(['To', hotel])
  if (typeof ctx.passengers === 'number' && ctx.passengers >= 1) rows.push(['Party', people(Math.round(ctx.passengers))])
  // TransferConfirmed.tsx:181 labels this leg "Hotel pickup ... Jamaica time".
  const home = legWhen(ctx.departure)
  if (home) rows.push(['Flying home', `Hotel pickup ${home}`])
  return rows
}

const tourRows = (tours: TourShown[]): Array<[string, Inline]> =>
  tours.map((t) => [
    t.day ?? 'Tour',
    [b(t.title), `${t.duration ? `, ${durIn(t.duration)}` : ''}${t.travelers ? `, for ${people(t.travelers)}` : ''}`],
  ])

/** "Rick’s Cafe Cliff Diving & Sunset" or "your 2 tours", for a lede. */
const toursPhrase = (tours: TourShown[]) =>
  tours.length === 1
    ? `${tours[0].title}${tours[0].day ? ` on ${tours[0].day}` : ''}`
    : tours.length > 1
      ? `${tours.length} tours${tours[0].day ? `, starting ${tours[0].day}` : ''}`
      : 'your tour'

/* ── The ten tips ───────────────────────────────────────────────────────── */

function p1(): Draft {
  const all = allFares('round_trip')
  const transfers = siteLink('/transfers', 'p1_ride_costs_button')
  return {
    subject: 'What your ride from MBJ costs',
    // The answer the subject asks for comes first, round trip as the site's
    // route cards lead. TransfersView.tsx:840 "Fixed zone price, paid up
    // front"; airport-transfers-content.ts:36 "per vehicle, not per person";
    // fares from zonePriceRange.
    preheader: `${usdRange(all.min, all.max)} round trip, by where you stay: one fare per vehicle for up to 4 people.`,
    body: [
      { t: 'h1', text: 'What your ride from MBJ costs' },
      // airport-transfers-content.ts:36: "The fare shown is per vehicle, not
      // per person. A family of four pays the same as a solo traveler";
      // TransfersView.tsx:840 "Fixed zone price, paid up front" (so "fixed",
      // and known before they land).
      { t: 'p', text: 'Walk out of Sangster (MBJ) already knowing what your ride costs. One fixed fare covers the whole vehicle, for 1 to 4 people. Here’s the round trip, by where you’re staying:' },
      fareTable(),
      { t: 'small', text: fareNotes() },
      // The late-landing answer sits at the button (the risk a first-timer
      // weighs before paying up front), so the facts below skip it.
      // airport-transfers-content.ts:40; TransfersView.tsx:842.
      { t: 'button', href: transfers, label: 'Price my ride', helper: ['We track your flight, and there’s no surcharge if you land late.', codeLine()] },
      // Below the button, not above it: a top photo pushed the first button
      // about 260px further down a 390px phone (Sentinel insight 7774f95b).
      photo('coastRoad', { href: siteLink('/transfers', 'p1_ride_costs_photo'), label: 'Price my ride' }),
      { t: 'h2', text: 'What happens when you land' },
      { t: 'facts', items: arrivalFacts(false).filter((f) => f.lead !== 'Land late, still met.') },
      // The quiet repeat of the one action, after the proof (Sentinel
      // insight fc1569b0), in the page's own words: TransfersView.tsx:763
      // "Pick your hotel to see your fare."
      { t: 'link', lead: 'Know where you’re staying?', label: 'See your hotel’s fare', href: siteLink('/transfers', 'p1_ride_costs_more') },
    ],
    closing: PROSPECT_CLOSING,
  }
}

function p2(): Draft {
  const tours = p2Tours()
  const [raft] = tours
  const towns = tours.map((e) => e.destination)
  return {
    // River, cliffs and falls: the three tours below (the Martha Brae raft,
    // Rick's Cafe Cliff Diving, Dunn's River), named by what you see.
    subject: 'A day off the resort: river, cliffs and falls',
    // The lead price always with its party limit (tourFrom: "$128 for up to
    // 3 people"), the only price in the line; "sunset" is from the Rick's
    // title; hotel pickup is every tour's meeting point (OnePageCheckout.tsx:442).
    preheader: `Martha Brae rafting, ${tourFrom(raft)}, sunset at Rick’s Cafe, and Dunn’s River, all with hotel pickup.`,
    body: [
      { t: 'h1', text: 'A day off the resort' },
      // app/safety/page.tsx:16 "Every tour and transfer we sell is private:
      // your party, your driver, your vehicle."; OnePageCheckout.tsx:442
      // "Your hotel, resort, the airport or a cruise port. We bring you back
      // to the same place." "Three we'd start with" is a recommendation, not
      // a popularity claim.
      { t: 'p', text: `Every tour with us is private: just your party, your driver, your vehicle. We pick you up at your hotel and bring you back to the same place. Three we’d start with, in ${towns.slice(0, -1).join(', ')} and ${towns[towns.length - 1]}:` },
      {
        t: 'table',
        head: ['Tour', 'From'],
        // Title, destination and duration from lib/experiences.ts (durations
        // verified against operator listings, 48cce3e); price = tourPrice for
        // the smallest party with priceUnitLabel's party limit. Each name
        // opens its own tour page (/experience/<getSlug>, the same URL the
        // site's WebMCP get_tour returns), so choosing is one tap.
        rows: tours.map((e) => ({
          main: typo(e.title),
          sub: `${e.destination}, ${durIn(e.duration)}`,
          value: usd(tourPrice(e.pricing, 1)),
          valueSub: `${e.pricing.mode === 'group' ? 'for ' : ''}${priceUnitLabel(e.pricing)}`,
          href: siteLink(`/experience/${getSlug(e)}`, `p2_tours_tour_${e.id}`),
        })),
      },
      // tourOperatorCost: above tierMax the party pays per head; help-faqs:29
      // "with a per-person rate above that; set your guest count at checkout
      // and the price updates". "Than that" ties it to the limits in the table.
      { t: 'small', text: 'Bigger parties than that pay per person, and the price updates as you set your group.' },
      { t: 'button', href: siteLink('/explore', 'p2_tours_button'), label: 'Choose my tour', helper: [TOUR_NOTICE, codeLine()] },
      // Below the button: above the table it pushed the button past the
      // first screen on 320 to 360px phones (measured 880px and 854px). The
      // first tour in the table, the raft the owner approved for email.
      photo('marthaBraeRaft', { href: siteLink('/explore', 'p2_tours_photo'), label: 'Choose my tour' }),
      // As p4 asks it: a prospect has booked nothing, so not "still".
      { t: 'link', lead: 'Need the ride from the airport too?', label: 'Price my ride', href: siteLink('/transfers', 'p2_tours_ride') },
    ],
    closing: PROSPECT_CLOSING,
  }
}

function p3(): Draft {
  const all = allFares('round_trip')
  return {
    subject: 'Before you land at MBJ: three things',
    preheader: 'Jamaica’s free C5 arrival form, money at the airport, and how your driver finds you.',
    body: [
      { t: 'h1', text: 'Before you land at MBJ' },
      { t: 'p', text: 'Sort these three before you fly, and your first hour in Jamaica goes easy.' },
      {
        // Numbered, so the three the lede promises are visible as three.
        t: 'checklist',
        items: [
          { done: false, lead: 'Fill in the C5 form.', text: c5Line() },
          { done: false, lead: 'Money.', text: MONEY_LINE },
          {
            done: false,
            lead: 'Your ride.',
            // The tip first, whoever they book with; then the offer.
            // airport-transfers-content.ts:40,44 (as arrivalFacts).
            text: 'Know how you’re getting to your hotel before you land. With us, your driver waits past customs holding a MAPL Tours Jamaica sign with your name on it. We track the flight, and there’s no surcharge if you land late.',
          },
        ],
      },
      {
        t: 'button',
        href: siteLink('/transfers', 'p3_before_you_land_button'),
        label: 'Price my ride',
        helper: [`One fare per vehicle for up to 4 people, ${usdRange(all.min, all.max)} round trip.`, codeLine()],
      },
      // The ride the third item is about, after the button (it sits near the
      // bottom of a 390px phone's first screen, with no room above it).
      photo('shoreRoad', { href: siteLink('/transfers', 'p3_before_you_land_photo'), label: 'Price my ride' }),
    ],
    closing: PROSPECT_CLOSING,
  }
}

function p4(): Draft {
  return {
    // The three worries a planner has, in the card's own words ("cancelling"
    // as the site spells it).
    subject: 'Paying, cancelling and weather: how it works',
    preheader: 'Pay up front in US dollars, book a Friday tour by Wednesday, and get 48 hours to cancel, less a 20% charge.',
    body: [
      { t: 'h1', text: 'How booking with us works' },
      // The four rows below, in order, as a guest would ask them.
      { t: 'p', text: 'How you pay, when to book, and what happens if your plans or the weather change.' },
      {
        // One labelled card, so the four rules read as a set.
        t: 'rows',
        rows: [
          // app/terms/page.tsx:43-44 (USD, Stripe at checkout);
          // lib/help-faqs.ts:87 (cards, Apple Pay, Google Pay);
          // airport-transfers-content.ts:48 "taken online up front".
          ['Paying', 'Online when you book, in US dollars, by card, Apple Pay or Google Pay.'],
          // app/terms/page.tsx:47 "Bookings close 24 hours before an
          // experience or pickup begins" (rides: the pickup is a real time,
          // isPickupBookable) and TOUR_NOTICE for tours (lib/help-faqs.ts:33
          // "experience days are counted from midnight in Jamaica").
          ['How far ahead', 'Book a ride at least 24 hours before pickup. Tour days count from midnight in Jamaica, so book a Friday tour by the end of Wednesday.'],
          // app/terms/page.tsx:54,57,58 (nothing is refundable once the tour
          // or pickup has begun, even inside the 48 hours; the refund is "the
          // amount you paid, less an administration charge"); app/safety/page.tsx:25
          // "less a 20% administration charge".
          ['Changing your mind', 'If you cancel within 48 hours of booking, and before the tour or pickup begins, we refund what you paid, less a 20% administration charge. After that, the booking is non-refundable.'],
          ['Weather', WEATHER_LINE],
        ],
      },
      // A product, not the home page: the ready reader lands one tap from a
      // tour, with the ride as the one quiet alternative.
      { t: 'button', href: siteLink('/explore', 'p4_booking_rules_button'), label: 'Choose my tour', helper: codeLine() },
      // A tour to choose, after the button (it sits near the bottom of a
      // 390px phone's first screen): Rick's Cafe, as the bio's tour.jpg.
      photo('ricksCafeSunset', { href: siteLink('/explore', 'p4_booking_rules_photo'), label: 'Choose my tour' }),
      { t: 'link', lead: 'Need the ride from the airport too?', label: 'Price my ride', href: siteLink('/transfers', 'p4_booking_rules_ride') },
    ],
    closing: PROSPECT_CLOSING,
  }
}

/**
 * The tips that describe the guest's landing (r1, r2, b1) need the arrival
 * leg: without it they would describe a pickup at MBJ nobody booked. The
 * planner only picks them with an arrival; this keeps a later change from
 * ever rendering one without it (the run then skips it as build_failed).
 */
function needArrival(key: TipKey, ctx: TipContext): void {
  if (!formatDay(ctx.arrival?.date)) throw new Error(`trip-tips: ${key} needs the arrival leg`)
}

function r1(ctx: TipContext): Draft {
  needArrival('r1_before_you_fly', ctx)
  const dest = destinationByName(ctx.hotel)
  return {
    // The house verb ("meet you"), and the reassurance this guest opens it for.
    subject: 'How we meet you at MBJ',
    // Owner's pick, Sept 27 2026: the two questions a guest has at MBJ (who do
    // I look for, what if I land late), the same for every guest. It used to
    // open with the date and the flight number as the guest typed it ("flight
    // 479"), which read like a form and repeated the rows the email opens with.
    // True to the body: "We track your flight, so a delay moves your pickup
    // with it, at no extra charge."
    preheader: 'Your driver waits at arrivals with your name on a sign, even if your flight lands late.',
    body: [
      { t: 'eyebrow', text: 'Your ride is booked' },
      { t: 'h1', text: 'How we meet you at MBJ' },
      // The eyebrow already says booked; the rows right below name the hotel.
      { t: 'p', text: `${cap(`${nameLead(ctx)}here’s your ride, and what happens when you land.`)}` },
      ...(rideRows(ctx, dest).length ? [{ t: 'rows', rows: rideRows(ctx, dest) } as Block] : []),
      // The confirmation's own button (emails/BookingConfirmed.tsx:143
      // "View your booking" to /profile; the account is made at payment,
      // lib/account-provision.ts). Right under the booking it opens, so it
      // sits on a phone's first screen.
      { t: 'button', href: siteLink('/profile', 'r1_before_you_fly_button'), label: 'View my booking', helper: FLIGHT_CHANGE },
      { t: 'h2', text: 'When you land' },
      // The ride heads the section it shows, as b1's tour photo heads "Tour
      // day": never between the booking and "When you land", which read as
      // one story. Not linked (the button opens the booking, not a road).
      photo('coastRoad'),
      { t: 'facts', items: arrivalFacts(true) },
    ],
    closing: BOOKED_CLOSING,
  }
}

function r2(ctx: TipContext): Draft {
  needArrival('r2_week_before', ctx)
  const dest = destinationByName(ctx.hotel)
  const day = formatDay(ctx.arrival?.date)
  const landing = legWhen(ctx.arrival)
  const flight = flightOf(ctx.arrival)
  const hotel = dest ? dest.name : clean(ctx.hotel, 80)
  const home = legWhen(ctx.departure)
  const items: Array<{ done: boolean; lead: string; text: Inline }> = [
    {
      done: true,
      lead: 'Ride booked.',
      // Route first, then when: planes land at MBJ, not at the hotel.
      text: [`From Sangster (MBJ)${hotel ? ` to ${hotel}` : ''}, when you land on ${landing}`, flight ? `, flight ${flight}` : '', '.'].join(''),
    },
    { done: false, lead: 'Fill in the C5 form.', text: c5Line() },
    // TransfersView.tsx:395 (as arrivalFacts).
    { done: false, lead: 'Your driver’s details.', text: 'We email you their name, vehicle, plate and WhatsApp number before pickup. Keep an eye on this inbox.' },
    { done: false, lead: 'Money.', text: MONEY_LINE },
  ]
  // emails/TransferDayOf.tsx:148 "Be in the lobby a few minutes before the
  // pickup time above."; TransferConfirmed.tsx:181 labels the departure
  // leg's time "Hotel pickup ... Jamaica time".
  if (home) items.push({ done: false, lead: 'Flying home.', text: `Your hotel pickup is ${home}. Be in the lobby a few minutes before.` })
  return {
    subject: day ? `See you at MBJ on ${day}` : 'Your MBJ pickup is almost here',
    preheader: 'Before you fly: the C5 form, your driver’s details, money at the airport.',
    body: [
      { t: 'eyebrow', text: 'Your ride is booked' },
      { t: 'h1', text: 'Almost time' },
      // The one real task is the C5 form (the JTB says the day before you
      // arrive, so not "now"); the rest is to know.
      { t: 'p', text: `${cap(`${nameLead(ctx)}there’s one form to fill in before you fly, and a few things to know.`)}` },
      { t: 'checklist', items },
      { t: 'button', href: siteLink('/profile', 'r2_week_before_button'), label: 'View my booking', helper: FLIGHT_CHANGE },
      // The ride again, a different shot from r1's (the same guest gets both).
      photo('shoreRoad'),
    ],
    closing: BOOKED_CLOSING,
  }
}

function t1(ctx: TipContext): Draft {
  const tours = toursShown(ctx)
  const first = tours[0]
  // For a TOUR guest, ctx.hotel is the tour's pickup place (plan.ts
  // tripFacts): priced exactly when it is a rate-card property they stay at.
  const dest = stayDestination(ctx.hotel)
  const party = ctx.passengers ?? first?.travelers ?? null
  const fare = fareFor(dest, party)
  const path = dest ? `/transfers/${dest.id}` : '/transfers'
  // Who the fare is for, in words that are true for every party. legRate
  // (lib/airport-transfers.ts) is flat to 4, so 1 to 4 people pay one fare
  // and it reads "for up to 4 people": right for a known small party, and for
  // an unknown one (fareFor then prices 2) without inventing a party size.
  // From 5 to 7 the fare depends on the party, so it names them, and the
  // helper says they still share one vehicle (TransfersView.tsx:427 "Private
  // vehicle for up to 7 passengers"; airport-transfers-content.ts:36 "still
  // ride together"). Never "per person": the 5+ rate is floored at the
  // vehicle fare. A test holds "for up to 4 people" to getTransferPrice.
  const small = fare !== null && fare.pax <= 4
  const farePeople = fare ? (small ? 'up to 4 people' : people(fare.pax)) : ''
  // Tours take parties up to 12 (lib/checkout-pricing.ts:108) and the ride
  // prices up to 7 online, so a bigger party gets the site's route for it:
  // TransfersView.tsx:953-954 "groups of eight or more, we'll quote you
  // directly within 24 hours".
  const big = typeof party === 'number' && Number.isFinite(party) && Math.round(party) > MAX_TRANSFER_PASSENGERS ? Math.round(party) : null
  // "If you still need": this guest has booked a tour, not a ride, and may
  // have one sorted already; the offer is a question they can ignore.
  const booked = cap(`${nameLead(ctx)}you’re booked for ${toursPhrase(tours)}.`)
  const lede = dest && fare
    ? `${booked} If you still need a ride from Sangster (MBJ) to your hotel, here’s what it costs.`
    : // The zone table's fares are the 1 to 4 fares (zonePriceRange), so the
      // lede says so; the table's own header cannot. "A round trip" as a
      // noun, the one form the emails use (see the header).
      `${booked} If you still need a ride from Sangster (MBJ), here’s what a round trip costs for 1 to 4 people, by where you’re staying.`
  const body: Block[] = [
    { t: 'eyebrow', text: tours.length > 1 ? 'Your tours are booked' : 'Your tour is booked' },
    // Their open question, not "Your ride from the airport": under a
    // "booked" eyebrow that read as if the ride were booked too.
    { t: 'h1', text: 'Getting from MBJ to your hotel' },
    { t: 'p', text: lede },
  ]
  if (dest && fare) {
    // getTransferPrice for their own hotel and party, the round trip first
    // (with the party and the saving), one way second. The photo comes after
    // the button so the fare and the button share the first screen.
    body.push({
      t: 'rows',
      rows: [
        ['To', dest.name],
        ['Round trip', [b(usd(fare.roundTrip)), ` for ${farePeople}, about 10% less than two one-ways`]],
        // Regular weight, so the bold round trip above is the one that stands out.
        ['One way', usd(fare.oneWay)],
      ],
    })
  } else {
    body.push(fareTable())
    // The rule for bigger parties goes with the table.
    body.push({ t: 'small', text: fareNotes() })
  }
  body.push({
    t: 'button',
    href: siteLink(path, 't1_airport_ride_button'),
    label: 'Price my ride',
    // airport-transfers-content.ts:36,40,44; the reply promise as REPLY_PROMISE.
    helper: fare && !small
      ? `All ${fare.pax} of you ride together in one private vehicle. ${DRIVER_LINE}`
      : big
        ? [`For ${big} of you, reply with your hotel and your dates, and one of us will quote the ride within 24 hours.`, DRIVER_LINE]
        : DRIVER_LINE,
  })
  return {
    // The guest's own question, short enough to show whole on a phone; the
    // preheader carries their fare.
    subject: 'Getting from MBJ to your hotel',
    preheader: fare && dest
      ? `From MBJ to ${dest.name}: ${usd(fare.roundTrip)} round trip for ${farePeople}, with your driver waiting at arrivals.`
      : 'Our fares from MBJ by where you’re staying, with your driver waiting at arrivals and your flight tracked.',
    body,
    closing: BOOKED_CLOSING,
    // The ride this tip prices, linked where the button goes, below the reply
    // line, so the fare and the button lead.
    after: [photo('coastRoad', { href: siteLink(path, 't1_airport_ride_photo'), label: 'Price my ride' })],
  }
}

function t2(ctx: TipContext): Draft {
  const tours = toursShown(ctx)
  const first = tours[0]
  const plural = tours.length > 1
  // The guest's own day first, short enough to show whole on a phone (the
  // shape of b2's "Your tour is on Sunday, November 8").
  const subject = first?.day ? `Your tour is on ${first.day}` : 'Your tour day is almost here'
  return {
    subject: plural && first?.day ? `Your tours start ${first.day}` : subject,
    // GUIDE_LINE, paraphrased as the b1 preheader does; BRING_LINE below.
    preheader: 'Your guide gets in touch 24 to 48 hours before. Here’s what to bring.',
    body: [
      { t: 'eyebrow', text: plural ? 'Your tours are booked' : 'Your tour is booked' },
      { t: 'h1', text: 'Almost tour day' },
      // Every booked tip greets the guest before the facts.
      { t: 'p', text: cap(`${nameLead(ctx)}here’s what happens before your ${plural ? 'tours' : 'tour'}, and what to pack.`) },
      ...(tours.length ? [{ t: 'rows', rows: tourRows(tours) } as Block] : []),
      {
        t: 'facts',
        items: [
          { lead: 'Before the day.', text: GUIDE_LINE },
          // app/terms/page.tsx:48 "You provide the pickup and drop-off
          // locations at checkout"; emails/BookingConfirmed.tsx:269-283 shows
          // them (the drop-off only when it differs). Not "the same place":
          // the API stores its own drop-off.
          { lead: 'Pickup.', text: 'We pick you up and drop you off where you told us at checkout. It’s in your confirmation email.' },
          { lead: 'Packing.', text: BRING_LINE },
          { lead: 'Weather.', text: WEATHER_LINE },
        ],
      },
      // The reassurance at the button, as FLIGHT_CHANGE is in the ride tips:
      // the question a guest has in the week before, answered where they
      // decide. The promise itself is the closing's, said once.
      { t: 'button', href: siteLink('/profile', 't2_week_before_tour_button'), label: 'View my booking', helper: PLANS_CHANGED },
      // THEIR tour, by catalogue id: the soonest one the site has a photo of.
      // 32px below it before the question (the photo block's rule).
      photo(toursPhoto(tours)),
      // The one quiet cross-sell. "To or from": a tour guest may already be
      // here, or may only need the ride home.
      { t: 'link', lead: 'Need a ride to or from the airport too?', label: 'Price my ride', href: siteLink('/transfers', 't2_week_before_tour_ride') },
    ],
    // The series' booked closing: "Plans changed?" is already at the button,
    // so the email does not ask it twice.
    closing: BOOKED_CLOSING,
  }
}

function b1(ctx: TipContext): Draft {
  needArrival('b1_before_you_fly', ctx)
  const dest = destinationByName(ctx.hotel)
  const tours = toursShown(ctx)
  // In trip order: the landing rows, each tour on its day, the pickup home.
  // Keys are 'YYYY-MM-DD' strings, so a string sort is a calendar sort.
  const ride = rideRows(ctx, dest)
  const home = ride.filter(([k]) => k === 'Flying home')
  const groups: Array<{ key: string; rows: Array<[string, Inline]> }> = [
    { key: formatDay(ctx.arrival?.date) ? ctx.arrival!.date : '', rows: ride.filter(([k]) => k !== 'Flying home') },
    ...tours.map((t, i) => ({ key: t.date, rows: [tourRows(tours)[i]] })),
    { key: formatDay(ctx.departure?.date) ? ctx.departure!.date : '\uffff', rows: home },
  ]
  const rows = groups
    .map((g, i) => ({ ...g, i }))
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.i - y.i))
    .flatMap((g) => g.rows)
  const day = formatDay(ctx.arrival?.date)
  return {
    subject: tours.length > 1 ? 'Before you fly: your ride and your tours' : 'Before you fly: your ride and your tour',
    // Their landing day first, as r1's preheader does; the guide half
    // paraphrases GUIDE_LINE. No "then": a tour is not always after landing.
    preheader: `${day ? `${day}: your` : 'Your'} driver meets you at MBJ, and your guide reaches out before tour day.`,
    body: [
      { t: 'eyebrow', text: 'Your trip is booked' },
      { t: 'h1', text: 'Before you fly' },
      // The eyebrow already says booked; the rows are the trip in date order.
      { t: 'p', text: `${cap(`${nameLead(ctx)}here’s your trip in order, and how landing and tour day work.`)}` },
      ...(rows.length ? [{ t: 'rows', rows } as Block] : []),
      { t: 'button', href: siteLink('/profile', 'b1_before_you_fly_button'), label: 'View my booking', helper: FLIGHT_CHANGE },
      // Nothing between the button and "When you land": the booking and the
      // landing read as one story.
      { t: 'h2', text: 'When you land' },
      // All but the driver's details: the week-before tip (b2) carries
      // those, and this one stays under 250 words.
      { t: 'facts', items: arrivalFacts(true, false) },
      // "Tour day", not "On tour day": the first line is about the days before.
      { t: 'h2', text: 'Tour day' },
      // ONE photo, by one rule: their tour's own (the soonest one with a
      // photo) under "Tour day", or the coast road in the same place when no
      // tour has one (toursPhoto's fallback: tour days start with the hotel
      // pickup). Never a second photo.
      photo(toursPhoto(tours)),
      { t: 'facts', items: [{ lead: 'Before the day.', text: GUIDE_LINE }, { lead: 'Packing.', text: BRING_LINE }] },
    ],
    closing: BOOKED_CLOSING,
  }
}

function b2(ctx: TipContext): Draft {
  const dest = destinationByName(ctx.hotel)
  const tours = toursShown(ctx)
  const landing = legWhen(ctx.arrival)
  const hotel = dest ? dest.name : clean(ctx.hotel, 80)
  const home = legWhen(ctx.departure)
  // BOTH always has a ride; the planner may pick b2 with only the ride HOME
  // (hotel to MBJ) and a tour. Neither leg is a context b2 cannot describe.
  if (!landing && !home) throw new Error('trip-tips: b2_week_before needs a ride leg')
  const firstDay = [landing ? ctx.arrival?.date : null, tours[0]?.date].filter((x): x is string => typeof x === 'string' && formatDay(x) !== null).sort()[0]
  // The ride as booked: from MBJ when they land with us, otherwise the
  // pickup at the hotel for the airport (TransferConfirmed.tsx:181 "Hotel
  // pickup ... Jamaica time"). Never "From Sangster" for a ride that goes to it.
  const rideLine = landing
    ? `From Sangster (MBJ)${hotel ? ` to ${hotel}` : ''}, when you land on ${landing}.`
    : `${hotel ? `From ${hotel} to` : 'To'} Sangster (MBJ), hotel pickup ${home}.`
  // The tours as one list a phone reads cleanly: the dates carry commas, so
  // two tours join with ", and", three or more with semicolons.
  const tourList = tours.map((t) => `${t.title}${t.day ? ` on ${t.day}` : ''}`)
  const toursLine = `${tourList.length > 2 ? `${tourList.slice(0, -1).join('; ')}; and ${tourList[tourList.length - 1]}` : tourList.join(', and ')}.`
  const rideDone = { done: true, lead: 'Ride booked.', text: rideLine as Inline }
  const toursDone = tours.length ? [{ done: true, lead: tours.length > 1 ? 'Tours booked.' : 'Tour booked.', text: toursLine as Inline }] : []
  const driverItem = { done: false, lead: 'Your driver’s details.', text: `We email you their name, vehicle, plate and WhatsApp number before your ${landing ? 'airport' : 'hotel'} pickup.` as Inline }
  const tourDay = { done: false, lead: 'Tour day.', text: `${GUIDE_LINE} ${BRING_LINE}` as Inline }
  // With only the ride home, the tour comes first when it is on or before
  // the pickup day, so the list still runs in the order things happen.
  const tourFirst = !landing && tours.length > 0 && typeof ctx.departure?.date === 'string' && tours[0].date <= ctx.departure.date
  const items: Array<{ done: boolean; lead: string; text: Inline }> = tourFirst
    ? [...toursDone, rideDone, tourDay, driverItem]
    : [
        rideDone,
        ...toursDone,
        // In the order they happen: the form before the flight (only for a
        // guest we meet off the plane; one with just a ride home may already
        // be here), the driver's details before the pickup, then tour day.
        ...(landing ? [{ done: false, lead: 'Fill in the C5 form.', text: c5Line() }] : []),
        driverItem,
        tourDay,
      ]
  if (landing && home) items.push({ done: false, lead: 'Flying home.', text: `Your hotel pickup is ${home}. Be in the lobby a few minutes before.` })
  const firstShown = firstDay ? formatDay(firstDay) : null
  return {
    subject: landing
      ? firstShown ? `Your trip starts ${firstShown}` : 'Your trip starts soon'
      : firstShown ? `Your ${tours.length > 1 ? 'tours start' : 'tour is on'} ${firstShown}` : 'Almost time',
    preheader: landing
      ? 'Before you fly: the C5 form, your driver’s details, and tour day.'
      : 'Coming up: tour day, and your driver’s details for the ride to the airport.',
    body: [
      { t: 'eyebrow', text: 'Your trip is booked' },
      { t: 'h1', text: 'Almost time' },
      // The one real task (the C5 form) is for the day before they arrive,
      // not "now"; a guest with only the ride home has none.
      { t: 'p', text: `${cap(`${nameLead(ctx)}here’s your trip at a glance, and ${landing ? 'what to know before you fly' : 'what happens next'}.`)}` },
      { t: 'checklist', items },
      { t: 'button', href: siteLink('/profile', 'b2_week_before_button'), label: 'View my booking', helper: FLIGHT_CHANGE },
      // The week before, the tour day is what comes next: their tour (the
      // soonest one with a photo), or the general photo when none has one.
      photo(toursPhoto(tours)),
    ],
    closing: BOOKED_CLOSING,
  }
}

const BUILDERS: Record<TipKey, (ctx: TipContext) => Draft> = {
  p1_ride_costs: p1,
  p2_tours: p2,
  p3_before_you_land: p3,
  p4_booking_rules: p4,
  r1_before_you_fly: r1,
  r2_week_before: r2,
  t1_airport_ride: t1,
  t2_week_before_tour: t2,
  b1_before_you_fly: b1,
  b2_week_before: b2,
}

/**
 * Render one tip. Throws (the run releases its claim and sends nothing) when
 * the key is unknown, when the context's track is not the tip's own (a
 * prospect tip, with its code, must never reach someone who booked), or
 * when the unsubscribe link is missing. The mailing address is
 * TRIP_TIPS_POSTAL_ADDRESS (lib/trip-tips/postal.ts): printed when set,
 * left out while it is null.
 */
export function buildTip(key: TipKey, ctx: TipContext): BuiltTip {
  const builder = BUILDERS[key]
  if (!builder) throw new Error(`trip-tips: unknown tip "${String(key)}"`)
  const want = TIP_TRACK[key]
  const track = String(ctx?.track ?? '').toUpperCase()
  if (track !== want) throw new Error(`trip-tips: ${key} is a ${want} tip, not for track "${String(ctx?.track)}"`)
  const unsubscribeUrl = typeof ctx.unsubscribeUrl === 'string' ? ctx.unsubscribeUrl.trim() : ''
  if (!/^https:\/\/\S+$/.test(unsubscribeUrl)) throw new Error('trip-tips: an https unsubscribe link is required')
  return render(key, builder(ctx), unsubscribeUrl, clean(TRIP_TIPS_POSTAL_ADDRESS, 200))
}
