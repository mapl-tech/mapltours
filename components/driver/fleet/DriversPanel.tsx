'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronRight, CircleAlert, Clock, Lock, MessageCircle, Plus, UserRound } from 'lucide-react'
import Sheet from './Sheet'
import { EditReviewSteps, EditSteps, useEditReview } from './EditReview'
import { parseDriverFields, phoneDigits, type DriverFields } from '@/lib/drivers'
import type { PortalDriver } from '@/lib/driver-portal-data'

/**
 * The Drivers tab, for a fleet manager (owner, Nov 24 2026: "Fleet Manager:
 * Can ... create new drivers"; Nov 25 2026: "have the fleet manager be able
 * to enter the vehicle information for drivers as well. So make him able to
 * edit driver details"). Add a driver, change one's details, retire one or
 * bring them back, through /api/driver/drivers (the same field rules as the
 * admin desk, lib/drivers). The admin preview (/admin/driver) shows this same
 * tab, as Collin sees it.
 *
 * A change of details is reviewed before it is saved (EditReview): every ride
 * still ahead that carries the old details moves with it, and the review
 * says when each guest hears. A fleet manager's own row can be changed too,
 * except the name and the sign-in email (MAPL Tours Jamaica changes those).
 * A driver added here is always a regular driver; a fleet manager is never
 * retired here, and nobody with rides still ahead is.
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
const formOf = (d: PortalDriver): Form => ({ name: d.name, whatsapp: d.whatsapp, vehicle: d.vehicle, colour: d.colour, plate: d.plate, email: d.email ?? '' })

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

  /** Retire or bring back. A refusal with rides still ahead is returned for the retire sheet to show. */
  async function setActive(d: PortalDriver, action: 'retire' | 'restore'): Promise<{ ok: true } | { ok: false; message: string; rides?: BlockedRide[] }> {
    if (busyId) return { ok: false, message: 'One moment: another change is saving.' }
    setBusyId(d.id)
    setStatus(null)
    try {
      const res = await fetch('/api/driver/drivers', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: d.id, action }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.driver) {
        setList((l) => l.map((x) => (x.id === d.id ? { ...x, active: action === 'restore' } : x)))
        setStatus({ text: action === 'retire' ? `${d.name} is retired. Past rides keep ${d.name}'s name.` : `${d.name} is back on the list.`, tone: 'ok' })
        onChanged()
        return { ok: true }
      }
      return { ok: false, message: j.message ?? 'That did not save. Try again.', rides: Array.isArray(j.rides) ? j.rides as BlockedRide[] : undefined }
    } catch {
      return { ok: false, message: 'The connection dropped. Check your signal and try again.' }
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
        <div className="fm-person-acts">
          {d.active ? (
            <>
              <button type="button" className="fm-btn fm-btn-outline fm-btn-sm" onClick={(e) => { setOpener(e.currentTarget); setEditing({ id: d.id }) }} aria-label={`Edit ${d.name}`}>Edit</button>
              {!fleet && (
                <button type="button" className="fm-btn fm-btn-ghost fm-btn-sm" onClick={(e) => { setOpener(e.currentTarget); setRetiring(d) }} aria-disabled={busyId === d.id || undefined} aria-label={`Retire ${d.name}`}>
                  {busyId === d.id ? 'Retiring…' : 'Retire'}
                </button>
              )}
            </>
          ) : !fleet && (
            <button
              type="button" className="fm-btn fm-btn-outline fm-btn-sm" aria-disabled={busyId === d.id || undefined} aria-label={`Bring back ${d.name}`}
              onClick={async () => { const r = await setActive(d, 'restore'); if (!r.ok) setStatus({ text: r.message, tone: 'warn' }) }}
            >
              {busyId === d.id ? 'Bringing back…' : 'Bring back'}
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="fm-roster">
      <div className="fm-roster-head">
        <p className="fm-body">Drivers you can give rides and tours to. A driver with a portal email sees only what you give them.</p>
        <button type="button" className="fm-btn fm-btn-primary fm-btn-auto" onClick={(e) => { setOpener(e.currentTarget); setEditing({ id: null }) }}>
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
        busy={!!busyId}
        onClose={() => setRetiring(null)}
        onConfirm={(d) => setActive(d, 'retire')}
      />
      <DriverForm
        target={editing ? (editing.id ? list.find((d) => d.id === editing.id) ?? null : null) : undefined}
        returnTo={opener}
        onClose={() => setEditing(null)}
        onAdded={(d) => {
          setList((l) => [...l, d].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)))
          setStatus({ text: `${d.name} is added. Give them a ride from any ride's Driver section.`, tone: 'ok' })
          setEditing(null)
          onChanged()
        }}
        onEdited={onChanged}
      />
    </div>
  )
}

type BlockedRide = { bookingId: string; ref: string; guest: string; when: string | null }

/**
 * Add a driver (target null), or change one's details (a driver): the form,
 * then for a change the review (check, and email where a guest needs it).
 * Closed when target is undefined.
 */
