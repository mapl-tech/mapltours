import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import ExperienceDetail from '@/components/ExperienceDetail'
import { getExperienceBySlug } from '@/lib/experiences'

const SITE_URL = 'https://mapltours.com'

// Per-experience metadata so each of the commercial landing pages ranks on
// its own and gets a correct social preview. Without this, all experience
// URLs inherited the generic site title AND self-canonicalized to the
// homepage, telling Google to drop them from the index.
export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const exp = getExperienceBySlug(params.slug)
  if (!exp) {
    return { title: 'Experience not found', robots: { index: false, follow: false } }
  }
  // The layout template appends " | MAPL Tours Jamaica" (22 chars), so the
  // per-page part has to stay short or Google truncates the tour name itself.
  const title = exp.title.length > 28 ? exp.title : `${exp.title}, ${exp.destination}`
  // Search snippets cut around 160 characters; several tour blurbs run past
  // 180, which truncates mid-sentence in the SERP.
  const description =
    exp.description.length > 160
      ? exp.description.slice(0, 157).replace(/[\s,;:]+\S*$/, '') + '...'
      : exp.description
  const url = `${SITE_URL}/experience/${params.slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'MAPL Tours Jamaica',
      images: exp.image ? [{ url: exp.image, alt: exp.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: exp.image ? [exp.image] : undefined,
    },
  }
}

export default function ExperienceRoute({ params }: { params: { slug: string } }) {
  // 404 unknown slugs so they don't render an empty shell and so Google
  // doesn't index junk URLs.
  const exp = getExperienceBySlug(params.slug)
  if (!exp) notFound()

  // Per-experience structured data so each landing page is eligible for rich
  // results (price, rating). Modelled as a schema.org TouristTrip with an
  // Offer and AggregateRating built only from fields on the Experience type.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: exp.title,
    // The tour facts now live in a client-rendered dialog, so crawlers no
    // longer find them in the page HTML; carry the substance here instead.
    // The <meta> description above stays short — this one is for machines.
    description: [
      exp.about ?? exp.description,
      exp.included?.length ? `Included: ${exp.included.join('; ')}.` : null,
      exp.notIncluded?.length ? `Not included: ${exp.notIncluded.join('; ')}.` : null,
    ].filter(Boolean).join(' '),
    // Absolute: Google discards relative image URLs in structured data.
    image: exp.image?.startsWith('http') ? exp.image : `${SITE_URL}${exp.image}`,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/experience/${params.slug}`,
      price: exp.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      // The UNIT, which a bare `price` cannot carry.
      //
      // Two thirds of the catalogue is priced for a party, not a head: Dunn's
      // River is $351 for up to three people. Published as a bare number, every
      // shopping surface and every answer engine reads that as $351 per person
      // and quotes a family of three $1,053 for a tour that costs $351. The
      // error runs against us, so it is a booking lost to markup rather than to
      // price. referenceQuantity says what the figure buys; eligibleQuantity
      // says how many that covers.
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: exp.price,
        priceCurrency: 'USD',
        referenceQuantity: {
          '@type': 'QuantitativeValue',
          value: exp.pricing.mode === 'group' ? exp.pricing.tierMax : 1,
          unitCode: 'IE', // UN/CEFACT: "person"
          unitText: 'person',
        },
        ...(exp.pricing.mode === 'group'
          ? { description: `Private tour, flat price for up to ${exp.pricing.tierMax} people` }
          : { description: 'Price per person' }),
      },
      ...(exp.pricing.mode === 'group'
        ? {
            eligibleQuantity: {
              '@type': 'QuantitativeValue',
              minValue: 1,
              maxValue: exp.pricing.tierMax,
              unitCode: 'IE',
              unitText: 'person',
            },
          }
        : {}),
    },
    // aggregateRating is deliberately NOT emitted. Google requires review
    // snippets to reflect genuine reviews that are visible on the page, and
    // the rating/review counts in the catalog are placeholders with no review
    // content behind them. Publishing them as structured data risks a
    // structured-data manual action against the whole domain. Restore this
    // block, sourced from real reviews rendered on the page, once they exist.
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ExperienceDetail slug={params.slug} />
    </>
  )
}
