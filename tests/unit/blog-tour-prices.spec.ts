import { describe, test, expect } from 'vitest'
import { BLOG_POSTS, type BlogBlock } from '@/lib/blog'
import { experiences, slugify, tourPrice, zonesSold, isZonePriced, type Experience } from '@/lib/experiences'
import type { TourZone } from '@/lib/tour-zones'
import { areaClause, BLOG_AREA_FALLBACKS, blogFrom, blogInArea, blogIsGroupPrice, blogNotPerHead, blogPrice, blogShare, blogUnit } from '@/lib/blog-prices'
import { HELP_CATEGORIES, GROUP_PARTY_LIMITS, TOUR_PRICING_SENTENCE } from '@/lib/help-faqs'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Taken as soon as the posts have loaded, before any test below calls a helper itself.
const fallbacksWhenThePostsLoaded = [...BLOG_AREA_FALLBACKS]

/**
 * A post or a help answer that quotes one of our tours has to quote what the
 * rate card charges, in the unit the card charges it in.
 *
 * Nov 14 2026: the raft had been $115 per person for a day while a post still
 * said "$128 for up to three", three passages said Nine Mile was "$459 for up
 * to three" after its price covered four, one split the falls "three ways"
 * into "$117 a head" from a price two changes old, and the help page said
 * group prices cover "usually up to 3 or 4 guests" when none covered three.
 * Each was typed. They are read from the cards now (lib/blog-prices).
 *
 * What this file reads, in every post: each "$123" (never "US$25", which is
 * how the posts write someone else's price) in a sentence that links one of
 * our tours. Each amount is held to the tour linked before it in the
 * sentence (or the first one after it, when none comes before):
 *  - it must be a price that tour's card charges a party of 1 to 6 from some
 *    pickup area, or one guest's share of such a price;
 *  - "for up to N" after it: the tour must be one price for the party, N its
 *    card's number, and the amount that flat price;
 *  - "per person" or "a head" after it: a price for one guest of a per-person
 *    tour, or a share of a group price;
 *  - "picked up in <area>" or "in <area>" after it: that area's price.
 * In a sentence that links no tour it reads one thing only, a share ("$90 a
 * head"), which has to be a guest's share of some tour the post links. And
 * it fails on a helper that was never rendered ("${" on the page).
 *
 * A clause that quotes one pickup area's price is written through blogInArea
 * (lib/blog-prices), which also holds what to print once that area is no
 * longer sold: an area can be switched off at the prices desk, and neither a
 * false sentence nor a failed build is acceptable then. This file fails when
 * a post is on that other wording, so the passage gets rewritten.
 *
 * What it cannot see, so nobody relies on it for these: any other price in a
 * sentence that links no tour (matching tours by name was tried and caught
 * other people's prices: "Sandals Dunn's River ... clears $1,500", the Rio
 * Grande raft); a unit put in other words ("covers a party of three", "for
 * the two of you"); our own price written "US$128" or "128 USD"; a helper
 * called with the right tour and the wrong party size. The rule for writers
 * is in AUTOMATED-BLOGS.md: use the helpers.
 */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const bySlug = new Map(experiences.map((e) => [slugify(e.title), e]))
const byId = (id: number) => experiences.find((e) => e.id === id)!

/** A pickup area as the posts name it. */
const PLACES: Array<[RegExp, TourZone]> = [
  [/^(Montego Bay|Rose Hall)/, 'montego_bay'], [/^Negril/, 'negril'], [/^Ocho Rios/, 'ocho_rios'],
  [/^(Falmouth|Trelawny)/, 'trelawny'], [/^(Lucea|Hanover)/, 'lucea'], [/^(Runaway Bay|Discovery Bay)/, 'runaway_bay'],
]
const PLACE = '(Montego Bay|Rose Hall|Negril|Ocho Rios|Falmouth|Trelawny|Lucea|Hanover|Runaway Bay|Discovery Bay)'
const zoneOfPlace = (name: string) => PLACES.find(([re]) => re.test(name))?.[1]

const strings = (b: BlogBlock): string[] =>
  b.type === 'list' ? b.items
    : b.type === 'faq' ? b.items.flatMap((x) => [x.q, x.a])
      : b.type === 'image' ? (b.caption ? [b.caption] : [])
        : [b.text]

