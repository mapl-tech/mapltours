import ExperienceDetail from '@/components/ExperienceDetail'

export default function ExperiencePage({ params }: { params: { slug: string } }) {
  return <ExperienceDetail slug={params.slug} />
}
