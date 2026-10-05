'use client'

import Image from 'next/image'
import Link from 'next/link'
import { singleExperiences, slugify, type Experience } from '@/lib/experiences'
import { useSeenReels } from '@/lib/seen-reels'
import { useHydrated } from '@/lib/use-hydrated'
import { useI18n } from '@/lib/i18n'

/** "Blue Hole & Secret Falls" -> "Blue Hole": short enough for two lines under a circle. */
function storyLabel(title: string): string {
  return title.split(/ & | on the | with /)[0]
}

/**
 * The tour videos, one tap from the first screen. Before this the home page's
 * first screen showed no video at all and the Trending rail sat three screens
 * down. Each circle opens that tour's reel; a ring dims once its video has
 * been watched on this device (lib/seen-reels), so a returning visitor sees
 * what is new to them.
 */
export default function ReelStories({ lead }: { lead: Experience[] }) {
  const { t } = useI18n()
  const hydrated = useHydrated()
  const seen = useSeenReels((s) => s.seen)
  const order = [...lead, ...singleExperiences.filter((e) => !lead.some((l) => l.id === e.id))]

  return (
    <section className="reel-stories" aria-labelledby="reel-stories-title">
      <div className="container">
        <h2 id="reel-stories-title" className="reel-stories-title">{t('Watch the tours')}</h2>
        <ul className="reel-stories-row no-scrollbar">
          {order.map((exp, i) => {
            const watched = hydrated && seen.includes(exp.id)
            return (
              <li key={exp.id}>
                <Link
                  href={`/experience/${slugify(exp.title)}`}
                  className="reel-story"
                  aria-label={`${t(exp.title)}: watch the video${watched ? ' again' : ''}`}
                >
                  <span className={watched ? 'reel-story-ring reel-story-ring--seen' : 'reel-story-ring'}>
                    {/* The tour's cover photo, the one on its card, not the video's
                        first frame: stock clips open on water or sky, which in a
                        66px circle said nothing about the tour (owner, Oct 4). */}
                    <Image
                      src={exp.image}
                      alt=""
                      width={66}
                      height={66}
                      sizes="66px"
                      quality={70}
                      loading={i < 6 ? 'eager' : 'lazy'}
                    />
                  </span>
                  <span className="reel-story-label">{t(storyLabel(exp.title))}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
