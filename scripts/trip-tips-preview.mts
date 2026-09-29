/**
 * Renders every trip tip for realistic, fictional guests so the copy and the
 * layout can be read before anything is sent. Writes <key>.html and
 * <key>.txt (plus a variant or two where a second context changes the
 * email) to the directory given as the first argument, or to
 * TRIP_TIPS_PREVIEW_DIR, or ./trip-tips-previews.
 *
 *   npx tsx scripts/trip-tips-preview.mts /path/to/previews
 *
 * Pure: sends nothing. The names, flights and the unsubscribe link are made
 * up; the hotels and tours are real rate-card and catalogue entries, so every
 * fare and price is the site's own number. The photos are read from this
 * repo's public/media/email/tips/ (the HTML's TIPS_MEDIA_BASE is swapped for
 * that folder), so a preview shows them before they are deployed.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildTip, TIPS_MEDIA_BASE, type TipContext, type TipKey } from '../lib/trip-tips/emails'

const dir = resolve(process.argv[2] ?? process.env.TRIP_TIPS_PREVIEW_DIR ?? 'trip-tips-previews')
mkdirSync(dir, { recursive: true })
const localMedia = `${pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../public/media/email/tips')).href}/`

const base = {
  unsubscribeUrl: 'https://mapltours.com/api/trip-tips/unsubscribe?e=preview%40example.com&t=preview-token',
}

/** Maya has not booked anything. */
const prospect: TipContext = { ...base, track: 'PROSPECT', firstName: 'Maya' }

/** Jordan booked a round trip from MBJ to a Negril resort, two travelling. */
const ride: TipContext = {
  ...base,
  track: 'RIDE',
  firstName: 'Jordan',
  hotel: 'Riu Negril',
  zone: 'D',
  arrival: { date: '2026-11-14', time: '13:40', flight: 'DL 1234' },
  departure: { date: '2026-11-21', time: '09:15', flight: 'DL 1235' },
  passengers: 2,
}

/** Priya booked one tour picked up at an Ocho Rios resort (the tour's pickup is t1's hotel), three people, no ride yet. */
const tourOne: TipContext = {
  ...base,
  track: 'TOUR',
  firstName: 'Priya',
  hotel: 'Moon Palace Jamaica, Ocho Rios',
  zone: 'E',
  tours: [{ title: "Dunn's River + Blue Hole", date: '2026-12-03', experienceId: 18, travelers: 3 }],
  passengers: 3,
}

/** Sam booked two tours and no hotel we can price, so t1 falls back to the zone table. */
const tourTwo: TipContext = {
  ...base,
  track: 'TOUR',
  firstName: 'Sam',
  hotel: null,
  zone: null,
  tours: [
    { title: 'River Tubing', date: '2026-12-10', experienceId: 13, travelers: 2 },
    { title: "Dunn's River Falls Climb", date: '2026-12-08', experienceId: 1, travelers: 2 },
  ],
  passengers: 2,
}

/** Alex booked the ride to a Negril resort and Rick's Cafe. */
const bothOne: TipContext = {
  ...base,
  track: 'BOTH',
  firstName: 'Alex',
  hotel: 'Couples Negril',
  zone: 'D',
  arrival: { date: '2027-01-09', time: '11:05', flight: 'AA 0987' },
  departure: { date: '2027-01-16', time: '08:30', flight: 'AA 0988' },
  tours: [{ title: "Rick's Cafe Cliff Diving & Sunset", date: '2027-01-11', experienceId: 14, travelers: 2 }],
  passengers: 2,
}

/** Chris booked an arrival-only ride to Ocho Rios and two tours; no first name on file. */
const bothTwo: TipContext = {
  ...base,
  track: 'BOTH',
  firstName: null,
  hotel: 'Sandals Ochi Beach Resort',
  zone: 'E',
  arrival: { date: '2027-02-20', time: '16:25', flight: 'WS 2700' },
  departure: null,
  tours: [
    { title: 'Blue Hole & Secret Falls', date: '2027-02-22', experienceId: 2, travelers: 4 },
    { title: 'Bob Marley Nine Mile Pilgrimage', date: '2027-02-24', experienceId: 15, travelers: 4 },
  ],
  passengers: 4,
}

