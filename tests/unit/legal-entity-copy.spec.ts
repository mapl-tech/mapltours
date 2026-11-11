import { describe, test, expect } from 'vitest'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Who the business is, said the same way on /terms and in the Terms pop-up
 * guests open at checkout (owner, Nov 11 2026). The pop-up used to call the
 * site "a product of MAPL Tech" and its content "the property of MAPL Tech"
 * while /terms named MAPL Tours Limited, so a guest read two different
 * businesses depending on where they looked.
 */

const read = (rel: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\s+/g, ' ')

const terms = read('app/terms/page.tsx')
const modal = read('components/checkout/LegalModal.tsx')
const WHO = 'MAPL Tours Jamaica is the trading name of MAPL Tours Limited, a company registered in Jamaica.'
const OWNS = 'owned by MAPL Tours Jamaica or licensed to us'

describe('the business is named the same way at checkout and on /terms', () => {
  test('both say whose trading name MAPL Tours Jamaica is', () => {
    expect(terms).toContain(WHO)
    expect(modal).toContain(WHO)
  })

  test('both say who owns the content, without naming a company that may not', () => {
    expect(terms).toContain(OWNS)
    expect(modal).toContain(OWNS)
  })

  test('the Terms pop-up no longer calls the site a product or property of MAPL Tech', () => {
    expect(modal).not.toMatch(/product of MAPL Tech|property of MAPL Tech/i)
  })
})
