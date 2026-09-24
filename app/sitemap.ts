import { MetadataRoute } from 'next'
import { experiences, slugify } from '@/lib/experiences'
import { BLOG_POSTS } from '@/lib/blog'
import { DESTINATIONS } from '@/lib/airport-transfers'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://mapltours.com'
  const now = new Date()

  const staticPages = [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly' as const, priority: 1.0 },
    { url: `${baseUrl}/explore`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.9 },
    { url: `${baseUrl}/transfers`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/help`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/gifts`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/safety`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/accessibility`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/careers`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/partner`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${baseUrl}/press`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: 'yearly' as const, priority: 0.3 },
  ]

  const experiencePages = experiences.map((exp) => ({
    url: `${baseUrl}/experience/${slugify(exp.title)}`,
    lastModified: now,
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
  // canonicalises here.
  const transferPages = DESTINATIONS.map((d) => ({
    url: `${baseUrl}/transfers/${d.id}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...experiencePages, ...blogPages, ...transferPages]
}
