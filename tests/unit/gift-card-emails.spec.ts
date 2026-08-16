import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import GiftCardDelivered from '../../emails/GiftCardDelivered'
import GiftCardReceipt from '../../emails/GiftCardReceipt'

/**
 * A gift card email that renders without its code is worthless — the code IS
 * the card, and there is no other copy the recipient can reach. These tests
 * exist because every optional field on these templates (sender name, message,
 * recipient name, expiry) is a chance to throw or to silently drop the code.
 */

const CODE = 'MAPL-7K4Q-P2XR'

describe('GiftCardDelivered', () => {
  test('renders the code, the value and the sender', async () => {
    const html = await render(
      GiftCardDelivered({
        code: CODE,
        amount: 150,
        currency: 'USD',
        recipientName: 'Andre',
        senderName: 'Simone',
        message: 'Enjoy every minute of it.',
        expiresAt: '2028-08-16T00:00:00.000Z',
      }),
    )
    expect(html).toContain(CODE)
    expect(html).toContain('$150.00')
    expect(html).toContain('Simone')
    expect(html).toContain('Andre')
    expect(html).toContain('Enjoy every minute of it.')
  })

  test('survives an anonymous gift with no name, message or expiry', async () => {
    const html = await render(
      GiftCardDelivered({
        code: CODE,
        amount: 50,
        currency: 'USD',
        recipientName: null,
        senderName: null,
        message: null,
        expiresAt: null,
      }),
    )
    expect(html).toContain(CODE)
    expect(html).toContain('$50.00')
    // No expiry given means no expiry sentence, not "Valid until null".
    expect(html).not.toContain('Valid until')
    expect(html.toLowerCase()).not.toContain('null')
  })

  test('states the expiry date when the card has one', async () => {
    const html = await render(
      GiftCardDelivered({
        code: CODE,
        amount: 100,
        currency: 'USD',
        expiresAt: '2028-08-16T00:00:00.000Z',
      }),
    )
    expect(html).toContain('Valid until')
    expect(html).toContain('2028')
  })

  test('the plain-text part still carries the code', async () => {
    // Some clients render text-only; losing the code there loses the gift.
    const text = await render(
      GiftCardDelivered({ code: CODE, amount: 100, currency: 'USD' }),
      { plainText: true },
    )
    expect(text).toContain(CODE)
  })
})

describe('GiftCardReceipt', () => {
  test('repeats the code so a mistyped recipient is recoverable', async () => {
    const html = await render(
      GiftCardReceipt({
        code: CODE,
        amount: 250,
        currency: 'USD',
        recipientName: 'Andre',
        recipientEmail: 'andre@example.com',
        expiresAt: null,
      }),
    )
    expect(html).toContain(CODE)
    expect(html).toContain('andre@example.com')
    expect(html).toContain('$250.00')
  })

  test('renders when the buyer never gave the recipient a name', async () => {
    const html = await render(
      GiftCardReceipt({
        code: CODE,
        amount: 75,
        currency: 'USD',
        recipientName: null,
        recipientEmail: 'someone@example.com',
      }),
    )
    expect(html).toContain('someone@example.com')
    expect(html.toLowerCase()).not.toContain('null')
  })
})
