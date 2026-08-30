'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BedDouble, ChevronDown, Plane, Search, X } from 'lucide-react'
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
 *
 * Airport versus hotel is the whole decision, so the list says which is
 * which: the airport sits under its own "Airport" heading with a plane, the
 * properties under "Hotels & villas" with a bed. And the airport is offered
 * only where it can still go. Every ride has Sangster at exactly one end, so
 * once the airport is the pickup it is not in the drop-off list at all, and
 * a guest who types "airport" into that box is told where it already is
 * rather than shown an empty result.
 */

export const AIRPORT_ID = '__mbj__'
export const AIRPORT_NAME = 'Sangster International Airport (MBJ)'
/** What the box shows once the airport is chosen; the full name lives in the list row. */
export const AIRPORT_SHORT = 'Sangster Airport (MBJ)'

/** What this box may hold, given what the other end of the ride already is. */
export type PlaceOffer = 'both' | 'hotels' | 'airport'

type Row = { id: string; name: string; hint: string; kind: 'airport' | 'hotel' }

const AIRPORT_ROW: Row = {
  id: AIRPORT_ID,
  name: AIRPORT_NAME,
  hint: 'Montego Bay · every ride starts or ends here',
  kind: 'airport',
}

const looksLikeAirportQuery = (q: string) =>
  /airport|mbj|sangster|montego\s*bay\s*air/i.test(q)

export default function PlacePicker({
  id,
  label,
  value,
  onChange,
  offer = 'both',
  otherEnd = 'drop-off',
  clearable = true,
  placeholder,
}: {
  /** Injected by <Field> so its <label htmlFor> reaches the input. */
  id?: string
  label: string
  /** A destination id, AIRPORT_ID, or '' for nothing chosen yet. */
  value: string
  onChange: (id: string) => void
  offer?: PlaceOffer
  /** Name of the opposite box, for the "the airport is already your…" hint. */
  otherEnd?: 'pickup' | 'drop-off'
  /** False locks the box against the clear button, e.g. a round trip's airport. */
  clearable?: boolean
  placeholder?: string
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
  const isAirport = value === AIRPORT_ID
  const chosenLabel = isAirport ? AIRPORT_SHORT : chosen?.name ?? ''

  const placeholderText =
    placeholder ??
    (offer === 'hotels'
      ? 'Start typing your hotel or villa…'
      : offer === 'airport'
        ? AIRPORT_SHORT
        : 'Airport, or start typing your hotel…')

  // The airport is not in the rate table — it is the fixed other end of every
  // fare — so it is offered as its own row rather than filtered like a hotel.
  const airportMatches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === '' || 'sangster international airport mbj montego bay'.includes(q)
  }, [query])

  const results = useMemo(
    () => (offer === 'airport' ? [] : searchDestinations(query)),
    [offer, query],
  )
  const rows: Row[] = useMemo(
    () => [
      // An airport-only box always shows its one row, whatever was typed:
      // it exists to confirm, not to search.
      ...(offer === 'airport' || (offer === 'both' && airportMatches) ? [AIRPORT_ROW] : []),
      ...results.map((d) => ({
        id: d.id,
        name: d.name,
        // Every property reads the same, open or rebuilding: a guest booking
        // for a date months out is picking a place, not a status, and the
        // rate is the same either way.
        // Parish and drive time only. The zone letter means nothing to a
        // guest and the readout names it anyway; three lines per row made
        // the list a scroll before the second hotel.
        hint: `${d.parish} · ${ZONES[d.zone].duration.replace(' from MBJ', '')}`,
        kind: 'hotel' as const,
      })),
    ],
    [offer, airportMatches, results],
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
        listRef.current?.querySelector(`[id="${listId}-opt-${clamped}"]`)?.scrollIntoView({ block: 'nearest' })
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

  const LeadIcon = open || !chosenLabel ? Search : isAirport ? Plane : BedDouble
  const airportTakenHint =
    offer === 'hotels' && rows.length === 0 && looksLikeAirportQuery(query)

  // A heading over each kind, always: a list of hotels says it is hotels,
  // and the airport never reads as just another row.
  const showHeadings = true

  return (
    <div
      ref={wrapRef}
      className="pp-wrap"
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
        <LeadIcon
          size={17}
          aria-hidden
          className={`pp-lead pp-lead-${open || !chosenLabel ? 'search' : isAirport ? 'airport' : 'hotel'}`}
        />
        <input
          id={id}
          className="field-input pp-input"
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
          placeholder={placeholderText}
          onFocus={() => setOpen(true)}
          // A box that already has focus gets no focus event, so a guest who
          // picked a hotel and clicks the box again to change it saw nothing.
          onClick={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          style={{
            color: chosenLabel || query ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        />
        {chosenLabel && !open && clearable ? (
          <button
            type="button"
            className="pp-clear"
            onClick={() => { onChange(''); setQuery(''); setOpen(true) }}
            aria-label={`Clear ${label.toLowerCase()}`}
          >
            <X size={15} />
          </button>
        ) : (
          <ChevronDown size={16} aria-hidden className="pp-chevron" />
        )}
      </div>

      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label={label}
          className="pp-list"
          // Chrome makes any scrollable box a tab stop; the input owns the
          // keyboard (arrows scroll the highlight into view), so the list
          // itself must not be one.
          tabIndex={-1}
        >
          {rows.length === 0 && (
            <li role="presentation" className="pp-empty">
              {airportTakenHint ? (
                <>
                  Sangster (MBJ) is already your {otherEnd}. Choose your hotel or
                  villa here, or use <strong>Swap</strong> to ride from your hotel
                  to the airport instead.
                </>
              ) : (
                <>
                  No match for “{query}”. Try the town instead: Negril, Ocho Rios,
                  Falmouth, and pick the “Other hotel or villa” row for that area.
                  The fare is set by zone, so it will be the right price.
                </>
              )}
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
          {rows.map((row, i) => {
            const heading =
              showHeadings && (i === 0 || rows[i - 1].kind !== row.kind)
                ? row.kind === 'airport' ? 'Airport' : 'Hotels & villas'
                : null
            const RowIcon = row.kind === 'airport' ? Plane : BedDouble
            return [
              heading && (
                <li key={`h-${row.kind}`} role="presentation" className="pp-heading">
                  {heading}
                </li>
              ),
              <li
                key={row.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(row.id) }}
                className={`pp-option${i === active ? ' is-active' : ''}${row.id === value ? ' is-chosen' : ''}`}
              >
                <span className={`pp-option-icon pp-option-icon-${row.kind}`} aria-hidden>
                  <RowIcon size={15} />
                </span>
                <span className="pp-option-text">
                  <span className="pp-option-name">{row.name}</span>
                  <span className="pp-option-hint">{row.hint}</span>
                </span>
              </li>,
            ]
          })}
          {offer === 'airport' && (
            <li role="presentation" className="pp-empty" style={{ paddingTop: 4 }}>
              Every ride starts or ends at Sangster. Choose your hotel in the
              {otherEnd === 'pickup' ? ' Pickup' : ' Drop-off'} box.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
