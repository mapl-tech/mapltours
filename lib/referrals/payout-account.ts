/**
 * A referrer's payout account: the Wise US-dollar account they are paid into
 * (owner, Nov 26 2026: "Payout will be done through Wise so we will need the
 * referrers to have a USD wise account and enter in their details during
 * setup"). Pure: the form's rules, shared by the page (as the guest types)
 * and the server (which decides). Tested in tests/unit/referral-payout-account.spec.ts.
 *
 * The fields are exactly the ones Wise asks for a US-dollar 'aba' recipient
 * (POST /v1/quotes/{id}/account-requirements, read Nov 26 2026): the holder's
 * name and whether the account is a person's or a business's, the routing
 * number (9 digits) and the account number (4 to 17 digits), checking or
 * savings, and the holder's address. Which address fields a country needs
 * comes from Wise too, for every one of its 229 countries
 * (lib/referrals/wise-address.json): Jamaica needs no post code, the United
 * States a state and a 5-digit ZIP, Canada a province and its post code.
 *
 * Security: the account and routing numbers go from the form to Wise and
 * nowhere else. MAPL stores the Wise recipient id, the holder's name and the
 * account's last four digits; no log line, answer or email carries the rest.
 */

import ADDRESS_RULES from './wise-address.json'

/** One country's address rule from Wise: post code and state 0 = not asked, 1 = optional, 2 = required. */
export interface AddressRule {
  n: string
  pc: 0 | 1 | 2
  re?: string
  st: 0 | 1 | 2
  s?: [string, string][]
}

export const COUNTRY_RULES = ADDRESS_RULES as unknown as Record<string, AddressRule>

/** The countries most referrers live in, first in the list. */
export const COMMON_COUNTRIES = ['JM', 'US', 'CA', 'GB']

export type LegalType = 'PRIVATE' | 'BUSINESS'
export type AccountType = 'CHECKING' | 'SAVINGS'

export interface PayoutAccountInput {
  legalType: LegalType
  holderName: string
  routingNumber: string
  accountNumber: string
  accountNumberConfirm: string
  accountType: AccountType
  country: string
  state?: string
  city: string
  street: string
  postCode?: string
}

export type PayoutField = keyof PayoutAccountInput

export interface CleanPayoutAccount {
  legalType: LegalType
  holderName: string
  routingNumber: string
  accountNumber: string
  accountType: AccountType
  country: string
  state: string | null
  city: string
  street: string
  postCode: string | null
}

export type PayoutAccountCheck =
  | { ok: true; account: CleanPayoutAccount }
  | { ok: false; errors: Partial<Record<PayoutField, string>> }

