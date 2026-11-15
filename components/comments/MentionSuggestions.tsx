'use client'

import Avatar from '@/components/Avatar'
import { MAX_MENTIONS_PER_COMMENT } from '@/lib/mentions'
import type { MentionComposer } from './useMentionComposer'

/**
 * The people list that opens above a comment box while a tag is typed.
 * It sits inside the box's own positioned row, so it opens upward over the
 * comments and never past the panel or sheet edge. Rows are 48px tall; the
 * active row carries the gold wash and aria-selected. A polite live region
 * says how many people matched, for screen readers.
 */
export default function MentionSuggestions({ composer }: { composer: MentionComposer }) {
  const { open, active, results, status, index, setIndex, listId, optionId, pick, limitReached } = composer
  if (!open || !active) return null

  const q = active.query
  let note: string | null = null
  if (limitReached) note = `You can tag up to ${MAX_MENTIONS_PER_COMMENT} people in one comment.`
  else if (status === 'error') note = 'Could not load names. Keep typing to try again.'
  else if (status === 'ready' && !results.length) note = q ? `No one called “${q}” yet.` : 'Type a name to tag someone.'
  else if (status === 'loading' && !results.length) note = 'Looking for people…'

  const live =
    status === 'ready'
      ? results.length
        ? `${results.length} ${results.length === 1 ? 'person' : 'people'} found. Use the up and down arrows, then Enter to tag.`
        : note ?? ''
      : ''

  // "Ana B." only where two people in the list are both "Ana"; for one person it repeats the name.
  const labelCount = new Map<string, number>()
  results.forEach((p) => labelCount.set(p.label.toLowerCase(), (labelCount.get(p.label.toLowerCase()) ?? 0) + 1))

  return (
    <div className="mention-pop">
      {results.length > 0 && !limitReached && (
        <ul id={listId} role="listbox" aria-label="People to tag" className="mention-list">
          {results.map((p, i) => (
            <li
              key={p.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === index}
              className="mention-opt"
              // Keep focus in the box: a tap would otherwise blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseMove={() => { if (i !== index) setIndex(i) }}
              onClick={() => pick(p)}
            >
              <span aria-hidden style={{ display: 'flex', flexShrink: 0 }}>
                <Avatar src={p.avatarUrl} name={p.label} size={28} />
              </span>
              <span className="mention-opt-text">
                <span className="mention-opt-label">{p.isHandle ? '@' : ''}{p.label}</span>
                {p.detail && p.detail !== p.label && (labelCount.get(p.label.toLowerCase()) ?? 0) > 1 && (
                  <span className="mention-opt-detail">{p.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(note && (limitReached || !results.length)) && <p className="mention-pop-note">{note}</p>}
      {/* Never visible: announces the result count without moving focus. */}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">{live}</p>
      {/* The listbox id always exists while open, so aria-controls never points nowhere. */}
      {(!results.length || limitReached) && <span id={listId} role="listbox" aria-label="People to tag" hidden />}
    </div>
  )
}