export function DriverForm({ target, returnTo, onClose, onAdded, onEdited }: {
  target: PortalDriver | null | undefined
  returnTo: HTMLElement | null
  onClose: () => void
  onAdded: (d: PortalDriver) => void
  onEdited: () => void
}) {
  const uid = useId()
  const [form, setForm] = useState<Form>(() => (target ? formOf(target) : EMPTY))
  const [errors, setErrors] = useState<Partial<Record<keyof DriverFields, string>>>({})
  const [top, setTop] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const refs = useRef<Partial<Record<keyof DriverFields, HTMLInputElement | null>>>({})
  const open = target !== undefined
  const fieldError = (field: string, message: string) => {
    if ((ORDER as string[]).includes(field)) {
      setErrors({ [field as keyof DriverFields]: message })
      requestAnimationFrame(() => refs.current[field as keyof DriverFields]?.focus())
    } else {
      setTop(message)
      requestAnimationFrame(() => headingRef.current?.focus())
    }
  }
  const review = useEditReview('/api/driver/drivers', { onSaved: onEdited, onFieldError: fieldError })
  const { reset } = review
  // A fleet manager's name and sign-in email are MAPL Tours Jamaica's to change (lib/driver-edit).
  const locked = new Set<keyof DriverFields>(target?.role === 'fleet_manager' ? ['name', 'email'] : [])

  // The form starts from the driver as they were when it opened, in the same
  // render (never a frame of the last driver's values). Keyed on the driver's
  // id, not the object: a save refreshes the page's list, and the review must
  // not start again under the person's eyes.
  const targetId = target === undefined ? undefined : target?.id ?? null
  const [shownFor, setShownFor] = useState(targetId)
  if (shownFor !== targetId) {
    setShownFor(targetId)
    if (targetId !== undefined) {
      setForm(target ? formOf(target) : EMPTY)
      setErrors({})
      setTop(null)
      reset()
    }
  }
  useEffect(() => {
    if (open) requestAnimationFrame(() => headingRef.current?.focus())
  }, [open, targetId])

  const close = () => { if (!saving && !review.pending && review.step !== 'saving') onClose() }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving || review.pending) return
    // The same rules the server applies (lib/drivers), so a mistake is shown before anything is sent.
    const parsed = parseDriverFields(form)
    if (!parsed.ok) {
      setErrors({ [parsed.field]: parsed.error })
      refs.current[parsed.field]?.focus()
      return
    }
    setErrors({})
    setTop(null)
    if (target) {
      const same = (Object.keys(parsed.fields) as (keyof DriverFields)[]).every((k) => (parsed.fields[k] ?? '') === (target[k] ?? ''))
      if (same) { setTop('Nothing has changed yet. Change a detail, or close.'); headingRef.current?.focus(); return }
      const r = await review.start({ id: target.id, ...parsed.fields })
      if (!r.ok) fieldError(r.field ?? '', r.message)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/driver/drivers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed.fields) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.driver) onAdded(j.driver as PortalDriver)
      else fieldError(typeof j.field === 'string' ? j.field : '', j.message ?? 'That did not save. Try again.')
    } catch {
      setTop('The connection dropped. Check your signal and try again.')
    } finally {
      setSaving(false)
    }
  }

  const reviewing = !!review.step
  const busy = saving || review.pending || review.step === 'saving'
  const title = target ? `Change ${target.name}` : 'Add a driver'
  return (
    <Sheet open={open} onClose={close} labelledBy={`${uid}-t`} busy={busy} returnTo={returnTo}>
      <div className="fm-sheet-head">
        <p className="fm-eyebrow">{target ? `Drivers · ${target.name}` : 'Drivers'}</p>
        {/* Not while saving (nothing closes then), nor once done (its own Close button is the way out). */}
        {review.step !== 'saving' && review.step !== 'done' && (
          <button type="button" className="fm-x" onClick={close} aria-label="Close without saving"><span aria-hidden="true">×</span></button>
        )}
      </div>
      {open && !reviewing && (
        <form className="fm-step" onSubmit={save} noValidate>
          {target && <EditSteps at={0} withEmail={false} />}
          <h2 className="fm-title" id={`${uid}-t`} ref={headingRef} tabIndex={-1}>{title}</h2>
          {top && <p className="fm-callout fm-tone-warn" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{top}</span></p>}
          {ORDER.map((k) => {
            const f = LABELS[k]
            const id = `${uid}-${k}`
            const isLocked = locked.has(k)
            return (
              <div className="fm-field" key={k}>
                <label className="fm-label" htmlFor={id}>{isLocked && k === 'email' ? 'Google email for the portal' : f.label}</label>
                <p className="fm-hint" id={`${id}-hint`}>
                  {isLocked
                    ? <><Lock size={14} aria-hidden="true" className="fm-lock" />{k === 'name' ? 'Payments are matched by this name, so only MAPL Tours Jamaica changes it.' : 'The address you sign in with, so only MAPL Tours Jamaica changes it.'}</>
                    : f.hint}
                </p>
                <input
                  id={id}
                  ref={(el) => { refs.current[k] = el }}
                  className="fm-input"
                  type={f.type}
                  inputMode={f.mode}
                  autoComplete={isLocked ? 'off' : f.auto ?? 'off'}
                  autoCapitalize={k === 'email' ? 'none' : k === 'plate' ? 'characters' : 'words'}
                  spellCheck={false}
                  readOnly={isLocked || undefined}
                  value={isLocked && k === 'email' && !form[k] ? 'None' : form[k]}
                  onChange={(e) => { if (isLocked) return; const v = e.target.value; setForm((x) => ({ ...x, [k]: v })); if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined })) }}
                  aria-invalid={errors[k] ? true : undefined}
                  aria-describedby={`${id}-hint${errors[k] ? ` ${id}-err` : ''}`}
                  aria-required={(!isLocked && k !== 'email') || undefined}
                />
                {errors[k] && <p className="fm-error" id={`${id}-err`} role="alert">{errors[k]}</p>}
              </div>
            )
          })}
          {target && !locked.has('name') && target.name !== form.name.trim().replace(/\s+/g, ' ') && form.name.trim() && (
            <p className="fm-callout fm-tone-caution"><CircleAlert size={18} aria-hidden="true" /><span>Payments are matched by name. If MAPL Tours Jamaica does not have the new name yet, they are told when you save, and rides under it are paid once they add it.</span></p>
          )}
          <div className="fm-actions">
            <button type="submit" className="fm-btn fm-btn-primary" aria-disabled={busy || undefined}>
              {target ? (review.pending ? 'Checking…' : 'Review changes') : (saving ? 'Adding…' : 'Add driver')}
            </button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={close}>Cancel</button>
          </div>
          {target && <p className="fm-foot">Nothing is saved or sent until you confirm on the next screen.</p>}
        </form>
      )}
      {open && reviewing && (
        <EditReviewSteps
          review={review}
          titleId={`${uid}-t`}
          onBack={() => { reset(); requestAnimationFrame(() => headingRef.current?.focus()) }}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

/**
 * Retiring is confirmed first: the driver stops signing in and is no longer
 * offered for rides. A driver with rides still ahead is not retired; the
 * sheet then lists those rides, to give each to another driver first.
 */
function RetireConfirm({ driver, returnTo, busy, onClose, onConfirm }: {
  driver: PortalDriver | null
  returnTo: HTMLElement | null
  busy: boolean
  onClose: () => void
  onConfirm: (d: PortalDriver) => Promise<{ ok: true } | { ok: false; message: string; rides?: BlockedRide[] }>
}) {
  const uid = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [refused, setRefused] = useState<{ message: string; rides?: BlockedRide[] } | null>(null)
  useEffect(() => { setRefused(null); if (driver) requestAnimationFrame(() => headingRef.current?.focus()) }, [driver])
  useEffect(() => { if (refused) requestAnimationFrame(() => headingRef.current?.focus()) }, [refused])
  const first = driver ? driver.name.split(' ')[0] : ''
  const close = () => { if (!busy) onClose() }
  return (
    <Sheet open={!!driver} onClose={close} labelledBy={`${uid}-t`} describedBy={`${uid}-d`} returnTo={returnTo} busy={busy} alert>
      <div className="fm-sheet-head">
        <p className="fm-eyebrow">Drivers</p>
        <button type="button" className="fm-x" onClick={close} aria-label="Close without retiring"><span aria-hidden="true">×</span></button>
      </div>
      {driver && !refused && (
        <div className="fm-step">
          <h2 className="fm-title" id={`${uid}-t`} ref={headingRef} tabIndex={-1}>Retire {driver.name}?</h2>
          <p className="fm-body" id={`${uid}-d`}>
            {first} will no longer be offered for rides and tours{driver.email ? ', and can no longer sign in to the portal' : ''}. Past rides keep {first}&apos;s name. You can bring {first} back at any time.
          </p>
          <div className="fm-actions">
            <button
              type="button" className="fm-btn fm-btn-primary" aria-disabled={busy || undefined}
              onClick={async () => {
                if (busy) return
                const r = await onConfirm(driver)
                if (r.ok) onClose()
                else setRefused({ message: r.message, rides: r.rides })
              }}
            >
              {busy ? 'Retiring…' : `Retire ${first}`}
            </button>
            <button type="button" className="fm-btn fm-btn-ghost" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
      {driver && refused && (
        <div className="fm-step">
          <h2 className="fm-title" id={`${uid}-t`} ref={headingRef} tabIndex={-1}>{refused.rides?.length ? `${first} still has rides` : `${first} was not retired`}</h2>
          <p className="fm-callout fm-tone-caution" id={`${uid}-d`}><CircleAlert size={18} aria-hidden="true" /><span>{refused.message}</span></p>
          {!!refused.rides?.length && (
            <ul className="fm-rides">
              {refused.rides.map((r) => (
                <li key={r.bookingId} className="fm-ride fm-tone-muted">
                  <Clock size={18} aria-hidden="true" />
                  <div>
                    <p className="fm-ride-head"><span className="fm-num">{r.ref}</span> · {r.guest}</p>
                    {r.when && <p className="fm-ride-sub fm-num">{r.when}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="fm-actions">
            <button type="button" className="fm-btn fm-btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
