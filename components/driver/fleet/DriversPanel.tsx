'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, CircleAlert, MessageCircle, Plus, UserRound } from 'lucide-react'
import Sheet from './Sheet'
import { parseDriverFields, phoneDigits, type DriverFields } from '@/lib/drivers'
import type { PortalDriver } from '@/lib/driver-portal-data'

/**
 * The Drivers tab, for a fleet manager (owner, Nov 24 2026: "Fleet Manager:
 * Can ... create new drivers"). Add a driver, change one, retire one or bring
 * them back, through /api/driver/drivers (the same rules as the admin desk,
 * lib/drivers). A driver added here is always a regular driver; a fleet
 * manager's row is shown, never editable here.
 *
 * The email is optional and is what the driver signs in to the portal with
 * (Google): with one, that driver sees the rides and tours that name them.
 */

type Form = Record<keyof DriverFields, string>
const EMPTY: Form = { name: '', whatsapp: '', vehicle: '', colour: '', plate: '', email: '' }
const LABELS: Record<keyof DriverFields, { label: string; hint: string; type: string; auto?: string; mode?: 'tel' | 'email' | 'text' }> = {
  name: { label: 'Name', hint: 'As guests should read it, for example Devon Brown.', type: 'text', auto: 'name' },
  whatsapp: { label: 'WhatsApp number', hint: 'With the country code, for example +1 876 555 0100.', type: 'tel', auto: 'tel', mode: 'tel' },
  vehicle: { label: 'Vehicle', hint: 'Make and model, for example Toyota Hiace.', type: 'text' },
  colour: { label: 'Colour', hint: 'In words, for example silver.', type: 'text' },
  plate: { label: 'License plate', hint: 'As it reads on the vehicle, for example PJ 1234.', type: 'text' },
  email: { label: 'Google email for the portal (optional)', hint: 'With one, the driver can sign in and see the rides and tours you give them. Leave it empty if not.', type: 'email', auto: 'email', mode: 'email' },
}
const ORDER: (keyof DriverFields)[] = ['name', 'whatsapp', 'vehicle', 'colour', 'plate', 'email']

