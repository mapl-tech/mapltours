import { describe, test, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The editorial chrome (banner image, footer) is irrelevant to what the policy
// says; render its sections as plain markup.
vi.mock('@/components/EditorialPage', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  Section: ({ title, children }: { title: string; children: ReactNode }) => (
    <section data-title={title}>{children}</section>
  ),
}))

import PrivacyPage from '../../app/privacy/page'

/**
 * Every paid booking is copied to the ops Google Calendar by the Stripe
 * webhook (lib/google-calendar.ts): the guest's name, phone, hotel or pickup
 * place, party size, times and, for transfers, flight numbers. A processor
 * that receives that much has to be named in "Who we share data with".
 */

const html = renderToStaticMarkup(<PrivacyPage />)
const text = (fragment: string) =>
  fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&rsquo;/g, "'")

const sharing = text(html.match(/<section data-title="Who we share data with">([\s\S]*?)<\/section>/)?.[1] ?? '')

describe('privacy policy processor list', () => {
  test('names Google as the calendar processor, with what it receives', () => {
    const googleItem = text(html.match(/<li><strong>Google<\/strong>[\s\S]*?<\/li>/)?.[0] ?? '')
    expect(googleItem, 'a <li> for Google in the processor list').not.toBe('')
    expect(sharing).toContain(googleItem)
    expect(googleItem).toMatch(/Google Calendar/)
    for (const field of ['name', 'phone number', 'hotel or pickup', 'flight numbers']) {
      expect(googleItem).toContain(field)
    }
  })

  test('keeps the existing processors', () => {
    for (const name of ['Stripe', 'Resend', 'Supabase', 'Google Analytics & Hotjar']) {
      expect(sharing).toContain(name)
    }
  })

  test('keeps the last-updated line on or after the change', () => {
    expect(text(html)).toContain('This Privacy Policy was last updated on September 27, 2026.')
  })

  test('has no em dashes', () => {
    expect(html).not.toContain('—')
    expect(html).not.toContain('&mdash;')
  })
})

describe('privacy policy on trip tips', () => {
  const uses = text(html.match(/<section data-title="How we use your information">([\s\S]*?)<\/section>/)?.[1] ?? '').replace(/\u2019/g, "'")

  test('the tips box starts unticked for everyone, as lib/trip-tips.ts has it since Sept 26 2026', () => {
    expect(uses).toContain('only if you tick the trip tips box when you ask for your code (it starts unticked for everyone)')
    expect(uses).not.toMatch(/starts ticked/)
  })

  test('a booking changes the tips to ones about the trip, it does not stop them', () => {
    expect(uses).toContain("the tips change: instead of the general ones, we send a few about your own trip, using your first name and your booking's dates, flights, hotel or pickup place, party size and tours, until the trip ends.")
  })

  test('it names every booking field the trip tips print (lib/trip-tips/plan.ts TripFacts)', () => {
    // TripFacts: firstName, hotel (a ride's hotel, or a tour's pickup), arrival/departure (dates, times, flights), tours, passengers.
    for (const field of ['first name', 'dates', 'flights', 'hotel or pickup place', 'party size', 'tours']) expect(uses).toContain(field)
    expect(uses).not.toMatch(/welcome tips stop/)
  })
})