/** Sam booked only the ride home from a Negril resort, and Rick's Cafe the week before it. */
const bothHome: TipContext = {
  ...base,
  track: 'BOTH',
  firstName: 'Sam',
  hotel: 'Couples Negril',
  zone: 'D',
  arrival: null,
  departure: { date: '2026-11-12', time: '09:15', flight: 'AA 456' },
  tours: [{ title: "Rick's Cafe Cliff Diving & Sunset", date: '2026-11-08', experienceId: 14, travelers: 2 }],
  passengers: 2,
}

/** Dana booked Rick's Cafe for a party of 6 (priced online, one vehicle) and 9 (a quote), picked up at a Negril resort. */
const party = (n: number): TipContext => ({
  ...base,
  track: 'TOUR',
  firstName: 'Dana',
  hotel: n > 7 ? 'Hedonism II, Negril' : 'Sandals Negril Beach Resort',
  passengers: n,
  tours: [{ title: "Rick's Cafe", date: '2026-12-12', experienceId: 14, travelers: n }],
})

/** Lee booked the Martha Brae raft, no ride. */
const raftOnly: TipContext = {
  ...base,
  track: 'TOUR',
  firstName: 'Lee',
  hotel: null,
  tours: [{ title: 'Bamboo Rafting on the Martha Brae', date: '2026-12-05', experienceId: 3, travelers: 2 }],
}

const renders: Array<[string, TipKey, TipContext]> = [
  ['p1_ride_costs', 'p1_ride_costs', prospect],
  ['p2_tours', 'p2_tours', prospect],
  ['p3_before_you_land', 'p3_before_you_land', prospect],
  ['p4_booking_rules', 'p4_booking_rules', prospect],
  ['r1_before_you_fly', 'r1_before_you_fly', ride],
  ['r2_week_before', 'r2_week_before', ride],
  ['t1_airport_ride', 't1_airport_ride', tourOne],
  ['t1_airport_ride--no-hotel-two-tours', 't1_airport_ride', tourTwo],
  ['t1_airport_ride--party-of-6', 't1_airport_ride', party(6)],
  ['t1_airport_ride--party-of-9', 't1_airport_ride', party(9)],
  ['t2_week_before_tour', 't2_week_before_tour', tourOne],
  ['t2_week_before_tour--two-tours', 't2_week_before_tour', tourTwo],
  ['t2_week_before_tour--martha-brae', 't2_week_before_tour', raftOnly],
  ['b1_before_you_fly', 'b1_before_you_fly', bothOne],
  ['b1_before_you_fly--two-tours', 'b1_before_you_fly', bothTwo],
  ['b2_week_before', 'b2_week_before', bothOne],
  ['b2_week_before--two-tours', 'b2_week_before', bothTwo],
  ['b2_week_before--ride-home-only', 'b2_week_before', bothHome],
]

const index: string[] = []
for (const [name, key, ctx] of renders) {
  const t = buildTip(key, ctx)
  writeFileSync(join(dir, `${name}.html`), t.html.split(TIPS_MEDIA_BASE).join(localMedia))
  writeFileSync(join(dir, `${name}.txt`), `Subject: ${t.subject}\nPreheader: ${t.preheader}\n\n${t.text}`)
  const words = t.text.split(/\s+/).filter(Boolean).length
  const photos = Array.from(t.html.matchAll(/<img src="[^"]*\/([a-z-]+\.jpg)"/g)).map((m) => m[1]).join(', ')
  index.push(`${name.padEnd(38)} ${String(Buffer.byteLength(t.html)).padStart(6)} B html  ${String(words).padStart(4)} words  "${t.subject}"  [${photos}]`)
}
console.log(`Wrote ${renders.length} previews to ${dir}\n${index.join('\n')}`)
