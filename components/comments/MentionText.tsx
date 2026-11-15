'use client'

import { Fragment } from 'react'
import { splitMentions, mentionText, type MentionPerson } from '@/lib/mentions'

/**
 * A comment's text with every tag drawn as "@Name": gold, the only gold
 * text in a comment, so a tag reads as a tag at a glance. A tag of the
 * person reading gets a soft gold wash on top. Plain text otherwise; React
 * escapes it, nothing is ever parsed as HTML.
 */
export default function MentionText({
  text,
  people,
  meId,
  tone = 'dark',
}: {
  text: string
  people: ReadonlyMap<string, MentionPerson>
  meId?: string | null
  /** 'light' on the profile's white cards, where the dark gold carries AAA contrast. */
  tone?: 'dark' | 'light'
}) {
  const me = meId?.toLowerCase() ?? null
  return (
    <>
      {splitMentions(text).map((seg, i) =>
        seg.kind === 'text' ? (
          <Fragment key={i}>{seg.text}</Fragment>
        ) : (
          <span
            key={i}
            className={['mention', tone === 'light' ? 'mention-light' : '', seg.id === me ? 'mention-me' : ''].filter(Boolean).join(' ')}
          >
            {mentionText(people.get(seg.id))}
          </span>
        ),
      )}
    </>
  )
}
