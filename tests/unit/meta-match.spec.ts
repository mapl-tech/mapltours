import { describe, test, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  META_PIXEL_ID,
  bookingRefOf,
  matchFields,
  normalizeCountry,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from '../../lib/meta-match'

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

describe('the browser and the server hash the same details to the same digests', () => {
  // Captured Oct 17 2026 from the live pixel (fbevents 2.9.419, dataset 0055)
  // in Chrome: fbq('init', id, { em: 'probe@example.com', ph: '15555550100',
  // fn: 'probe', ln: 'tester', external_id: 'probe@example.com' }) put these
  // in the Gateway copy's fb.advanced_matching. The server's Conversions API
  // hashes matchFields() output with plain SHA-256, so equality here is what
  // makes the two copies of one Purchase reinforce each other.
  const PIXEL = {
    em: '01daf2b30b24130a019a896a6c532bc978d2ed8cbbe618e8a09f96769a20de9d',
    ph: 'e2bd2ffe3d8da79ec3f8f3f130c79347c398e24df2805976fdc2fa0cf96b5f37',
    fn: 'ba9c736f19e7f60b7f6764adb0b7908c0a2b394e09b6c09863528c7f2bc86095',
    ln: '9bba5c53a0545e0c80184b946153c9f58387e3bd1d4ee35740f29ac2e718b019',
    // ud[external_id] and the Gateway's fb.advanced_matching.external_id.
    external_id: '01daf2b30b24130a019a896a6c532bc978d2ed8cbbe618e8a09f96769a20de9d',
  }

  test('as the guest typed them', () => {
    const m = matchFields({ email: '  Probe@Example.com ', phone: '(555) 555-0100', firstName: ' Probe', lastName: 'Tester ' })
    expect(sha256(m.em!)).toBe(PIXEL.em)
    expect(sha256(m.ph!)).toBe(PIXEL.ph)
    expect(sha256(m.fn!)).toBe(PIXEL.fn)
    expect(sha256(m.ln!)).toBe(PIXEL.ln)
    // The customer id is the normalised email on both sides.
    expect(sha256(m.external_id!)).toBe(PIXEL.external_id)
  })

  test('the pixel is the main dataset the site loads', () => {
    expect(META_PIXEL_ID).toBe('1607953960710055')
  })
})

describe('email', () => {
  test('lowercased and trimmed, or nothing', () => {
    expect(normalizeEmail(' Guest@Gmail.COM ')).toBe('guest@gmail.com')
    for (const bad of ['', 'not-an-email', 'a@b', '@x.com', null, undefined, 42]) expect(normalizeEmail(bad)).toBeUndefined()
  })
})

describe('phone: digits with the country code, or nothing', () => {
  test.each([
    ['8765550123', '18765550123'], // Jamaica, typed without +1
    ['(876) 555-0123', '18765550123'],
    ['876.555.0123', '18765550123'],
    ['416-555-0199', '14165550199'], // Canada
    ['1 (212) 555-0142', '12125550142'], // US with the trunk 1
    ['+1 876 555 0123', '18765550123'],
    ['+44 7911 123456', '447911123456'], // UK mobile with +
    ['0044 7911 123456', '447911123456'], // UK with the 00 prefix
    ['447911123456', '447911123456'], // country code typed without +
    ['+49 30 1234567', '49301234567'],
    ['+44 (0) 7911 123456', '447911123456'], // the bracketed trunk 0 after a country code
    ['+49 (0)30 1234567', '49301234567'],
    ['(876) 555-0123 ext. 4', '18765550123'], // an extension is not part of the number
    ['876-555-0123 x12', '18765550123'],
    ['876 555 0123 #22', '18765550123'],
    ['876-555-0123 extension 7', '18765550123'],
    // Pasted from Apple Contacts: wrapped in invisible bidi marks that trim() keeps.
    ['\u202D+45 32 12 34 56\u202C', '4532123456'],
    ['\u202D+65 8234 5678\u202C', '6582345678'],
    ['\u202D+44 (0) 20 7946 0958\u202C', '442079460958'],
    ['\u202D+44 7911 123456 ext. 4\u202C', '447911123456'],
    ['\uFEFF876\u200B555\u200B0123', '18765550123'],
  ])('%s → %s', (raw, want) => {
    expect(normalizePhone(raw)).toBe(want)
  })

  test.each([
    ['07911 123456'], // a UK national number: the country cannot be known
    ['555-0100'], // too short
    ['1234567890'], // a North American area code never starts with 1
    ['0123456789'],
    ['+1 123 456 7890'], // +1 but not a valid North American number
    ['+0 555 1234'],
    ['(0)20 7946 0958'], // national, with its trunk 0: never read as a North American number
    [''],
    ['   '],
  ])('%s → nothing', (raw) => {
    expect(normalizePhone(raw)).toBeUndefined()
  })

  test('non-strings are nothing', () => {
    expect(normalizePhone(null)).toBeUndefined()
    expect(normalizePhone(8765550123)).toBeUndefined()
  })

  test('a long run of spaces stays fast: it runs in the browser just before the payment confirms', () => {
    const t = performance.now()
    expect(normalizePhone('876' + ' '.repeat(50_000) + '5550123')).toBe('18765550123')
    expect(normalizePhone('x'.repeat(50_000))).toBeUndefined()
    expect(performance.now() - t).toBeLessThan(250)
  })
})

describe('names', () => {
  test('lowercase letters only, accents kept', () => {
    expect(normalizeName('  Mary-Ann ')).toBe('maryann')
    expect(normalizeName("O'Brien")).toBe('obrien')
    expect(normalizeName('José')).toBe('josé')
    expect(normalizeName('José')).toBe('josé') // NFC: a decomposed accent composes first
    expect(normalizeName('St. John 3rd')).toBe('stjohnrd')
  })

  test('nothing when nothing is left', () => {
    for (const bad of ['', '   ', '-', '123', null, undefined]) expect(normalizeName(bad)).toBeUndefined()
  })
})

describe('country', () => {
  test('two letters or nothing', () => {
    expect(normalizeCountry(' US ')).toBe('us')
    expect(normalizeCountry('ca')).toBe('ca')
    for (const bad of ['Canada', 'USA', 'u', '', null]) expect(normalizeCountry(bad)).toBeUndefined()
  })
})

describe('matchFields', () => {
  test('carries only what it could normalise', () => {
    expect(matchFields({ email: 'a@b.co', phone: '07911 123456', firstName: '', lastName: 'Ray', country: 'Jamaica' }))
      .toEqual({ em: 'a@b.co', external_id: 'a@b.co', ln: 'ray' })
    expect(matchFields(null)).toEqual({})
    expect(matchFields({})).toEqual({})
  })

  test('the booking reference matches the confirm pages and the webhook', () => {
    expect(bookingRefOf('c067affe-1234-4abc-9def-000000000000')).toBe('MAPL-C067AFFE')
  })
})
