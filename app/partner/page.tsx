import type { Metadata } from 'next'
import PartnerView from '@/components/PartnerView'
import { experiences } from '@/lib/experiences'
import { PLACES } from '@/lib/places'

export const metadata: Metadata = {
  title: 'Partner With Us, List Your Experience',
  description:
    'Jamaican guides, tour companies, drivers and restaurants: reach travellers before they land. We handle listings, payments, marketing and transport. You run the experience.',
  alternates: { canonical: 'https://mapltours.com/partner' },
  openGraph: {
    title: 'Partner With MAPL Tours Jamaica',
    description:
      'You know Jamaica. We will bring you the guests. Partner with MAPL Tours Jamaica to reach travellers looking for exactly what you run.',
    url: 'https://mapltours.com/partner',
    type: 'website',
    // A page that sets its own openGraph loses the site's share image unless
    // it names one.
    images: [{ url: 'https://mapltours.com/opengraph-image', width: 1200, height: 630 }],
  },
}

export default function PartnerPage() {
  // Counted here, on the server, so the page's sentence about what is on the
  // site is always the catalogue's own count and the lists stay out of the
  // browser bundle.
  return <PartnerView experienceCount={experiences.length} placeCount={PLACES.length} />
}
