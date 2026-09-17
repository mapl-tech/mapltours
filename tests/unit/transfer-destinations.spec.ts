import { describe, test, expect } from 'vitest'
import {
  DESTINATIONS,
  ZONES,
  searchDestinations,
  getTransferPrice,
  type TransferZone,
} from '../../lib/airport-transfers'

/**
 * The destination table is hand-maintained and sells real rides, so the two
 * things that would hurt are a duplicate id (a quote pointing at the wrong
 * hotel) and a rate below what the driver charges for that zone (a booking
 * taken at a loss). Neither is visible by reading the file — it is ninety
 * lines of near-identical objects — so they are asserted here instead.
 */

const byZone = (z: TransferZone) => DESTINATIONS.filter((d) => d.zone === z)
const zones = Object.keys(ZONES) as TransferZone[]

describe('the table itself', () => {
  test('ids are unique', () => {
    const ids = DESTINATIONS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('no two entries are the same place twice', () => {
    // Ids being unique is not enough: the list is swept from several public
    // listings that spell the same resort differently, so the same hotel can
    // arrive twice under two ids and appear twice in the dropdown. Compare
    // the names with the chrome that varies between listings removed —
    // "Hotel", "Resort & Spa", "All Inclusive", "Adults Only" — while
    // keeping the town, because Sandals Montego Bay and Sandals Negril are
    // two hotels, not one.
    const chrome = new Set([
      'hotel', 'hotels', 'resort', 'resorts', 'spa', 'the', 'a', 'and', 'all',
      'inclusive', 'adults', 'only', 'by', 'jamaica', 'ltd', 'luxury',
    ])
    const key = (name: string) =>
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\(.*?\)/g, ' ')
        .split(/[^a-z0-9]+/)
        .filter((w) => w && !chrome.has(w))
        .sort()
        .join(' ')

    const seen = new Map<string, string>()
    for (const d of DESTINATIONS) {
      const k = key(d.name)
      expect(seen.has(k), `${d.name} duplicates ${seen.get(k)}`).toBe(false)
      seen.set(k, d.name)
    }
  })

  test('every destination has a zone the table knows', () => {
    for (const d of DESTINATIONS) expect(ZONES[d.zone]).toBeTruthy()
  })

  test('every destination prices a real quote', () => {
    for (const d of DESTINATIONS) {
      expect(getTransferPrice(d.id, 'one_way')).toBeGreaterThan(0)
      expect(getTransferPrice(d.id, 'round_trip')).toBeGreaterThan(0)
    }
  })
})

describe('rates make sense against their zone', () => {
  test('no rate sits below the cheapest quoted rate in its zone', () => {
    for (const z of zones) {
      const quoted = byZone(z).filter((d) => !d.estimated).map((d) => d.baseRate)
      if (quoted.length === 0) continue
      const floor = Math.min(...quoted)
      for (const d of byZone(z)) {
        expect(
          d.baseRate,
          `${d.name} (zone ${z}) is under the zone's cheapest quoted rate`,
        ).toBeGreaterThanOrEqual(floor)
      }
    }
  })

  test('an estimate is never cheaper than a quote in the same zone', () => {
    // Estimates are guesses; a guess that undercuts a real quote is the one
    // that loses money on every booking it takes.
    for (const z of zones) {
      const quoted = byZone(z).filter((d) => !d.estimated).map((d) => d.baseRate)
      if (quoted.length === 0) continue
      const ceiling = Math.max(...quoted)
      const guessed = byZone(z).filter((d) => d.estimated && d.id.endsWith('-other'))
      for (const d of guessed) {
        expect(d.baseRate, `${d.name} should sit at the top of zone ${z}`).toBeGreaterThanOrEqual(ceiling)
      }
    }
  })

  test('the airport zone stays the cheapest of them all', () => {
    // Not a monotonic ladder — zone C reaches west to Hanover, which is nearer
    // the airport than Falmouth in zone B — but nothing may undercut zone A,
    // the twenty minutes of road MBJ sits in.
    const cheapestA = Math.min(...byZone('A').map((d) => d.baseRate))
    for (const z of zones.filter((x) => x !== 'A')) {
      expect(Math.min(...byZone(z).map((d) => d.baseRate)), `zone ${z} undercuts zone A`)
        .toBeGreaterThanOrEqual(cheapestA)
    }
  })

  test('every area a guest might arrive in has a fallback row', () => {
    // The point of the type-ahead: a hotel we have never heard of still gets
    // the right zone through its town.
    for (const z of zones) {
      expect(byZone(z).some((d) => d.id.endsWith('-other')), `zone ${z} has no fallback`).toBe(true)
    }
  })
})

describe('closed and rebuilding properties', () => {
  test('are listed, findable and quotable like any other', () => {
    // Guests book transfers months ahead of a reopening, so a property that
    // is shut today is still the right pickup point for their date. The list
    // neither hides them nor labels them.
    const shut = DESTINATIONS.filter((d) => d.reopens)
    expect(shut.length).toBeGreaterThan(10)
    for (const d of shut) {
      expect(getTransferPrice(d.id, 'one_way')).toBeGreaterThan(0)
      expect(searchDestinations(d.name).some((r) => r.id === d.id)).toBe(true)
    }
  })

  test('a reopening date, where recorded, is readable for the operator', () => {
    for (const d of DESTINATIONS.filter((x) => x.reopens)) {
      expect(d.reopens, `${d.name} has an unreadable reopening label`)
        .toMatch(/^(\d{1,2} \w{3} \d{4}|Q[1-4] \d{4}|\d{4})$/)
    }
  })
})

describe('the type-ahead finds what guests actually type', () => {
  const names = (q: string) => searchDestinations(q).map((d) => d.name)

  test('a partial brand name', () => {
    expect(names('riu palace').length).toBeGreaterThan(0)
    expect(names('sandals ochi')[0]).toContain('Sandals Ochi')
  })

  test('a resort found under its old name', () => {
    // Hilton Rose Hall is Dreams Rose Hall now, and guests booked years ago
    // under the old one.
    expect(names('hilton rose hall')[0]).toContain('Dreams Rose Hall')
  })

  test('words in any order', () => {
    expect(names('rose hall hilton')[0]).toContain('Hilton Rose Hall')
  })

  test('punctuation does not have to be typed', () => {
    // The apostrophe in "Dunn's" and the ampersand in "Resort & Spa" are
    // exactly what a guest leaves out.
    expect(names('dunns river')[0]).toContain("Dunn's River")
    expect(names('palladium resort spa')[0]).toContain('Grand Palladium')
  })

  test('a town lists its own places first, fallback last among them', () => {
    // "Negril" also matches Runaway Bay through the shared zone label
    // "Negril & Runaway Bay"; those belong below the actual Negril hotels.
    const negril = searchDestinations('negril')
    expect(negril.length).toBeGreaterThan(5)
    expect(negril[0].parish).toBe('Westmoreland')

    const westmoreland = negril.filter((d) => d.parish === 'Westmoreland')
    expect(westmoreland[westmoreland.length - 1].id).toBe('negril-other')
  })

  test('nonsense finds nothing rather than everything', () => {
    expect(searchDestinations('zzzzz')).toHaveLength(0)
  })

  test('an empty query offers the list', () => {
    expect(searchDestinations('').length).toBeGreaterThan(0)
  })
})

describe('the type-ahead forgives what phones produce', () => {
  const ids = (q: string) => searchDestinations(q).map((d) => d.id)
  const first = (q: string) => searchDestinations(q)[0]?.name ?? ''

  test('a one-letter typo still finds the brand', () => {
    expect(first('Rui')).toMatch(/^Riu/)
    expect(first('sandles')).toMatch(/^Sandals/)
    expect(first('negrill')).toMatch(/Negril/)
    expect(first('excelence')).toBe('Excellence Oyster Bay')
    expect(first('royalton hideway')).toMatch(/Royalton Hideaway/)
  })

  test('a typo never pollutes an exact list', () => {
    // "rui" is inside "cruise": a three-letter token has to start a word.
    expect(ids('riu')).not.toContain('falmouth-cruise-port')
    expect(ids('Rui')).not.toContain('falmouth-cruise-port')
  })

  test('filler words are ignored', () => {
    expect(first('the riu hotel')).toMatch(/^Riu/)
    expect(first('sandals resorts negril')).toBe('Sandals Negril Beach Resort')
    expect(first('hotel riu')).toMatch(/^Riu/)
  })

  test('a former or booking-site name finds the row', () => {
    expect(first('royal caribbean')).toMatch(/Caribbean/)
    expect(first('jewel paradise cove')).toMatch(/Paradise Cove/)
    expect(first('royal decameron')).toMatch(/Decameron/)
  })

  test('a beach or district lists its hotels', () => {
    expect(ids('seven mile beach')).toContain('sandals-negril')
    expect(ids('7 mile')).toContain('sandals-negril')
    expect(ids('mobay')).toContain('sandals-montego-bay')
    expect(ids('mammee bay')).toContain('riu-ocho-rios')
    expect(ids('silver sands')).toContain('falmouth-other')
  })

  test('a villa or Airbnb guest is offered the area rows', () => {
    for (const q of ['airbnb', 'villa', 'private villa', 'apartment']) {
      const r = searchDestinations(q)
      expect(r.length).toBe(8)
      expect(r.every((d) => d.id.endsWith('-other'))).toBe(true)
    }
  })

  test('a short exact name beats a longer one that starts the same way', () => {
    expect(first('S hotel')).toBe('S Hotel, Montego Bay')
  })

  test('before anything is typed, the popular resorts come first, then the areas', () => {
    const r = searchDestinations('')
    expect(r[0].id).toBe('sandals-negril')
    expect(r.slice(0, 12).map((d) => d.id)).toContain('riu-ocho-rios')
    expect(r[12].id.endsWith('-other')).toBe(true)
  })

  test('towns are still browsed nearest-first, not alphabetically by whoever starts with the town', () => {
    expect(first('negril')).toBe('Sandals Negril Beach Resort')
    expect(first('ocho rios')).toMatch(/Moon Palace/)
  })
})
