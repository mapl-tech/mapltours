import type { Metadata } from 'next'
import PartnerView from '@/components/PartnerView'

export const metadata: Metadata = {
  title: 'Partner With Us, List Your Experience on MAPL Tours Jamaica',
  description:
    'Jamaican guides, tour companies, drivers and restaurants: reach travellers before they land. We handle listings, payments, marketing and transport. You run the experience.',
  alternates: { canonical: 'https://mapltours.com/partner' },
  openGraph: {
    title: 'Partner With MAPL Tours Jamaica',
    description:
      'You know Jamaica. We will bring you the guests. Partner with MAPL Tours to reach travellers looking for exactly what you run.',
    url: 'https://mapltours.com/partner',
    type: 'website',
  },
}

export default function PartnerPage() {
  return <PartnerView />
}