export default function DriversPanel({ drivers, selfId }: {
  drivers: PortalDriver[]
  selfId: string | null
}) {
  const router = useRouter()
  /** The list changed: the page reads the drivers (and every ride's choices) again. */
  const onChanged = () => router.refresh()
  const [list, setList] = useState<PortalDriver[]>(drivers)
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [retiring, setRetiring] = useState<PortalDriver | null>(null)
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null)
  useEffect(() => setList(drivers), [drivers])

  const working = list.filter((d) => d.active)
  const retired = list.filter((d) => !d.active)

  async function retire(d: PortalDriver, action: 'retire' | 'restore') {
    if (busyId) return
    setBusyId(d.id)
    setStatus(null)
    try {
      const res = await fetch('/api/driver/drivers', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.id, action }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.driver) {
        setList((l) => l.map((x) => (x.id === d.id ? { ...x, active: action === 'restore' } : x)))
        setStatus({ text: action === 'retire' ? `${d.name} is retired. Rides already given to ${d.name} keep the name.` : `${d.name} is back on the list.`, tone: 'ok' })
        onChanged()
      } else setStatus({ text: j.message ?? 'That did not save. Try again.', tone: 'warn' })
    } catch {
      setStatus({ text: 'The connection dropped. Check your signal and try again.', tone: 'warn' })
    } finally {
      setBusyId(null)
    }
  }

  const card = (d: PortalDriver) => {
    const fleet = d.role === 'fleet_manager'
    return (
      <li key={d.id} className="fm-person">
        <span className="fm-avatar" aria-hidden="true"><UserRound size={18} /></span>
        <div className="fm-person-main">
          <p className="fm-person-name">
            {d.name}
            {fleet && <span className="fm-badge">Fleet manager</span>}
            {d.id === selfId && <span className="fm-badge fm-badge-soft">You</span>}
          </p>
          <p className="fm-person-meta">{d.colour} {d.vehicle} · <span className="fm-num">{d.plate}</span></p>
          <p className="fm-person-meta">
            <a className="fm-link" href={`https://wa.me/${phoneDigits(d.whatsapp)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={14} aria-hidden="true" /> {d.whatsapp}
            </a>
          </p>
          <p className="fm-person-meta">{d.email ? <>Signs in with {d.email}</> : 'No portal sign-in'}</p>
        </div>
        {!fleet && (
          <div className="fm-person-acts">
            {d.active ? (
              <>
                <button type="button" className="fm-btn fm-btn-outline fm-btn-sm" onClick={() => setEditing({ id: d.id })} aria-label={`Edit ${d.name}`}>Edit</button>
                <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={(e) => { setOpener(e.currentTarget); setRetiring(d) }} aria-disabled={busyId === d.id || undefined} aria-label={`Retire ${d.name}`}>
                  {busyId === d.id ? 'Retiring…' : 'Retire'}
                </button>
              </>
            ) : (
              <button type="button" className="fm-btn fm-btn-outline fm-btn-sm" onClick={() => retire(d, 'restore')} aria-disabled={busyId === d.id || undefined} aria-label={`Bring back ${d.name}`}>
                {busyId === d.id ? 'Bringing back…' : 'Bring back'}
              </button>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="fm-roster">
      <div className="fm-roster-head">
        <p className="fm-body">Drivers you can give rides and tours to. A driver with a portal email sees only what you give them.</p>
        <button type="button" className="fm-btn fm-btn-primary fm-btn-auto" onClick={() => setEditing({ id: null })}>
          <Plus size={18} aria-hidden="true" />Add a driver
        </button>
      </div>
      <div aria-live="polite">
        {status && (
          <p className={`fm-callout fm-tone-${status.tone}`}>
            {status.tone === 'ok' ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
            <span>{status.text}</span>
          </p>
        )}
      </div>
      <ul className="fm-people" aria-label="Working drivers">{working.map(card)}</ul>
      {retired.length > 0 && (
        <details className="fm-retired">
          <summary>Retired ({retired.length})<ChevronRight size={18} aria-hidden="true" className="fm-chev" /></summary>
          <ul className="fm-people" aria-label="Retired drivers">{retired.map(card)}</ul>
        </details>
      )}
      <RetireConfirm
        driver={retiring}
        returnTo={opener}
        onCancel={() => setRetiring(null)}
        onConfirm={async () => { const d = retiring; setRetiring(null); if (d) await retire(d, 'retire') }}
      />
      <DriverForm
        target={editing ? (editing.id ? list.find((d) => d.id === editing.id) ?? null : null) : undefined}
        onClose={() => setEditing(null)}
        onSaved={(d, added) => {
          setList((l) => (added ? [...l, d] : l.map((x) => (x.id === d.id ? d : x))).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)))
          setStatus({ text: added ? `${d.name} is added. Give them a ride from any ride's Driver section.` : `${d.name} is saved. Rides already given to them keep the details they had.`, tone: 'ok' })
          setEditing(null)
          onChanged()
        }}
      />
    </div>
  )
}

