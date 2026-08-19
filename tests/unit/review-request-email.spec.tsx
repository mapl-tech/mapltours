import { describe, test, expect } from 'vitest'
import { render } from '@react-email/render'
import ReviewRequest from '../../emails/ReviewRequest'

/**
 * The post-trip review request.
 *
 * Two things these lock down. The wording must match what the guest actually
 * bought, because asking a transfer customer about a tour they never took
 * tells them we do not know who they are. And the compliance posture must
 * hold: Tripadvisor prohibits incentivised reviews, and routing people by
 * sentiment ("if you enjoyed it, review us") is review gating, which is the
 * same violation with better manners.
 */

const base = {
  bookingRef: 'MAPL-7F3A21C4',
  firstName: 'Sanjay',
  reviewUrl: 'https://www.tripadvisor.ca/UserReviewEdit-g147311-d34605425',
  supportEmail: 'contact@mapltours.com',
}

/** react-email escapes apostrophes, so compare on decoded text. */
const decode = (html: string) =>
  html.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&rsquo;|’/g, "'")

const transfer = () => render(ReviewRequest({
  ...base, isTransfer: true, tripLabel: 'Azul Beach Resort Negril', tripDates: '15 to 25 August',
}))
const tour = () => render(ReviewRequest({
  ...base, firstName: 'Linda', isTransfer: false,
  tripLabel: "Dunn's River Falls Climb", tripDates: '20 September',
}))

describe('asks about the right thing', () => {
  test('a transfer guest is asked about the driving', async () => {
    const html = decode(await transfer())
    expect(html).toContain('Azul Beach Resort Negril')
    expect(html).toMatch(/drove you/i)
    expect(html).toMatch(/arrivals/i)
    // Never tour language.
    expect(html).not.toMatch(/what you ate/i)
  })

  test('a tour guest is asked about the tour, by name', async () => {
    const html = decode(await tour())
    expect(html).toContain("Dunn's River Falls Climb")
    expect(html).toMatch(/took you out to/i)
    // Never transfer language.
    expect(html).not.toMatch(/drove you to and from/i)
  })

  test('the guest name and booking reference both appear', async () => {
    const html = decode(await transfer())
    expect(html).toContain('Sanjay')
    expect(html).toContain('MAPL-7F3A21C4')
  })
})

describe('compliance holds', () => {
  test('offers no incentive of any kind', async () => {
    // Not offering one is the compliant act. The email used to also ANNOUNCE
    // that it was not offering one, which read as small print answering an
    // accusation nobody had made, so this checks for absence instead.
    for (const html of [decode(await transfer()), decode(await tour())]) {
      expect(html).not.toMatch(/discount/i)
      expect(html).not.toMatch(/voucher/i)
      expect(html).not.toMatch(/prize|giveaway|competition/i)
      expect(html).not.toMatch(/free (trip|transfer|tour|ride)/i)
      expect(html).not.toMatch(/in (exchange|return) for/i)
    }
  })

  test('does not gate by sentiment', async () => {
    for (const html of [decode(await transfer()), decode(await tour())]) {
      expect(html).not.toMatch(/if you enjoyed/i)
      expect(html).not.toMatch(/if you were happy/i)
      expect(html).not.toMatch(/only if you/i)
    }
  })

  test('offers the private route in addition to the review, not instead of it', async () => {
    const html = decode(await transfer())
    expect(html).toContain('contact@mapltours.com')
    expect(html).toMatch(/leave the review as well/i)
  })

  test('carries no em dash', async () => {
    for (const html of [await transfer(), await tour()]) {
      expect(html).not.toContain('—')
    }
  })

  test('links to Tripadvisor and prefills the complaint subject with the booking ref', async () => {
    const html = await transfer()
    expect(html).toContain('tripadvisor.ca')
    expect(html).toContain('MAPL-7F3A21C4%3A%20something%20fell%20short')
  })
})
