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
  const title = `${exp.title} — ${exp.destination}, Jamaica`
  const description = exp.description
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

export default function ExperiencePage({ params }: { params: { slug: string } }) {
  // 404 unknown slugs so they don't render an empty shell and so Google
  // doesn't index junk URLs.
  if (!getExperienceBySlug(params.slug)) notFound()
  return <ExperienceDetail slug={params.slug} />
}
