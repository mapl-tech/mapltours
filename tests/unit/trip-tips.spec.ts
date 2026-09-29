import { describe, test, expect } from 'vitest'
import { TIPS_LABEL, TIPS_ON_LINE, normaliseCountry, pretickLawful, tipsConsentValid, tipsDefaultFor } from '../../lib/trip-tips'

describe('the trip-tips box default', () => {
  test('starts unticked for everyone, the US included', () => {
    for (const c of ['US', 'us', ' Us ', 'CA', 'GB', 'JM', 'DE', '', null, undefined]) {
      expect(tipsDefaultFor(c), String(c)).toBe(false)
    }
  })

  test('a pre-tick from a page cached before the change is lawful in the US only', () => {
    expect(pretickLawful('US')).toBe(true)
    expect(pretickLawful('us')).toBe(true)
    expect(pretickLawful(' Us ')).toBe(true)
    for (const c of ['CA', 'ca', 'GB', 'JM', 'DE', '', null, undefined]) expect(pretickLawful(c), String(c)).toBe(false)
  })

  test('anything that is not a two-letter code is unknown, and unknown is never the US', () => {
    for (const c of ['USA', 'U', 'U S', '12', 'U1', 'us-east']) {
      expect(pretickLawful(c), c).toBe(false)
      expect(normaliseCountry(c), c).toBeNull()
    }
    expect(normaliseCountry(42)).toBeNull()
    expect(normaliseCountry('jm')).toBe('JM')
  })
})

describe('what counts as consent', () => {
  test('a box the visitor ticked themselves counts anywhere', () => {
    for (const country of ['US', 'CA', 'GB', 'JM', null, undefined]) {
      expect(tipsConsentValid({ optIn: true, defaultShown: 'unchecked', country }), String(country)).toBe(true)
    }
  })

  test('a pre-ticked box counts in the US only', () => {
    expect(tipsConsentValid({ optIn: true, defaultShown: 'checked', country: 'US' })).toBe(true)
    expect(tipsConsentValid({ optIn: true, defaultShown: 'checked', country: 'us' })).toBe(true)
    for (const country of ['CA', 'GB', 'JM', 'DE', '', null, undefined]) {
      expect(tipsConsentValid({ optIn: true, defaultShown: 'checked', country }), String(country)).toBe(false)
    }
  })

  test('an unticked box is never consent', () => {
    for (const defaultShown of ['checked', 'unchecked']) {
      expect(tipsConsentValid({ optIn: false, defaultShown, country: 'US' })).toBe(false)
      expect(tipsConsentValid({ optIn: false, defaultShown, country: 'CA' })).toBe(false)
    }
  })

  test('only a literal true is a tick, and an unreadable default proves nothing outside the US', () => {
    for (const optIn of ['true', 'yes', 1, 'on', null, undefined, {}]) {
      expect(tipsConsentValid({ optIn, defaultShown: 'unchecked', country: 'CA' }), String(optIn)).toBe(false)
    }
    for (const defaultShown of ['Unchecked', 'off', '', null, undefined, 0]) {
      expect(tipsConsentValid({ optIn: true, defaultShown, country: 'GB' }), String(defaultShown)).toBe(false)
    }
  })
})

describe('the copy', () => {
  test('the words the owner approved, with no em dashes and the brand in mixed case', () => {
    expect(TIPS_LABEL).toBe('Send me Jamaica trip tips from MAPL Tours Jamaica, about twice a month. Unsubscribe anytime.')
    expect(TIPS_ON_LINE).toBe('Trip tips are on. The first one comes in a couple of days.')
    for (const s of [TIPS_LABEL, TIPS_ON_LINE]) {
      expect(s).not.toMatch(/—/)
      expect(s).not.toMatch(/MAPL TOURS/)
    }
  })
})
