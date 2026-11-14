import { describe, test, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { GET } from '../../app/llms.txt/route'

/**
 * llms.txt tells an agent that can pay in a browser, with the traveller's
 * approval, how our checkout works (ChatGPT Wallet, Nov 13 2026: "ChatGPT
 * Wallet works out of the box with existing checkout pages and payment
 * forms. No Wallet-specific integration is required."). An assistant acts on
 * these sentences, so each one is held to the pages it describes: the
 * addresses exist, the fields it names are the labels on the forms, the
 * button is the one the page renders, and the waiver box is on tours only.
 */
const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('llms.txt: paying in a browser for a traveller who approved it', () => {
  let section: string

  beforeAll(async () => {
    const body = await GET().text()
    section = body.slice(body.indexOf('## For AI agents'))
  })

  test('the paragraph is there, in plain words, and names the two checkout pages', () => {
    expect(section).toContain('If you can complete a purchase in a browser for a traveller who has approved it')
    expect(section).toContain('https://mapltours.com/transfers/checkout for an airport ride and https://mapltours.com/checkout for tours')
    expect(section).toContain('No account or sign-in is needed.')
    // The checkout pages exist where it says.
    expect(src('app/transfers/checkout/page.tsx').length).toBeGreaterThan(0)
    expect(src('app/checkout/page.tsx').length).toBeGreaterThan(0)
    // House rules for anything a guest or an assistant reads: no em dash, the name in full.
    expect(section).not.toMatch(/\u2014/)
    expect(section).not.toMatch(/MAPL Tours(?! Jamaica)/)
    expect(section).not.toMatch(/\$\{|undefined|\[object/)
  })

  test('every field it says a checkout asks for is a label on that form', () => {
    const ride = src('components/transfers/one-page/OnePageTransfersCheckout.tsx')
    const tour = src('components/checkout/one-page/OnePageCheckout.tsx')
    // Said of both.
    expect(section).toContain("Both ask for the traveller's first name, last name, email and phone.")
    for (const form of [ride, tour]) for (const label of ['First name', 'Last name', 'Email', 'Phone']) expect(form).toContain(`label="${label}"`)
    // A ride.
    expect(section).toContain('A ride also asks for each leg\'s flight: for an arrival, the flight number and when it lands at MBJ; for the ride back to the airport, the flight home\'s number and when it departs.')
    for (const label of ['Flight lands', 'Arrival flight', 'Departure flight']) expect(ride).toContain(`label="${label}"`)
    expect(ride).toContain("departureAt: 'Flight departs'")
    // A tour.
    expect(section).toContain('A tour asks for the trip date and where we pick the traveller up.')
    expect(tour).toContain("tripDate: 'Trip date'")
    expect(tour).toContain('label="Where we pick you up"')
  })

  test('the waiver box is on the tour checkout only, and the paragraph leaves it to the traveller', () => {
    expect(section).toContain('On a tour the page has a box to accept the Activity Waiver, the Terms and the Cancellation Policy. That agreement is the traveller\'s own: show it to them and tick it only when they say yes.')
    expect(src('components/checkout/one-page/OnePageCheckout.tsx')).toMatch(/Activity Waiver/)
    expect(src('components/transfers/one-page/OnePageTransfersCheckout.tsx')).not.toMatch(/Activity Waiver/)
  })

  test('what it says of the payment is what the page does', () => {
    expect(section).toContain('the button reads Pay with the full total: that is the amount charged, and nothing is added after it.')
    // Both pages hand the shared panel a button that reads "Pay" and the final total.
    for (const f of ['components/checkout/one-page/OnePageCheckout.tsx', 'components/transfers/one-page/OnePageTransfersCheckout.tsx']) {
      expect(src(f), f).toContain('`Pay ${formatUsd(finalTotal)}`')
    }
    expect(section).toContain('Pay once per approval')
    // It does not undo what the same section says about the tools: they never take payment.
    expect(section).toContain('The two start_ tools fill the cart and open a prefilled checkout page; they never take payment.')
  })
})
