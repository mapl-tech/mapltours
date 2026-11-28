import { describe, test, expect } from 'vitest'
import { createElement } from 'react'
import { render } from '@react-email/render'
import { referralTerms } from '@/lib/referrals/terms'
import ReferralInvite from '@/emails/ReferralInvite'
import ReferralPayoutAccount from '@/emails/ReferralPayoutAccount'
import ReferralPaid from '@/emails/ReferralPaid'
import { CANCELLATION_WINDOW_HOURS } from '@/lib/refund-pricing'
import { MAX_LIVE_CODES, MIN_PAYOUT_USD, PAYOUT_ACCOUNT_HOLD_HOURS, REFERRAL_DISCOUNT_PERCENT, TERMS_VERSION } from '@/lib/referrals/rules'

/**
 * The referral terms (a draft for the owner's approval) and the three
 * referral emails: every figure from the rules, the house rules for copy (no
 * em or en dashes, "MAPL Tours Jamaica" in full, never "collect you"), and no
 * account number, routing number or guest detail anywhere. Made-up people.
 */

const HOUSE = (text: string) => {
  expect(text).not.toMatch(/[–—]/)
  expect(text).not.toMatch(/MAPL Tours(?! Jamaica)/)
  expect(text).not.toMatch(/collect you/i)
}

describe('the terms', () => {
  const t = referralTerms(3)
  const all = t.map((s) => `${s.title}. ${s.body}`).join(' ')
  test('every figure is the rules’', () => {
    expect(all).toContain(`up to ${MAX_LIVE_CODES} codes`)
    expect(all).toContain(`${REFERRAL_DISCOUNT_PERCENT}% off`)
    expect(all).toContain('You earn 3% of what the guest pays')
    expect(all).toContain(`${CANCELLATION_WINDOW_HOURS}-hour cancellation window`)
    expect(all).toContain(`under US$${MIN_PAYOUT_USD}`)
    expect(all).toContain(`${PAYOUT_ACCOUNT_HOLD_HOURS / 24} days after it is added`)
    expect(all).toContain('every Monday')
    expect(referralTerms(2.5).map((s) => s.body).join(' ')).toContain('You earn 2.5% of what the guest pays')
  })
  test('a creator must say they earn from the code (owner, Nov 27 2026), and the version moved with the words', () => {
    const sharing = t.find((s) => s.title === 'Sharing your codes')!.body
    expect(sharing).toContain('When you share your code in a post, a story or a video, say clearly that you earn a commission, for example with #ad or "I earn a commission when you book with my code".')
    expect(TERMS_VERSION).toBe('2026-11-27')
  })
  test('it promises what the code keeps, and says where bank details go', () => {
    expect(all).toMatch(/cancelled or refunded earns nothing/)
    expect(all).toMatch(/still paid/)
    expect(all).toMatch(/straight to Wise/)
    HOUSE(all)
  })
})

describe('the emails', () => {
  test('the invitation names the address to sign in with and the real rates', async () => {
    const html = await render(createElement(ReferralInvite, { firstName: 'Ann', email: 'ann@example.com', discountPercent: '5%', commissionPercent: '3%', pageUrl: 'https://mapltours.com/referrals', supportEmail: 'contact@mapltours.com' }))
    const text = await render(createElement(ReferralInvite, { firstName: 'Ann', email: 'ann@example.com', discountPercent: '5%', commissionPercent: '3%', pageUrl: 'https://mapltours.com/referrals', supportEmail: 'contact@mapltours.com' }), { plainText: true })
    expect(text).toContain('ann@example.com')
    expect(text).toContain('5% off airport rides and tours')
    expect(text).toContain('You earn 3% of what they pay')
    expect(html).toContain('href="https://mapltours.com/referrals"')
    expect(html).not.toMatch(/token=|\?t=|secret/i)
    HOUSE(text)
  })

  test('the payout account notice: last four only, and what to do if it was not them', async () => {
    const props = { firstName: 'Ann', kind: 'changed' as const, last4: '4567', holder: 'Ann Lee', previousLast4: '1111', startsText: 'Sunday, November 29', pageUrl: 'https://mapltours.com/referrals', supportEmail: 'contact@mapltours.com' }
    const text = await render(createElement(ReferralPayoutAccount, props), { plainText: true })
    expect(text).toContain('ending 4567')
    expect(text).toContain('The account ending 1111 is no longer used')
    expect(text).toMatch(/If you did not make this change, reply to this email right away/)
    expect(text).toContain('from Sunday, November 29')
    expect(text).not.toMatch(/\d{5,}/) // no account or routing number
    HOUSE(text)
    const added = await render(createElement(ReferralPayoutAccount, { ...props, kind: 'added', previousLast4: null }), { plainText: true })
    expect(added).toMatch(/your payout account is set/i) // headings are capitals in the plain-text part
    HOUSE(added)
  })

  test('the payout notice: what went, where, and for which trips; no guest', async () => {
    const text = await render(createElement(ReferralPaid, {
      firstName: 'Ann', amount: 'US$15.08', last4: '4567', pageUrl: 'https://mapltours.com/referrals', supportEmail: 'contact@mapltours.com',
      lines: [
        { what: 'Airport ride, round trip', days: 'Nov 25 to Nov 29', code: 'CHARELA5', guestPaid: 'US$184.30', commission: 'US$5.53' },
        { what: "Dunn's River Falls Climb", days: 'Dec 2', code: 'CHARELA5', guestPaid: 'US$318.25', commission: 'US$9.55' },
      ],
    }), { plainText: true })
    expect(text).toMatch(/we sent you US\$15\.08/i)
    expect(text).toContain('2 trips')
    expect(text).toContain('ending 4567')
    expect(text).toContain('US$5.53')
    expect(text).toContain('Total sent')
    HOUSE(text)
  })
})
