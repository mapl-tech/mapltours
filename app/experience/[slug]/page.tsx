/// <reference types="react-dom/canary" />
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { preload } from 'react-dom'
import ExperienceDetail from '@/components/ExperienceDetail'
import { getExperienceBySlug, reelPoster, isZonePriced, isPerPersonByArea, zonePrices, type Experience } from '@/lib/experiences'
import { TOUR_ZONE_LABEL } from '@/lib/tour-zones'
import { createServiceClient } from '@/lib/supabase/service'
import { isMaplAccount } from '@/lib/creator'

const SITE_URL = 'https://mapltours.com'

/**
 * A tour priced by where the guest is picked up, as structured data: the
 * range across the areas it is sold from, each area's exact price in the
 * description, and the party the price covers. A single `price` would be one
 * area's figure presented as everyone's.
 */
function zoneOffer(exp: Experience, url: string) {
  const p = exp.pricing
  // Per person by area (bamboo rafting): each area's price is for one guest.
  const perHead = isPerPersonByArea(p)
  const flatGroup = !perHead && !p.perPersonAddon
  const party = flatGroup ? p.tierMax : 1
  const areas = zonePrices(p, party)
  const prices = areas.map((a) => a.price)
  return {
    '@type': 'AggregateOffer',
    url,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    offerCount: areas.length,
    description: `${perHead ? 'Private tour, price per person' : flatGroup ? `Private tour, one price for up to ${p.tierMax} people` : 'Price for 1 person; each guest adds to it'}, set by the pickup area: ${areas.map((a) => `${TOUR_ZONE_LABEL[a.zone]} $${a.price}`).join(', ')}.`,
    eligibleQuantity: {
      '@type': 'QuantitativeValue',
      minValue: 1,
      maxValue: party,
      unitCode: 'IE',
      unitText: 'person',
    },
  }
}

// Per-experience metadata so each of the commercial landing pages ranks on
// its own and gets a correct social preview. Without this, all experience
// URLs inherited the generic site title AND self-canonicalized to the
// homepage, telling Google to drop them from the index.
export async function generateMetadata({ params, searchParams }: {
  params: { slug: string }
  searchParams?: { clip?: string }
}): Promise<Metadata> {
  const exp = getExperienceBySlug(params.slug)
  if (!exp) {
    return { title: 'Experience not found', robots: { index: false, follow: false } }
  }

  // A shared clip (?clip=<id>) unfurls with the clip's own poster frame,
  // described as a guest's unless MAPL's own account posted it. Only
  // approved clips belonging to this experience qualify, the canonical stays
  // the clean experience URL so the variant never competes in search, and
  // any failure here quietly falls back to the standard experience metadata.
  let clipImage: string | undefined
  let clipAlt = `Guest clip from ${exp.title}`
  const clipId = searchParams?.clip
  if (clipId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clipId)) {
    try {
      const svc = createServiceClient()
      const { data: clip } = await svc
        .from('user_tour_videos')
        .select('thumbnail_path, status, experience_id, user_id')
        .eq('id', clipId)
        .maybeSingle()
      if (clip && clip.status === 'approved' && clip.experience_id === exp.id && clip.thumbnail_path) {
        const { data: pub } = svc.storage.from('tour-videos').getPublicUrl(clip.thumbnail_path)
        if (pub?.publicUrl) clipImage = pub.publicUrl
        if (isMaplAccount(clip.user_id)) clipAlt = `Clip from ${exp.title}`
      }
    } catch {
      // Metadata falls back to the experience defaults.
    }
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
      images: clipImage
        ? [{ url: clipImage, alt: clipAlt }]
        : exp.image ? [{ url: exp.image, alt: exp.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: clipImage ? [clipImage] : exp.image ? [exp.image] : undefined,
    },
  }
}

// A tap on Add to Trip between first paint and React attaching was dropped:
// React 18 does not replay discrete events. This runs from the server HTML,
// records the tap on window and presses the button; the Reel's mount effect
// (components/ExperienceDetail) replays it once and clears the class. Inline
// and nonce-less: the CSP is report-only today; if a nonce-based CSP is ever
// enforced this script needs the nonce.
const EARLY_TAP_SCRIPT = `document.addEventListener('click',function(e){
if(window.__maplHydrated===true)return;
var t=e.target&&e.target.closest?e.target.closest('.reel-cta'):null;
if(!t)return;
var s=t.getAttribute('data-slug');
if(!s)return;
window.__maplEarlyTap={slug:s,at:Date.now()};
t.classList.add('reel-cta--pressed');
},true);`

export default function ExperienceRoute({ params }: { params: { slug: string } }) {
  // 404 unknown slugs so they don't render an empty shell and so Google
  // doesn't index junk URLs.
  const exp = getExperienceBySlug(params.slug)
  if (!exp) notFound()

  // The requested tour opens the feed, and its poster is the first large
  // paint. Nothing pointed the browser at it: the only image preload in the
  // head was the rail's 2 KB logo. reelPoster is the reel's own rule, so this
  // is the same request the <video poster> makes.
  const poster = reelPoster(exp)
  if (poster) preload(poster, { as: 'image', fetchPriority: 'high' })

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
      // The guest's whole outing, as llms.txt and get_tour give it: the
      // duration alone is only the time at the activity.
      exp.fromHotel ? `Time at the activity: ${exp.duration}. From your hotel and back: ${exp.fromHotel.charAt(0).toLowerCase()}${exp.fromHotel.slice(1)}` : null,
    ].filter(Boolean).join(' '),
    // Absolute: Google discards relative image URLs in structured data.
    image: exp.image?.startsWith('http') ? exp.image : `${SITE_URL}${exp.image}`,
    offers: isZonePriced(exp.pricing) ? zoneOffer(exp, `${SITE_URL}/experience/${params.slug}`) : {
      '@type': 'Offer',
      url: `${SITE_URL}/experience/${params.slug}`,
      price: exp.price,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      // The UNIT, which a bare `price` cannot carry.
      //
      // Much of the catalogue is priced for a party, not a head: Rick's Cafe
      // is $255 for up to four people. Published as a bare number, every
      // shopping surface and every answer engine reads that as $255 per person
      // and quotes a family of four $1,020 for a tour that costs $255. The
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
      <script dangerouslySetInnerHTML={{ __html: EARLY_TAP_SCRIPT }} />
      <ExperienceDetail slug={params.slug} />
    </>
  )
}