/** Sentences. A full stop after "St", "Mt" or an initial does not end one ("the St. Ann hills"). */
function sentences(s: string): string[] {
  const out: string[] = []
  for (const part of s.split(/(?<=[.!?])\s+(?=[A-Z[])/)) {
    const last = out[out.length - 1]
    if (last !== undefined && /\b(St|Mt|Dr|Mr|Mrs|Ms|No|vs|[A-Z])\.$/.test(last)) out[out.length - 1] = `${last} ${part}`
    else out.push(part)
  }
  return out
}

const zonesOf = (e: Experience): Array<TourZone | undefined> => (isZonePriced(e.pricing) ? [undefined, ...zonesSold(e.pricing)] : [undefined])
const flatGroup = (e: Experience) => e.pricing.mode === 'group' && !e.pricing.perPersonAddon

/** Every total a party of 1 to 6 pays, from the given area or from any, and each guest's share of one. */
function prices(e: Experience, zone?: TourZone): Set<number> {
  const out = new Set<number>()
  for (const z of zone ? [zone] : zonesOf(e)) {
    for (let n = 1; n <= 6; n++) {
      const total = tourPrice(e.pricing, n, z)
      out.add(total)
      out.add(Math.ceil(total / n))
    }
  }
  return out
}
/** The one price a group tour charges a party it covers, from each area. */
const flatPrices = (e: Experience) => new Set(zonesOf(e).map((z) => tourPrice(e.pricing, e.pricing.tierMax, z)))
/** What one guest pays: alone, or as their share of any party up to 12 (bigger parties can pay less each). */
function guestPrices(e: Experience): Set<number> {
  const out = new Set<number>()
  for (const z of zonesOf(e)) for (let n = 1; n <= 12; n++) out.add(Math.ceil(tourPrice(e.pricing, n, z) / n))
  return out
}
/** A share of a group price: the flat price over 2 to tierMax guests, or a bigger party's total over its size. */
function shares(e: Experience): Set<number> {
  const out = new Set<number>()
  for (const z of zonesOf(e)) for (let n = 2; n <= 12; n++) out.add(Math.ceil(tourPrice(e.pricing, n, z) / n))
  return out
}

interface Quote { post: string; sentence: string; amount: number; after: string; tour: Experience }
interface Share { post: string; sentence: string; amount: number; tours: Experience[] }

const quotes: Quote[] = []
const loneShares: Share[] = []
const deadLinks: string[] = []
const unrendered: string[] = []
let sentencesWithATour = 0
// "$357", never "US$25" (someone else's price), never part of a longer token.
const AMOUNT = /(?<![A-Za-z$])\$([0-9][0-9,]*)(?![0-9])/g
const LINK = /\]\(\/experience\/([a-z0-9-]+)\)/g

