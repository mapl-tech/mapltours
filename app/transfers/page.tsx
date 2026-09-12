import type { Metadata } from 'next'
import TransfersView from '@/components/transfers/TransfersView'
import { ZONES, DESTINATIONS, getTransferPrice, zoneFromPrice, groupDestinationsByZone } from '@/lib/airport-transfers'
import { TRANSFER_FAQS } from '@/lib/airport-transfers-content'
import { HERO } from '@/lib/images'

const SITE_URL = 'https://mapltours.com'
const PAGE_URL = `${SITE_URL}/transfers`

export const metadata: Metadata = {
  title: 'Jamaica Airport Transfers from MBJ',
  description:
    'Private transfers from Sangster (MBJ) to Negril, Ocho Rios, Falmouth and every resort. Flat rates from $22 per vehicle, meet-and-greet, flight tracking.',
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
      'Private flat-rate airport transfers from Sangster International Airport (MBJ) to every major resort destination in Jamaica. Private drivers, flight tracking, meet-and-greet at arrivals, flexible cancellation within 48 hours of booking.',
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
      // Every entry carries its real fare. This catalogue listed all 199
      // properties with no price at all, which made the site's single most
      // quotable asset invisible: the exact per-property fares existed only
      // in llms.txt, a file no HTML parser reads. The numbers come from
      // getTransferPrice, the same function the checkout prices with, so a
      // published figure cannot drift from the charged one.
      itemListElement: DESTINATIONS.map((d) => {
        const ow = getTransferPrice(d.id, 'one_way')
        const rt = getTransferPrice(d.id, 'round_trip')
        // Kept deliberately lean: 199 entries, so every field here is paid
        // for 199 times and again in the RSC payload. `price` is the one-way
        // fare (the figure people compare on) and the round trip rides in a
        // single extra spec rather than an array of two. The per-vehicle
        // 1-4 passenger term is stated once on the service above rather than
        // repeated on every offer.
        return {
          '@type': 'Offer',
          priceCurrency: 'USD',
          ...(ow != null ? { price: String(ow) } : {}),
          ...(rt != null
            ? {
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  name: 'Round trip',
                  price: String(rt),
                  priceCurrency: 'USD',
                },
              }
            : {}),
          // A resort shut for renovation is not in stock, and saying so beats
          // quoting a fare for a closed hotel.
          availability: d.reopens
            ? 'https://schema.org/PreOrder'
            : 'https://schema.org/InStock',
          itemOffered: {
            '@type': 'Place',
            name: d.name,
            address: {
              '@type': 'PostalAddress',
              addressRegion: d.parish,
              addressCountry: 'JM',
            },
          },
        }
      }),
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

/**
 * Every fare, as server-rendered text.
 *
 * The interactive picker above this says "Pick your hotel to see your fare",
 * which is right for a person and useless to everything else: a crawler, an
 * AI assistant, or anyone comparing on a phone with the tab half-loaded reads
 * nothing. The 199 exact fares were published in llms.txt and nowhere in any
 * page's HTML, and llms.txt is neither linked nor in the sitemap.
 *
 * This is also the likeliest reason the page already earns what it earns:
 * /transfers is the top AI-assistant landing page on the site, and the only
 * commercial page that server-renders prices at all, though until now only
 * zone bands rather than per-property fares.
 *
 * Prices come from getTransferPrice, the same function the checkout prices
 * with, so what is published here cannot drift from what is charged.
 */
function FareTables() {
  const groups = groupDestinationsByZone()
  return (
    <section
      aria-labelledby="every-fare"
      style={{ background: 'var(--bg-dark)', padding: '56px 0 72px' }}
    >
      <div className="container">
        <h2
          id="every-fare"
          style={{
            fontFamily: 'var(--font-dm-sans)', fontWeight: 700,
            fontSize: 'var(--fs-h2)', color: '#fff',
            lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 10,
          }}
        >
          Every fare from Sangster (MBJ)
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: 15,
            color: 'rgba(255,255,255,0.68)', lineHeight: 1.6,
            maxWidth: 680, marginBottom: 36,
          }}
        >
          One flat price per vehicle for one to four passengers, all in, with nothing added at
          checkout. A round trip costs less than two one-ways booked separately. Parties of five or
          more, and Kingston or Port Antonio, are quoted individually.
        </p>

        {groups.map(({ zone, items }) => (
          <div key={zone.code} style={{ marginBottom: 40 }}>
            <h3
              style={{
                fontFamily: 'var(--font-dm-sans)', fontWeight: 600, fontSize: 18,
                color: 'var(--gold-warm)', marginBottom: 4,
              }}
            >
              {zone.label}
            </h3>
            <p
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: 13,
                color: 'rgba(255,255,255,0.5)', marginBottom: 14,
              }}
            >
              {zone.duration}
            </p>
            <div className="fare-scroll">
              <table className="fare-table">
                <thead>
                  <tr>
                    <th scope="col">Hotel or villa</th>
                    <th scope="col">Parish</th>
                    <th scope="col" className="fare-num">One way</th>
                    <th scope="col" className="fare-num">Round trip</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => {
                    const ow = getTransferPrice(d.id, 'one_way')
                    const rt = getTransferPrice(d.id, 'round_trip')
                    return (
                      <tr key={d.id}>
                        <th scope="row">
                          {d.name}
                          {d.reopens ? (
                            <span className="fare-reopen"> (reopening {d.reopens})</span>
                          ) : null}
                        </th>
                        <td>{d.parish}</td>
                        <td className="fare-num">{ow != null ? `$${ow}` : 'On request'}</td>
                        <td className="fare-num">{rt != null ? `$${rt}` : 'On request'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

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
      <FareTables />
    </>
  )
}
