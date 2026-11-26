/**
 * The referral terms a referrer accepts at setup (TERMS_VERSION in
 * lib/referrals/rules: a new version asks everyone again). DRAFTED Nov 26
 * 2026 for the owner's approval ("Draft both, I approve"); legal text changes
 * only on his word. Every figure comes from the rules, so the terms can never
 * promise a rate, a discount or a day the code does not keep.
 * tests/unit/referral-terms.spec.ts holds each sentence to the rules.
 */

import { CANCELLATION_WINDOW_HOURS } from '@/lib/refund-pricing'
import { MAX_LIVE_CODES, MIN_PAYOUT_USD, PAYOUT_ACCOUNT_HOLD_HOURS, REFERRAL_DISCOUNT_PERCENT, percentText } from './rules'

export interface TermsSection {
  title: string
  body: string
}

/** The terms for a referrer on `percent`. */
export function referralTerms(percent: number | string): TermsSection[] {
  const rate = percentText(percent)
  return [
    {
      title: 'Your codes',
      body: `You can hold up to ${MAX_LIVE_CODES} codes at a time. Each one gives your guests ${REFERRAL_DISCOUNT_PERCENT}% off airport rides and tours booked at mapltours.com. One discount code per booking.`,
    },
    {
      title: 'What you earn',
      body: `You earn ${rate} of what the guest pays, after their ${REFERRAL_DISCOUNT_PERCENT}% off, on every booking made with your codes. If we ever change your rate, we will tell you first, and the change counts only for bookings paid after it.`,
    },
    {
      title: 'When a booking counts',
      body: `A commission is earned once the guest's trip has happened and the ${CANCELLATION_WINDOW_HOURS}-hour cancellation window has closed. A booking that is cancelled or refunded earns nothing. Bookings for your own travel do not earn a commission.`,
    },
    {
      title: 'When you are paid',
      body: `We pay what you have earned every Monday, in US dollars, into the Wise account you give us. Wise charges nothing for this. Amounts under US$${MIN_PAYOUT_USD} wait for the next payout. For your safety, payouts to a new or changed account start ${PAYOUT_ACCOUNT_HOLD_HOURS / 24} days after it is added.`,
    },
    {
      title: 'Sharing your codes',
      body: 'Share them with your own guests, contacts and followers. Please do not post them on coupon or deal websites, send them in messages people did not ask for, or run ads that use the MAPL Tours Jamaica name.',
    },
    {
      title: 'If something goes wrong',
      body: 'We may pause a code, or not count a booking that breaks these terms. If we do, we will tell you why.',
    },
    {
      title: 'Taxes',
      body: 'You are responsible for any tax on what you earn.',
    },
    {
      title: 'Ending',
      body: 'You or we can end your referrals at any time. Whatever you earned before then is still paid.',
    },
    {
      title: 'Your details',
      body: 'We keep your name, email address and business name, your codes, and the bookings made with them. The bank details you give us go straight to Wise, our payment provider. We keep only the account holder’s name, the last four digits, and whether it is a personal or business account.',
    },
  ]
}
