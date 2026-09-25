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
    expect(text(html)).toContain('This Privacy Policy was last updated on September 24, 2026.')
  })

  test('has no em dashes', () => {
    expect(html).not.toContain('—')
    expect(html).not.toContain('&mdash;')
  })
})
