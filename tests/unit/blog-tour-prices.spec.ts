import { describe, test, expect } from 'vitest'
import { BLOG_POSTS, type BlogBlock } from '@/lib/blog'
import { experiences, slugify, tourPrice, zonesSold, isZonePriced, type Experience } from '@/lib/experiences'
import { blogFrom, blogPrice, blogShare, blogUnit } from '@/lib/blog-prices'
import { HELP_CATEGORIES, GROUP_PARTY_LIMITS } from '@/lib/help-faqs'

/**
 * A post or a help answer that quotes one of our tours has to quote what the
 * rate card charges, in the unit the card charges it in.
 *
 * Nov 14 2026: the raft had been $115 per person for a day while a post still
 * said "$128 for up to three", three passages said Nine Mile was "$459 for up
 * to three" after its price covered four, one split the falls "three ways"
 * into "$117 a head" from a price two changes old, and the help page said
 * group prices cover "usually up to 3 or 4 guests" when none covered three.
 * Each was typed. They are read from the cards now (lib/blog-prices), and
 * this file fails the day anyone types another.
 *
 * What it checks, in every sentence of every post that links one of our
 * tours: a dollar amount written "$123" is a price that tour's card produces
 * (any party of 1 to 12, from any pickup area, or one guest's share of one),
 * and the words after it agree with the card ("for up to four people" only on
 * a tour priced for the group, and only with that card's number). Prices of
 * other people's things are written "US$25" in the posts and are left alone.
 */

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const bySlug = new Map(experiences.map((e) => [slugify(e.title), e]))

const strings = (b: BlogBlock): string[] =>
  b.type === 'list' ? b.items
    : b.type === 'faq' ? b.items.flatMap((x) => [x.q, x.a])
      : b.type === 'image' ? (b.caption ? [b.caption] : [])
        : [b.text]

/** Sentences, split after a full stop that is followed by a capital or a link; "St. Ann" may split, which only narrows a sentence. */
const sentences = (s: string): string[] => s.split(/(?<=[.!?])\s+(?=[A-Z[])/)

/** Every total this card can produce, and every guest's share of one rounded up. */
function pricesOf(e: Experience): Set<number> {
  const out = new Set<number>()
  const zones = isZonePriced(e.pricing) ? [undefined, ...zonesSold(e.pricing)] : [undefined]
  for (const z of zones) {
    for (let n = 1; n <= 12; n++) {
      const total = tourPrice(e.pricing, n, z)
      out.add(total)
      out.add(Math.ceil(total / n))
    }
  }
  return out
}

interface Quote { post: string; sentence: string; tours: Experience[]; amounts: number[] }

const quotes: Quote[] = []
const deadLinks: string[] = []
for (const post of BLOG_POSTS) {
  for (const block of post.body) {
    for (const s of strings(block)) {
      for (const sentence of sentences(s)) {
        const slugs = Array.from(sentence.matchAll(/\]\(\/experience\/([a-z0-9-]+)\)/g)).map((m) => m[1])
        if (!slugs.length) continue
        for (const slug of slugs) if (!bySlug.has(slug)) deadLinks.push(`${post.slug}: /experience/${slug}`)
        const tours = slugs.map((x) => bySlug.get(x)).filter((e): e is Experience => !!e)
        // "$357", never "US$25" (someone else's price) and never part of a longer token.
        const amounts = Array.from(sentence.matchAll(/(?<![A-Za-z$])\$([0-9][0-9,]*)(?![0-9])/g)).map((m) => Number(m[1].replace(/,/g, '')))
        quotes.push({ post: post.slug, sentence, tours, amounts })
      }
    }
  }
}

