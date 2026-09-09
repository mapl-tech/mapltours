'use client'

import { useId, type ReactNode, type CSSProperties, type InputHTMLAttributes } from 'react'
import { ChevronDown, Lock, ShieldCheck } from 'lucide-react'

/**
 * The small set of controls both one-page checkouts are built from. Every
 * input is 16px so iOS Safari never zooms the page on focus, every tap target
 * is at least 44px, and every error is tied to its control with
 * aria-describedby so a screen reader hears the same thing a sighted guest
 * reads under the field.
 */

const FONT = 'var(--font-dm-sans)'

export function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={`opc-card${className ? ' ' + className : ''}`} style={style}>
      {children}
    </div>
  )
}

/**
 * A numbered section heading.
 *
 * Everything is on one page, which is the point, but a page with no marked
 * structure reads as long. Three numbered headings say "three short steps"
 * before a first-time guest scrolls, and they give the trip card the label
 * it was missing, so the heading order is complete for a screen reader too.
 */
export function SectionTitle({ title, sub, id, step }: { title: string; sub?: string; id?: string; step?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
      {step !== undefined && (
        <span aria-hidden style={{
          flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
          background: 'var(--accent)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT, fontWeight: 700, fontSize: 13, lineHeight: 1, marginTop: 1,
        }}>{step}</span>
      )}
      <div style={{ minWidth: 0 }}>
        <h2 id={id} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.25 }}>{title}</h2>
        {sub && <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>{sub}</p>}
      </div>
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'id'> {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  /** Stable key used by the focus-first-error routine (defaults to id). */
  fieldKey?: string
}

export function TextField({ id, label, value, onChange, error, hint, fieldKey, style, ...rest }: TextFieldProps) {
  const errId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div data-field={fieldKey ?? id} style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'block', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: error ? '#b00020' : 'var(--text-secondary)', marginBottom: 6 }}>
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className="field-input"
        style={{ height: 50, fontSize: 16, width: '100%', background: '#fff', borderColor: error ? 'rgba(176,0,32,0.55)' : 'rgba(23,22,20,0.16)', ...style }}
        {...rest}
      />
      {error ? (
        <p id={errId} style={{ fontFamily: FONT, fontSize: 13, color: '#b00020', marginTop: 6, lineHeight: 1.4 }}>{error}</p>
      ) : hint ? (
        <p id={hintId} style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4 }}>{hint}</p>
      ) : null}
    </div>
  )
}

export function SelectField({ id, label, value, onChange, error, hint, children, fieldKey }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; children: ReactNode; fieldKey?: string
}) {
  const errId = `${id}-error`
  const hintId = `${id}-hint`
  return (
    <div data-field={fieldKey ?? id} style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ display: 'block', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: error ? '#b00020' : 'var(--text-secondary)', marginBottom: 6 }}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        className="field-input"
        style={{ height: 50, fontSize: 16, width: '100%', background: '#fff', fontWeight: 500, borderColor: error ? 'rgba(176,0,32,0.55)' : 'rgba(23,22,20,0.16)' }}
      >
        {children}
      </select>
      {error ? (
        <p id={errId} style={{ fontFamily: FONT, fontSize: 13, color: '#b00020', marginTop: 6, lineHeight: 1.4 }}>{error}</p>
      ) : hint ? (
        <p id={hintId} style={{ fontFamily: FONT, fontSize: 13, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.4 }}>{hint}</p>
      ) : null}
    </div>
  )
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button type="button" className="btn-outline" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 44, height: 44, padding: 0, borderRadius: '12px 0 0 12px', fontSize: 19, opacity: value <= min ? 0.45 : 1 }}>−</button>
      <div aria-live="polite" style={{ minWidth: 48, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)', fontFamily: FONT, fontWeight: 700, fontSize: 16, background: '#fff' }}>
        {value}
      </div>
      <button type="button" className="btn-outline" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: 44, height: 44, padding: 0, borderRadius: '0 12px 12px 0', fontSize: 19, opacity: value >= max ? 0.45 : 1 }}>+</button>
    </div>
  )
}

/** A collapsed row that opens into more controls ("Add a note", "Add more to your day"). */
export function Disclosure({ summary, detail, open, onToggle, children }: { summary: string; detail?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId()
  return (
    <div>
      {/* No top border and no bordered chevron: with them this optional row
          looked like one more field to fill in, sitting in a card of fields.
          A quiet line with a chevron reads as "there is more here if you
          want it", which is what it is. */}
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
        style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FONT, color: 'var(--text-secondary)' }}>
        <ChevronDown aria-hidden size={16} style={{ flexShrink: 0, marginTop: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{summary}</span>
          {detail && <span style={{ display: 'block', fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{detail}</span>}
        </span>
      </button>
      <div id={id} hidden={!open} style={{ paddingBottom: open ? 16 : 0 }}>{open && children}</div>
    </div>
  )
}

export function Reassurance({ lines }: { lines: string[] }) {
  return (
    <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((l, i) => (
        <li key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontFamily: FONT, fontSize: 13, lineHeight: 1.55, color: 'var(--text-tertiary)' }}>
          {i === 0
            ? <Lock size={14} color="var(--text-secondary)" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
            : <ShieldCheck size={14} color="var(--emerald)" strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />}
          <span>{l}</span>
        </li>
      ))}
    </ul>
  )
}

/** Inline text button that opens a modal; styled as a link so it reads as one. */
export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}>
      {children}
    </button>
  )
}

/** Moves focus to the first field that failed, scrolling it into view. */
export function focusFirstError(errors: Record<string, string>, order: string[]) {
  const key = order.find((k) => errors[k])
  if (!key) return
  window.setTimeout(() => {
    const scope = document.querySelector(`[data-field="${key}"]`) as HTMLElement | null
    if (!scope) return
    const control = scope.querySelector('input, select, textarea, button') as HTMLElement | null
    if (control) {
      control.focus({ preventScroll: true })
      control.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      scope.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, 60)
}
