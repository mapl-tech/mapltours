import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bookingRefOf } from '../../lib/meta-match'
import { bookingRef } from '../../lib/dispatch'

/**
 * The browser half of the Purchase's matching depends on wiring no rendered
 * test covers: both checkouts must hand the guest's details to the payment
 * panel, and the reference the panel stores them under must be the same
 * string the confirmation page reports, or trackPurchase drops them as
 * another booking's. Nothing fails loudly if either drifts; matching just
 * stops. So the source is held here.
 */

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const ID = 'c067affe-1234-4abc-9def-000000000000'

describe('both checkouts hand the guest details to the payment panel', () => {
  test.each([
    'components/checkout/one-page/OnePageCheckout.tsx',
    'components/transfers/one-page/OnePageTransfersCheckout.tsx',
  ])('%s', (path) => {
    expect(read(path)).toContain('purchaseMatch={{ email: form.email, phone: form.phone, firstName: form.firstName, lastName: form.lastName }}')
  })
})

describe('one booking reference everywhere', () => {
  test('the stored reference, the webhook event id and the confirm pages agree', () => {
    expect(bookingRefOf(ID)).toBe('MAPL-C067AFFE')
    expect(bookingRef(ID)).toBe(bookingRefOf(ID))
    for (const page of ['app/checkout/confirm/page.tsx', 'app/transfers/confirm/page.tsx']) {
      const src = read(page)
      expect(src, page).toContain("function humanizeId(id: string): string {\n  return 'MAPL-' + id.slice(0, 8).toUpperCase()\n}")
      expect(src, page).toContain('bookingRef={data.bookingRef}')
    }
  })

  test.each([
    'app/checkout/confirm/ConfirmClient.tsx',
    'app/transfers/confirm/ConfirmClient.tsx',
  ])('%s reports that reference as the Purchase id', (path) => {
    expect(read(path)).toContain('transactionId: bookingRef,')
  })
})
