import { describe, test, expect } from 'vitest'
import {
  checkPayoutAccount, routingChecksumOk, wiseRecipientBody, lastFour, accountLabel,
  COUNTRY_RULES, COMMON_COUNTRIES, type PayoutAccountInput,
} from '@/lib/referrals/payout-account'

/**
 * A referrer's Wise US-dollar payout account (lib/referrals/payout-account):
 * exactly the fields Wise asks for an 'aba' recipient, the address rules Wise
 * gave for every country (Nov 26 2026), and checks that catch a mistyped
 * number before Wise is asked. Made-up people and made-up account numbers;
 * 026073150 is the routing number Wise publishes for its US accounts.
 */

const good: PayoutAccountInput = {
  legalType: 'PRIVATE',
  holderName: 'Ann Lee',
  routingNumber: '026073150',
  accountNumber: '8310001234567',
  accountNumberConfirm: '8310001234567',
  accountType: 'CHECKING',
  country: 'JM',
  city: 'Montego Bay',
  street: '12 Gloucester Avenue',
}

describe('Wise address rules, as Wise gave them', () => {
  test('all 229 countries, with the ones referrers live in first', () => {
    expect(Object.keys(COUNTRY_RULES)).toHaveLength(229)
    for (const cc of COMMON_COUNTRIES) expect(COUNTRY_RULES[cc]).toBeTruthy()
    expect(COUNTRY_RULES.JM).toMatchObject({ n: 'Jamaica', pc: 0, st: 0 })
    expect(COUNTRY_RULES.US).toMatchObject({ pc: 2, st: 2 })
    expect(COUNTRY_RULES.US.s).toHaveLength(58)
    expect(COUNTRY_RULES.CA).toMatchObject({ pc: 2, st: 2 })
    expect(COUNTRY_RULES.GB).toMatchObject({ pc: 2, st: 0 })
  })
})

describe('the routing number', () => {
  test('the ABA checksum', () => {
    expect(routingChecksumOk('026073150')).toBe(true) // Wise (Community Federal Savings Bank)
    expect(routingChecksumOk('084009519')).toBe(true) // Wise (Evolve Bank & Trust)
    expect(routingChecksumOk('026073151')).toBe(false) // one digit off
    expect(routingChecksumOk('206073150')).toBe(false) // two swapped
    expect(routingChecksumOk('000000000')).toBe(false)
    expect(routingChecksumOk('12345678')).toBe(false)
  })
})

describe('checking the form', () => {
  test('a Jamaican address needs no post code', () => {
    const r = checkPayoutAccount(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.account).toEqual({
      legalType: 'PRIVATE', holderName: 'Ann Lee', routingNumber: '026073150', accountNumber: '8310001234567',
      accountType: 'CHECKING', country: 'JM', state: null, city: 'Montego Bay', street: '12 Gloucester Avenue', postCode: null,
    })
  })

  test('spaces and dashes in numbers are fine; everything is tidied', () => {
    const r = checkPayoutAccount({ ...good, routingNumber: '026 073 150', accountNumber: '8310-0012-34567', accountNumberConfirm: '8310 0012 34567', holderName: '  Ann   Lee ', city: ' Montego  Bay ' })
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.account.routingNumber, r.account.accountNumber, r.account.holderName, r.account.city]).toEqual(['026073150', '8310001234567', 'Ann Lee', 'Montego Bay'])
  })

  test('every mistake is named against its field', () => {
    const bad = checkPayoutAccount({
      legalType: 'NOPE' as never, holderName: 'A', routingNumber: '02607315', accountNumber: '12', accountNumberConfirm: '12',
      accountType: 'BOTH' as never, country: 'XX', city: '', street: '',
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['accountNumber', 'accountType', 'city', 'country', 'holderName', 'legalType', 'routingNumber', 'street'].sort())
  })

  test('the two account numbers must match', () => {
    const r = checkPayoutAccount({ ...good, accountNumberConfirm: '8310001234568' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual({ accountNumberConfirm: 'The two account numbers do not match. Type it again.' })
  })

  test('a routing number with a wrong digit is caught before Wise is asked', () => {
    const r = checkPayoutAccount({ ...good, routingNumber: '026073159' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.routingNumber).toMatch(/not a valid routing number/)
  })

  test("a person's account needs a first and a last name; a business's does not", () => {
    expect(checkPayoutAccount({ ...good, holderName: 'Ann' }).ok).toBe(false)
    expect(checkPayoutAccount({ ...good, legalType: 'BUSINESS', holderName: 'Charela' }).ok).toBe(true)
    expect(checkPayoutAccount({ ...good, holderName: 'Ann 😀 Lee' }).ok).toBe(false)
  })

  test('a US address needs its state and a 5-digit ZIP', () => {
    const us = { ...good, country: 'US', city: 'Miami', street: '1 Main St' }
    let r = checkPayoutAccount(us)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['postCode', 'state'])
    r = checkPayoutAccount({ ...us, state: 'FL', postCode: '3313' })
    expect(r.ok).toBe(false)
    r = checkPayoutAccount({ ...us, state: 'ZZ', postCode: '33131' })
    expect(r.ok).toBe(false)
    r = checkPayoutAccount({ ...us, state: 'fl', postCode: '33131-1234' })
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.account.state, r.account.postCode]).toEqual(['FL', '33131-1234'])
  })

  test("a Canadian post code is matched whole (Wise's pattern has no anchors)", () => {
    const ca = { ...good, country: 'CA', state: 'ON', city: 'Toronto', street: '1 Bay St' }
    expect(checkPayoutAccount({ ...ca, postCode: 'm5j 2n8' }).ok).toBe(true)
    expect(checkPayoutAccount({ ...ca, postCode: 'M5J 2N8 EXTRA' }).ok).toBe(false)
    expect(checkPayoutAccount({ ...ca, postCode: '12345' }).ok).toBe(false)
  })

  test("a post code given where Wise does not ask for one is not sent", () => {
    const r = checkPayoutAccount({ ...good, postCode: 'JMCJS01' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.account.postCode).toBeNull()
  })
})

describe('what goes to Wise, and what MAPL keeps', () => {
  test('the recipient body is the shape MAPL created its own recipients with', () => {
    const r = checkPayoutAccount({ ...good, country: 'US', state: 'FL', postCode: '33131', city: 'Miami', street: '1 Main St' })
    if (!r.ok) throw new Error('should pass')
    expect(wiseRecipientBody(r.account, 9001)).toEqual({
      currency: 'USD', type: 'aba', profile: 9001, accountHolderName: 'Ann Lee',
      details: {
        legalType: 'PRIVATE', abartn: '026073150', accountNumber: '8310001234567', accountType: 'CHECKING',
        address: { country: 'US', city: 'Miami', firstLine: '1 Main St', postCode: '33131', state: 'FL' },
      },
    })
  })

  test('only the last four digits are kept', () => {
    expect(lastFour('8310 0012 34567')).toBe('4567')
    expect(accountLabel('4567')).toBe('Wise account ending 4567')
    expect(accountLabel(null)).toBe('No Wise account yet')
  })
})
