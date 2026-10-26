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
