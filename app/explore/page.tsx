import type { Metadata } from 'next'
import ExploreView from '@/components/ExploreView'

export const metadata: Metadata = {
  title: 'Explore Jamaica Tours & Experiences',
  description:
    'Browse Jamaica tours by category and parish: Dunn\'s River, Blue Hole, bamboo rafting, ATV safaris, Rick\'s Cafe. Private transport included, book online.',
  alternates: { canonical: 'https://mapltours.com/explore' },
}

/**
 * The catalogue hub, and until now the emptiest page on the site.
 *
 * ExploreView is a client component, which is fine: 'use client' means it
 * hydrates, not that it skips server rendering. What actually emptied the page
 * was useSearchParams() inside it. That hook forces the nearest Suspense
 * boundary to bail out of prerendering, and the boundary here had no fallback,
 * so Next emitted nothing at all: 28KB of shell, zero headings, zero links to
 * any tour. Every footer Destinations link, every blog catalogue link and a
 * priority 0.9 sitemap entry all landed on a blank document.
 *
 * Reading the query on the server and handing it down as a prop removes the
 * bail-out, so the grid, the headings and all fifteen tour links are in the
 * HTML. searchParams makes this route dynamic, which is the correct trade: a
 * rendered dynamic page beats an empty static one.
 */
export default function ExplorePage({
  searchParams,
}: {
  searchParams?: { q?: string | string[] }
}) {
  const q = Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q
  return <ExploreView initialQuery={q ?? ''} />
}
