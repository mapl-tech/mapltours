import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { experiences } from '../../lib/experiences'

/**
 * Claims about notice and price that a guest reads on the way to paying.
 *
 * The notice period moved from 24 hours to 12 (8873288) and the checkout's own
 * Terms dialog kept saying 24, while /terms and /help said 12. And with half
 * the tours priced per guest, the dialog, the About page and the home page
 * still said tours were one price per vehicle, "not per person". Both kinds
 * of claim drift every time a rule changes, so they are checked here.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

describe('the checkout Terms dialog', () => {
  const src = read('components/checkout/LegalModal.tsx')

  test('states the notice period from the booking rule, not a typed number', () => {
    expect(src).toContain('Bookings close {MIN_LEAD_TIME_HOURS} hours')
    expect(src).not.toMatch(/Bookings close \d+ hours/)
  })
})

describe('tour pricing claims', () => {
  const perGuest = experiences.filter((e) => e.pricing.mode === 'per_person').length

  test('the catalogue still has per-guest tours (otherwise these claims can be revisited)', () => {
    expect(perGuest).toBeGreaterThan(0)
  })

  test.each([
    'components/checkout/LegalModal.tsx',
    'app/about/page.tsx',
    'components/FeedView.tsx',
  ])('%s does not say every or most tours are one price per vehicle', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/one price per vehicle for your party for tours/i)
    expect(src).not.toMatch(/most tours (are )?one price/i)
    expect(src).not.toMatch(/per vehicle for your party, not per person/i)
  })
})

/**
 * Rides are one price per vehicle only for 1 to 4 people; from 5 they are
 * priced per person (lib/airport-transfers). A first pass at the tour fix
 * above wrote "airport rides are one price per vehicle" without the limit.
 */
describe('ride pricing claims', () => {
  test.each([
    'components/checkout/LegalModal.tsx',
    'app/about/page.tsx',
    'components/FeedView.tsx',
  ])('%s gives the 1 to 4 limit wherever it says a ride is one price', (file) => {
    const src = read(file)
    expect(src).not.toMatch(/one price for the whole vehicle/i)
    for (const m of Array.from(src.matchAll(/(airport ride|airport rides)[^.;]{0,40}one price per vehicle([^.;]*)/gi))) {
      expect(m[0]).toMatch(/1 to 4/)
    }
  })
})

/**
 * Six of the twenty tours are priced by where we pick the guest up (Nov 14
 * 2026). The Terms page was changed from "a few" to "some" that morning and
 * the checkout's own Terms dialog, a second copy of the same sentence, was
 * missed until the evening.
 */
describe('how many tours are priced by pickup area', () => {
  const byArea = experiences.filter((e) => e.pricing.zoneRates && Object.keys(e.pricing.zoneRates).length > 0).length

  test('the Terms page and the checkout dialog use the same word, and it is not "a few" while a quarter or more are', () => {
    expect(byArea / experiences.length).toBeGreaterThanOrEqual(0.25)
    expect(read('app/terms/page.tsx')).toContain('Some tours are priced by where we pick you up')
    expect(read('components/checkout/LegalModal.tsx')).toContain('and some also by where we pick you up')
    for (const f of ['app/terms/page.tsx', 'components/checkout/LegalModal.tsx']) expect(read(f), f).not.toMatch(/a few (tours are priced|also) by where we pick you up/i)
  })
})

/**
 * The Activity Waiver a guest ticks at checkout names the kinds of activity
 * we sell. It named cliff diving, waterfalls, rafting, snorkeling, hiking and
 * swimming from the first catalogue; the tours that replaced it in October
 * 2026 (ATVs, ziplines, jet skis, parasailing, horseback, tubing, kayaks)
 * were not in it until the owner had them added on Nov 14 2026. A new kind of
 * tour fails here until its activity is in the waiver.
 */
describe('the Activity Waiver names what we sell', () => {
  const modal = read('components/checkout/LegalModal.tsx')
  const sentence = (modal.match(/inherent risks, including but not limited to: ([^.]*)\./) ?? [])[1] ?? ''
  // Every single tour in the catalogue, by id, and the words in the waiver that cover it.
  const COVERED_BY: Record<number, RegExp> = {
    1: /waterfall climbing/, 2: /waterfall climbing|swimming in natural bodies of water/, 3: /bamboo rafting/, 5: /all-terrain vehicles \(ATVs\)/, 6: /all-terrain vehicles \(ATVs\)/,
    7: /ziplining/, 8: /horseback riding/, 9: /horseback riding/, 10: /jet skiing/, 11: /parasailing/, 12: /kayaking/, 13: /river tubing/, 14: /cliff diving/, 15: /cultural activities/,
  }

  test('the sentence is found and still says the list is not the whole of it', () => {
    expect(sentence.length).toBeGreaterThan(100)
    expect(modal).toContain('inherent risks, including but not limited to:')
  })

  test('every tour sold on its own is covered by words in the waiver', () => {
    const singles = experiences.filter((e) => e.kind === 'single')
    for (const e of singles) {
      const words = COVERED_BY[e.id]
      expect(words, `${e.title} (tour ${e.id}) is not mapped to an activity the waiver names: add it to the waiver and to this list`).toBeDefined()
      expect(sentence, `${e.title}`).toMatch(words)
    }
    // A package is made of those tours, so it is covered by theirs.
    for (const p of experiences.filter((e) => e.kind === 'package')) for (const id of p.includes ?? []) expect(COVERED_BY[id], `${p.title} includes tour ${id}`).toBeDefined()
  })

  test('nothing it named before was dropped', () => {
    for (const kept of ['cliff diving', 'waterfall climbing', 'bamboo rafting', 'snorkeling', 'hiking through mountainous terrain', 'swimming in natural bodies of water', 'participation in cultural activities']) expect(sentence).toContain(kept)
  })
})
