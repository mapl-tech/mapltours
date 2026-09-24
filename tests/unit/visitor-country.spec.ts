import { describe, test, expect, vi, afterEach } from 'vitest'
import { countryFromHeaders, countryFromNfGeo } from '../../lib/visitor-country'
import { GET } from '@/app/api/geo/route'

// What Netlify sends: base64 of a UTF-8 JSON object.
const nfGeo = (obj: unknown) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
const US = { city: 'Miami', country: { code: 'US', name: 'United States' }, subdivision: { code: 'FL', name: 'Florida' } }

describe('reading the country from the Netlify geo header', () => {
  test('base64 JSON, as Netlify sends it', () => {
    expect(countryFromNfGeo(nfGeo(US))).toBe('US')
    expect(countryFromNfGeo(nfGeo({ country: { code: 'CA' } }))).toBe('CA')
  })

  test('a city name outside ASCII does not break the decode', () => {
    expect(countryFromNfGeo(nfGeo({ city: 'Montréal', country: { code: 'CA', name: 'Canada' } }))).toBe('CA')
  })

  test('plain JSON, and base64url without padding', () => {
    expect(countryFromNfGeo(JSON.stringify({ country: { code: 'GB' } }))).toBe('GB')
    const url = nfGeo({ city: '??>', country: { code: 'JM' } }).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(countryFromNfGeo(url)).toBe('JM')
  })

  test('a lower-case code is upper-cased; anything but two letters is unknown', () => {
    expect(countryFromNfGeo(nfGeo({ country: { code: 'us' } }))).toBe('US')
    expect(countryFromNfGeo(nfGeo({ country: { code: 'USA' } }))).toBeNull()
    expect(countryFromNfGeo(nfGeo({ country: { code: 1 } }))).toBeNull()
    expect(countryFromNfGeo(nfGeo({ country: 'US' }))).toBeNull()
    expect(countryFromNfGeo(nfGeo({ city: 'Somewhere' }))).toBeNull()
    expect(countryFromNfGeo(nfGeo(null))).toBeNull()
  })

  test('missing, empty, garbled or oversized headers are unknown, never a throw', () => {
    for (const raw of [null, undefined, '', '   ', 'not base64 !!', '{"country":', Buffer.from('not json').toString('base64'), 'x'.repeat(5000)]) {
      expect(countryFromNfGeo(raw), String(raw).slice(0, 20)).toBeNull()
    }
  })

  test('x-nf-geo first, x-country second, and neither means null', () => {
    const h = (o: Record<string, string>) => new Headers(o)
    expect(countryFromHeaders(h({ 'x-nf-geo': nfGeo(US), 'x-country': 'CA' }))).toBe('US')
    expect(countryFromHeaders(h({ 'x-nf-geo': 'garbage!!', 'x-country': 'ca' }))).toBe('CA')
    expect(countryFromHeaders(h({ 'x-country': 'GB' }))).toBe('GB')
    expect(countryFromHeaders(h({ 'x-country': 'Great Britain' }))).toBeNull()
    expect(countryFromHeaders(h({}))).toBeNull()
  })
})

describe('GET /api/geo', () => {
  afterEach(() => vi.unstubAllGlobals())

  const noStore = (r: Response) => {
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('netlify-cdn-cache-control')).toBe('no-store')
  }

  test('answers from the Netlify header without calling anybody, and is never cached', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const r = await GET(new Request('https://mapltours.com/api/geo', { headers: { 'x-nf-geo': nfGeo(US) } }))
    expect(await r.json()).toEqual({ country: 'US', country_code: 'US' })
    noStore(r)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('without the header the popup gets null, and the language detector keeps its ipapi guess', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ country_code: 'FR' }), { status: 200 })))
    const r = await GET(new Request('https://mapltours.com/api/geo'))
    expect(await r.json()).toEqual({ country: null, country_code: 'FR' })
    noStore(r)
  })

  test('an ipapi failure is two nulls, still no-store', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    let r = await GET(new Request('https://mapltours.com/api/geo'))
    expect(await r.json()).toEqual({ country: null, country_code: null })
    noStore(r)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })))
    r = await GET(new Request('https://mapltours.com/api/geo'))
    expect(await r.json()).toEqual({ country: null, country_code: null })
    noStore(r)
  })
})
