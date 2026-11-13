/**
 * The site's arrow. Drawn, never typed: the font's "→" is long and hairline
 * beside bold words, and a link's underline runs under it. This one is the
 * same arrow the home page's call-to-action icons use, sized to the text it
 * sits in (1em), riding clear of the underline, and on a link or button it
 * nudges toward where it points on hover and keyboard focus (styles: the
 * .ui-arrow block in app/globals.css; still under reduced motion).
 *
 * Decorative: hidden from screen readers. A route arrow between two places
 * ("MBJ → Negril") carries a visually hidden "to", so it reads as words.
 */
import { Fragment } from 'react'

type Dir = 'right' | 'left' | 'up' | 'down'

const PATHS: Record<Dir, [string, string]> = {
  right: ['M5 12h14', 'm12 5 7 7-7 7'],
  left: ['M19 12H5', 'm12 19-7-7 7-7'],
  up: ['M12 19V5', 'm5 12 7-7 7 7'],
  down: ['M12 5v14', 'm19 12-7 7-7-7'],
}

export default function Arrow({ dir = 'right', place = 'after', className }: {
  dir?: Dir
  /** Where it sits against its words: after them, before them, or between two places. */
  place?: 'after' | 'before' | 'between'
  className?: string
}) {
  const [shaft, head] = PATHS[dir]
  const svg = (
    <svg
      className={`ui-arrow ui-arrow--${dir} ui-arrow--${place}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <path d={shaft} />
      <path d={head} />
    </svg>
  )
  if (place !== 'between') return svg
  return (<><span className="visually-hidden"> to </span>{svg}</>)
}

/**
 * A route written "MBJ → Negril" (or "MBJ → Hotel → MBJ") shown as its places
 * with drawn arrows between them, read aloud as "MBJ to Negril". Lets data
 * keep its plain string form. Styles: .ui-route-keep in app/globals.css.
 */
export function RouteText({ text }: { text: string }) {
  const parts = text.split(/\s*→\s*/)
  return (
    <>
      {parts.map((p, i) => {
        if (i === parts.length - 1) return <Fragment key={i}>{p}</Fragment>
        // Each arrow stays on the line of the word before it, so a wrapped
        // route never starts a line with an arrow.
        const cut = p.lastIndexOf(' ')
        return (
          <Fragment key={i}>
            {cut >= 0 ? p.slice(0, cut + 1) : ''}
            <span className="ui-route-keep">{cut >= 0 ? p.slice(cut + 1) : p}<Arrow place="between" /></span>
          </Fragment>
        )
      })}
    </>
  )
}
