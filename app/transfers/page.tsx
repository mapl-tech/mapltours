import type { Metadata } from 'next'
import TransfersView from '@/components/transfers/TransfersView'

const SITE_URL = 'https://mapltours.com'

export const metadata: Metadata = {
  title: 'Airport Transfers in Jamaica — Flat Rates from MBJ',
  description:
    'Private airport transfers from Sangster International (MBJ) to every major Jamaican resort. Flat rates for 1–4 passengers, meet-and-greet, free cancellation up to 24 hours.',
  alternates: { canonical: `${SITE_URL}/transfers` },
  openGraph: {
    title: 'Jamaica Airport Transfers — Flat Rates from MBJ',
    description:
      'Private transfers from Sangster International Airport to every major Jamaican resort. Flat-rate pricing, no surprises.',
    type: 'website',
    url: `${SITE_URL}/transfers`,
  },
}

export default function TransfersPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Airport transfer',
    name: 'MAPL Tours Jamaica — Private Airport Transfers',
    description:
      'Private flat-rate airport transfers from Sangster International Airport (MBJ) to every major resort destination across Jamaica.',
    provider: {
      '@type': 'Organization',
      name: 'MAPL Tours Jamaica',
      url: SITE_URL,
    },
    areaServed: { '@type': 'Country', name: 'Jamaica' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: '35',
      highPrice: '180',
      offerCount: 5,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TransfersView />
    </>
  )
}
