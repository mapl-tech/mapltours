import { describe, expect, test } from 'vitest'
import { bookingLink, linkOrigin, parseHandoff, pickupText, viaOf, type Handoff } from '@/lib/agent/booking-link'

const NOW = new Date('2026-10-01T12:00:00Z')
const O = 'https://mapltours.com'

const params = (url: string) => new URL(url).searchParams

describe('viaOf', () => {
  test.each([
    ['muse', 'muse'], ['MUSE', 'muse'], [' claude ', 'claude'], ['chatgpt', 'chatgpt'], ['gemini', 'gemini'],
    ['evil', 'mcp'], ['', 'mcp'], [undefined, 'mcp'], [42, 'mcp'],
  ])('%s -> %s', (raw, want) => expect(viaOf(raw)).toBe(want))
})

describe('linkOrigin: links always name the public site', () => {
  test.each([
    // What the function sees behind the custom domain on Netlify (Oct 2 2026).
    ['https://6abfa9bd03b6d300087ad7f1--mapltours.netlify.app/mcp?via=muse', O],
    ['https://deploy-preview-12--mapltours.netlify.app/mcp', O],
    ['https://mapltours.netlify.app/mcp', O],
    ['https://www.mapltours.com/mcp', O],
    ['https://mapltours.com/mcp', O],
    ['https://evil.example/mcp', O],
    ['http://localhost:3180/mcp', 'http://localhost:3180'],
    ['http://127.0.0.1:3100/mcp', 'http://127.0.0.1:3100'],
  ])('%s -> %s', (url, want) => expect(linkOrigin(new URL(url))).toBe(want))
})

