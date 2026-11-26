/**
 * Who may open /referrals, and as which referrer (Nov 26 2026). Pure, so the
 * rule is tested on its own (tests/unit/referral-access.spec.ts);
 * lib/referrals/server.ts reads the session and the rows.
 *
 * The owner: "The admin can add an email account that initiates and
 * invitation; when the user signs in with their gmail, they go to their
 * referral page". So the invitation is the address: a signed-in person whose
 * CONFIRMED address is a referrer's (any case) is that referrer. Google
 * sign-in is always confirmed; an email sign-up is once its link was opened
 * (mailer_autoconfirm is off), or anyone could claim an invited address.
 *
 * The database allows one referrer per address that is not removed
 * (referrers_live_email_once, migration 045). A removed one opens nothing,
 * so removing someone on the admin page closes the page to them at once.
 */

import { TERMS_VERSION } from './rules'

export type ReferrerStatus = 'invited' | 'active' | 'paused' | 'removed'

/** The referrer columns the page and the routes read (lib/referrals/server REFERRER_COLS). */
export interface ReferrerRow {
  id: string
  email: string
  name: string
  business: string | null
  status: ReferrerStatus
  commission_percent: number | string
  user_id: string | null
  invited_at: string
  invite_sent_at: string | null
  invite_sends: number
  terms_version: string | null
  terms_accepted_at: string | null
  wise_recipient_id: number | string | null
  payout_holder: string | null
  payout_last4: string | null
  payout_legal_type: string | null
  payout_added_at: string | null
  payout_hold_until: string | null
  note?: string | null
  created_at: string
  updated_at: string
  removed_at?: string | null
}

export type ReferralDenied = 'not_signed_in' | 'unconfirmed' | 'not_invited' | 'removed'

/** The address, as it is compared and stored: trimmed, lower case. */
export const emailKey = (e: string | null | undefined): string => String(e ?? '').trim().toLowerCase()

export function resolveReferrerAccess(input: {
  email: string | null | undefined
  confirmed: boolean
  rows: ReferrerRow[]
}): { ok: true; referrer: ReferrerRow } | { ok: false; denied: ReferralDenied } {
  const email = emailKey(input.email)
  if (!email) return { ok: false, denied: 'not_signed_in' }
  if (!input.confirmed) return { ok: false, denied: 'unconfirmed' }
  const mine = input.rows.filter((r) => emailKey(r.email) === email)
  const live = mine.filter((r) => r.status !== 'removed')
  // Two would break the unique index; refused, never guessed between.
  if (live.length === 1) return { ok: true, referrer: live[0] }
  if (live.length > 1) return { ok: false, denied: 'not_invited' }
  if (mine.length) return { ok: false, denied: 'removed' }
  return { ok: false, denied: 'not_invited' }
}

/** Has this referrer accepted the terms as they stand now? */
export const acceptedTerms = (r: Pick<ReferrerRow, 'terms_version' | 'terms_accepted_at'>): boolean =>
  !!r.terms_accepted_at && r.terms_version === TERMS_VERSION

/** May this referrer create codes? Only once active (terms accepted) and not paused. */
export const mayCreateCodes = (r: Pick<ReferrerRow, 'status' | 'terms_version' | 'terms_accepted_at'>): boolean =>
  r.status === 'active' && acceptedTerms(r)

/** The words the sign-in page shows for a refusal. */
export function deniedMessage(d: ReferralDenied | 'unavailable', email?: string | null): string {
  const who = email ? ` (${email})` : ''
  switch (d) {
    case 'not_signed_in': return 'Sign in to open your referral page.'
    case 'unconfirmed': return 'Confirm your email address first: open the link we emailed you, then sign in again.'
    case 'not_invited': return `This account${who} is not on our referral list. Sign in with the address your invitation was sent to, or write to contact@mapltours.com and we will add this one.`
    case 'removed': return `Referrals for this account${who} have ended. If you think that is a mistake, write to contact@mapltours.com.`
    case 'unavailable': return 'We could not open your referral page just now. Wait a minute, then try again.'
  }
}
