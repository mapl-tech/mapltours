import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex'
import { getRouteMatcher } from 'next/dist/shared/lib/router/utils/route-matcher'
import { isNotFoundError } from 'next/dist/client/components/not-found'
import {
  DESTINATIONS,
  destinationFromSlug,
  getTransferPrice,
  resortSlug,
} from '../../lib/airport-transfers'

// The quote calculator is a large client component with its own stores; the
// page's own job is resolving the slug and writing the intro, so stub it.
vi.mock('@/components/transfers/TransfersView', () => ({ default: () => null }))

import ResortTransferPage, {
  generateMetadata,
  generateStaticParams,
} from '../../app/transfers/[resort]/page'

/**
 * /transfers/[resort] is where the Google Ads final URLs land. Two things
 * must hold: every real resort slug resolves (in the ads' title case and the
 * canonical lower case), and anything else is a 404, never a 500. A crafted
 * `/transfers/%25E0` used to throw URIError, because Next had already decoded
 * the segment once and the helper decoded it a second time.
 */

const BAD_SEGMENTS = ['%E0', '%', '100%', '%zz', '%E0%A4%A']

const matchResort = getRouteMatcher(getRouteRegex('/transfers/[resort]'))

describe('slug resolution', () => {
  test('Next hands the page an already-decoded segment', () => {
    // The premise of the fix: the route matcher decodes, so the page sees
    // "%E0" for the path /transfers/%25E0. Decoding that again is what threw.
    expect(matchResort('/transfers/%25E0')).toEqual({ resort: '%E0' })
    expect(matchResort('/transfers/Sandals-Ochi')).toEqual({ resort: 'Sandals-Ochi' })
  })

  test('every id is plain [a-z0-9-], so a slug never needs a second decode', () => {
    // destinationFromSlug compares the segment as Next hands it over. That is
    // only safe while no id contains a character a browser would percent-encode.
    for (const d of DESTINATIONS) expect(d.id, d.id).toMatch(/^[a-z0-9-]+$/)
  })

  test.each(BAD_SEGMENTS)('a malformed segment %s resolves to nothing instead of throwing', (seg) => {
    expect(() => destinationFromSlug(seg)).not.toThrow()
    expect(destinationFromSlug(seg)).toBeUndefined()
  })

  test('every pre-rendered param resolves, in both casings', () => {
    const params = generateStaticParams()
    expect(params).toHaveLength(DESTINATIONS.length * 2)
    for (const d of DESTINATIONS) {
      expect(destinationFromSlug(d.id)?.id).toBe(d.id)
      expect(destinationFromSlug(resortSlug(d.id))?.id).toBe(d.id)
    }
    for (const p of params) expect(destinationFromSlug(p.resort)).toBeDefined()
  })

  test('any other casing still resolves (dynamicParams stays on for these)', () => {
    const d = DESTINATIONS[0]
    expect(destinationFromSlug(d.id.toUpperCase())?.id).toBe(d.id)
  })

  test('an unknown resort resolves to nothing', () => {
    expect(destinationFromSlug('not-a-real-resort')).toBeUndefined()
    expect(destinationFromSlug('')).toBeUndefined()
  })
})

describe('the page answers a bad slug with a 404', () => {
  test.each(BAD_SEGMENTS)('metadata for %s is the noindex not-found shape', async (seg) => {
    const meta = await generateMetadata({ params: { resort: seg } })
    expect(meta.title).toBe('Transfer not found')
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  test.each(BAD_SEGMENTS)('rendering %s throws notFound(), not URIError', (seg) => {
    let thrown: unknown
    try {
      ResortTransferPage({ params: { resort: seg } })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeDefined()
    expect(thrown).not.toBeInstanceOf(URIError)
    expect(isNotFoundError(thrown)).toBe(true)
  })
})

describe('intro copy', () => {
  const render = (id: string) => {
    const html = renderToStaticMarkup(ResortTransferPage({ params: { resort: resortSlug(id) } }))
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1] ?? '{}')
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
    return { text, ld }
  }

  test('no space before a comma, and the fares read as one sentence', () => {
    const d = DESTINATIONS.find((x) => x.parish === 'St. Ann' && !x.estimated && !x.reopens)!
    const { text } = render(d.id)
    const oneWay = getTransferPrice(d.id, 'one_way')
    const roundTrip = getTransferPrice(d.id, 'round_trip')
    expect(text).toContain(
      `to ${d.name} in St. Ann, from $${oneWay} per vehicle one way and $${roundTrip} round trip. The fare is per vehicle`,
    )
  })

  test('holds for every destination: no stray space before punctuation, no em dash', () => {
    for (const d of DESTINATIONS) {
      const { text } = render(d.id)
      expect(text, d.id).not.toMatch(/\s[,.]/)
      expect(text, d.id).not.toContain('—')
    }
  })

  test('structured data names the brand the way the rest of the site does', () => {
    const { ld } = render(DESTINATIONS[0].id)
    expect(ld.provider?.name).toBe('MAPL Tours Jamaica')
  })
})
