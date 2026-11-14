import { describe, test, expect } from 'vitest'
import { COUNTRY_LANGUAGE, languages } from '@/lib/i18n'

/**
 * The language and currency a first visit opens in, by country (Nov 13 2026).
 * One rule holds the table together: nobody is shown a currency their country
 * does not use. It used to show Australians pounds, Mexicans euros, the
 * Portuguese Brazilian reais, and Puerto Ricans (who pay in US dollars) euros.
 */

/** What each country actually pays in, for the ones the table names. */
const PAYS_IN: Record<string, string> = {
  US: 'USD', PR: 'USD', GB: 'GBP', JM: 'JMD', JP: 'JPY', CN: 'CNY', KR: 'KRW', BR: 'BRL',
  ES: 'EUR', FR: 'EUR', BE: 'EUR', DE: 'EUR', AT: 'EUR',
}

describe('first-visit language by country', () => {
  test('every entry names a language that exists', () => {
    for (const [country, code] of Object.entries(COUNTRY_LANGUAGE)) {
      expect(languages.some((l) => l.code === code), `${country} -> ${code}`).toBe(true)
    }
  })

  test('the currency shown is the country\'s own, or US dollars (what every card is charged in)', () => {
    for (const [country, code] of Object.entries(COUNTRY_LANGUAGE)) {
      const lang = languages.find((l) => l.code === code)!
      const own = PAYS_IN[country]
      expect([own, 'USD'], `${country} is shown ${lang.currency}`).toContain(lang.currency)
    }
  })

  test('the mistakes it replaces stay fixed', () => {
    const shown = (country: string) => languages.find((l) => l.code === COUNTRY_LANGUAGE[country])
    expect(shown('AU')?.currency).toBe('USD')
    expect(shown('NZ')?.currency).toBe('USD')
    for (const c of ['MX', 'CO', 'AR', 'PE', 'CL', 'DO', 'PR']) {
      expect(shown(c)?.currency, c).toBe('USD')
      // Still Spanish: the translations are looked up by the first half of the code.
      expect(shown(c)?.code.split('-')[0], c).toBe('es')
    }
    // No entry means English and dollars: Portugal is not Brazil, Taiwan and Hong Kong are not mainland China.
    for (const c of ['PT', 'TW', 'HK', 'CH']) expect(COUNTRY_LANGUAGE[c], c).toBeUndefined()
  })

  test('Spain keeps euros, Britain pounds, Jamaica its dollar', () => {
    expect(COUNTRY_LANGUAGE.ES).toBe('es')
    expect(COUNTRY_LANGUAGE.GB).toBe('en-gb')
    expect(COUNTRY_LANGUAGE.JM).toBe('en-jm')
  })

  test('Spanish in dollars charges exactly what it shows', () => {
    const es419 = languages.find((l) => l.code === 'es-419')!
    expect(es419.rate).toBe(1)
    expect(es419.currencySymbol).toBe('$')
  })
})
