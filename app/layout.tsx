import type { Metadata, Viewport } from 'next'
import { Playfair_Display, DM_Sans } from 'next/font/google'
import './globals.css'
import LayoutShell from '@/components/LayoutShell'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-syne',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const siteUrl = 'https://mapltours.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MAPL Tours Jamaica | Best Tours & Cultural Experiences in Jamaica',
    template: '%s | MAPL Tours Jamaica',
  },
  description: 'Discover the best tours in Jamaica. Book authentic cultural experiences, cliff diving in Negril, Blue Mountain coffee treks, reggae studio sessions, jerk cooking classes, and more. Curated by locals who know Jamaica best.',
  keywords: [
    'best tours in Jamaica',
    'Jamaica tours',
    'Jamaica cultural experiences',
    'things to do in Jamaica',
    'Jamaica excursions',
    'Negril tours',
    'Kingston tours',
    'Ocho Rios tours',
    'Montego Bay tours',
    'Jamaica adventure tours',
    'Jamaica food tours',
    'jerk chicken Jamaica',
    'Blue Mountain coffee tour',
    'Dunns River Falls tour',
    'Bob Marley tour Jamaica',
    'bamboo rafting Jamaica',
    'Jamaica snorkeling',
    'Jamaica cliff diving',
    'Ricks Cafe Negril',
    'Jamaica local experiences',
    'authentic Jamaica',
    'Jamaica vacation activities',
    'Jamaica trip planning',
    'Caribbean tours',
    'Jamaica travel',
  ],
  authors: [{ name: 'MAPL Tours Jamaica', url: siteUrl }],
  creator: 'MAPL Tech',
  publisher: 'MAPL Tours Jamaica',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'MAPL Tours Jamaica',
    title: 'MAPL Tours Jamaica | Best Tours & Cultural Experiences in Jamaica',
    description: 'Discover the best tours in Jamaica. Authentic cultural experiences crafted by locals. Cliff diving, coffee treks, reggae sessions, jerk cooking, and more.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MAPL Tours Jamaica - Discover Jamaica Beyond the Resort',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MAPL Tours Jamaica | Best Tours & Cultural Experiences',
    description: 'Authentic cultural experiences crafted by locals who know Jamaica best.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: siteUrl,
  },
  category: 'travel',
}

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

// JSON-LD structured data for SEO
function JsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'TravelAgency',
    name: 'MAPL Tours Jamaica',
    url: siteUrl,
    logo: `${siteUrl}/icon.png`,
    description: 'Discover the best tours in Jamaica. Authentic cultural experiences crafted by locals who know Jamaica best.',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'JM',
      addressRegion: 'Jamaica',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: 18.1096,
      longitude: -77.2975,
    },
    areaServed: {
      '@type': 'Country',
      name: 'Jamaica',
    },
    priceRange: '$55 - $145',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      reviewCount: '3241',
      bestRating: '5',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Jamaica Tours & Experiences',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'TouristTrip',
            name: "Rick's Cafe Cliff Diving & Sunset",
            description: 'Jump from legendary cliffs as the sun melts into the Caribbean.',
            touristType: 'Adventure',
            offers: { '@type': 'Offer', price: '85', priceCurrency: 'USD' },
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'TouristTrip',
            name: 'Bob Marley Heritage Pilgrimage',
            description: 'Walk where Bob walked. Feel the spirit of One Love.',
            touristType: 'Culture',
            offers: { '@type': 'Offer', price: '145', priceCurrency: 'USD' },
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'TouristTrip',
            name: "Dunn's River Falls & Hidden Blue Hole",
            description: 'Climb 600 feet of cascading falls hand-in-hand.',
            touristType: 'Adventure',
            offers: { '@type': 'Offer', price: '110', priceCurrency: 'USD' },
          },
        },
      ],
    },
    sameAs: [
      'https://www.instagram.com/mapltours',
      'https://www.tiktok.com/@mapltours',
      'https://twitter.com/mapltours',
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <JsonLd />
        <link rel="dns-prefetch" href="https://images.pexels.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://videos.pexels.com" />
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="anonymous" />
      </head>
      <body className={`${playfair.variable} ${dmSans.variable}`}>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  )
}
