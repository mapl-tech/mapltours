import { MetadataRoute } from 'next'
import { experiences, slugify } from '@/lib/experiences'
import { BLOG_POSTS } from '@/lib/blog'
import { DESTINATIONS } from '@/lib/airport-transfers'

/**
 * lastmod is given only where it is a real date: a blog post's own
 * updatedAt (or publishedAt). Every other page used to say it had changed at
 * the moment of the build, so each deploy told Google that 290 pages were new,
 * and Google learns to ignore a lastmod that is always "now" (Search Console,
 * Nov 24 2026). Leaving it out is the honest answer for a page that has no
 * date of its own; Google then schedules those crawls itself.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://mapltours.com'

  const staticPages = [
    { url: baseUrl, changeFrequency: 'weekly' as const, priority: 1.0 },
    { url: `${baseUrl}/explore`, changeFrequency: 'weekly' as const, priority: 0.9 },
    { url: `${baseUrl}/transfers`, changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `${baseUrl}/blog`, changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${baseUrl}/contact`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/help`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/gifts`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/safety`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/accessibility`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/careers`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/partner`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/connect`, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/press`, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly' as const, priority: 0.3 },
  ]

  const experiencePages = experiences.map((exp) => ({
    url: `${baseUrl}/experience/${slugify(exp.title)}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const blogPages = BLOG_POSTS.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: post.featured ? 0.75 : 0.65,
  }))

  // One URL per transfer destination. These are the pages the Google Ads
  // campaigns land on, so they need to be crawlable in their own right rather
  // than living only behind the picker on /transfers. Canonical form is the
  // lower-case id; the ads' title-cased spelling resolves to the same page and
  // canonicalises here. /transfers links every one of them (HotelDirectory),
  // so the sitemap is not their only way in.
  const transferPages = DESTINATIONS.map((d) => ({
    url: `${baseUrl}/transfers/${d.id}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...experiencePages, ...blogPages, ...transferPages]
}
