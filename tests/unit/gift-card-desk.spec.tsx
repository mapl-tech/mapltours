import { describe, test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import GiftCardDesk, { actionsFor, balanceWords, cardState, sendResult } from '../../components/admin/GiftCardDesk'

/**
 * The gift card desk's rules (Nov 13 2026 rebuild): a card offers only what
 * its state allows, the owner is told what a send actually did, and the
 * balance is worded so only a spendable card has money "left".
 */

const NOW = Date.parse('2099-06-15T12:00:00Z')
const base = { status: 'active', expires_at: '2100-01-01T00:00:00Z', paid_at: '2099-06-01T12:00:00Z', balance: 40, initial_amount: 100, currency: 'USD' }
const c = (extra: Partial<typeof base> & Record<string, unknown> = {}) => ({ ...base, ...extra }) as typeof base

describe('a card’s state', () => {
  test('void, unpaid and used up come from the row; a live card past its date is expired', () => {
    expect(cardState(c({ status: 'void' }), NOW)).toBe('void')
    expect(cardState(c({ status: 'pending' }), NOW)).toBe('pending')
    expect(cardState(c({ status: 'depleted' }), NOW)).toBe('depleted')
    expect(cardState(c({ expires_at: '2099-06-15T11:59:59Z' }), NOW)).toBe('expired')
    expect(cardState(c({ expires_at: null as unknown as string }), NOW)).toBe('active')
    expect(cardState(c(), NOW)).toBe('active')
  })
})

describe('what each card offers', () => {
  test('a live card: send, fix the address, void; never reactivate', () => {
    expect(actionsFor(c(), NOW)).toEqual({ resend: true, fix: true, void: true, reactivate: false })
  })

  test('an unpaid card: only a new address (voiding it would strand its payment)', () => {
    expect(actionsFor(c({ status: 'pending', paid_at: null as unknown as string }), NOW)).toEqual({ resend: false, fix: true, void: false, reactivate: false })
  })

  test('a void card comes back only if it was paid for and still holds money', () => {
    expect(actionsFor(c({ status: 'void' }), NOW).reactivate).toBe(true)
    expect(actionsFor(c({ status: 'void', paid_at: null as unknown as string }), NOW).reactivate).toBe(false)
    expect(actionsFor(c({ status: 'void', balance: 0 }), NOW).reactivate).toBe(false)
  })

  test('used up and expired cards offer nothing', () => {
    const none = { resend: false, fix: false, void: false, reactivate: false }
    expect(actionsFor(c({ status: 'depleted', balance: 0 }), NOW)).toEqual(none)
    expect(actionsFor(c({ expires_at: '2099-01-01T00:00:00Z' }), NOW)).toEqual(none)
  })
})

describe('what the owner is told after a send', () => {
  const card = { code: 'MAPL-ACDE-FHJK', recipient_email: 'sam@example.com', status: 'active', delivered_at: '2099-06-01T12:00:00Z' }

  test('sent says sent (and "again" only when it had gone before)', () => {
    expect(sendResult('resend', card, { emails: { recipient: 'sent' } })).toEqual({ text: 'MAPL-ACDE-FHJK was sent again to sam@example.com.' })
    expect(sendResult('resend', { ...card, delivered_at: null }, { emails: { recipient: 'sent' } }).text).toBe('MAPL-ACDE-FHJK was sent to sam@example.com.')
  })

  test('a failed or skipped send is never reported as sent', () => {
    const failed = sendResult('resend', card, { emails: { recipient: 'failed' } })
    expect(failed.bad).toBe(true)
    expect(failed.text).toMatch(/did not go out/)
    const skipped = sendResult('resend', card, { emails: { recipient: 'skipped' } })
    expect(skipped.bad).toBe(true)
    expect(skipped.text).toMatch(/already being sent/)
    expect(sendResult('resend', card, {}).bad).toBe(true)
  })

  test('a new address: sent, failed, waiting for payment, or a send already under way', () => {
    expect(sendResult('correct_email', card, { recipientEmail: 'sam.new@example.com', emails: { recipient: 'sent' } }).text)
      .toBe('Address changed to sam.new@example.com, and MAPL-ACDE-FHJK was sent there.')
    expect(sendResult('correct_email', card, { recipientEmail: 'a@example.com', emails: { recipient: 'failed' } }).bad).toBe(true)
    expect(sendResult('correct_email', { ...card, status: 'pending' }, { recipientEmail: 'a@example.com', emails: { recipient: 'skipped' } }))
      .toEqual({ text: 'Address changed to a@example.com. MAPL-ACDE-FHJK goes there once its payment completes.' })
    const raced = sendResult('correct_email', card, { recipientEmail: 'a@example.com', emails: { recipient: 'skipped' } })
    expect(raced.bad).toBe(true)
    expect(raced.text).toMatch(/old address/)
  })
})

describe('the balance in words', () => {
  test('only a spendable card has money left', () => {
    expect(balanceWords(c(), NOW)).toEqual({ lead: '$40.00 left', rest: ' of $100.00' })
    expect(balanceWords(c({ status: 'void' }), NOW)).toEqual({ lead: '$40.00 frozen', rest: ' of $100.00' })
    expect(balanceWords(c({ expires_at: '2099-01-01T00:00:00Z' }), NOW)).toEqual({ lead: '$40.00 unspent', rest: ' of $100.00' })
    expect(balanceWords(c({ status: 'pending', balance: 100 }), NOW)).toEqual({ lead: '$100.00 once paid', rest: '' })
    expect(balanceWords(c({ status: 'depleted', balance: 0 }), NOW)).toEqual({ lead: '$0.00 left', rest: ' of $100.00' })
    expect(balanceWords(c({ balance: 1234.5, initial_amount: 2000 }), NOW).lead).toBe('$1,234.50 left')
  })
})

describe('the desk as it first renders', () => {
  test('a labelled search, the Search button idle while deliveries are checked, and no cards yet', () => {
    const html = renderToStaticMarkup(<GiftCardDesk />)
    expect(html).toMatch(/<h1 [^>]*class="adm-h1"[^>]*>Gift cards<\/h1>/)
    expect(html).toContain('Search gift cards by code or email')
    expect(html).toMatch(/<button type="submit" class="adm-btn adm-btn--primary">Search<\/button>/)
    expect(html).not.toContain('adm-gc-head')
  })
})
