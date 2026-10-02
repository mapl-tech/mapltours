'use client'

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { FONT, GOLD_TINT } from './tokens'

/**
 * The assistant picker on /connect: one tab per assistant, one set of steps
 * shown at a time (WAI-ARIA tabs, automatic activation, roving tabindex,
 * Left/Right/Home/End).
 *
 * Which assistant opens first, in order: the hash (/connect#gemini, also the
 * tab's own id, so the browser scrolls to the picker), then ?via= (the same
 * names the connector addresses use), then the site the visitor came from
 * when an assistant's own page linked here, then the first tab. Only a hash
 * scrolls; the other two just open the right steps.
 *
 * Picking a tab writes the hash with replaceState, so the address bar is a
 * link to what is on screen and the back button is left alone.
 *
 * Every panel is server-rendered; the inactive ones are only hidden, so the
 * steps for all five assistants are in the page source for search engines
 * and directory reviewers.
 *
 * The selected tab is an outlined gold chip, not a filled button: the filled
 * dark pill is the copy button's, and the two must not look alike. The tabs
 * carry their own styles rather than .btn-outline, whose site-wide phone rule
 * shrinks button labels to 14px; hover is tracked in state for the same
 * reason (this page adds no stylesheet).
 */

export interface AssistantTab {
  id: string
  label: string
  panel: ReactNode
}

/** Assistants whose own pages may link here, by the host they send in Referer. */
const REFERRERS: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)claude\.(ai|com)$/, 'claude'],
  [/(^|\.)chatgpt\.com$|^chat\.openai\.com$/, 'chatgpt'],
  [/^gemini\.google\.com$/, 'gemini'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
]

function initialChoice(known: string[]): string | null {
  const hash = decodeURIComponent(window.location.hash.slice(1)).toLowerCase()
  if (known.includes(hash)) return hash
  const via = (new URLSearchParams(window.location.search).get('via') ?? '').toLowerCase()
  if (known.includes(via)) return via
  try {
    const host = document.referrer ? new URL(document.referrer).hostname : ''
    const hit = REFERRERS.find(([re]) => re.test(host))
    if (hit && known.includes(hit[1])) return hit[1]
  } catch {
    // An unparsable referrer is no referrer.
  }
  return null
}

const TAB: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 44,
  // Inline so the site-wide :focus-visible radius (3px) cannot square the pill.
  borderRadius: 9999,
  padding: '0 24px',
  border: '1px solid var(--border-strong)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
  scrollMarginTop: 'calc(var(--nav-h) + 24px)',
}

const HOVER: CSSProperties = { ...TAB, background: 'var(--surface)' }

const SELECTED: CSSProperties = {
  ...TAB,
  fontWeight: 700,
  color: 'var(--gold-text)',
  background: GOLD_TINT,
  border: '1px solid var(--gold-text)',
  boxShadow: 'inset 0 0 0 1px var(--gold-text)',
}

export default function AssistantTabs({ tabs, label }: { tabs: AssistantTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const [hovered, setHovered] = useState<string | null>(null)
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const ids = tabs.map((t) => t.id).join(' ')

  useEffect(() => {
    const known = ids.split(' ')
    const first = initialChoice(known)
    if (first) setActive(first)
    const onHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1)).toLowerCase()
      if (known.includes(id)) setActive(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [ids])

  const select = (id: string, focus: boolean) => {
    setActive(id)
    if (focus) buttons.current[id]?.focus()
    try {
      window.history.replaceState(window.history.state, '', `#${id}`)
    } catch {
      // A sandboxed frame can refuse; the tab still switches.
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0) return
    e.preventDefault()
    select(tabs[next].id, true)
  }

  return (
    <div>
      <div role="tablist" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {tabs.map((t, i) => {
          const on = t.id === active
          return (
            <button
              key={t.id}
              ref={(el) => {
                buttons.current[t.id] = el
              }}
              id={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${t.id}-steps`}
              tabIndex={on ? 0 : -1}
              onClick={() => select(t.id, false)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onMouseEnter={() => setHovered(t.id)}
              onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
              style={on ? SELECTED : hovered === t.id ? HOVER : TAB}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${t.id}-steps`}
          role="tabpanel"
          aria-labelledby={t.id}
          hidden={t.id !== active}
          style={{ marginTop: 16, animation: 'fadeIn 0.2s ease both' }}
        >
          {t.panel}
        </div>
      ))}
    </div>
  )
}
