import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TransfersView from '@/components/transfers/TransfersView'
import {
  DESTINATIONS,
  ZONES,
  getTransferPrice,
  resortSlug,
  destinationFromSlug,
} from '@/lib/airport-transfers'

const SITE_URL = 'https://mapltours.com'

/**
 * One landing page per transfer destination.
 *
 * These URLs are what the Google Ads campaigns point at. The live ad
 * "Sandals Ochi Transfer $111 | Price Locked Before You Land" has a final URL
 * of mapltours.com/Transfers/Sandals-Ochi, and until this route existed it
 * returned a 404 - which costs the click and gets the ad disapproved for a
 * broken destination. The sitelinks under it follow the same shape.
 *
 * The path segment is matched CASE-INSENSITIVELY on purpose. The ads use the
 * title-cased form the copywriter typed (`/Transfers/Sandals-Ochi`), the
 * sitemap and every internal link use the canonical lower-case id, and both
 * have to resolve. The canonical tag always points at the lower-case form so
 * only one of them can rank.
 */
export function generateStaticParams() {
  // Both casings are pre-rendered: the ads' title-cased slug and the canonical
  // lower-case one. `dynamicParams` stays on, so any other casing still
  // resolves, it is just rendered on demand the first time.
  return DESTINATIONS.flatMap((d) => [{ resort: resortSlug(d.id) }, { resort: d.id }])
}

export async function generateMetadata({ params }: { params: { resort: string } }): Promise<Metadata> {
  const dest = destinationFromSlug(params.resort)
  if (!dest) return { title: 'Transfer not found', robots: { index: false, follow: false } }

  const oneWay = getTransferPrice(dest.id, 'one_way')
  // The layout template appends " | MAPL Tours Jamaica", so the per-page part
  // stays short enough that the resort name itself is not truncated.
  const title = `Montego Bay to ${dest.name} Transfer`
  const description =
    `Private airport transfer from Sangster (MBJ) to ${dest.name}, ${dest.parish}` +
    (oneWay ? `, from $${oneWay} per vehicle one way` : '') +
    `. Flat fare locked at checkout, met at arrivals with a name sign, flight tracked.`

  return {
    title,
    description,
    keywords: [
      `${dest.name} airport transfer`,
      `Montego Bay to ${dest.name}`,
      `MBJ to ${dest.name} transfer`,
      `${dest.parish} airport transfer`,
      'Jamaica private transfer',
      'MBJ airport transfer',
    ],
    alternates: { canonical: `${SITE_URL}/transfers/${dest.id}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/transfers/${dest.id}`,
      type: 'website',
    },
  }
}

export default function ResortTransferPage({ params }: { params: { resort: string } }) {
  const dest = destinationFromSlug(params.resort)
  if (!dest) notFound()

  const oneWay = getTransferPrice(dest.id, 'one_way')
  const roundTrip = getTransferPrice(dest.id, 'round_trip')
  const zone = ZONES[dest.zone]

  // The price a visitor sees here is the same function the quote calculator
  // and the checkout use, so the ad's number, this page's number and the
  // amount Stripe takes cannot drift apart.
  const offers = [
    oneWay ? { name: 'One way', price: oneWay } : null,
    roundTrip ? { name: 'Round trip', price: roundTrip } : null,
  ].filter(Boolean) as Array<{ name: string; price: number }>

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Airport transfer',
    name: `Montego Bay (MBJ) to ${dest.name} private transfer`,
    areaServed: { '@type': 'Place', name: `${dest.parish}, Jamaica` },
    provider: { '@type': 'Organization', name: 'MAPL Tours', url: SITE_URL },
    url: `${SITE_URL}/transfers/${dest.id}`,
    offers: offers.map((o) => ({
      '@type': 'Offer',
      name: o.name,
      price: o.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="mx-auto max-w-5xl px-4 pt-10 pb-2 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm opacity-70">
          <Link href="/transfers" className="underline underline-offset-2">
            Airport transfers
          </Link>
          <span aria-hidden="true"> / </span>
          <span>{dest.name}</span>
        </nav>

        <h1 className="text-3xl font-semibold sm:text-4xl">
          Montego Bay to {dest.name}
        </h1>

        <p className="mt-3 max-w-2xl text-base opacity-80">
          Private transfer from Sangster International (MBJ) to {dest.name} in {dest.parish}
          {oneWay ? <> , from <strong>${oneWay}</strong> per vehicle one way</> : null}
          {roundTrip ? <> and <strong>${roundTrip}</strong> round trip</> : null}. The fare is per
          vehicle, not per person, and it is locked at checkout. We track your flight, so a late
          landing is still met at arrivals with a name sign.
          {dest.estimated ? ' This route is priced on our standard zone rate; we confirm it before you pay.' : ''}
          {dest.reopens ? ` Note: this resort reopens ${dest.reopens}.` : ''}
        </p>

        <p className="mt-2 text-sm opacity-60">
          Zone {dest.zone}
          {zone?.label ? ` - ${zone.label}` : ''}
        </p>
      </section>

      {/* The quote calculator, with this resort already chosen. */}
      <TransfersView initialDestinationId={dest.id} />
    </>
  )
}