for (const post of BLOG_POSTS) {
  const all = [post.title, post.excerpt, ...post.body.flatMap(strings)]
  const linkedInPost = Array.from(new Set(all.flatMap((s) => Array.from(s.matchAll(LINK)).map((m) => bySlug.get(m[1])).filter((e): e is Experience => !!e))))
  for (const s of all) {
    if (/\$\{|\bblog(From|Price|Unit|Share|NotPerHead)\(|\bundefined\b|\bNaN\b/.test(s)) unrendered.push(`${post.slug}: ${s.slice(0, 120)}`)
    for (const sentence of sentences(s)) {
      const links = Array.from(sentence.matchAll(LINK)).map((m) => ({ slug: m[1], at: m.index ?? 0 }))
      for (const l of links) if (!bySlug.has(l.slug)) deadLinks.push(`${post.slug}: /experience/${l.slug}`)
      const named = links.filter((l) => bySlug.has(l.slug)).map((l) => ({ tour: bySlug.get(l.slug)!, at: l.at }))
      const amounts = Array.from(sentence.matchAll(AMOUNT)).map((m) => ({ value: Number(m[1].replace(/,/g, '')), at: m.index ?? 0, end: (m.index ?? 0) + m[0].length }))
      if (!named.length) {
        // No tour linked: only a share is read, against the tours the post links anywhere.
        for (const a of amounts) if (linkedInPost.length && /^\s*(a head|each\b)/.test(sentence.slice(a.end, a.end + 12))) loneShares.push({ post: post.slug, sentence, amount: a.value, tours: linkedInPost })
        continue
      }
      sentencesWithATour++
      for (const a of amounts) {
        // The tour linked before the amount, the nearest one; with none before it, the first one after.
        const before = named.filter((n) => n.at <= a.at)
        const tour = (before.length ? before[before.length - 1] : named[0]).tour
        quotes.push({ post: post.slug, sentence, amount: a.value, after: sentence.slice(a.end, a.end + 80), tour })
      }
    }
  }
}

const say = (q: Quote, why: string) => `${q.post}: $${q.amount} ${why} (${q.tour.title}) :: ${q.sentence.slice(0, 170)}`

describe('blog posts quote the prices the rate cards charge', () => {
  test('the posts link real tours, render their helpers, and there is something to check', () => {
    expect(deadLinks).toEqual([])
    expect(unrendered).toEqual([])
    // If these ever read zero the test has stopped looking at anything.
    expect(sentencesWithATour).toBeGreaterThanOrEqual(25)
    expect(quotes.length).toBeGreaterThanOrEqual(8)
    expect(loneShares.length).toBeGreaterThanOrEqual(1)
  })

  test('a share quoted in a sentence with no link ("$90 a head") is a guest\'s share of a tour the post links', () => {
    const wrong = loneShares.filter((x) => !x.tours.some((t) => shares(t).has(x.amount) || guestPrices(t).has(x.amount)))
    expect(wrong.map((x) => `${x.post}: $${x.amount} a head is no guest's share of ${x.tours.map((t) => t.title).join(', ')} :: ${x.sentence.slice(0, 160)}`)).toEqual([])
  })

  test('every dollar amount beside a tour is a price that tour charges, or a guest\'s share of one', () => {
    expect(quotes.filter((q) => !prices(q.tour).has(q.amount)).map((q) => say(q, 'is not a price of the tour named nearest it'))).toEqual([])
  })

  test('"for up to N" follows only a group tour\'s own flat price, with that card\'s number', () => {
    const wrong: string[] = []
    for (const q of quotes) {
      const m = /^\s*for up to (\w+)/.exec(q.after)
      if (!m) continue
      const said = WORDS.indexOf(m[1].toLowerCase()) >= 0 ? WORDS.indexOf(m[1].toLowerCase()) : Number(m[1])
      if (!flatGroup(q.tour)) wrong.push(say(q, `is called a price "for up to ${m[1]}", and the tour is not one price for the party`))
      else if (said !== q.tour.pricing.tierMax) wrong.push(say(q, `is said to cover up to ${m[1]}; the card covers ${q.tour.pricing.tierMax}`))
      else if (!flatPrices(q.tour).has(q.amount)) wrong.push(say(q, 'is not the flat price the card charges a party it covers'))
    }
    expect(wrong).toEqual([])
  })

  test('"per person" and "a head" follow one guest\'s price, never a party\'s total', () => {
    const wrong: string[] = []
    for (const q of quotes) {
      if (!/^\s*(per person|per guest|a person|a head|each\b)/.test(q.after)) continue
      if (flatGroup(q.tour)) { if (!shares(q.tour).has(q.amount)) wrong.push(say(q, 'is called per person, and the tour is one price for the party')) }
      else if (!guestPrices(q.tour).has(q.amount)) wrong.push(say(q, 'is called per person and is not what one guest pays'))
    }
    expect(wrong).toEqual([])
  })

  test('"for one person" is said only of a tour where every guest adds to the price', () => {
    expect(quotes.filter((q) => /^\s*for one person/.test(q.after) && !q.tour.pricing.perPersonAddon).map((q) => say(q, 'is called a price for one person'))).toEqual([])
  })

  test('a price said to be from a pickup area is that area\'s price', () => {
    const wrong: string[] = []
    let checked = 0
    for (const q of quotes) {
      const m = new RegExp(`^[^.$;(]{0,45}?picked up in ${PLACE}`).exec(q.after) ?? new RegExp(`^\\s*in ${PLACE}`).exec(q.after)
      if (!m || !isZonePriced(q.tour.pricing)) continue
      const zone = zoneOfPlace(m[1])
      checked++
      if (!zone || !zonesSold(q.tour.pricing).includes(zone)) wrong.push(say(q, `is said to be from ${m[1]}, where the card has no price`))
      else if (!prices(q.tour, zone).has(q.amount)) wrong.push(say(q, `is not the price from ${m[1]}`))
    }
    expect(wrong).toEqual([])
    expect(checked).toBeGreaterThanOrEqual(3)
  })
})

describe('the helpers the posts quote with', () => {
  test('the unit is read from the card', () => {
    // Per person (Collin, Nov 14 2026): they read "for up to three people" the day before.
    for (const id of [5, 10, 11]) {
      expect(blogUnit(id), `tour ${id}`).toBe('per person')
      expect(blogFrom(id), `tour ${id}`).toBe(`$${byId(id).price} per person`)
      expect(blogIsGroupPrice(id)).toBe(false)
      expect(blogNotPerHead(id)).toBe('')
    }
    // Per person by pickup area: a "from", because the price depends on where we pick the guest up.
    expect(blogFrom(3)).toBe(`from $${tourPrice(byId(3).pricing, 1)} per person`)
    // One price for the group, with the card's own number in words, and only there "rather than per head".
    for (const id of [15]) {
      expect(byId(id).pricing.mode).toBe('group')
      expect(blogFrom(id)).toBe(`$${byId(id).price} for up to ${WORDS[byId(id).pricing.tierMax]} people`)
      expect(blogIsGroupPrice(id)).toBe(true)
      expect(blogNotPerHead(id)).toBe(' rather than per head')
    }
    // Rick's Cafe is one group rate from the areas it is sold from (the west, since Nov 16 2026), so a "from".
    expect(blogFrom(14)).toBe(`from $${byId(14).price} for up to five people`)
    expect(blogIsGroupPrice(14)).toBe(true)
    // Every guest adds to it (the day with both falls): the headline is one guest's price, not a group price.
    expect(blogUnit(18)).toBe('for one person')
    expect(blogIsGroupPrice(18)).toBe(false)
  })

  test('a share is the total over the party, rounded up, never less than the share', () => {
    for (const [id, party, zone] of [[1, 3, 'montego_bay'], [15, 3, undefined], [15, 4, undefined], [1, 4, 'negril'], [14, 3, undefined]] as const) {
      const total = tourPrice(byId(id).pricing, party, zone)
      // One named area's share comes through the area clause; without an area, blogShare.
      const printed = zone ? areaClause(byId(id).pricing, party, zone, (_price, share) => share, 'not sold from there') : blogShare(id, party)
      const share = Number(printed.slice(1))
      expect(printed).toMatch(/^\$[0-9]+$/)
      expect(share * party).toBeGreaterThanOrEqual(total)
      expect((share - 1) * party).toBeLessThan(total)
    }
    expect(blogPrice(15, 3)).toBe(`$${tourPrice(byId(15).pricing, 3)}`)
    // Without an area, a tour priced by area answers with its cheapest area: a "from".
    expect(blogPrice(1, 1)).toBe(`$${tourPrice(byId(1).pricing, 1)}`)
    expect(blogPrice(1, 1)).toBe(`$${Math.min(...zonesSold(byId(1).pricing).map((z) => tourPrice(byId(1).pricing, 1, z)))}`)
  })

  test('a clause about one pickup area prints that area\'s price while it is sold, and its other wording once it is not', () => {
    const falls = byId(1)
    // Sold from there: that area's own price and share reach the sentence.
    expect(blogInArea(1, 1, 'montego_bay', (price) => `${price} picked up in Montego Bay`, 'the other wording')).toBe(`$${tourPrice(falls.pricing, 1, 'montego_bay')} picked up in Montego Bay`)
    expect(blogInArea(1, 4, 'montego_bay', (_price, share) => `about ${share}`, 'the other wording')).toBe(`about $${Math.ceil(tourPrice(falls.pricing, 4, 'montego_bay') / 4)}`)
    // The prices desk can leave an area out of a card. The clause then prints its other wording: never the
    // cheapest area's price beside this area's name, which is what tourPrice alone would give ...
    const withoutMontegoBay = { ...falls.pricing, zoneRates: Object.fromEntries(Object.entries(falls.pricing.zoneRates ?? {}).filter(([z]) => z !== 'montego_bay')) }
    expect(Object.keys(withoutMontegoBay.zoneRates).length).toBe(zonesSold(falls.pricing).length - 1)
    expect(tourPrice(withoutMontegoBay, 1, 'montego_bay')).toBe(tourPrice(withoutMontegoBay, 1)) // the trap: the cheapest area's price
    expect(areaClause(withoutMontegoBay, 1, 'montego_bay', (price) => `${price} picked up in Montego Bay`, 'the other wording')).toBe('the other wording')
    // ... and never an error. An error while the posts load fails the build, the build is what publishes a save
    // at the prices desk, and a price change saved with the dropped area would then never go live.
    expect(() => areaClause(withoutMontegoBay, 4, 'montego_bay', () => 'unused', 'the other wording')).not.toThrow()
    // A tour that is one price from everywhere has no area price to quote.
    expect(areaClause(byId(15).pricing, 2, 'negril', (price) => `${price} picked up in Negril`, 'one price everywhere')).toBe('one price everywhere')
  })

  test('no post is on its other wording today: every pickup area a post quotes is still sold', () => {
    // If this fails, the site is fine (it published, and the sentence it printed is true), but the post was
    // written around an area that is no longer sold. Read the passage and rewrite it.
    expect(fallbacksWhenThePostsLoaded).toEqual([])
    // The clauses exist and were counted: five today (the falls twice and the raft in the all-inclusive post,
    // the day with both falls twice in the Dunn's River posts).
    const src = ['lib/blog-auto-3.ts', 'lib/blog-auto-5.ts'].map((f) => readFileSync(resolve(process.cwd(), f), 'utf8')).join('\n')
    expect((src.match(/= blogInArea\(/g) ?? []).length).toBe(5)
    // And no post passes an area to the plain helpers, where the area's name would be typed beside a price
    // that is not tied to it (TypeScript refuses a third argument; this reads the source as well).
    for (const f of readdirSync(resolve(process.cwd(), 'lib')).filter((n) => /^blog.*\.ts$/.test(n) && n !== 'blog-prices.ts')) {
      const text = readFileSync(resolve(process.cwd(), 'lib', f), 'utf8')
      expect(text, f).not.toMatch(/blog(Price|Share)\([^)]*'(negril|lucea|montego_bay|trelawny|runaway_bay|ocho_rios)'/)
    }
  })
})

describe('the help page says who a group price covers from the cards', () => {
  test('the party sizes named are the ones the group cards cover', () => {
    const limits = Array.from(new Set(experiences.filter((e) => e.pricing.mode === 'group').map((e) => e.pricing.tierMax))).sort((a, b) => a - b)
    expect(limits.length).toBeGreaterThan(0)
    expect(GROUP_PARTY_LIMITS).toBe(limits.length > 1 ? `${limits.slice(0, -1).join(', ')} or ${limits[limits.length - 1]}` : String(limits[0]))
    // Today the group prices cover four, and Rick's Cafe five (since Nov 16 2026 it is priced by area, where
    // the extra rate is per guest past the cover, and its old card charged five the same as four).
    expect(GROUP_PARTY_LIMITS).toBe('4 or 5')
    expect(TOUR_PRICING_SENTENCE).toBe('Some are priced for your whole party, up to 4 or 5 guests, with a per-person rate above that; the rest are priced per person.')
    const answer = HELP_CATEGORIES.flatMap((c) => c.faqs).find((f) => f.q === 'Can I book for a group?')?.a ?? ''
    expect(answer).toContain(`Yes. Every tour is private. ${TOUR_PRICING_SENTENCE} Some are also priced by where we pick you up.`)
    for (const f of HELP_CATEGORIES.flatMap((c) => c.faqs)) expect(`${f.q} ${f.a}`, f.q).not.toMatch(/\$\{|\bundefined\b|\bNaN\b/)
  })
})
