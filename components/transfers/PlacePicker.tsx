'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import {
  DESTINATIONS,
  ZONES,
  searchDestinations,
  type TransferDestination,
} from '@/lib/airport-transfers'

/**
 * Pickup / drop-off picker for the transfer quote.
 *
 * This replaced a plain <select>. With fifty-odd resorts a select was already
 * a long scroll, and the list has since grown past ninety; more to the point,
 * a select can only offer what is in it — a guest whose hotel was missing had
 * no way to say so except the contact form, which is a booking lost to a data
 * gap. Typing finds the property, and every area carries an "Other hotel or
 * villa" row so a guest whose hotel is genuinely absent still gets the right
 * ZONE, which is what the fare is priced on. The quote is honest either way:
 * the driver is paid by zone, not by hotel.
 *
 * Built as a combobox rather than a library: input owns the text, a listbox
 * owns the options, arrows move a highlight, Enter takes it, Escape closes.
 * On a phone it is an ordinary text input with a list under it, which is the
 * one interaction pattern nobody has to learn.
 */

export const AIRPORT_ID = '__mbj__'
export const AIRPORT_NAME = 'Sangster International Airport (MBJ)'

export default function PlacePicker({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  /** A destination id, AIRPORT_ID, or '' for nothing chosen yet. */
  value: string
  onChange: (id: string) => void
  placeholder: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const chosen: TransferDestination | undefined = useMemo(
    () => DESTINATIONS.find((d) => d.id === value),
    [value],
  )
  const chosenLabel = value === AIRPORT_ID ? AIRPORT_NAME : chosen?.name ?? ''

  // The airport is not in the rate table — it is the fixed other end of every
  // fare — so it is offered as its own row rather than filtered like a hotel.
  const airportMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === '' || 'sangster international airport mbj montego bay'.includes(q)
  }, [query])

  const results = useMemo(() => searchDestinations(query), [query])
  const rows: { id: string; name: string; hint: string }[] = useMemo(
    () => [
      ...(airportMatches ? [{ id: AIRPORT_ID, name: AIRPORT_NAME, hint: 'Airport' }] : []),
      ...results.map((d) => ({
        id: d.id,
        name: d.name,
        // Every property reads the same, open or rebuilding: a guest booking
        // for a date months out is picking a place, not a status, and the
        // rate is the same either way.
        hint: `${d.parish} · Zone ${d.zone} · ${ZONES[d.zone].duration}`,
      })),
    ],
    [airportMatches, results],
  )

  useEffect(() => { setActive(0) }, [query])

  // Click-away closes and restores the chosen label, so a half-typed query
  // never lingers as if it were a selection.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (id: string) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1
        const clamped = Math.max(0, Math.min(rows.length - 1, next))
        listRef.current?.children[clamped]?.scrollIntoView({ block: 'nearest' })
        return clamped
      })
      return
    }
    if (e.key === 'Enter' && open && rows[active]) {
      e.preventDefault()
      pick(rows[active].id)
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div
      ref={wrapRef}
      // Tabbing out has to close the list too. With only the mousedown
      // click-away handler, moving to the drop-off field by keyboard left the
      // pickup list open and floating over the control that now had focus.
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false)
          setQuery('')
        }
      }}
      style={{ position: 'relative' }}
    >
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          aria-hidden
          style={{
            position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)', pointerEvents: 'none',
          }}
        />
        <input
          className="field-input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          // Names the highlighted row for a screen reader. Without it the
          // arrow keys moved a purely visual highlight and nothing was
          // announced, so the list could be opened and stepped through
          // without ever learning what was under the cursor.
          aria-activedescendant={open && rows[active] ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          value={open ? query : chosenLabel}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          style={{
            height: 50, fontSize: 15, fontWeight: 500,
            paddingLeft: 42, paddingRight: 42,
            color: chosenLabel || query ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        />
        {chosenLabel && !open ? (
          <button
            type="button"
            onClick={() => { onChange(''); setQuery(''); setOpen(true) }}
            aria-label={`Clear ${label.toLowerCase()}`}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-tertiary)',
            }}
          >
            <X size={15} />
          </button>
        ) : (
          <ChevronDown
            size={16}
            aria-hidden
            style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-secondary)', pointerEvents: 'none',
            }}
          />
        )}
      </div>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, right: 0,
            maxHeight: 300, overflowY: 'auto', margin: 0, padding: 6,
            listStyle: 'none', background: '#fff',
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
            boxShadow: '0 12px 32px rgba(23,22,20,0.12)',
          }}
        >
          {rows.length === 0 && (
            <li role="presentation" style={{
              padding: '12px 12px 14px', fontSize: 13.5, lineHeight: 1.5,
              color: 'var(--text-secondary)', fontFamily: 'var(--font-dm-sans)',
            }}>
              No match for “{query}”. Try the town instead: Negril, Ocho Rios,
              Falmouth, and pick the “Other hotel or villa” row for that area.
              The fare is set by zone, so it will be the right price.
            </li>
          )}
          {/* role="option" sits on the li itself. It used to sit on a button
              nested inside a bare li, which is not a structure the listbox
              role permits: the li was an unlabelled child of the listbox and
              the button was an option with no owning list, so a screen reader
              announced neither the number of hotels nor which one was
              highlighted. The row is not a button any more either, because an
              option is not a button; the combobox input keeps the keyboard
              and the click handler stays for the mouse. */}
          {rows.map((row, i) => (
            <li
              key={row.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(row.id) }}
              style={{
                borderRadius: 8, padding: '9px 11px', cursor: 'pointer',
                background: i === active ? 'var(--surface)' : 'none',
                fontFamily: 'var(--font-dm-sans)',
              }}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {row.name}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                {row.hint}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