describe('bookingLink then parseHandoff round-trips', () => {
  const cases: Handoff[] = [
    { kind: 'ride', destinationId: 'riu-negril', tripType: 'round_trip', passengers: 2, fromAirport: true, arrivalAt: '2027-03-05T14:30', arrivalFlight: 'AA1234', departureAt: '2027-03-12T12:35', departureFlight: 'AA1235' },
    { kind: 'ride', destinationId: 'riu-negril', tripType: 'one_way', passengers: 3, fromAirport: true, arrivalAt: '2027-03-05T14:30', arrivalFlight: 'DL1997' },
    { kind: 'ride', destinationId: 'riu-negril', tripType: 'one_way', passengers: 7, fromAirport: false, departureAt: '2027-03-12T09:00', departureFlight: 'B6123' },
    { kind: 'ride', destinationId: 'riu-negril', tripType: 'round_trip', passengers: 1, fromAirport: true },
    { kind: 'tour', slug: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-03-07', pickupHotel: 'Riu Negril' },
    { kind: 'tour', slug: 'bamboo-rafting-on-the-martha-brae', guests: 12, date: '2027-03-07' },
  ]
  test.each(cases)('%o', (h) => {
    const url = bookingLink(O, h, 'muse', 'start_x')
    expect(parseHandoff(params(url), NOW)).toEqual({ ok: true, handoff: h })
  })

  test('carries no personal data and tags the assistant and tool', () => {
    const url = new URL(bookingLink(O, cases[0], 'claude', 'start_transfer_booking'))
    const keys = Array.from(url.searchParams.keys()).sort()
    expect(keys).toEqual(['in', 'land', 'out', 'pax', 'pickup', 'ride', 'trip', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source'])
    expect(url.searchParams.get('utm_source')).toBe('claude')
    expect(url.searchParams.get('utm_medium')).toBe('ai_agent')
    expect(url.searchParams.get('utm_campaign')).toBe('connector')
    expect(url.searchParams.get('utm_content')).toBe('start_transfer_booking')
    expect(url.pathname).toBe('/book')
  })
})

describe('parseHandoff refuses, with a way forward', () => {
  const ride = (q: string) => parseHandoff(new URLSearchParams(q), NOW)
  test.each([
    ['', 'incomplete'],
    ['ride=riu-negril&tour=bamboo-rafting-on-the-martha-brae', 'incomplete'],
    ['ride=nowhere&trip=round_trip&pax=2', 'not on our rate card'],
    ['ride=__mbj__&trip=round_trip&pax=2', 'not on our rate card'],
    ['ride=riu-negril&trip=sideways&pax=2', 'trip type'],
    ['ride=riu-negril&pax=2', 'trip type'],
    ['ride=riu-negril&trip=round_trip&pax=0', '1 to 7'],
    ['ride=riu-negril&trip=round_trip&pax=8', '1 to 7'],
    ['ride=riu-negril&trip=round_trip&pax=2x', '1 to 7'],
    ['ride=riu-negril&trip=one_way&pax=2', 'which way'],
    ['ride=riu-negril&trip=one_way&dir=up&pax=2', 'which way'],
    ['ride=riu-negril&trip=one_way&dir=from_airport&pax=2&pickup=2027-03-12T09:00', 'does not match'],
    ['ride=riu-negril&trip=one_way&dir=to_airport&pax=2&in=AA1', 'does not match'],
    ['ride=riu-negril&trip=round_trip&pax=2&land=2027-03-12T10:00&pickup=2027-03-05T10:00', 'before the arrival'],
    ['ride=riu-negril&trip=round_trip&pax=2&land=2027-03-05', 'not valid'],
    ['ride=riu-negril&trip=round_trip&pax=2&land=2027-03-05T14:30Z', 'not valid'],
    ['ride=riu-negril&trip=round_trip&pax=2&land=2027-02-30T10:00', 'not valid'],
    ['ride=riu-negril&trip=round_trip&pax=2&land=2026-10-02T06:00', "24 hours' notice"],
  ])('%s', (q, msg) => {
    const r = ride(q)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain(msg)
      expect(r.fallbackPath.startsWith('/')).toBe(true)
      expect(r.fallbackLabel.length).toBeGreaterThan(3)
    }
  })

  test.each([
    ['tour=nope&guests=2&date=2027-03-07', 'not on our list'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=0&date=2027-03-07', '1 to 12'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=13&date=2027-03-07', '1 to 12'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=2', 'missing the tour date'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=2&date=2027-02-30', 'missing the tour date'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=2&date=07/03/2027', 'missing the tour date'],
    ['tour=bamboo-rafting-on-the-martha-brae&guests=2&date=2026-10-01', "24 hours' notice"],
  ])('%s', (q, msg) => {
    const r = ride(q)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain(msg)
  })

  test('a long hotel name is clipped, never refused', () => {
    const r = ride(`tour=bamboo-rafting-on-the-martha-brae&guests=2&date=2027-03-07&hotel=${'x'.repeat(500)}`)
    expect(r.ok && r.handoff.kind === 'tour' && r.handoff.pickupHotel?.length).toBe(120)
  })

  test('flight numbers are normalised the way the in-browser tools store them', () => {
    const r = ride('ride=riu-negril&trip=one_way&dir=from_airport&pax=2&land=2027-03-05T14:30&in=aa%201234')
    expect(r.ok && r.handoff.kind === 'ride' && r.handoff.arrivalFlight).toBe('AA1234')
  })
})

describe('pickupText: a tour pickup from a link is only a place name', () => {
  test.each([
    ['Riu Negril', 'Riu Negril'],
    ['Hôtel Mocking Bird, Port Royal', 'Hôtel Mocking Bird, Port Royal'],
    ['Villa #3 (Tryall)', 'Villa #3 (Tryall)'],
    ["Rick's Cafe & Grill", "Rick's Cafe & Grill"],
    ['  lots   of   space  ', 'lots of space'],
    ['<b>Riu</b>', 'bRiu/b'],
    ['Call 555-1234!!', 'Call 555-1234'],
    ['see www.example.com', ''],
    ['https://example.com/x', ''],
    ['me@example.com', ''],
    [42, ''],
    [undefined, ''],
  ])('%s -> %s', (raw, want) => {
    expect(pickupText(raw)).toBe(want)
  })

  test('a link built with a dirty pickup carries the clean one, and parses back to it', () => {
    const url = bookingLink(O, { kind: 'tour', slug: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-03-07', pickupHotel: 'Riu <Negril> www.x.com' }, 'muse', 't')
    expect(new URL(url).searchParams.get('hotel')).toBeNull()
    const url2 = bookingLink(O, { kind: 'tour', slug: 'bamboo-rafting-on-the-martha-brae', guests: 2, date: '2027-03-07', pickupHotel: 'Riu <Negril>' }, 'muse', 't')
    expect(new URL(url2).searchParams.get('hotel')).toBe('Riu Negril')
  })
})
