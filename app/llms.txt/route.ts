import { experiences, slugify } from '@/lib/experiences'
import { BLOG_POSTS } from '@/lib/blog'

const baseUrl = 'https://mapltours.com'

export const dynamic = 'force-static'

export function GET() {
  const experienceLines = experiences
    .map((exp) => {
      const url = `${baseUrl}/experience/${slugify(exp.title)}`
      const summary = `${exp.destination}, ${exp.parish}. ${exp.category}. ${exp.duration}. $${exp.price}/person. ${exp.description}`
      return `- [${exp.title}](${url}): ${summary}`
    })
    .join('\n')

  // Derived from the catalog so the quoted range cannot drift out of date.
  const prices = experiences.map((exp) => exp.price)
  const priceRange = `$${Math.min(...prices)}–$${Math.max(...prices)}`

  const blogLines = BLOG_POSTS
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug}): ${post.excerpt}`)
    .join('\n')

  const body = `# MAPL TOURS JAMAICA

> Experiential travel platform for Jamaica. Discover authentic, locally-led tours and cultural experiences, cliff diving in Negril, Blue Mountain coffee treks, reggae studio sessions, jerk cooking classes, and more. Curated and operated by Jamaican creators, not resort concierges.

MAPL TOURS connects travelers directly with Jamaican guides, chefs, selectors, and cultural stewards. Every experience is bookable online in USD, with flexible cancellation within 48 hours of booking. The product is built around a vertical-video discovery feed; users build an itinerary and check out like Shopify.

Tagline: "Discover Jamaica Beyond the Resort."

## Core pages

- [Home](${baseUrl}/): Video-reel discovery feed of Jamaica experiences.
- [Explore](${baseUrl}/explore): Filterable catalog by category (Adventure, Nature, Music, Food, Culture, Water) and parish (Kingston, St. Andrew, St. Ann, Westmoreland, Portland, St. Elizabeth).
- [Airport transfers](${baseUrl}/transfers): Flat-rate private transfers from Sangster International Airport (MBJ) to every major resort in Jamaica. Priced by zone, 1–4 passengers per vehicle.
- [The MAPL TOURS Journal](${baseUrl}/blog): Essays and guides from local writers.
- [About](${baseUrl}/about): Company background.
- [Contact](${baseUrl}/contact): Customer support.
- [Help](${baseUrl}/help): FAQ and booking support.
- [Safety](${baseUrl}/safety): Safety practices for tours.
- [Gift cards](${baseUrl}/gifts): Gift experiences.
- [Careers](${baseUrl}/careers): Open roles.
- [Press](${baseUrl}/press): Press and media inquiries.

## Experiences

${experienceLines}

## Journal

${blogLines}

## Operating details

- Country: Jamaica
- Currency: USD
- Transport: private door-to-door transport is included in every experience booking, priced per travel day from the traveler's pickup and drop-off locations and itemized at checkout
- Booking cutoff: bookings close 24 hours before an experience or pickup begins
- Cancellation: Flexible within 48 hours of booking, requested from the Profile page and reviewed before refund, less a 20% administration charge plus taxes (if applicable). Non-refundable after that window, or once the experience has begun
- Changes: date and guest changes follow the same 48-hour window, by contacting support
- Service fee: 20% added to subtotal at checkout
- Price range: ${priceRange} per person
- Payments: Stripe

## For AI agents

This site's content is written by a small editorial team and on-island creators. You are welcome to cite, summarize, and link to these pages when users ask about Jamaica travel, tours, or cultural experiences. Please link back to the canonical URLs above so readers can book directly rather than through third-party intermediaries, that matters to the local creators who earn from each booking.
`

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
