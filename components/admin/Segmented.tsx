'use client'

import { useId } from 'react'
import { plural } from '@/lib/admin-format'

/**
 * A row of mutually exclusive choices for the admin screens: a native radio
 * group (one tab stop, arrow keys move the choice, read as "1 of 3"), drawn in
 * the admin's one selected state, the ink pill. A choice with a count is named
 * in words ("Paid, 2 bookings"); the pill it draws is hidden from screen
 * readers. Styles: .adm-seg in app/globals.css.
 */
export default function Segmented<T extends string>({ label, value, options, onChange, unit = 'booking', showLabel = false, grid = false }: {
  label: string
  /** On a phone, lay the choices out two to a row instead of wrapping (for rows of four or more). */
  grid?: boolean
  /** Show the legend as the field's label (in a form), instead of only to screen readers. */
  showLabel?: boolean
  value: T
  options: { key: T; label: string; count?: number }[]
  onChange: (v: T) => void
  /** What a count counts, for its spoken name. */
  unit?: string
}) {
  const name = useId()
  return (
    <fieldset className="adm-fieldset">
      <legend className={showLabel ? 'adm-label' : 'visually-hidden'}>{label}</legend>
      <div className={grid ? 'adm-seg adm-seg--grid' : 'adm-seg'}>
        {options.map((o) => (
          <label key={o.key} className={value === o.key ? 'adm-seg-btn is-on' : 'adm-seg-btn'}>
            <input
              type="radio" className="adm-seg-input" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)}
              aria-label={o.count !== undefined ? `${o.label}, ${plural(o.count, unit)}` : undefined}
            />
            {o.count !== undefined ? (
              <span className="adm-seg-text" aria-hidden="true">{o.label}<span className="adm-seg-count">{o.count}</span></span>
            ) : o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
