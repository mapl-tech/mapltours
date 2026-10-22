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

/**
 * A ride is told as the ride it was. The email said "We drove you to and from
 * {hotel}" and asked whether the guest "walked out of arrivals" and "got to
 * the resort", to a guest who had booked a single direction. A guest who only
 * rode in is mid-trip when it lands, so "got home" and the sand in the bag are
 * wrong for them as well.
 */
describe('a ride is told in the direction it ran', () => {
  const ride = (legs?: 'arrival' | 'departure' | 'both') => render(ReviewRequest({
    ...base, firstName: 'Kalen', isTransfer: true, legs,
    tripLabel: 'Excellence Oyster Bay', tripDates: '18 October',
  }))

  test('a ride in is a ride in, for a guest who is still on holiday', async () => {
    const html = decode(await ride('arrival'))
    expect(html).toContain('We drove you from the airport to Excellence Oyster Bay, 18 October.')
    expect(html).not.toMatch(/to and from/i)
    expect(html).toContain('settled in')
    expect(html).not.toMatch(/got home/i)
    expect(html).not.toMatch(/sand in it/i)
    // The prompts are about the arrival they actually had.
    expect(html).toMatch(/walked out of arrivals/i)
    expect(html).toMatch(/got to the resort/i)
  })

  test('a ride out is a ride out, with no arrivals anywhere in it', async () => {
    const html = decode(await ride('departure'))
    expect(html).toContain('We drove you from Excellence Oyster Bay to the airport, 18 October.')
    expect(html).not.toMatch(/to and from/i)
    expect(html).not.toMatch(/arrivals/i)
    expect(html).not.toMatch(/when they land/i)
    expect(html).not.toMatch(/got to the resort/i)
    expect(html).toContain('Whether the driver was waiting when you came out of the hotel')
    expect(html).toContain('Whether you got to the airport without drama')
    // They flew home afterwards, so the line about the bag still holds.
    expect(html).toContain('got home easily')
  })

  test('a round trip, and a ride with no direction given, read as they always did', async () => {
    for (const html of [decode(await ride('both')), decode(await ride(undefined))]) {
      expect(html).toContain('We drove you to and from Excellence Oyster Bay, 18 October.')
      expect(html).toContain('got home easily')
      expect(html).toMatch(/walked out of arrivals/i)
      expect(html).toMatch(/when they land/i)
    }
  })

  test('every direction keeps the compliance posture and the house rules', async () => {
    for (const legs of ['arrival', 'departure', 'both'] as const) {
      const raw = await ride(legs)
      const html = decode(raw)
      expect(raw).not.toContain('—')
      expect(html).not.toMatch(/discount|voucher|prize|giveaway|competition/i)
      expect(html).not.toMatch(/if you enjoyed|if you were happy|only if you/i)
      expect(html).toMatch(/leave the review as well/i)
      expect(html).toContain('Excellence Oyster Bay')
    }
  })

  test('the footnote says "ride" for a guest who only rode in, who is mid-holiday, and "trip" for everyone else', async () => {
    const rideIn = decode(await ride('arrival'))
    expect(rideIn).toContain('You get this once, the day after your ride. We will not chase you about it.')
    expect(rideIn).not.toContain('the day after your trip')
    for (const legs of ['departure', 'both', undefined] as const) {
      const html = decode(await ride(legs))
      expect(html, String(legs)).toContain('You get this once, the day after your trip. We will not chase you about it.')
    }
    const tour = decode(await render(ReviewRequest({
      ...base, firstName: 'Linda', isTransfer: false, legs: 'arrival',
      tripLabel: "Dunn's River Falls Climb", tripDates: '20 September',
    })))
    expect(tour).toContain('the day after your trip')
  })

  test('signs off with the brand in full, in every direction', async () => {
    for (const legs of ['arrival', 'departure', 'both'] as const) {
      const html = decode(await ride(legs))
      expect(html, legs).toContain('MAPL Tours Jamaica, Montego Bay')
      expect(html, legs).not.toMatch(/MAPL Tours(?! Jamaica)/)
    }
  })

  test('a tour is told as a tour, whatever legs it is handed', async () => {
    const html = decode(await render(ReviewRequest({
      ...base, firstName: 'Linda', isTransfer: false, legs: 'departure',
      tripLabel: "Dunn's River Falls Climb", tripDates: '20 September',
    })))
    expect(html).toContain("Dunn's River Falls Climb")
    expect(html).toMatch(/took you out to/i)
    expect(html).not.toMatch(/drove you/i)
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
