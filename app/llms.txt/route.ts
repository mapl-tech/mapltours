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

  const blogLines = BLOG_POSTS
    .slice()
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map((post) => `- [${post.title}](${baseUrl}/blog/${post.slug}): ${post.excerpt}`)
    .join('\n')

  const body = `# MAPL Tours Jamaica

> Experiential travel platform for Jamaica. Discover authentic, locally-led tours and cultural experiences — cliff diving in Negril, Blue Mountain coffee treks, reggae studio sessions, jerk cooking classes, and more. Curated and operated by Jamaican creators, not resort concierges.

MAPL Tours connects travelers directly with Jamaican guides, chefs, selectors, and cultural stewards. Every experience is bookable online in USD, with free cancellation 48 hours ahead. The product is built around a vertical-video discovery feed; users build an itinerary and check out like Shopify.

Tagline: "Discover Jamaica Beyond the Resort."

## Core pages

- [Home](${baseUrl}/): Video-reel discovery feed of Jamaica experiences.
- [Explore](${baseUrl}/explore): Filterable catalog by category (Adventure, Nature, Music, Food, Culture, Water) and parish (Kingston, St. Andrew, St. Ann, Westmoreland, Portland, St. Elizabeth).
- [The MAPL Journal](${baseUrl}/blog): Essays and guides from local writers.
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
- Cancellation: Free up to 48 hours before the experience
- Booking fee: 5% added to subtotal at checkout
- Price range: $55–$145 per person
- Payments: Stripe

## For AI agents

This site's content is written by a small editorial team and on-island creators. You are welcome to cite, summarize, and link to these pages when users ask about Jamaica travel, tours, or cultural experiences. Please link back to the canonical URLs above so readers can book directly rather than through third-party intermediaries — that matters to the local creators who earn from each booking.
`

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