/** Wise's own pattern for accountHolderName. */
const HOLDER_RE = /^[0-9A-Za-zÀ-ÖØ-öø-ÿ\-_()'’*,.%#^@&/{}~<>+$"[\]\\ ]+$/
const digits = (s: unknown) => String(s ?? '').replace(/[\s-]/g, '')
const line = (s: unknown) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The ABA routing number checksum: 3, 7 and 1 times the digits in turn add up
 * to a multiple of 10. Catches nearly every single mistyped digit and most
 * swapped pairs before Wise is ever asked.
 */
export function routingChecksumOk(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false
  const d = r.split('').map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  return sum % 10 === 0 && sum > 0
}

/** A post code pattern from Wise, matched whole (two of Wise's patterns carry no anchors). */
function fullMatch(re: string, value: string): boolean {
  const body = re.replace(/^\^/, '').replace(/\$$/, '')
  try {
    return new RegExp(`^(?:${body})$`).test(value)
  } catch {
    return true // an unreadable pattern is Wise's to judge
  }
}

export function checkPayoutAccount(raw: Partial<Record<PayoutField, unknown>>): PayoutAccountCheck {
  const errors: Partial<Record<PayoutField, string>> = {}

  const legalType = raw.legalType === 'BUSINESS' ? 'BUSINESS' : raw.legalType === 'PRIVATE' ? 'PRIVATE' : null
  if (!legalType) errors.legalType = 'Choose whose name the account is in.'

  const holderName = line(raw.holderName)
  if (holderName.length < 2) errors.holderName = 'Type the name on the Wise account.'
  else if (holderName.length > 140) errors.holderName = 'That name is too long for Wise (140 characters at most).'
  else if (!HOLDER_RE.test(holderName)) errors.holderName = 'Use the name exactly as Wise shows it, in letters (no emoji or symbols).'
  else if (legalType === 'PRIVATE' && holderName.split(' ').filter(Boolean).length < 2) errors.holderName = 'Type the full name, first and last, as Wise shows it.'

  const routingNumber = digits(raw.routingNumber)
  if (!routingNumber) errors.routingNumber = 'Type the routing number.'
  else if (!/^\d+$/.test(routingNumber)) errors.routingNumber = 'The routing number is 9 digits, numbers only.'
  else if (routingNumber.length !== 9) errors.routingNumber = `The routing number is 9 digits. This one has ${routingNumber.length}.`
  else if (!routingChecksumOk(routingNumber)) errors.routingNumber = 'That is not a valid routing number. Check each digit against Wise.'

  const accountNumber = digits(raw.accountNumber)
  if (!accountNumber) errors.accountNumber = 'Type the account number.'
  else if (!/^\d+$/.test(accountNumber)) errors.accountNumber = 'The account number is numbers only.'
  else if (accountNumber.length < 4 || accountNumber.length > 17) errors.accountNumber = 'The account number is 4 to 17 digits.'

  const confirm = digits(raw.accountNumberConfirm)
  if (!errors.accountNumber && confirm !== accountNumber) errors.accountNumberConfirm = 'The two account numbers do not match. Type it again.'

  const accountType = raw.accountType === 'SAVINGS' ? 'SAVINGS' : raw.accountType === 'CHECKING' ? 'CHECKING' : null
  if (!accountType) errors.accountType = 'Choose checking or savings.'

  const country = String(raw.country ?? '').trim().toUpperCase()
  const rule = COUNTRY_RULES[country]
  if (!rule) errors.country = 'Choose the country of the address on the account.'

  let state: string | null = null
  if (rule && rule.st > 0) {
    const given = String(raw.state ?? '').trim().toUpperCase()
    const allowed = rule.s ?? []
    if (given) {
      if (allowed.length && !allowed.some(([code]) => code === given)) errors.state = 'Choose one from the list.'
      else state = given
    } else if (rule.st === 2) {
      errors.state = country === 'CA' ? 'Choose the province.' : 'Choose the state.'
    }
  }

  const city = line(raw.city)
  if (!city) errors.city = 'Type the town or city.'
  else if (city.length > 100) errors.city = 'That is too long for a town or city.'

  const street = line(raw.street)
  if (!street) errors.street = 'Type the street address.'
  else if (street.length > 140) errors.street = 'That address line is too long (140 characters at most).'

  let postCode: string | null = null
  if (rule && rule.pc > 0) {
    const given = line(raw.postCode).toUpperCase()
    if (!given) {
      if (rule.pc === 2) errors.postCode = country === 'US' ? 'Type the ZIP code.' : 'Type the post code.'
    } else if (given.length > 32) {
      errors.postCode = 'That post code is too long.'
    } else if (rule.re && !fullMatch(rule.re, given)) {
      errors.postCode = country === 'US' ? 'A ZIP code is 5 digits (or 5, a dash and 4).' : country === 'CA' ? 'A Canadian post code looks like K1A 0B1.' : 'Check the post code.'
    } else {
      postCode = given
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    account: {
      legalType: legalType!, holderName, routingNumber, accountNumber, accountType: accountType!,
      country, state, city, street, postCode,
    },
  }
}

/** The recipient Wise is asked to create (POST /v1/accounts), the shape MAPL's own recipients were made with. */
export function wiseRecipientBody(a: CleanPayoutAccount, profileId: number): Record<string, unknown> {
  return {
    currency: 'USD',
    type: 'aba',
    profile: profileId,
    accountHolderName: a.holderName,
    details: {
      legalType: a.legalType,
      abartn: a.routingNumber,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      address: {
        country: a.country,
        city: a.city,
        firstLine: a.street,
        ...(a.postCode ? { postCode: a.postCode } : {}),
        ...(a.state ? { state: a.state } : {}),
      },
    },
  }
}

/** The only part of the account number MAPL keeps. */
export const lastFour = (accountNumber: string): string => digits(accountNumber).slice(-4)

/** "Wise account ending 4821" */
export const accountLabel = (last4: string | null | undefined): string => (last4 ? `Wise account ending ${last4}` : 'No Wise account yet')
