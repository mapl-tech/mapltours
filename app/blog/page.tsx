import type { Metadata } from 'next'
import BlogIndex from '@/components/BlogIndex'
import { BLOG_POSTS } from '@/lib/blog'

const SITE_URL = 'https://mapltours.com'
const BLOG_URL = `${SITE_URL}/blog`

export const metadata: Metadata = {
  title: 'The MAPL Journal — Jamaica Travel Stories & Guides',
  description:
    'Stories, guides, and dispatches from the real Jamaica. Essays from pit masters, selectors, and local creators who know the island beyond the resort.',
  alternates: { canonical: BLOG_URL },
  openGraph: {
    title: 'The MAPL Journal — Jamaica Travel Stories & Guides',
    description: 'Stories, guides, and dispatches from the real Jamaica.',
    type: 'website',
    url: BLOG_URL,
  },
}

export default function BlogPage() {
  const sorted = [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  )

  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': BLOG_URL,
    url: BLOG_URL,
    name: 'The MAPL Journal',
    description:
      'Stories, guides, and dispatches from the real Jamaica. Essays from pit masters, selectors, and local creators.',
    inLanguage: 'en-US',
    publisher: {
      '@type': 'Organization',
      name: 'MAPL Tours Jamaica',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/icon.png` },
    },
    blogPost: sorted.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.excerpt,
      url: `${SITE_URL}/blog/${p.slug}`,
      image: p.image,
      datePublished: p.publishedAt,
      articleSection: p.category,
      author: { '@type': 'Person', name: p.author.name },
    })),
  }

  const breadcrumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'The MAPL Journal', item: BLOG_URL },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }}
      />
      <BlogIndex posts={sorted} />
    </>
  )
}
