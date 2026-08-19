import { describe, test, expect } from 'vitest'
import {
  CANCELLATION_SUMMARY,
  CANCELLATION_WINDOW_HOURS,
  ADMIN_CHARGE_RATE,
} from '../../lib/refund-pricing'

/**
 * One promise, one source.
 *
 * The window and the admin charge were stated in four hand-typed sentences:
 * under each of the two pay buttons, under the Stripe panel, and at the top of
 * the policy dialog those lines open. Three of them could keep saying 48 hours
 * and 20% after the rule moved, and the guest would be reading a promise the
 * refund code no longer keeps.
 */
describe('the cancellation promise', () => {
  test('states the window the refund gate actually enforces', () => {
    expect(CANCELLATION_SUMMARY.short).toContain(`${CANCELLATION_WINDOW_HOURS} hrs`)
    expect(CANCELLATION_SUMMARY.lead).toContain(`${CANCELLATION_WINDOW_HOURS} hours`)
  })

  test('states the charge the refund quote actually retains', () => {
    const pct = `${Math.round(ADMIN_CHARGE_RATE * 100)}%`
    expect(CANCELLATION_SUMMARY.short).toContain(pct)
    expect(CANCELLATION_SUMMARY.detail).toContain(pct)
  })

  test('says a started trip is no longer refundable, matching quoteRefund', () => {
    expect(CANCELLATION_SUMMARY.detail).toMatch(/non-refundable/i)
    expect(CANCELLATION_SUMMARY.detail).toMatch(/has begun/i)
  })

  test('carries no em dash, per the standing copy rule', () => {
    for (const line of Object.values(CANCELLATION_SUMMARY)) {
      expect(line).not.toContain('—')
    }
  })
})
