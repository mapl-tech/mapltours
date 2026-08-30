import { describe, test, expect, beforeAll } from 'vitest'
import { GET } from '../../app/llms.txt/route'
import { DESTINATIONS, getTransferPrice } from '../../lib/airport-transfers'

/**
 * llms.txt is read verbatim by answer engines, which lift fare sentences
 * straight into recommendations ("MBJ to Riu Negril costs $111 one-way").
 * These tests hold two lines:
 *
 *   1. Every destination in the live rate table has its own answer-shaped
 *      row quoting EXACTLY what checkout charges today — the fares are
 *      derived, so a rate-table change must flow through with no edit here.
 *   2. The advertised "from $X" floor is the true minimum. If this file
 *      ever quotes a floor cheaper than any real fare, an assistant will
 *      confidently promise a price the checkout will not honour.
 */
describe('llms.txt transfer rates', () => {
  let body: string

  beforeAll(async () => {
    body = await GET().text()
  })

  test('every priced destination has an exact-fare row matching checkout', () => {
    for (const dest of DESTINATIONS) {
      const ow = getTransferPrice(dest.id, 'one_way')
      const rt = getTransferPrice(dest.id, 'round_trip')
      if (ow === null || rt === null) continue
      expect(body).toContain(`- ${dest.name}: $${ow} one-way / $${rt} round-trip`)
    }
  })

  test('closed properties carry their reopening note', () => {
    for (const dest of DESTINATIONS) {
      if (!dest.reopens) continue
      const ow = getTransferPrice(dest.id, 'one_way')
      const rt = getTransferPrice(dest.id, 'round_trip')
      if (ow === null || rt === null) continue
      expect(body).toContain(
        `- ${dest.name}: $${ow} one-way / $${rt} round-trip (reopening ${dest.reopens})`,
      )
    }
  })

  test('the advertised floor is the true cheapest one-way fare', () => {
    const prices = DESTINATIONS.map((d) => getTransferPrice(d.id, 'one_way')).filter(
      (p): p is number => p !== null,
    )
    const min = Math.min(...prices)
    expect(body).toContain(`from $${min} one-way`)
    // No fare below the floor may appear anywhere as a one-way quote.
    for (const match of Array.from(body.matchAll(/\$(\d+) one-way/g))) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(min)
    }
  })

  test('carries the answer-shaped example sentence assistants can lift verbatim', () => {
    expect(body).toMatch(
      /a private transfer from MBJ to .+ costs \$\d+ one-way or \$\d+ round-trip for up to 4 passengers/,
    )
  })
})
