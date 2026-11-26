import { describe, test, expect } from 'vitest'
import { decideResolution } from '@/lib/referrals/resolve'

/**
 * Resolving a referral payout that needed a look (lib/referrals/resolve): the
 * admin's answer is saved only when Wise's own state agrees with it, so the same
 * commissions can never be paid twice or left unpaid by a wrong click.
 */
describe('decideResolution', () => {
  test('paid is saved only when the money has left our balance', () => {
    expect(decideResolution('paid', 'outgoing_payment_sent')).toEqual({ ok: true, status: 'sent', cancelFirst: false })
    for (const s of ['processing', 'funds_converted', 'incoming_payment_initiated']) expect(decideResolution('paid', s)).toEqual({ ok: true, status: 'funded', cancelFirst: false })
    for (const s of ['cancelled', 'funds_refunded', 'incoming_payment_waiting']) {
      const d = decideResolution('paid', s)
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.message).toMatch(/so it was not paid\. Choose It was not paid\.$/)
    }
  })

  test('not paid is saved only when no money went, and an unfunded transfer is cancelled first', () => {
    for (const s of ['cancelled', 'funds_refunded']) expect(decideResolution('not_paid', s)).toEqual({ ok: true, status: 'failed', cancelFirst: false })
    expect(decideResolution('not_paid', 'incoming_payment_waiting')).toEqual({ ok: true, status: 'failed', cancelFirst: true })
    for (const s of ['outgoing_payment_sent', 'processing', 'funds_converted', 'incoming_payment_initiated']) {
      const d = decideResolution('not_paid', s)
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.message).toMatch(/the money has gone\. Choose It was paid\.$/)
    }
  })

  test('a state that is neither (bounced, charged back, waiting on the recipient, anything new) is settled in Wise first', () => {
    for (const s of ['bounced_back', 'charged_back', 'waiting_recipient_input_to_proceed', 'unknown', 'something_new']) {
      for (const a of ['paid', 'not_paid'] as const) {
        const d = decideResolution(a, s)
        expect(d.ok).toBe(false)
        if (!d.ok) expect(d.message).toMatch(/Settle it in Wise first/)
      }
    }
  })

  test('with no transfer on our side, no money left through it: the answer stands', () => {
    expect(decideResolution('paid', null)).toEqual({ ok: true, status: 'sent', cancelFirst: false })
    expect(decideResolution('not_paid', null)).toEqual({ ok: true, status: 'failed', cancelFirst: false })
  })
})
