import { describe, test, expect, afterEach } from 'vitest'
import { operatorAlertRecipients, confirmationBcc, opsBcc } from '../../lib/email/send'

/**
 * Who is told a booking just landed.
 *
 * Collins runs every trip, and until now the alert that announces one reached
 * only the operations inbox. He was BCCed on the guest's own confirmation,
 * which carries subtotal, booking fee and total paid, so this exposes no money
 * he could not already see; what it adds is the alert itself, addressed to him,
 * at the moment the booking happens.
 *
 * The safety rule is the part worth pinning: with more than one driver on the
 * allowlist and no explicit notify address, nobody is added. Mailing every
 * driver every guest's name, phone and hotel is worse than mailing none.
 */

const OPS = ['contact@mapltours.com']

afterEach(() => {
  delete process.env.DRIVER_NOTIFY_EMAIL
  delete process.env.DRIVER_ALLOWED_EMAILS
  delete process.env.OPERATIONS_EMAIL
})

describe('operatorAlertRecipients', () => {
  test('adds the named driver alongside operations', () => {
    process.env.DRIVER_NOTIFY_EMAIL = 'collinsadventuretours@gmail.com'
    expect(operatorAlertRecipients(OPS)).toEqual([
      'contact@mapltours.com',
      'collinsadventuretours@gmail.com',
    ])
  })

  test('falls back to a single-entry allowlist, which is unambiguous', () => {
    process.env.DRIVER_ALLOWED_EMAILS = 'collinsadventuretours@gmail.com'
    expect(operatorAlertRecipients(OPS)).toContain('collinsadventuretours@gmail.com')
  })

  test('adds NOBODY when several drivers exist and none is named', () => {
    process.env.DRIVER_ALLOWED_EMAILS = 'collins@example.com, second@example.com'
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com'])
  })

  test('an explicit notify address still wins over a multi-driver allowlist', () => {
    process.env.DRIVER_ALLOWED_EMAILS = 'collins@example.com, second@example.com'
    process.env.DRIVER_NOTIFY_EMAIL = 'collins@example.com'
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com', 'collins@example.com'])
  })

  test('never duplicates when the driver is already an operations address', () => {
    process.env.DRIVER_NOTIFY_EMAIL = 'Contact@MaplTours.com'
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com'])
  })

  test('with no driver configured at all, operations is unchanged', () => {
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com'])
  })

  test('discards anything that is not an address', () => {
    process.env.DRIVER_NOTIFY_EMAIL = 'not-an-email'
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com'])
  })

  // Resend rejects the WHOLE send if any recipient is malformed, so a typo in
  // the driver address would otherwise take the operations alert down with it
  // and a booking would reach nobody at all.
  test.each([
    ['collins@gmail', 'no TLD'],
    ['collins@', 'no domain'],
    ['@gmail.com', 'no local part'],
    ['collins @gmail.com', 'internal space'],
    ['collins@gmail..com', 'double dot'],
  ])('a malformed driver address (%s, %s) is dropped without killing the ops alert', (bad) => {
    process.env.DRIVER_NOTIFY_EMAIL = bad
    expect(operatorAlertRecipients(OPS)).toEqual(['contact@mapltours.com'])
  })

  test('surrounding whitespace is trimmed rather than treated as malformed', () => {
    process.env.DRIVER_NOTIFY_EMAIL = '  collinsadventuretours@gmail.com  '
    expect(operatorAlertRecipients(OPS)).toEqual([
      'contact@mapltours.com',
      'collinsadventuretours@gmail.com',
    ])
  })

  test('keeps multiple operations addresses and dedupes case-insensitively', () => {
    process.env.DRIVER_NOTIFY_EMAIL = 'collins@example.com'
    expect(operatorAlertRecipients(['A@mapltours.com', 'a@mapltours.com', 'b@mapltours.com']))
      .toEqual(['a@mapltours.com', 'b@mapltours.com', 'collins@example.com'])
  })
})

/**
 * And who does NOT get the guest's confirmation.
 *
 * The driver used to be BCCed on it, so every booking reached him twice: once
 * as the alert and once as a blind copy of a letter written for the guest. The
 * owner's decision is that he gets the alert and not the confirmation. The
 * day-of mail is a different case and still copies him, because that message is
 * largely his own name, vehicle and number and he should see what the guest was
 * told.
 */
describe('confirmationBcc', () => {
  test('is operations only, never the driver', () => {
    process.env.OPERATIONS_EMAIL = 'contact@mapltours.com'
    process.env.DRIVER_NOTIFY_EMAIL = 'collinsadventuretours@gmail.com'
    expect(confirmationBcc('guest@example.com')).toEqual(['contact@mapltours.com'])
  })

  test('still never BCCs the guest their own copy', () => {
    process.env.OPERATIONS_EMAIL = 'contact@mapltours.com, guest@example.com'
    expect(confirmationBcc('guest@example.com')).toEqual(['contact@mapltours.com'])
  })

  test('the day-of mail is unaffected and still reaches the driver', () => {
    process.env.OPERATIONS_EMAIL = 'contact@mapltours.com'
    process.env.DRIVER_NOTIFY_EMAIL = 'collinsadventuretours@gmail.com'
    expect(opsBcc('guest@example.com')).toContain('collinsadventuretours@gmail.com')
  })

  test('falls back to the default inbox when OPERATIONS_EMAIL is unset', () => {
    expect(confirmationBcc('guest@example.com')).toEqual(['contact@mapltours.com'])
  })
})