describe('blog posts quote the prices the rate cards charge', () => {
  test('the posts link real tours, and several sentences do quote a price', () => {
    expect(deadLinks).toEqual([])
    // If this ever reads zero the test has stopped looking at anything.
    expect(quotes.filter((q) => q.amounts.length > 0).length).toBeGreaterThanOrEqual(7)
  })

  test('every dollar amount beside a tour link is a price that tour charges', () => {
    const wrong: string[] = []
    for (const q of quotes) {
      const valid = new Set<number>()
      for (const e of q.tours) pricesOf(e).forEach((p) => valid.add(p))
      for (const a of q.amounts) if (!valid.has(a)) wrong.push(`${q.post}: $${a} is not a price of ${q.tours.map((e) => e.title).join(' or ')} :: ${q.sentence.slice(0, 160)}`)
    }
    expect(wrong).toEqual([])
  })

  test('"for up to N" is said only of a tour priced for the group, with that card\'s number', () => {
    const wrong: string[] = []
    for (const q of quotes) {
      if (!q.amounts.length || q.tours.length !== 1) continue
      const e = q.tours[0]
      // Only the words that follow a price: "$255 for up to four people". A transfer's "up to four passengers" elsewhere in a sentence is not this.
      const m = /\$[0-9][0-9,]*\s+for up to (\w+)/.exec(q.sentence)
      if (!m) continue
      const said = WORDS.indexOf(m[1].toLowerCase()) >= 0 ? WORDS.indexOf(m[1].toLowerCase()) : Number(m[1])
      const flatGroup = e.pricing.mode === 'group' && !e.pricing.perPersonAddon
      if (!flatGroup) wrong.push(`${q.post}: "${m[0]}" but ${e.title} is not one price for the group :: ${q.sentence.slice(0, 140)}`)
      else if (said !== e.pricing.tierMax) wrong.push(`${q.post}: "${m[0]}" but ${e.title} covers up to ${e.pricing.tierMax} :: ${q.sentence.slice(0, 140)}`)
    }
    expect(wrong).toEqual([])
  })

  test('a tour priced per person is never quoted as a price for a party', () => {
    const wrong: string[] = []
    for (const q of quotes) {
      if (!q.amounts.length || q.tours.length !== 1) continue
      const e = q.tours[0]
      if (e.pricing.mode === 'group') continue
      if (/\$[0-9][0-9,]*\s+(for up to|for the (group|party)|per (party|group|vehicle|car))/.test(q.sentence)) wrong.push(`${q.post}: ${e.title} is per person :: ${q.sentence.slice(0, 160)}`)
    }
    expect(wrong).toEqual([])
  })
})

describe('the helpers the posts quote with', () => {
  const exp = (id: number) => experiences.find((e) => e.id === id)!

  test('the unit is read from the card', () => {
    // Per person (Collin, Nov 14 2026): they read "for up to three people" the day before.
    for (const id of [5, 10, 11]) {
      expect(blogUnit(id), `tour ${id}`).toBe('per person')
      expect(blogFrom(id), `tour ${id}`).toBe(`$${exp(id).price} per person`)
    }
    // Per person by pickup area: a "from", because the price depends on where we pick the guest up.
    expect(blogFrom(3)).toBe(`from $${tourPrice(exp(3).pricing, 1)} per person`)
    // One price for the group, with the card's own number in words.
    for (const id of [14, 15]) {
      expect(exp(id).pricing.mode).toBe('group')
      expect(blogFrom(id)).toBe(`$${exp(id).price} for up to ${WORDS[exp(id).pricing.tierMax]} people`)
    }
    // Every guest adds to it (the day with both falls): the headline is one guest's price.
    expect(blogUnit(18)).toBe('for one person')
  })

  test('a share is the total over the party, rounded up, never less than the share', () => {
    for (const [id, party, zone] of [[1, 3, 'montego_bay'], [15, 3, undefined], [15, 4, undefined], [1, 4, 'negril'], [14, 3, undefined]] as const) {
      const total = tourPrice(exp(id).pricing, party, zone)
      const share = Number(blogShare(id, party, zone).slice(1))
      expect(blogShare(id, party, zone)).toMatch(/^\$[0-9]+$/)
      expect(share * party).toBeGreaterThanOrEqual(total)
      expect((share - 1) * party).toBeLessThan(total)
    }
    expect(blogPrice(15, 3)).toBe(`$${tourPrice(exp(15).pricing, 3)}`)
  })
})

describe('the help page says who a group price covers from the cards', () => {
  test('the party sizes named are the ones the group cards cover', () => {
    const limits = Array.from(new Set(experiences.filter((e) => e.pricing.mode === 'group').map((e) => e.pricing.tierMax))).sort((a, b) => a - b)
    expect(GROUP_PARTY_LIMITS).toBe(limits.length > 1 ? `${limits.slice(0, -1).join(', ')} or ${limits[limits.length - 1]}` : String(limits[0]))
    // Today every group price covers four.
    expect(GROUP_PARTY_LIMITS).toBe('4')
    const answer = HELP_CATEGORIES.flatMap((c) => c.faqs).find((f) => f.q === 'Can I book for a group?')?.a ?? ''
    expect(answer).toContain(`Some are priced for your whole party, up to ${GROUP_PARTY_LIMITS} guests, with a per-person rate above that; the rest are priced per person.`)
    expect(answer).not.toMatch(/\$\{|undefined|NaN/)
  })
})
