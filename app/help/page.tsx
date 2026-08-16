import type { Metadata } from 'next'
import HelpCenter from '@/components/HelpCenter'
import { HELP_CATEGORIES } from '@/lib/help-faqs'

export const metadata: Metadata = {
  title: 'Help Center',
  description: 'Get help with your MAPL Tours Jamaica booking. FAQs on cancellations, refunds, what to bring, payments, and how to reach support.',
  alternates: {
    canonical: 'https://mapltours.com/help',
  },
}

// FAQPage structured data, built from the same array the page renders, so
// Google can surface these answers directly in search and the two can never
// disagree.
function FaqJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: HELP_CATEGORIES.flatMap((c) =>
      c.faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      }))
    ),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export default function HelpPage() {
  return (
    <>
      <FaqJsonLd />
      <HelpCenter />
    </>
  )
}
