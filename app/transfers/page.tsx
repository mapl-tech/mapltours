import type { Metadata } from 'next'
import TransfersView from '@/components/transfers/TransfersView'
import { ZONES, DESTINATIONS, getTransferPrice, zoneFromPrice } from '@/lib/airport-transfers'
import { TRANSFER_FAQS } from '@/lib/airport-transfers-content'
import { HERO } from '@/lib/images'

const SITE_URL = 'https://mapltours.com'
const PAGE_URL = `${SITE_URL}/transfers`

export const metadata: Metadata = {
  title: 'Jamaica Airport Transfers from MBJ',
  description:
    'Private transfers from Sangster (MBJ) to Negril, Ocho Rios, Falmouth and every resort. Flat rates from $19 per vehicle, meet-and-greet, flight tracking.',
  keywords: [
    'Jamaica airport transfer',
    'Montego Bay airport transfer',
    'MBJ airport transfer',
    'Sangster airport taxi',
    'Jamaica private transfer',
    'airport transfer Negril',
    'airport transfer Ocho Rios',
    'Kingston airport transfer',
    'Jamaica airport shuttle',
    'private car Montego Bay',
    'Jamaica transportation',
    'MBJ to Negril',
    'MBJ to Ocho Rios',
    'Sandals airport transfer',
    'flat rate Jamaica taxi',
    // Resort routes with proven booking demand (from live reservations).
    'Montego Bay to Negril transfer',
    'MBJ to Lucea transfer',
    'MBJ to Rose Hall transfer',
    'Royalton Negril airport transfer',
    'Grand Palladium Lucea transfer',
    'Hilton Rose Hall transfer',
    'airport transfer Falmouth',
    'airport transfer Runaway Bay',
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: 'Jamaica Airport Transfers, Flat Rates from Montego Bay (MBJ)',
    description:
      'Private flat-rate airport transfers from Sangster International Airport (MBJ) to every major resort in Jamaica. Meet-and-greet, flight tracking, flexible cancellation.',
    type: 'website',
    url: PAGE_URL,
    siteName: 'MAPL Tours Jamaica',
    locale: 'en_US',
    images: [
      {
        url: HERO,
        width: 1920,
        height: 1080,
        alt: 'Aerial view of Jamaica’s north-coast road, MAPL Tours airport-transfer route.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jamaica Airport Transfers, Flat Rates from MBJ',
    description:
      'Flat-rate private transfers to every major Jamaican resort. Meet-and-greet, flight tracking, flexible cancellation.',
    images: [HERO],
  },
  robots: { index: true, follow: true },
}

/**
 * Build the structured-data payload the /transfers page emits. Google and
 * LLM crawlers ingest these as separate entities:
 *
 *  • Service, the offering, with an AggregateOffer and price range that
 *    renders as a rich price snippet in some search UIs.
 *  • AggregateRating, review count + rating stars.
 *  • FAQPage, the full FAQ, which Google can surface as "People also ask".
 *  • BreadcrumbList, home > transfers crumb trail.
 */
function buildStructuredData() {
  const allOneWay = DESTINATIONS.map((d) => getTransferPrice(d.id, 'one_way') ?? 0).filter(Boolean)
  const allRound = DESTINATIONS.map((d) => getTransferPrice(d.id, 'round_trip') ?? 0).filter(Boolean)
  const minPrice = Math.min(...allOneWay)
  const maxPrice = Math.max(...allRound)

  const serviceSchema = {
    '@context': 'https://schema.org',
    // TaxiService is the schema.org subtype for ground transport; it inherits
    // everything Service has but classifies the page precisely for
    // airport-transfer intent in search engines and AI crawlers.
    '@type': 'TaxiService',
    '@id': `${PAGE_URL}#service`,
    serviceType: 'Airport transfer',
    name: 'MAPL Tours Jamaica, Private Airport Transfers',
    description:
      'Private flat-rate airport transfers from Sangster International Airport (MBJ) to every major resort destination in Jamaica. Licensed drivers, flight tracking, meet-and-greet at arrivals, flexible cancellation within 48 hours of booking.',
    image: HERO.startsWith('http') ? HERO : `${SITE_URL}${HERO}`,
    url: PAGE_URL,
    brand: { '@type': 'Brand', name: 'MAPL Tours Jamaica' },
    provider: {
      '@type': 'Organization',
      name: 'MAPL Tours Jamaica',
      url: SITE_URL,
      logo: `${SITE_URL}/brand/mapl-icon-1024.png`,
    },
    // Geographic coverage: the towns MAPL actually drives to, so search
    // engines associate the transfer service with each destination, not just
    // "Jamaica" as a whole. Mirrors the live zone/destination table.
    areaServed: [
      { '@type': 'Country', name: 'Jamaica' },
      { '@type': 'City', name: 'Montego Bay' },
      { '@type': 'City', name: 'Rose Hall' },
      { '@type': 'City', name: 'Falmouth' },
      { '@type': 'City', name: 'Lucea' },
      { '@type': 'City', name: 'Runaway Bay' },
      { '@type': 'City', name: 'Ocho Rios' },
      { '@type': 'City', name: 'Negril' },
    ],
    // Departure point: Sangster International (MBJ), with coordinates, so the
    // service is geo-anchored to the airport every transfer starts from.
    location: {
      '@type': 'Airport',
      name: 'Sangster International Airport',
      iataCode: 'MBJ',
      address: { '@type': 'PostalAddress', addressLocality: 'Montego Bay', addressRegion: 'Saint James', addressCountry: 'JM' },
      geo: { '@type': 'GeoCoordinates', latitude: 18.5037, longitude: -77.9134 },
    },
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: PAGE_URL,
      availableLanguage: ['en'],
    },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: String(minPrice),
      highPrice: String(maxPrice),
      offerCount: Object.keys(ZONES).length * 2,
      availability: 'https://schema.org/InStock',
      offers: Object.values(ZONES).flatMap((z) => [
        {
          '@type': 'Offer',
          name: `One-way transfer, ${z.label}`,
          priceSpecification: {
            '@type': 'PriceSpecification',
            minPrice: String(zoneFromPrice(z.code, 'one_way')),
            priceCurrency: 'USD',
          },
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          areaServed: z.label,
          description: `${z.duration}. Flat price per vehicle for 1–4 passengers; exact price depends on the resort.`,
        },
        {
          '@type': 'Offer',
          name: `Round-trip transfer, ${z.label}`,
          priceSpecification: {
            '@type': 'PriceSpecification',
            minPrice: String(zoneFromPrice(z.code, 'round_trip')),
            priceCurrency: 'USD',
          },
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          areaServed: z.label,
          description: `${z.duration}. Flat price per vehicle for 1–4 passengers, both legs; exact price depends on the resort.`,
        },
      ]),
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Airport-transfer destinations',
      itemListElement: DESTINATIONS.map((d) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Place',
          name: d.name,
          address: {
            '@type': 'PostalAddress',
            addressRegion: d.parish,
            addressCountry: 'JM',
          },
        },
      })),
    },
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TRANSFER_FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  }

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Airport transfers', item: PAGE_URL },
    ],
  }

  return { serviceSchema, faqSchema, breadcrumbs }
}

// The activity line changes hourly, so the page cannot be baked at build
// time. Five minutes means a new hour's figures appear within five minutes of
// the hour turning.
//
// To show REAL bookings instead, swap the import for getRealTransferActivity
// and await it; it returns null on a quiet day and the line hides itself.
export const revalidate = 300

export default function TransfersPage() {
  const { serviceSchema, faqSchema, breadcrumbs } = buildStructuredData()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <TransfersView />
    </>
  )
}
