import { describe, test, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { BLOG_POSTS, type BlogBlock } from '@/lib/blog'
import { DESTINATIONS, MAX_TRANSFER_PASSENGERS, getTransferPrice, zonePriceRange, areaFromPrice } from '@/lib/airport-transfers'
import { blogRideCheapest, blogRideFrom, blogRideRange } from '@/lib/blog-prices'

/**
 * A post that quotes our own airport rides has to quote what the rate card
 * charges. On Nov 21 2026, the day Stripe's 2% conversion came out of the
 * fares, five posts still typed $22, $99, $111 and $199; they read the card
 * through lib/blog-prices now (blogRideFrom, blogRideRange, blogRideCheapest).
 *
 * Two readings:
 *  - the source: a line about our rides (it links /transfers, or names MAPL
 *    Tours Jamaica beside a ride word) types no dollar figure. Our fares go
 *    through the helpers; someone else's price is written "US$25", which is
 *    how the posts mark a price that is not ours.
 *  - the rendered posts: every "$123" in a sentence that links /transfers is
 *    a fare the card charges today, for some hotel, trip and party.
 */

const BLOG_FILES = readdirSync(resolve(__dirname, '../../lib'))
  .filter((f) => /^blog(-auto(-\d+)?)?\.ts$/.test(f))
  .map((f) => resolve(__dirname, '../../lib', f))

const RIDE_WORD = /transfer|airport|one[- ]way|round[- ]trip|fare|ride|driver|shuttle/i
const ABOUT_OUR_RIDES = /\(\/transfers|MAPL Tours Jamaica/
// A typed figure: "$109", never "US$25" (not ours) and never "${" (a helper).
const TYPED = /(?<![US{])\$[0-9]/

const fares = new Set<number>()
for (const d of DESTINATIONS) for (const t of ['one_way', 'round_trip'] as const) for (let p = 1; p <= MAX_TRANSFER_PASSENGERS; p++) {
  const f = getTransferPrice(d.id, t, p)
  if (f) fares.add(f)
}

const strings = (b: BlogBlock): string[] =>
  b.type === 'list' ? b.items
    : b.type === 'faq' ? b.items.flatMap((x) => [x.q, x.a])
      : b.type === 'image' ? (b.caption ? [b.caption] : [])
        : [b.text]

describe('ride fares in the blog', () => {
  test('the posts are found', () => {
    expect(BLOG_FILES.length).toBeGreaterThanOrEqual(6)
    expect(BLOG_POSTS.length).toBeGreaterThan(20)
  })

  test('no line about our rides types a dollar figure: our fares come from the helpers, other prices are US$', () => {
    const typed: string[] = []
    for (const file of BLOG_FILES) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (ABOUT_OUR_RIDES.test(line) && RIDE_WORD.test(line) && TYPED.test(line)) typed.push(`${file.split('/').pop()}:${i + 1} ${line.trim().slice(0, 160)}`)
      })
    }
    expect(typed).toEqual([])
  })

  test('every $ amount in a sentence that links /transfers is a fare the rate card charges', () => {
    const stale: string[] = []
    let checked = 0
    for (const post of BLOG_POSTS) {
      for (const s of [post.title, post.excerpt, ...post.body.flatMap(strings)]) {
        expect(s, post.slug).not.toMatch(/\$\{|\bblogRide(From|Range|Cheapest)\(|\bundefined\b|\bNaN\b/)
        for (const sentence of s.split(/(?<=[.!?])\s+(?=[A-Z[])/)) {
          if (!/\]\(\/transfers/.test(sentence)) continue
          for (const m of Array.from(sentence.matchAll(/(?<![A-Za-z$])\$([0-9][0-9,]*)(?![0-9])/g))) {
            checked++
            const n = Number(m[1].replace(/,/g, ''))
            if (!fares.has(n)) stale.push(`${post.slug}: $${n} in "${sentence.slice(0, 140)}"`)
          }
        }
      }
    }
    expect(stale).toEqual([])
    expect(checked).toBeGreaterThanOrEqual(6)
  })

  test('the helpers read the card, and "Negril or Ocho Rios" is one fare from both', () => {
    for (const t of ['one_way', 'round_trip'] as const) {
      expect(blogRideFrom('Negril', t)).toBe(`$${areaFromPrice('Negril', t)}`)
      // Two posts say "from $X ... to Negril or Ocho Rios": rewrite them if the two ever part.
      expect(blogRideFrom('Ocho Rios', t), `Negril and Ocho Rios ${t}`).toBe(blogRideFrom('Negril', t))
      const r = zonePriceRange('A', t)
      expect(blogRideRange('A', t)).toBe(r.min === r.max ? `$${r.min}` : `$${r.min} to $${r.max}`)
      expect(blogRideCheapest(t)).toBe(`$${Math.min(...DESTINATIONS.map((d) => getTransferPrice(d.id, t)!))}`)
    }
    expect(() => blogRideFrom('Atlantis', 'one_way')).toThrow()
  })
})