/** Add (target null) or change (a driver) one driver; closed when target is undefined. */
function DriverForm({ target, onClose, onSaved }: {
  target: PortalDriver | null | undefined
  onClose: () => void
  onSaved: (d: PortalDriver, added: boolean) => void
}) {
  const uid = useId()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof DriverFields, string>>>({})
  const [top, setTop] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const refs = useRef<Partial<Record<keyof DriverFields, HTMLInputElement | null>>>({})
  const open = target !== undefined

  useEffect(() => {
    if (!open) return
    setForm(target ? { name: target.name, whatsapp: target.whatsapp, vehicle: target.vehicle, colour: target.colour, plate: target.plate, email: target.email ?? '' } : EMPTY)
    setErrors({})
    setTop(null)
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [open, target])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    // The same rules the server applies (lib/drivers), so a mistake is shown before anything is sent.
    const parsed = parseDriverFields(form)
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error })
      refs.current[parsed.field]?.focus()
      return
    }
    setSaving(true)
    setErrors({})
    setTop(null)
    try {
      const res = await fetch('/api/driver/drivers', {
        method: target ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(target ? { id: target.id, ...parsed.fields } : parsed.fields),
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.driver) onSaved(j.driver as PortalDriver, !target)
      else if (j.field && (ORDER as string[]).includes(j.field)) {
        setErrors({ [j.field as keyof DriverFields]: j.message })
        refs.current[j.field as keyof DriverFields]?.focus()
      } else setTop(j.message ?? 'That did not save. Try again.')
    } catch {
      setTop('The connection dropped. Check your signal and try again.')
    } finally {
      setSaving(false)
    }
  }

  const title = target ? `Change ${target.name}` : 'Add a driver'
  return (
    <Sheet open={open} onClose={() => { if (!saving) onClose() }} labelledBy={`${uid}-t`} busy={saving}>
      <div className="fm-sheet-head">
        <p className="fm-eyebrow">Drivers</p>
        <button type="button" className="fm-x" onClick={() => { if (!saving) onClose() }} aria-label="Close without saving"><span aria-hidden="true">×</span></button>
      </div>
      {open && (
        <form className="fm-step" onSubmit={save} noValidate>
          <h2 className="fm-title" id={`${uid}-t`} ref={headingRef} tabIndex={-1}>{title}</h2>
          {top && <p className="fm-callout fm-tone-warn" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{top}</span></p>}
          {ORDER.map((k) => {
            const f = LABELS[k]
            const id = `${uid}-${k}`
            return (
              <div className="fm-field" key={k}>
                <label className="fm-label" htmlFor={id}>{f.label}</label>
                <p className="fm-hint" id={`${id}-hint`}>{f.hint}</p>
                <input
                  id={id}
                  ref={(el) => { refs.current[k] = el }}
                  className="fm-input"
                  type={f.type}
                  inputMode={f.mode}
                  autoComplete={f.auto ?? 'off'}
                  autoCapitalize={k === 'email' ? 'none' : k === 'plate' ? 'characters' : 'words'}
                  spellCheck={false}
                  value={form[k]}
                  onChange={(e) => { const v = e.target.value; setForm((x) => ({ ...x, [k]: v })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })) }}
                  aria-invalid={errors[k] ? true : undefined}
                  aria-describedby={`${id}-hint${errors[k] ? ` ${id}-err` : ''}`}
                  aria-required={k !== 'email' || undefined}
                />
                {errors[k] && <p className="fm-error" id={`${id}-err`} role="alert">{errors[k]}</p>}
              </div>
            )
          })}
          {target && target.name !== form.name.trim() && (
            <p className="fm-callout fm-tone-warn"><CircleAlert size={18} aria-hidden="true" /><span>Payments are matched by name. If MAPL Tours Jamaica does not have the new name yet, they are told when you save, and rides under it are paid once they add it.</span></p>
          )}
          <div className="fm-actions">
            <button type="submit" className="fm-btn fm-btn-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : target ? 'Save changes' : 'Add driver'}</button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={() => { if (!saving) onClose() }}>Cancel</button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

/** Retiring is confirmed first: the driver stops signing in and is no longer offered for rides. */
function RetireConfirm({ driver, returnTo, onCancel, onConfirm }: {
  driver: PortalDriver | null
  returnTo: HTMLElement | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const uid = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (driver) requestAnimationFrame(() => headingRef.current?.focus()) }, [driver])
  const first = driver ? driver.name.split(' ')[0] : ''
  return (
    <Sheet open={!!driver} onClose={onCancel} labelledBy={`${uid}-t`} describedBy={`${uid}-d`} returnTo={returnTo} alert>
      <div className="fm-sheet-head">
        <p className="fm-eyebrow">Drivers</p>
        <button type="button" className="fm-x" onClick={onCancel} aria-label="Close without retiring"><span aria-hidden="true">×</span></button>
      </div>
      {driver && (
        <div className="fm-step">
          <h2 className="fm-title" id={`${uid}-t`} ref={headingRef} tabIndex={-1}>Retire {driver.name}?</h2>
          <p className="fm-body" id={`${uid}-d`}>
            {first} will no longer be offered for rides and tours{driver.email ? ', and can no longer sign in to the portal' : ''}. Rides already given to {first} keep the name. You can bring {first} back at any time.
          </p>
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn-primary" onClick={onConfirm}>Retire {first}</button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
