'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  MAX_MENTIONS_PER_COMMENT,
  draftLabelFor,
  encodeMentions,
  findActiveQuery,
  insertMention,
  pruneDraftMentions,
  type ActiveQuery,
  type DraftMention,
  type MentionCandidate,
  type MentionPerson,
} from '@/lib/mentions'

/**
 * The @-tag typeahead for a comment box (WAI-ARIA combobox with a listbox
 * popup). Typing "@" after a space or at the start opens a list of people;
 * Up/Down move, Enter or Tab picks, Escape closes, a tap picks. The box keeps
 * plain text ("@Ana"); encode() turns each picked name into its tag at submit.
 *
 * One instance serves whichever comment box the guest is typing in (the
 * desktop panel and the phone sheet are never on screen together).
 */

export type ComposerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface MentionComposer {
  open: boolean
  active: ActiveQuery | null
  results: MentionCandidate[]
  status: ComposerStatus
  index: number
  setIndex: (i: number) => void
  listId: string
  optionId: (i: number) => string
  limitReached: boolean
  pick: (person: MentionCandidate) => void
  close: () => void
  /** Bind to the input's onChange (replaces the plain setter). */
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Call first in the input's onKeyDown; true means the key was used. */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => boolean
  /** Bind to onSelect / onClick so moving the caret re-reads the query. */
  onCaretMove: (e: React.SyntheticEvent<HTMLInputElement>) => void
  onBlur: () => void
  /** ARIA props for the input. */
  inputProps: {
    role: 'combobox'
    'aria-autocomplete': 'list'
    'aria-expanded': boolean
    'aria-controls': string
    'aria-activedescendant': string | undefined
  }
  /** The text to store, with tags. */
  encode: () => { text: string; ids: string[] }
  /** How the tagged people are shown, for the comment painted before the server answers. */
  known: (ids: string[]) => Record<string, MentionPerson>
  reset: () => void
}

export function useMentionComposer({
  value,
  setValue,
  experienceId,
  enabled,
}: {
  value: string
  setValue: (v: string) => void
  experienceId: number | null
  /** False when signed out: the box is read-only and nothing opens. */
  enabled: boolean
}): MentionComposer {
  const [draft, setDraft] = useState<DraftMention[]>([])
  const [active, setActive] = useState<ActiveQuery | null>(null)
  const [results, setResults] = useState<MentionCandidate[]>([])
  const [status, setStatus] = useState<ComposerStatus>('idle')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const picked = useRef(new Map<string, MentionCandidate>())
  const rawId = useId()
  const listId = `mention-list-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const optionId = useCallback((i: number) => `${listId}-opt-${i}`, [listId])

  const read = useCallback((el: HTMLInputElement) => {
    inputRef.current = el
    if (!enabled) { setActive(null); return }
    const caret = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? caret
    // A selected range is not a place to type a tag.
    setActive(caret === end ? findActiveQuery(el.value, caret) : null)
  }, [enabled])

  // The text changed from outside (posted, cleared, a reply started): drop
  // picks no longer in it and close the list if its "@" is gone.
  useEffect(() => {
    setDraft((d) => pruneDraftMentions(value, d))
    setActive((a) => (a && value[a.start] === '@' && a.end <= value.length ? a : null))
  }, [value])

  // Ask for people while a tag is being typed: debounced, newest answer only.
  const queryKey = active ? `${active.start}:${active.query}` : null
  useEffect(() => {
    if (!active || !enabled) { setResults([]); setStatus('idle'); return }
    const ctl = new AbortController()
    setStatus('loading')
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: active.query })
        if (experienceId) params.set('experience', String(experienceId))
        const res = await fetch(`/api/mentions/search?${params.toString()}`, { signal: ctl.signal, credentials: 'same-origin' })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as { people?: MentionCandidate[] }
        setResults(Array.isArray(body.people) ? body.people : [])
        setIndex(0)
        setStatus('ready')
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setResults([])
        setStatus('error')
      }
    }, active.query ? 140 : 0)
    return () => { window.clearTimeout(timer); ctl.abort() }
    // queryKey stands for active; experienceId and enabled are the other inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, experienceId, enabled])

  const distinctPicked = new Set(pruneDraftMentions(value, draft).map((m) => m.id)).size
  const limitReached = distinctPicked >= MAX_MENTIONS_PER_COMMENT
  const open = !!active && enabled

  const close = useCallback(() => { setActive(null); setResults([]); setStatus('idle') }, [])

  const pick = useCallback((person: MentionCandidate) => {
    const el = inputRef.current
    if (!active) return
    const already = draft.some((m) => m.id === person.id)
    if (!already && limitReached) return
    const label = draftLabelFor(person, draft)
    picked.current.set(person.id.toLowerCase(), person)
    const next = insertMention(value, active, label)
    setValue(next.text)
    setDraft((d) => [...pruneDraftMentions(next.text, d).filter((m) => m.id !== person.id), { id: person.id, label }])
    setActive(null)
    setResults([])
    setStatus('idle')
    if (el) {
      window.requestAnimationFrame(() => {
        el.focus({ preventScroll: true })
        try { el.setSelectionRange(next.caret, next.caret) } catch { /* input type without selection */ }
      })
    }
  }, [active, draft, limitReached, setValue, value])

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setValue(v)
    setDraft((d) => pruneDraftMentions(v, d))
    read(e.target)
  }, [read, setValue])

  const onCaretMove = useCallback((e: React.SyntheticEvent<HTMLInputElement>) => read(e.currentTarget), [read])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): boolean => {
    if (!open) return false
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return true
    }
    if (!results.length) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => (i + 1) % results.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => (i - 1 + results.length) % results.length)
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.nativeEvent.isComposing) return false
      e.preventDefault()
      pick(results[Math.min(index, results.length - 1)])
      return true
    }
    return false
  }, [close, index, open, pick, results])

  // Leaving the box closes the list (a tap on an option keeps focus first).
  const onBlur = useCallback(() => { window.setTimeout(close, 120) }, [close])

  const encode = useCallback(() => encodeMentions(value, draft), [draft, value])
  const known = useCallback((ids: string[]) => {
    const out: Record<string, MentionPerson> = {}
    for (const id of ids) {
      const p = picked.current.get(id.toLowerCase())
      if (p) out[id.toLowerCase()] = { label: p.label, isHandle: p.isHandle }
    }
    return out
  }, [])
  const reset = useCallback(() => { setDraft([]); close() }, [close])

  return {
    open,
    active,
    results,
    status,
    index,
    setIndex,
    listId,
    optionId,
    limitReached,
    pick,
    close,
    onChange,
    onKeyDown,
    onCaretMove,
    onBlur,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      'aria-controls': listId,
      'aria-activedescendant': open && results.length ? optionId(Math.min(index, results.length - 1)) : undefined,
    },
    encode,
    known,
    reset,
  }
}
