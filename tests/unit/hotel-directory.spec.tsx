import { describe, test, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DESTINATIONS, groupDestinationsByZone } from '../../lib/airport-transfers'

// The quote calculator is a large client component with its own stores; these
// tests only need the props each page hands it.
const { seen } = vi.hoisted(() => ({ seen: [] as Array<Record<string, unknown>> }))
vi.mock('@/components/transfers/TransfersView', () => ({
  default: (props: Record<string, unknown>) => {
    seen.push(props)
    return null
  },
}))

import HotelDirectory from '../../components/transfers/HotelDirectory'
import TransfersPage from '../../app/transfers/page'
import ResortTransferPage from '../../app/transfers/[resort]/page'
import sitemap from '../../app/sitemap'

/**
 * Search Console, Nov 24 2026: Google had never crawled one of the
 * /transfers/<hotel> pages. Nothing on the site linked to them and Google had
 * not re-read the sitemap since April. /transfers now links every one
 * (HotelDirectory), and the sitemap stopped stamping every page with the
 * build time.
 */

const html = renderToStaticMarkup(<HotelDirectory />)
const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g), (m) => m[1])

describe('/transfers links every hotel page', () => {
  test('one plain link per hotel page, and nothing else', () => {
    expect(hrefs).toHaveLength(DESTINATIONS.length)
    expect(new Set(hrefs).size).toBe(DESTINATIONS.length)
    for (const d of DESTINATIONS) expect(hrefs).toContain(`/transfers/${d.id}`)
  })

  test('every hotel page in the sitemap is one of those links', () => {
    const pages = sitemap()
      .map((e) => e.url)
      .filter((u) => /^https:\/\/mapltours\.com\/transfers\/[^/]+$/.test(u))
    expect(pages).toHaveLength(DESTINATIONS.length)
    for (const u of pages) expect(hrefs).toContain(u.replace('https://mapltours.com', ''))
  })

  test("grouped by the rate card's areas, every area closed, with its count", () => {
    const groups = groupDestinationsByZone()
    expect(html.match(/<details/g)).toHaveLength(groups.length)
    expect(html).not.toMatch(/<details[^>]*\sopen/)
    for (const g of groups) {
      expect(html).toContain(`>${g.zone.label.replace(/&/g, '&amp;')}<`)
      expect(html).toContain(`${g.items.length} ${g.items.length === 1 ? 'hotel' : 'hotels'}`)
    }
  })

  test('each area reads A to Z, with "Other hotel or villa" last', () => {
    const names = (block: string) => Array.from(block.matchAll(/<a [^>]*>([^<]+)<\/a>/g), (m) => m[1].replace(/&amp;/g, '&').replace(/&#x27;/g, "'"))
    const blocks = html.split('<details').slice(1)
    for (const block of blocks) {
      const list = names(block)
      const others = list.filter((n) => n.startsWith('Other hotel or villa'))
      expect(list.slice(list.length - others.length)).toEqual(others)
      const named = list.slice(0, list.length - others.length)
      expect(named).toEqual([...named].sort((a, b) => a.localeCompare(b, 'en')))
    }
  })

  test('no prefetch: opening an area must not fetch up to 58 pages on a phone', () => {
    // next/link renders a bare <a href>; anything else here would be per-link weight.
    expect(html).not.toMatch(/<a [^>]*(style|data-prefetch)=/)
  })

  test('/transfers asks for the list and a hotel page does not', () => {
    seen.length = 0
    renderToStaticMarkup(<TransfersPage />)
    expect(seen.at(-1)).toMatchObject({ hotelDirectory: true })
    seen.length = 0
    renderToStaticMarkup(<ResortTransferPage params={{ resort: DESTINATIONS[0].id }} />)
    expect(seen.at(-1)?.hotelDirectory).toBeFalsy()
  })
})

describe('the sitemap dates only what has a date of its own', () => {
  test('lastmod on blog posts only, and never the build time', () => {
    const before = Date.now()
    const entries = sitemap()
    for (const e of entries) {
      if (/\/blog\/[^/]+$/.test(e.url)) {
        expect(e.lastModified, e.url).toBeInstanceOf(Date)
        expect((e.lastModified as Date).getTime(), e.url).toBeLessThan(before)
      } else {
        expect(e.lastModified, e.url).toBeUndefined()
      }
    }
  })

  test('the same pages as before, each once', () => {
    const urls = sitemap().map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls.filter((u) => /\/transfers\/[^/]+$/.test(u))).toHaveLength(DESTINATIONS.length)
  })
})
